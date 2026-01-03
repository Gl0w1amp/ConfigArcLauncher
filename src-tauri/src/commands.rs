use crate::config::{
    paths::{
        active_game_dir, ensure_default_segatoools_exists, get_active_game_id, segatoools_path_for_active,
        segatoools_path_for_game_id, set_active_game_id,
    },
    profiles::{delete_profile, list_profiles, load_profile, save_profile, ConfigProfile},
    segatools::SegatoolsConfig,
    templates,
    json_configs::{JsonConfigFile, list_json_configs_for_active, load_json_config_for_active, save_json_config_for_active},
    {default_segatoools_config, load_segatoools_config, load_segatoools_config_from_string, save_segatoools_config as persist_segatoools_config, render_segatoools_config},
};
use crate::games::{launcher::{launch_game, launch_game_child}, model::{Game, LaunchMode}, store};
use crate::icf::{decode_icf, encrypt_icf, serialize_icf, IcfData};
use crate::trusted::{
    deploy_segatoools_for_active, rollback_segatoools_for_active, verify_segatoools_for_active,
    DeployResult, RollbackResult, SegatoolsTrustStatus,
};
use crate::vhd::{load_vhd_config, mount_vhd_with_elevation, resolve_vhd_config, save_vhd_config, unmount_vhd_handle, VhdConfig};
use crate::fsdecrypt;
use serde::{Serialize, Deserialize};
use base64::{engine::general_purpose, Engine as _};
use flate2::{Compression, write::DeflateEncoder, write::ZlibEncoder, read::ZlibDecoder};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, USER_AGENT};
use reqwest::Proxy;
use std::collections::HashSet;
use tauri::{command, AppHandle, Emitter, Manager, Window};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::os::windows::process::CommandExt;
use std::io::{Read, Write};

static DOWNLOAD_ORDER_CANCELLED: AtomicBool = AtomicBool::new(false);

fn redact_keychip_id(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut in_keychip = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_keychip = trimmed[1..trimmed.len() - 1].eq_ignore_ascii_case("keychip");
            result.push_str(line);
            result.push('\n');
            continue;
        }

        if in_keychip {
            let mut body = trimmed;
            if body.starts_with(';') || body.starts_with('#') {
                body = body[1..].trim_start();
            }
            if let Some(idx) = body.find('=') {
                let key = body[..idx].trim();
                if key.eq_ignore_ascii_case("id") {
                    result.push_str("id=\n");
                    continue;
                }
            }
        }

        result.push_str(line);
        result.push('\n');
    }

    result
}

#[derive(Deserialize)]
struct ImportProfilePayload {
    name: Option<String>,
    description: Option<String>,
    segatools: SegatoolsConfig,
}

fn gen_profile_id(prefix: &str) -> String {
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("{}-{}", prefix, ts)
}

fn blacklist_sections_for_game(name: &str) -> HashSet<&'static str> {
    let blacklist: HashSet<&'static str> = ["ds", "eeprom", "gpio", "jvs", "sram"].into_iter().collect();

    match name {
        // Extendable per-game blacklist
        _ => {}
    }

    blacklist
}

fn canonical_game_key(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    if lower.starts_with("sdez") {
        return "sinmai".to_string();
    }
    lower
}

fn allowed_sections_for_game(name: &str) -> HashSet<&'static str> {
    let key = canonical_game_key(name);
    let all_sections: &[&str] = &[
        "aimeio", "aime", "vfd", "amvideo", "clock", "dns", "ds", "eeprom", "gpio", "gfx", "hwmon",
        "jvs", "io4", "keychip", "netenv", "pcbid", "sram", "vfs", "epay", "openssl", "system",
        "led15070", "unity", "mai2io", "chuniio", "mu3io", "button", "touch", "led15093", "led",
        "io3", "slider", "ir",
    ];
    let common: &[&str] = &[
        "aimeio", "aime", "vfd", "amvideo", "clock", "dns", "ds", "eeprom", "gpio", "hwmon",
        "jvs", "keychip", "netenv", "pcbid", "sram", "vfs", "epay", "openssl", "system",
    ];
    let mut allowed: HashSet<&'static str> = match key.as_str() {
        "chunithm" => common.iter().copied()
            .chain(["gfx", "led15093", "led", "chuniio", "io3", "ir", "slider"].iter().copied())
            .collect(),
        "sinmai" => common.iter().copied()
            .chain(["led15070", "unity", "mai2io", "io4", "button", "touch", "gfx"].iter().copied())
            .collect(),
        "ongeki" => common.iter().copied()
            .chain(["gfx", "unity", "led15093", "led", "mu3io", "io4"].iter().copied())
            .collect(),
        _ => all_sections.iter().copied().collect(),
    };

    for section in blacklist_sections_for_game(name) {
        allowed.remove(section);
    }

    allowed
}

struct DetectedGameInfo {
    name: String,
    executable_path: String,
    working_dir: String,
    launch_args: Vec<String>,
}

fn default_launch_args(game_name: &str) -> Vec<String> {
    match game_name {
        "Sinmai" => vec![
            "-screen-fullscreen".into(), "0".into(),
            "-popupwindow".into(),
            "-screen-width".into(), "2160".into(),
            "-screen-height".into(), "1920".into(),
            "-silent-crashes".into()
        ],
        "Chunithm" => vec![],
        "Ongeki" => vec![
            "-screen-fullscreen".into(), "0".into(),
            "-popupwindow".into(),
            "-screen-width".into(), "1080".into(),
            "-screen-height".into(), "1920".into()
        ],
        _ => vec![],
    }
}

fn detect_game_in_dir(dir: &Path) -> Option<DetectedGameInfo> {
    let join_path = |p: &str| dir.join(p).to_str().unwrap_or("").to_string();

    if dir.join("Sinmai.exe").exists() {
        let name = "Sinmai".to_string();
        return Some(DetectedGameInfo {
            name: name.clone(),
            executable_path: join_path("Sinmai.exe"),
            working_dir: dir.to_string_lossy().to_string(),
            launch_args: default_launch_args(&name),
        });
    }
    if dir.join("chusanApp.exe").exists() {
        let name = "Chunithm".to_string();
        return Some(DetectedGameInfo {
            name: name.clone(),
            executable_path: join_path("chusanApp.exe"),
            working_dir: dir.to_string_lossy().to_string(),
            launch_args: default_launch_args(&name),
        });
    }
    if dir.join("mu3.exe").exists() {
        let name = "Ongeki".to_string();
        return Some(DetectedGameInfo {
            name: name.clone(),
            executable_path: join_path("mu3.exe"),
            working_dir: dir.to_string_lossy().to_string(),
            launch_args: default_launch_args(&name),
        });
    }
    None
}

fn detect_game_with_fallback(dir: &Path) -> Option<DetectedGameInfo> {
    if let Some(detected) = detect_game_in_dir(dir) {
        return Some(detected);
    }

    let package_bin = dir.join("package").join("bin");
    if let Some(detected) = detect_game_in_dir(&package_bin) {
        return Some(detected);
    }

    let mut subdirs = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                subdirs.push(path);
            }
        }
    }
    subdirs.sort_by_key(|p| p.to_string_lossy().to_lowercase());

    for subdir in subdirs {
        if let Some(detected) = detect_game_in_dir(&subdir) {
            return Some(detected);
        }
    }

    None
}

fn build_folder_game(detected: DetectedGameInfo) -> Game {
    Game {
        id: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis().to_string(),
        name: detected.name,
        executable_path: detected.executable_path,
        working_dir: Some(detected.working_dir),
        launch_args: detected.launch_args,
        enabled: true,
        tags: vec![],
        launch_mode: LaunchMode::Folder,
    }
}

fn scan_game_folder_logic(path: &str) -> Result<Game, String> {
    let dir = Path::new(path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Invalid directory".to_string());
    }

    let detected = detect_game_in_dir(dir)
        .ok_or_else(|| "No supported game executable found (Sinmai.exe, chusanApp.exe, mu3.exe)".to_string())?;

    Ok(build_folder_game(detected))
}

fn detect_game_on_mount() -> Result<DetectedGameInfo, String> {
    let candidates = [
        Path::new("X:\\"),
        Path::new("X:\\app"),
        Path::new("X:\\app\\bin"),
        Path::new("X:\\app\\Package"),
    ];
    for dir in candidates.iter() {
        if dir.exists() {
            if let Some(detected) = detect_game_in_dir(dir) {
                return Ok(detected);
            }
        }
    }
    Err("No supported game executable found on mounted VHD".to_string())
}

#[derive(Debug)]
struct VfsResolved {
    amfs: String,
    appdata: String,
    option: String,
}

fn find_vfs_dir<F>(base: &Path, predicate: F) -> Option<PathBuf>
where
    F: Fn(&Path) -> bool,
{
    let entries = fs::read_dir(base).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if predicate(&path) {
            return Some(path);
        }
    }
    None
}

fn dir_has_icf(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("ICF") {
                    return true;
                }
            }
        }
    }
    false
}

fn dir_has_appdata(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(name) = entry.file_name().to_str() {
                if name.len() == 4 && name.starts_with('S') && name.chars().skip(1).all(|c| c.is_ascii_uppercase()) {
                    return true;
                }
            }
        }
    }
    false
}

fn dir_has_option(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(name) = entry.file_name().to_str() {
                if name.len() == 4 && (name.starts_with('X') || name.starts_with('A')) {
                    return true;
                }
            }
        }
    }
    false
}

fn detect_vfs_paths_on_drive() -> Result<VfsResolved, String> {
    let candidates = [
        PathBuf::from("X:\\"),
        PathBuf::from("X:\\app"),
        PathBuf::from("X:\\app\\bin"),
        PathBuf::from("X:\\app\\Package"),
    ];

    let direct_amfs = PathBuf::from("X:\\amfs");
    let direct_appdata = PathBuf::from("X:\\appdata");
    let direct_option = PathBuf::from("X:\\option");

    let mut amfs = if direct_amfs.is_dir() { Some(direct_amfs) } else { None };
    let mut appdata = if direct_appdata.is_dir() { Some(direct_appdata) } else { None };
    let mut option = if direct_option.is_dir() { Some(direct_option) } else { None };

    for base in candidates.iter() {
        if !base.exists() {
            continue;
        }
        if amfs.is_none() {
            amfs = find_vfs_dir(base, dir_has_icf);
        }
        if appdata.is_none() {
            appdata = find_vfs_dir(base, dir_has_appdata);
        }
        if option.is_none() {
            option = find_vfs_dir(base, dir_has_option);
        }
    }

    let amfs = amfs.ok_or_else(|| "AMFS path not found on mounted VHD".to_string())?;
    let appdata = appdata.ok_or_else(|| "APPDATA path not found on mounted VHD".to_string())?;
    let option = option.ok_or_else(|| "OPTION path not found on mounted VHD".to_string())?;

    Ok(VfsResolved {
        amfs: amfs.to_string_lossy().to_string(),
        appdata: appdata.to_string_lossy().to_string(),
        option: option.to_string_lossy().to_string(),
    })
}

fn ensure_vfs_keys_present(cfg: &mut SegatoolsConfig) {
    if !cfg.present_sections.is_empty()
        && !cfg.present_sections.iter().any(|s| s.eq_ignore_ascii_case("vfs"))
    {
        cfg.present_sections.push("vfs".to_string());
    }
    if !cfg.present_keys.is_empty() {
        for key in ["vfs.enable", "vfs.amfs", "vfs.appdata", "vfs.option"] {
            if !cfg.present_keys.iter().any(|k| k.eq_ignore_ascii_case(key)) {
                cfg.present_keys.push(key.to_string());
            }
        }
    }
}

fn is_process_running(name: &str) -> Result<bool, String> {
    let escaped = name.replace('\'', "''");
    let cmd = format!(
        "Get-Process -Name '{}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id",
        escaped
    );
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", &cmd])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(!stdout.trim().is_empty())
}

fn wait_for_process_start(name: &str, timeout: Duration) -> Result<bool, String> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if is_process_running(name)? {
            return Ok(true);
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Ok(false)
}

fn wait_for_process_exit(name: &str) -> Result<(), String> {
    loop {
        if !is_process_running(name)? {
            return Ok(());
        }
        std::thread::sleep(Duration::from_secs(1));
    }
}

fn active_game() -> Result<Game, String> {
    let active_id = get_active_game_id()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active game selected".to_string())?;
    let games = store::list_games().map_err(|e| e.to_string())?;
    games
        .into_iter()
        .find(|g| g.id == active_id)
        .ok_or_else(|| "Active game not found".to_string())
}

fn active_game_root_dir() -> Result<PathBuf, String> {
    let game = active_game()?;
    store::game_root_dir(&game).ok_or_else(|| "Game path missing".to_string())
}

fn resolve_with_base(base: &Path, target: &str) -> PathBuf {
    let raw = PathBuf::from(target);
    if raw.is_absolute() {
        raw
    } else {
        base.join(target)
    }
}

fn load_active_seg_config() -> Result<(SegatoolsConfig, PathBuf), String> {
    let base = active_game_dir().map_err(|e| e.to_string())?;
    let seg_path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    if !seg_path.exists() {
        return Err("segatools.ini not found. Please deploy first.".to_string());
    }
    let cfg = load_segatoools_config(&seg_path).map_err(|e| e.to_string())?;
    Ok((cfg, base))
}

fn sanitize_segatoools_for_game(mut cfg: SegatoolsConfig, game_name: Option<&str>) -> SegatoolsConfig {
    let name = game_name.unwrap_or("");
    let key = canonical_game_key(name);
    let allowed_sections = allowed_sections_for_game(&key);
    let blacklist = blacklist_sections_for_game(name);

    let allowed_lower: HashSet<String> = allowed_sections.into_iter().map(|s| s.to_lowercase()).collect();
    let blacklist_lower: HashSet<String> = blacklist.into_iter().map(|s| s.to_lowercase()).collect();

    let mut present: Vec<String> = cfg
        .present_sections
        .into_iter()
        .filter(|s| allowed_lower.contains(&s.to_lowercase()))
        .collect();

    if present.is_empty() {
        let template = match key.as_str() {
            "chunithm" => Some(templates::CHUSAN_TEMPLATE),
            "sinmai" => Some(templates::MAI2_TEMPLATE),
            "ongeki" => Some(templates::MU3_TEMPLATE),
            _ => None
        };

        if let Some(tmpl) = template {
            if let Ok(default_cfg) = load_segatoools_config_from_string(tmpl) {
                return default_cfg;
            }
        }
        present = allowed_lower.iter().cloned().collect();
    }

    let filter_keys = |keys: &mut Vec<String>| {
        keys.retain(|k| {
            k.split('.')
                .next()
                .map(|sec| !blacklist_lower.contains(&sec.to_lowercase()))
                .unwrap_or(true)
        });
    };

    filter_keys(&mut cfg.present_keys);
    filter_keys(&mut cfg.commented_keys);
    cfg.present_sections = present;

    cfg
}

#[derive(Serialize)]
pub struct PathInfo {
    pub configured: String,
    pub resolved: String,
    pub exists: bool,
}

#[derive(Serialize)]
pub struct DataPaths {
    pub game_root: String,
    pub amfs: Option<PathInfo>,
    pub appdata: Option<PathInfo>,
    pub option: Option<PathInfo>,
}

#[derive(Serialize)]
pub struct OptionEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub version: Option<String>,
}

#[derive(Serialize)]
pub struct ModEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
}

#[derive(Serialize)]
pub struct ModsStatus {
    pub supported: bool,
    pub game: Option<String>,
    pub melonloader_installed: bool,
    pub mods_dir: Option<String>,
    pub mods: Vec<ModEntry>,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AimeEntry {
    pub id: String,
    pub name: String,
    pub number: String,
}

fn build_path_info(base: &Path, raw: &str) -> Option<PathInfo> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let resolved = resolve_with_base(base, trimmed);
    Some(PathInfo {
        configured: trimmed.to_string(),
        resolved: resolved.to_string_lossy().into_owned(),
        exists: resolved.exists(),
    })
}

#[command]
pub async fn pick_game_folder_cmd() -> Result<Game, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", ps_script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if path.is_empty() {
            return Err("No folder selected".to_string());
        }

        scan_game_folder_logic(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn pick_game_auto_cmd() -> Result<AutoDetectResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", ps_script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if path.is_empty() {
            return Err("No folder selected".to_string());
        }

        let dir = Path::new(&path);
        if !dir.exists() || !dir.is_dir() {
            return Err("Invalid directory".to_string());
        }

        auto_detect_game_in_dir(dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
struct LaunchProgress {
    game_id: String,
    stage: String,
}

fn emit_launch_progress(window: &Window, game_id: &str, stage: &str) {
    let _ = window.emit(
        "launch-progress",
        LaunchProgress {
            game_id: game_id.to_string(),
            stage: stage.to_string(),
        },
    );
}

fn emit_decrypt_progress(window: &Window, progress: fsdecrypt::DecryptProgress) {
    let _ = window.emit("decrypt-progress", progress);
}

fn emit_decrypt_result(window: &Window, result: fsdecrypt::DecryptResult) {
    let _ = window.emit("decrypt-result", result);
}

#[derive(Serialize)]
pub struct VhdDetectResult {
    pub game: Game,
    pub vhd: VhdConfig,
}

#[derive(Serialize)]
pub struct AutoDetectResult {
    pub game: Game,
    pub vhd: Option<VhdConfig>,
}

fn detect_vhd_files_in_dir(dir: &Path) -> Result<VhdConfig, String> {
    let mut vhds: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| {
            path.is_file()
                && path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("vhd")).unwrap_or(false)
                && !path.file_stem().and_then(|s| s.to_str()).map(|s| s.contains("-runtime")).unwrap_or(false)
        })
        .collect();

    if vhds.is_empty() {
        return Err("No VHD files found in the selected folder.".to_string());
    }

    vhds.sort_by_key(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0));

    let patch = vhds.iter().find(|p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.to_lowercase().contains("unpack") || n.to_lowercase().contains("patch"))
            .unwrap_or(false)
    })
    .cloned()
    .or_else(|| {
        if vhds.len() > 1 { vhds.first().cloned() } else { None }
    })
    .ok_or_else(|| "Patch VHD not found. Please select manually.".to_string())?;

    let base = vhds.iter()
        .filter(|p| **p != patch)
        .max_by_key(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .cloned()
        .ok_or_else(|| "Base VHD not found. Please select manually.".to_string())?;

    Ok(VhdConfig {
        base_path: base.to_string_lossy().to_string(),
        patch_path: patch.to_string_lossy().to_string(),
        delta_enabled: true,
    })
}

fn build_vhd_game(dir: &Path, vhd: &VhdConfig) -> Game {
    let name = Path::new(&vhd.base_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("VHD Game")
        .to_string();

    Game {
        id: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis().to_string(),
        name,
        executable_path: vhd.base_path.clone(),
        working_dir: Some(dir.to_string_lossy().to_string()),
        launch_args: vec![],
        enabled: true,
        tags: vec![],
        launch_mode: LaunchMode::Vhd,
    }
}

fn auto_detect_game_in_dir(dir: &Path) -> Result<AutoDetectResult, String> {
    if let Some(detected) = detect_game_with_fallback(dir) {
        return Ok(AutoDetectResult {
            game: build_folder_game(detected),
            vhd: None,
        });
    }

    let vhd = detect_vhd_files_in_dir(dir)?;
    let game = build_vhd_game(dir, &vhd);

    Ok(AutoDetectResult {
        game,
        vhd: Some(vhd),
    })
}

#[command]
pub async fn pick_vhd_game_cmd() -> Result<VhdDetectResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", ps_script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if path.is_empty() {
            return Err("No folder selected".to_string());
        }

        let dir = Path::new(&path);
        if !dir.exists() || !dir.is_dir() {
            return Err("Invalid directory".to_string());
        }

        let vhd = detect_vhd_files_in_dir(dir)?;
        let game = build_vhd_game(dir, &vhd);

        Ok(VhdDetectResult { game, vhd })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn pick_decrypt_files_cmd() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Multiselect = $true; $f.Filter = 'Container files (*.app;*.opt;*.pack)|*.app;*.opt;*.pack|All files (*.*)|*.*'; if ($f.ShowDialog() -eq 'OK') { $f.FileNames }";

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", ps_script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        let raw = String::from_utf8_lossy(&output.stdout);
        let files: Vec<String> = raw
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect();

        if files.is_empty() {
            return Err("No files selected".to_string());
        }

        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub fn get_segatoools_config() -> Result<SegatoolsConfig, String> {
    ensure_default_segatoools_exists().map_err(|e| e.to_string())?;
    let path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    let game_name = active_game().ok().map(|g| g.name);
    let cfg = load_segatoools_config(&path).map_err(|e| e.to_string())?;
    Ok(sanitize_segatoools_for_game(cfg, game_name.as_deref()))
}

#[command]
pub fn save_segatoools_config(config: SegatoolsConfig) -> Result<(), String> {
    let path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    if !path.exists() {
        return Err("segatools.ini not found. Please deploy first.".to_string());
    }
    let game_name = active_game().ok().map(|g| g.name);
    let sanitized = sanitize_segatoools_for_game(config, game_name.as_deref());
    persist_segatoools_config(&path, &sanitized).map_err(|e| e.to_string())
}

#[command]
pub fn export_segatoools_config_cmd() -> Result<String, String> {
    ensure_default_segatoools_exists().map_err(|e| e.to_string())?;
    let path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let game_name = active_game().ok().map(|g| g.name);
    let mut cfg = load_segatoools_config_from_string(&content).map_err(|e| e.to_string())?;
    cfg.keychip.id.clear();
    let sanitized = sanitize_segatoools_for_game(cfg, game_name.as_deref());
    let rendered = render_segatoools_config(&sanitized, Some(&content)).map_err(|e| e.to_string())?;
    Ok(redact_keychip_id(&rendered))
}

#[command]
pub fn import_segatoools_config_cmd(content: String) -> Result<SegatoolsConfig, String> {
    let game_name = active_game().ok().map(|g| g.name);
    let cfg = load_segatoools_config_from_string(&content).map_err(|e| e.to_string())?;
    Ok(sanitize_segatoools_for_game(cfg, game_name.as_deref()))
}

#[command]
pub fn export_profile_cmd(profile_id: Option<String>) -> Result<String, String> {
    ensure_default_segatoools_exists().map_err(|e| e.to_string())?;
    let game = active_game()?;
    let game_name = game.name.clone();
    let allowed = allowed_sections_for_game(&game.name);

    let (name, description, mut cfg) = if let Some(id) = profile_id {
        let profile = load_profile(&id, None).map_err(|e| e.to_string())?;
        (profile.name, profile.description, profile.segatools)
    } else {
        let path = segatoools_path_for_active().map_err(|e| e.to_string())?;
        let cfg = load_segatoools_config(&path).map_err(|e| e.to_string())?;
        ("Shared Profile".to_string(), None, cfg)
    };

    cfg = sanitize_segatoools_for_game(cfg, Some(game_name.as_str()));
    cfg.keychip.id.clear();

    let mut payload = serde_json::to_value(serde_json::json!({
        "name": name,
        "description": description,
        "segatools": cfg,
    })).map_err(|e| e.to_string())?;

    if let Some(seg) = payload.get_mut("segatools").and_then(|v| v.as_object_mut()) {
        let keys: Vec<String> = seg.keys().cloned().collect();
        for k in keys {
            if k == "presentSections" || k == "presentKeys" || k == "commentedKeys" {
                continue;
            }
            if !allowed.contains(k.as_str()) {
                seg.remove(&k);
            }
        }

        // Filter present sections/keys to only allowed
        if let Some(present) = seg.get_mut("presentSections").and_then(|v| v.as_array_mut()) {
            present.retain(|s| s.as_str().map(|v| allowed.contains(v)).unwrap_or(true));
        }
        if let Some(present) = seg.get_mut("presentKeys").and_then(|v| v.as_array_mut()) {
            present.retain(|s| {
                s.as_str().map(|v| {
                    let sec = v.split('.').next().unwrap_or("");
                    allowed.contains(sec)
                }).unwrap_or(true)
            });
        }
        if let Some(comments) = seg.get_mut("commentedKeys").and_then(|v| v.as_array_mut()) {
            comments.retain(|s| {
                s.as_str().map(|v| {
                    let sec = v.split('.').next().unwrap_or("");
                    allowed.contains(sec)
                }).unwrap_or(true)
            });
        }
    }

    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

#[command]
pub fn import_profile_cmd(content: String) -> Result<ConfigProfile, String> {
    let mut payload: ImportProfilePayload = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    payload.segatools.keychip.id.clear();

    let game_name = active_game().ok().map(|g| g.name);
    let now = chrono::Utc::now().to_rfc3339();
    let mut profile = ConfigProfile {
        id: gen_profile_id("import"),
        name: payload.name.unwrap_or_else(|| "Imported Profile".to_string()),
        description: payload.description,
        segatools: payload.segatools,
        created_at: now.clone(),
        updated_at: now,
    };
    profile.segatools = sanitize_segatoools_for_game(profile.segatools, game_name.as_deref());
    save_profile(&profile).map_err(|e| e.to_string())?;
    Ok(profile)
}

#[command]
pub fn list_profiles_cmd(game_id: Option<String>) -> Result<Vec<ConfigProfile>, String> {
    list_profiles(game_id.as_deref()).map_err(|e| e.to_string())
}

#[command]
pub fn load_profile_cmd(id: String) -> Result<ConfigProfile, String> {
    let game_name = active_game().ok().map(|g| g.name);
    let mut profile = load_profile(&id, None).map_err(|e| e.to_string())?;
    profile.segatools = sanitize_segatoools_for_game(profile.segatools, game_name.as_deref());
    Ok(profile)
}

#[command]
pub fn save_profile_cmd(profile: ConfigProfile) -> Result<(), String> {
    let game_name = active_game().ok().map(|g| g.name);
    let mut profile = profile;
    profile.segatools = sanitize_segatoools_for_game(profile.segatools, game_name.as_deref());
    save_profile(&profile).map_err(|e| e.to_string())
}

#[command]
pub fn delete_profile_cmd(id: String) -> Result<(), String> {
    delete_profile(&id).map_err(|e| e.to_string())
}

#[command]
pub fn list_games_cmd() -> Result<Vec<Game>, String> {
    store::list_games().map_err(|e| e.to_string())
}

#[command]
pub fn save_game_cmd(game: Game) -> Result<(), String> {
    store::save_game(game).map_err(|e| e.to_string())
}

#[command]
pub fn load_vhd_config_cmd(game_id: String) -> Result<VhdConfig, String> {
    load_vhd_config(&game_id).map_err(|e| e.to_string())
}

#[command]
pub fn save_vhd_config_cmd(game_id: String, config: VhdConfig) -> Result<(), String> {
    save_vhd_config(&game_id, &config).map_err(|e| e.to_string())
}

#[command]
pub fn delete_game_cmd(id: String) -> Result<(), String> {
    store::delete_game(&id).map_err(|e| e.to_string())
}

#[command]
pub fn launch_game_cmd(window: Window, id: String, profile_id: Option<String>) -> Result<(), String> {
    let games = store::list_games().map_err(|e| e.to_string())?;
    let game = games
        .into_iter()
        .find(|g| g.id == id)
        .ok_or_else(|| "Game not found".to_string())?;
    if matches!(game.launch_mode, LaunchMode::Vhd) {
        return launch_vhd_game(&game, profile_id, &window);
    }
    let game_name = game.name.clone();
    let _ = store::game_root_dir(&game).ok_or_else(|| "Game path missing".to_string())?;

    let config_to_validate = if let Some(pid) = profile_id.filter(|s| !s.is_empty()) {
        let profile = load_profile(&pid, Some(&id)).map_err(|e| e.to_string())?;
        let seg_path = segatoools_path_for_game_id(&id).map_err(|e| e.to_string())?;
        let sanitized = sanitize_segatoools_for_game(profile.segatools, Some(game_name.as_str()));
        persist_segatoools_config(&seg_path, &sanitized).map_err(|e| e.to_string())?;
        sanitized
    } else {
        let seg_path = segatoools_path_for_game_id(&id).map_err(|e| e.to_string())?;
        if seg_path.exists() {
            let cfg = load_segatoools_config(&seg_path).map_err(|e| e.to_string())?;
            sanitize_segatoools_for_game(cfg, Some(game_name.as_str()))
        } else {
            return Err("segatools.ini not found. Please configure the game.".to_string());
        }
    };

    let mut missing = Vec::new();
    if config_to_validate.keychip.id.is_empty() { missing.push("Keychip ID"); }
    if config_to_validate.vfs.amfs.is_empty() { missing.push("AMFS Path"); }
    if config_to_validate.vfs.appdata.is_empty() { missing.push("APPDATA Path"); }
    if config_to_validate.vfs.option.is_empty() { missing.push("OPTION Path"); }

    if !missing.is_empty() {
        return Err(format!("Missing required fields: {}. Please configure them in settings.", missing.join(", ")));
    }

    launch_game(&game).map_err(|e| e.to_string())
}

fn load_launch_config(game: &Game, profile_id: Option<String>, game_name: &str) -> Result<(SegatoolsConfig, PathBuf), String> {
    let seg_path = segatoools_path_for_game_id(&game.id).map_err(|e| e.to_string())?;
    let cfg = if let Some(pid) = profile_id.filter(|s| !s.is_empty()) {
        let profile = load_profile(&pid, Some(&game.id)).map_err(|e| e.to_string())?;
        let sanitized = sanitize_segatoools_for_game(profile.segatools, Some(game_name));
        persist_segatoools_config(&seg_path, &sanitized).map_err(|e| e.to_string())?;
        sanitized
    } else {
        if !seg_path.exists() {
            return Err("segatools.ini not found. Please configure the game.".to_string());
        }
        let cfg = load_segatoools_config(&seg_path).map_err(|e| e.to_string())?;
        sanitize_segatoools_for_game(cfg, Some(game_name))
    };
    Ok((cfg, seg_path))
}

fn launch_vhd_game(game: &Game, profile_id: Option<String>, window: &Window) -> Result<(), String> {
    if !game.enabled {
        emit_launch_progress(window, &game.id, "error");
        return Err("Game is disabled".to_string());
    }
    let vhd_cfg = load_vhd_config(&game.id).map_err(|e| e.to_string())?;
    let resolved = resolve_vhd_config(&game.id, &vhd_cfg)?;
    emit_launch_progress(window, &game.id, "mounting");
    let mounted = match mount_vhd_with_elevation(&resolved) {
        Ok(mounted) => mounted,
        Err(err) => {
            emit_launch_progress(window, &game.id, "error");
            return Err(err);
        }
    };

    let result = (|| -> Result<(), String> {
        emit_launch_progress(window, &game.id, "detecting");
        let detected = detect_game_on_mount()?;
        let (mut cfg, seg_path) = load_launch_config(game, profile_id, &detected.name)?;

        emit_launch_progress(window, &game.id, "configuring");
        let vfs = detect_vfs_paths_on_drive()?;
        cfg.vfs.enable = true;
        cfg.vfs.amfs = vfs.amfs;
        cfg.vfs.appdata = vfs.appdata;
        cfg.vfs.option = vfs.option;
        ensure_vfs_keys_present(&mut cfg);
        persist_segatoools_config(&seg_path, &cfg).map_err(|e| e.to_string())?;

        if cfg.keychip.id.is_empty() {
            return Err("Missing required fields: Keychip ID. Please configure it in settings.".to_string());
        }

        emit_launch_progress(window, &game.id, "launching");
        let launch_game = Game {
            id: game.id.clone(),
            name: detected.name,
            executable_path: detected.executable_path,
            working_dir: Some(detected.working_dir),
            launch_args: detected.launch_args,
            enabled: game.enabled,
            tags: game.tags.clone(),
            launch_mode: LaunchMode::Folder,
        };

        let process_name = Path::new(&launch_game.executable_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let mut child = launch_game_child(&launch_game).map_err(|e| e.to_string())?;
        let mounted_for_thread = mounted.clone();
        std::thread::spawn(move || {
            let started = if process_name.is_empty() {
                false
            } else {
                wait_for_process_start(&process_name, Duration::from_secs(15)).unwrap_or(false)
            };
            if started {
                let _ = wait_for_process_exit(&process_name);
            } else {
                let _ = child.wait();
            }
            let _ = unmount_vhd_handle(&mounted_for_thread);
        });
        Ok(())
    })();

    if result.is_err() {
        let _ = unmount_vhd_handle(&mounted);
        emit_launch_progress(window, &game.id, "error");
    } else {
        emit_launch_progress(window, &game.id, "started");
    }
    result
}

#[command]
pub fn default_segatoools_config_cmd() -> Result<SegatoolsConfig, String> {
    // Try to load game-specific default if an active game is selected
    let active = if let Ok(Some(id)) = get_active_game_id() {
        if let Ok(games) = store::list_games() {
            games.iter().find(|g| g.id == id).cloned()
        } else {
            None
        }
    } else {
        None
    };

    if let Some(game) = active {
        let key = canonical_game_key(&game.name);
        let content = match key.as_str() {
            "chunithm" => Some(templates::CHUSAN_TEMPLATE),
            "sinmai" => Some(templates::MAI2_TEMPLATE),
            "ongeki" => Some(templates::MU3_TEMPLATE),
            _ => None
        };

        if let Some(ini_content) = content {
            let cfg = load_segatoools_config_from_string(ini_content).map_err(|e| e.to_string())?;
            return Ok(sanitize_segatoools_for_game(cfg, Some(key.as_str())));
        }

        return Ok(sanitize_segatoools_for_game(default_segatoools_config(), Some(key.as_str())));
    }

    Ok(sanitize_segatoools_for_game(default_segatoools_config(), None))
}

#[command]
pub fn segatoools_path_cmd() -> Result<String, String> {
    Ok(segatoools_path_for_active()
        .map_err(|e| e.to_string())?
        .to_str()
        .unwrap_or("./segatools.ini")
        .to_string())
}

#[command]
pub fn open_segatoools_folder_cmd() -> Result<(), String> {
    let ini_path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    let dir = ini_path
        .parent()
        .ok_or_else(|| "Config folder not found".to_string())?;
    if !dir.exists() {
        return Err("Config folder not found".to_string());
    }
    Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn get_data_paths_cmd() -> Result<DataPaths, String> {
    let (cfg, base) = load_active_seg_config()?;
    Ok(DataPaths {
        game_root: base.to_string_lossy().into_owned(),
        amfs: build_path_info(&base, &cfg.vfs.amfs),
        appdata: build_path_info(&base, &cfg.vfs.appdata),
        option: build_path_info(&base, &cfg.vfs.option),
    })
}

fn amfs_path() -> Result<PathBuf, String> {
    let (cfg, base) = load_active_seg_config()?;
    let trimmed = cfg.vfs.amfs.trim();
    if trimmed.is_empty() {
        return Err("AMFS path is empty in segatools.ini".to_string());
    }
    Ok(resolve_with_base(&base, trimmed))
}

fn option_dir() -> Result<PathBuf, String> {
    let (cfg, base) = load_active_seg_config()?;
    let trimmed = cfg.vfs.option.trim();
    if trimmed.is_empty() {
        return Err("OPTION path is empty in segatools.ini".to_string());
    }
    Ok(resolve_with_base(&base, trimmed))
}

fn icf_path(kind: &str) -> Result<PathBuf, String> {
    let icf_name = kind.trim().to_uppercase();
    if icf_name.is_empty() {
        return Err("ICF name missing".to_string());
    }
    let mut path = amfs_path()?;
    path.push(icf_name);
    Ok(path)
}

fn is_option_folder(name: &str) -> bool {
    let chars: Vec<char> = name.chars().collect();
    if chars.len() != 4 {
        return false;
    }
    chars[0].is_ascii_uppercase()
        && chars[1].is_ascii_digit()
        && chars[2].is_ascii_digit()
        && chars[3].is_ascii_digit()
}

fn find_case_insensitive(dir: &Path, candidates: &[&str]) -> Option<PathBuf> {
    let lower_candidates: Vec<String> = candidates.iter().map(|s| s.to_lowercase()).collect();
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let fname = entry.file_name();
        let name = fname.to_string_lossy().to_lowercase();
        if lower_candidates.contains(&name) {
            return Some(entry.path());
        }
    }
    None
}

fn parse_data_conf_version(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let mut major: Option<u32> = None;
    let mut minor: Option<u32> = None;
    let mut release: Option<u32> = None;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if let Some(idx) = line.find('=') {
            let key = line[..idx].trim();
            let val = line[idx + 1..].trim();
            match key {
                "VerMajor" => major = val.parse::<u32>().ok(),
                "VerMinor" => minor = val.parse::<u32>().ok(),
                "VerRelease" => release = val.parse::<u32>().ok(),
                _ => {}
            }
        }
    }
    match (major, minor, release) {
        (Some(a), Some(b), Some(c)) => Some(format!("Ver {a}.{b}.{c}")),
        _ => None,
    }
}

fn extract_tag_value(content: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = content.to_lowercase().find(&open.to_lowercase())?;
    let end = content.to_lowercase().find(&close.to_lowercase())?;
    if end <= start {
        return None;
    }
    let inner_start = start + open.len();
    Some(content[inner_start..end].trim().to_string())
}

fn parse_dataconfig_xml_version(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let major = extract_tag_value(&content, "major")?.parse::<u32>().ok()?;
    let minor = extract_tag_value(&content, "minor")?.parse::<u32>().ok()?;
    let release = extract_tag_value(&content, "release")?.parse::<u32>().ok()?;
    Some(format!("Ver {major}.{minor}.{release}"))
}

fn detect_option_version(dir: &Path) -> Option<String> {
    if let Some(conf) = find_case_insensitive(dir, &["data.conf"]) {
        if let Some(ver) = parse_data_conf_version(&conf) {
            return Some(ver);
        }
    }
    if let Some(xml) = find_case_insensitive(dir, &["dataconfig.xml", "DataConfig.xml"]) {
        if let Some(ver) = parse_dataconfig_xml_version(&xml) {
            return Some(ver);
        }
    }
    None
}

fn detect_melonloader(base: &Path) -> bool {
    base.join("MelonLoader").is_dir()
        || base.join("version.dll").exists()
        || base.join("winhttp.dll").exists()
        || base.join("mods").join("version.dll").exists()
}

fn list_mods(dir: &Path) -> Result<Vec<ModEntry>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut mods = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_file() {
            mods.push(ModEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size: meta.len(),
            });
        }
    }
    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(mods)
}

fn aime_store_path() -> PathBuf {
    Path::new(".").join("configarc_aime.json")
}

fn load_aimes() -> Result<Vec<AimeEntry>, String> {
    let path = aime_store_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if data.trim().is_empty() {
        return Ok(vec![]);
    }
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_aimes(entries: &[AimeEntry]) -> Result<(), String> {
    let path = aime_store_path();
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn normalize_aime_number(raw: &str) -> Result<String, String> {
    let cleaned: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    if cleaned.len() != 20 || !cleaned.chars().all(|c| c.is_ascii_digit()) {
        return Err("Aime number must be exactly 20 digits".to_string());
    }
    Ok(cleaned)
}

fn unique_copy_destination(dir: &Path, src: &Path) -> Result<PathBuf, String> {
    let name = src.file_name().ok_or_else(|| "Invalid file name".to_string())?;
    let mut dest = dir.join(name);
    if !dest.exists() {
        return Ok(dest);
    }

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
    let mut index = 1;
    loop {
        let candidate = if ext.is_empty() {
            format!("{}_{}", stem, index)
        } else {
            format!("{}_{}.{}", stem, index, ext)
        };
        let candidate_path = dir.join(candidate);
        if !candidate_path.exists() {
            dest = candidate_path;
            break;
        }
        index += 1;
    }

    Ok(dest)
}

fn changelog_path() -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("CHANGELOG.md"));
            candidates.push(dir.join("resources").join("CHANGELOG.md"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("CHANGELOG.md"));
    }

    for path in &candidates {
        if path.exists() {
            return path.to_path_buf();
        }
    }

    candidates
        .first()
        .cloned()
        .unwrap_or_else(|| Path::new("CHANGELOG.md").to_path_buf())
}

#[derive(Serialize)]
pub struct VfsScanResult {
    pub amfs: Option<String>,
    pub appdata: Option<String>,
    pub option: Option<String>,
}

#[command]
pub fn scan_game_vfs_folders_cmd() -> Result<VfsScanResult, String> {
    let game_dir = active_game_dir().map_err(|e| e.to_string())?;
    
    let mut result = VfsScanResult {
        amfs: None,
        appdata: None,
        option: None,
    };

    let read_dir = fs::read_dir(&game_dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        
        let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        
        // Check for AMFS (contains ICF*)
        if result.amfs.is_none() {
            if let Ok(sub_entries) = fs::read_dir(&path) {
                for sub in sub_entries {
                    if let Ok(sub) = sub {
                        if let Some(name) = sub.file_name().to_str() {
                            if name.starts_with("ICF") {
                                result.amfs = Some(dir_name.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Check for AppData (contains S[A-Z]{3})
        if result.appdata.is_none() {
             if let Ok(sub_entries) = fs::read_dir(&path) {
                for sub in sub_entries {
                    if let Ok(sub) = sub {
                        if sub.path().is_dir() {
                            if let Some(name) = sub.file_name().to_str() {
                                if name.len() == 4 && name.starts_with('S') && name.chars().skip(1).all(|c| c.is_ascii_uppercase()) {
                                    result.appdata = Some(dir_name.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check for Option (contains X*** or A***)
        if result.option.is_none() {
             if let Ok(sub_entries) = fs::read_dir(&path) {
                for sub in sub_entries {
                    if let Ok(sub) = sub {
                        if sub.path().is_dir() {
                            if let Some(name) = sub.file_name().to_str() {
                                // User requested X***, standard is A***. Support both.
                                if name.len() == 4 && (name.starts_with('X') || name.starts_with('A')) {
                                    result.option = Some(dir_name.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(result)
}

#[command]
pub fn get_active_game_cmd() -> Result<Option<String>, String> {
    get_active_game_id().map_err(|e| e.to_string())
}

#[command]
pub fn set_active_game_cmd(id: String, profile_id: Option<String>) -> Result<(), String> {
    set_active_game_id(&id).map_err(|e| e.to_string())?;

    let game_opt = store::list_games()
        .ok()
        .and_then(|games| games.into_iter().find(|g| g.id == id));
    let game_name = game_opt.as_ref().map(|g| g.name.clone());

    // Auto-backup logic: Check if "Original INI" profile exists, if not, create it from current file
    if let Ok(path) = segatoools_path_for_active() {
        if path.exists() {
            let profiles = list_profiles(None).unwrap_or_default();
            let has_original = profiles.iter().any(|p| p.name == "Original INI");
            
            if !has_original {
                if let Ok(current_cfg) = load_segatoools_config(&path) {
                    let sanitized = sanitize_segatoools_for_game(current_cfg, game_name.as_deref());
                    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                    let backup_profile = ConfigProfile {
                        id: format!("original-{}", timestamp),
                        name: "Original INI".to_string(),
                        description: Some("Automatically created from initial configuration".to_string()),
                        segatools: sanitized,
                        created_at: timestamp.to_string(),
                        updated_at: timestamp.to_string(),
                    };
                    let _ = save_profile(&backup_profile);
                }
            }
        }
    }

    // If a profile is supplied when activating a game, apply it immediately (so switching config does not require launch)
    if let Some(pid) = profile_id.filter(|s| !s.is_empty()) {
        let game = game_opt.ok_or_else(|| "Game not found".to_string())?;
        let seg_path = segatoools_path_for_active().map_err(|e| e.to_string())?;
        if !seg_path.exists() {
            return Err("segatools.ini not found. Please deploy first.".to_string());
        }
        let profile = load_profile(&pid, Some(&id)).map_err(|e| e.to_string())?;
        let sanitized = sanitize_segatoools_for_game(profile.segatools, Some(game.name.as_str()));
        persist_segatoools_config(&seg_path, &sanitized).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[command]
pub fn apply_profile_to_game_cmd(game_id: String, profile_id: String) -> Result<(), String> {
    let games = store::list_games().map_err(|e| e.to_string())?;
    let game = games
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| "Game not found".to_string())?;
    let seg_path = segatoools_path_for_game_id(&game_id).map_err(|e| e.to_string())?;
    if !seg_path.exists() {
        return Err("segatools.ini not found. Please deploy first.".to_string());
    }
    let profile = load_profile(&profile_id, Some(&game_id)).map_err(|e| e.to_string())?;
    let sanitized = sanitize_segatoools_for_game(profile.segatools, Some(game.name.as_str()));
    persist_segatoools_config(&seg_path, &sanitized).map_err(|e| e.to_string())
}

#[command]
pub fn list_json_configs_cmd() -> Result<Vec<JsonConfigFile>, String> {
    list_json_configs_for_active().map_err(|e| e.to_string())
}

#[command]
pub fn load_json_config_cmd(name: String) -> Result<Value, String> {
    load_json_config_for_active(&name).map_err(|e| e.to_string())
}

#[command]
pub fn save_json_config_cmd(name: String, content: Value) -> Result<(), String> {
    save_json_config_for_active(&name, &content).map_err(|e| e.to_string())
}

#[command]
pub fn load_icf_cmd(kind: String) -> Result<Vec<IcfData>, String> {
    let path = icf_path(&kind)?;
    let kind_upper = kind.trim().to_uppercase();
    if !path.exists() {
        if kind_upper == "ICF2" {
            return Ok(vec![]);
        }
        return Err(format!("{} not found", kind_upper));
    }
    let mut buf = fs::read(path).map_err(|e| e.to_string())?;
    decode_icf(&mut buf).map_err(|e| e.to_string())
}

#[command]
pub fn save_icf_cmd(kind: String, entries: Vec<IcfData>) -> Result<(), String> {
    let path = icf_path(&kind)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serialize_icf(&entries).map_err(|e| e.to_string())?;
    let encrypted = encrypt_icf(&serialized, crate::icf::ICF_KEY, crate::icf::ICF_IV).map_err(|e| e.to_string())?;
    if path.exists() {
        let backup = path.with_extension("bak");
        let _ = fs::copy(&path, &backup);
    }
    fs::write(path, encrypted).map_err(|e| e.to_string())
}

#[command]
pub fn list_option_files_cmd() -> Result<Vec<OptionEntry>, String> {
    let dir = option_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if !meta.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_option_folder(&name) {
            continue;
        }
        let version = detect_option_version(&entry.path());
        entries.push(OptionEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: true,
            size: meta.len(),
            version,
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[command]
pub fn get_mods_status_cmd() -> Result<ModsStatus, String> {
    let game = active_game()?;
    let root = active_game_root_dir()?;
    let supported = game.name.eq_ignore_ascii_case("sinmai");
    let mods_dir = root.join("Mods");
    let melonloader_installed = detect_melonloader(&root);

    let mods = if supported {
        list_mods(&mods_dir)?
    } else {
        vec![]
    };

    Ok(ModsStatus {
        supported,
        game: Some(game.name),
        melonloader_installed,
        mods_dir: if supported {
            Some(mods_dir.to_string_lossy().into_owned())
        } else {
            None
        },
        mods,
        message: if supported {
            None
        } else {
            Some("Mods are only supported for Sinmai right now".to_string())
        },
    })
}

#[command]
pub fn list_aimes_cmd() -> Result<Vec<AimeEntry>, String> {
    load_aimes()
}

#[command]
pub fn save_aime_cmd(name: String, number: String) -> Result<AimeEntry, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Name is required".to_string());
    }
    let cleaned_number = normalize_aime_number(&number)?;
    let mut entries = load_aimes()?;
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let entry = AimeEntry {
        id: format!("aime-{}", ts),
        name: trimmed_name,
        number: cleaned_number,
    };
    entries.push(entry.clone());
    save_aimes(&entries)?;
    Ok(entry)
}

#[command]
pub fn update_aime_cmd(id: String, name: String, number: String) -> Result<AimeEntry, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Name is required".to_string());
    }
    let cleaned_number = normalize_aime_number(&number)?;
    let mut entries = load_aimes()?;
    
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        entry.name = trimmed_name;
        entry.number = cleaned_number;
        let result = entry.clone();
        save_aimes(&entries)?;
        Ok(result)
    } else {
        Err("Aime not found".to_string())
    }
}

#[command]
pub fn delete_aime_cmd(id: String) -> Result<(), String> {
    let mut entries = load_aimes()?;
    let before = entries.len();
    entries.retain(|e| e.id != id);
    if entries.len() == before {
        return Err("Aime not found".to_string());
    }
    save_aimes(&entries)
}

#[command]
pub fn apply_aime_to_active_cmd(id: String) -> Result<(), String> {
    let entries = load_aimes()?;
    let entry = entries
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| "Aime not found".to_string())?;
    let (cfg, base) = load_active_seg_config()?;
    let raw_path = cfg.aime.aime_path.trim();
    if raw_path.is_empty() {
        return Err("aimePath is empty in segatools.ini".to_string());
    }
    let target = resolve_with_base(&base, raw_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(target, entry.number).map_err(|e| e.to_string())
}

#[command]
pub fn get_active_aime_cmd() -> Result<Option<String>, String> {
    let (cfg, base) = match load_active_seg_config() {
        Ok(res) => res,
        Err(err) => return Err(err),
    };
    let raw_path = cfg.aime.aime_path.trim();
    if raw_path.is_empty() {
        return Ok(None);
    }
    let target = resolve_with_base(&base, raw_path);
    if !target.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(target).map_err(|e| e.to_string())?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(Some(trimmed.to_string()))
}

#[command]
pub fn store_io_dll_cmd(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is empty".to_string());
    }
    let src = PathBuf::from(trimmed);
    if !src.exists() || !src.is_file() {
        return Err(format!("File not found: {}", trimmed));
    }
    let seg_path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    if !seg_path.exists() {
        return Err("segatools.ini not found. Please deploy first.".to_string());
    }
    let base = seg_path.parent().ok_or_else(|| "Invalid segatools.ini path".to_string())?;
    let io_dir = base.join("IO");
    fs::create_dir_all(&io_dir).map_err(|e| e.to_string())?;
    let dest = unique_copy_destination(&io_dir, &src)?;
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    let relative = dest.strip_prefix(base).unwrap_or(&dest);
    Ok(relative.to_string_lossy().into_owned())
}

#[command]
pub fn load_changelog_cmd() -> Result<String, String> {
    let path = changelog_path();
    fs::read_to_string(&path).map_err(|e| format!("Failed to read changelog: {}", e))
}

#[command]
pub fn add_mods_cmd(paths: Vec<String>) -> Result<Vec<ModEntry>, String> {
    let game = active_game()?;
    if !game.name.eq_ignore_ascii_case("sinmai") {
        return Err("Mods are only supported for Sinmai".to_string());
    }
    let mods_dir = active_game_root_dir()?.join("Mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    for src in paths {
        let src_path = PathBuf::from(&src);
        if !src_path.exists() || !src_path.is_file() {
            return Err(format!("Mod file not found: {}", src));
        }
        let Some(name) = src_path.file_name() else {
            return Err("Invalid mod file name".to_string());
        };
        let dest = mods_dir.join(name);
        fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    }

    list_mods(&mods_dir)
}

#[command]
pub fn delete_mod_cmd(name: String) -> Result<Vec<ModEntry>, String> {
    let game = active_game()?;
    if !game.name.eq_ignore_ascii_case("sinmai") {
        return Err("Mods are only supported for Sinmai".to_string());
    }
    let mods_dir = active_game_root_dir()?.join("Mods");
    let sanitized = PathBuf::from(&name);
    let Some(fname) = sanitized.file_name() else {
        return Err("Invalid mod name".to_string());
    };
    let target = mods_dir.join(fname);
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
    } else {
        return Err("Mod not found".to_string());
    }
    list_mods(&mods_dir)
}

#[command]
pub async fn load_fsdecrypt_keys_cmd(key_url: Option<String>) -> Result<fsdecrypt::KeyStatus, String> {
    let key_url = key_url.and_then(|url| {
        let trimmed = url.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    tauri::async_runtime::spawn_blocking(move || fsdecrypt::load_key_status(key_url))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[command]
pub async fn decrypt_game_files_cmd(
    window: Window,
    files: Vec<String>,
    no_extract: bool,
    key_url: Option<String>,
) -> Result<fsdecrypt::DecryptSummary, String> {
    if files.is_empty() {
        return Err("No files provided".to_string());
    }
    let paths: Vec<PathBuf> = files.into_iter().map(PathBuf::from).collect();
    let key_url = key_url.and_then(|url| {
        let trimmed = url.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let window = window.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut report_progress = |progress: fsdecrypt::DecryptProgress| {
            emit_decrypt_progress(&window, progress);
        };
        let mut report_result = |result: fsdecrypt::DecryptResult| {
            emit_decrypt_result(&window, result);
        };
        fsdecrypt::decrypt_game_files(
            paths,
            no_extract,
            key_url,
            Some(&mut report_progress),
            Some(&mut report_result),
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOrderRequest {
    pub url: String,
    pub game_id: String,
    pub ver: String,
    pub serial: String,
    pub headers: Vec<String>,
    pub proxy: Option<String>,
    pub timeout_secs: Option<u64>,
    #[serde(alias = "encode_request")]
    pub encode_request: Option<bool>,
}

#[derive(Serialize)]
pub struct DownloadOrderResponse {
    pub raw: String,
    pub decoded: String,
    pub decode_error: Option<String>,
    pub status_code: u16,
    pub status_text: String,
    pub content_length: Option<u64>,
}

#[derive(Deserialize)]
pub struct DownloadOrderDownloadItem {
    pub url: String,
    pub filename: Option<String>,
}

#[derive(Serialize)]
pub struct DownloadOrderDownloadResult {
    pub url: String,
    pub filename: String,
    pub path: String,
}

#[derive(Serialize, Clone)]
pub struct DownloadOrderProgress {
    pub percent: f64,
    pub current_file: usize,
    pub total_files: usize,
    pub filename: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn sanitize_filename(name: &str) -> String {
    let mut result = String::with_capacity(name.len());
    for ch in name.chars() {
        let is_invalid = matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            || ch.is_control();
        if is_invalid {
            result.push('_');
        } else {
            result.push(ch);
        }
    }
    let trimmed = result.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        "download".to_string()
    } else {
        trimmed.to_string()
    }
}

fn unique_filename(base: &str, used: &mut HashSet<String>, dir: &Path) -> String {
    if !used.contains(base) && !dir.join(base).exists() {
        used.insert(base.to_string());
        return base.to_string();
    }
    let path = Path::new(base);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(base);
    let ext = path.extension().and_then(|s| s.to_str());
    let mut index = 1;
    loop {
        let candidate = if let Some(ext) = ext {
            format!("{}-{}.{}", stem, index, ext)
        } else {
            format!("{}-{}", stem, index)
        };
        if !used.contains(&candidate) && !dir.join(&candidate).exists() {
            used.insert(candidate.clone());
            return candidate;
        }
        index += 1;
    }
}

#[command]
pub async fn download_order_fetch_text_cmd(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed = url.trim();
        if trimmed.is_empty() {
            return Err("URL is required".to_string());
        }
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        let mut resp = client
            .get(trimmed)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        resp.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&buffer).to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub fn download_order_cancel_cmd() -> Result<(), String> {
    DOWNLOAD_ORDER_CANCELLED.store(true, Ordering::SeqCst);
    Ok(())
}

#[command]
pub async fn download_order_download_files_cmd(
    app: AppHandle,
    items: Vec<DownloadOrderDownloadItem>,
) -> Result<Vec<DownloadOrderDownloadResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if items.is_empty() {
            return Err("No files selected".to_string());
        }
        DOWNLOAD_ORDER_CANCELLED.store(false, Ordering::SeqCst);
        let download_dir = app
            .path()
            .download_dir()
            .map_err(|e| e.to_string())?;
        if !download_dir.exists() {
            fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;
        let mut used_names = HashSet::new();
        let mut results = Vec::with_capacity(items.len());
        let total_files = items.len();
        let is_cancelled = || DOWNLOAD_ORDER_CANCELLED.load(Ordering::SeqCst);

        for (index, item) in items.into_iter().enumerate() {
            if is_cancelled() {
                return Err("Download cancelled".to_string());
            }
            let url = item.url.trim().to_string();
            if url.is_empty() {
                return Err("URL is required".to_string());
            }
            let mut name = item
                .filename
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(sanitize_filename)
                .unwrap_or_else(|| {
                    reqwest::Url::parse(&url)
                        .ok()
                        .and_then(|parsed| {
                            parsed
                                .path_segments()
                                .and_then(|segments| segments.last().map(str::to_string))
                        })
                        .map(|name| sanitize_filename(&name))
                        .unwrap_or_else(|| format!("download-{}", index + 1))
                });
            name = unique_filename(&name, &mut used_names, &download_dir);
            let path = download_dir.join(&name);

            let mut resp = client
                .get(&url)
                .send()
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?;
            let total = resp.content_length();
            let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
            let mut downloaded: u64 = 0;
            let mut buffer = [0u8; 64 * 1024];
            let mut last_emit = Instant::now();
            let emit_progress = |done: bool,
                                 downloaded: u64,
                                 total: Option<u64>,
                                 name: &str,
                                 current_file: usize| {
                let file_progress = match total {
                    Some(total) if total > 0 => (downloaded as f64) / (total as f64),
                    _ => {
                        if done { 1.0 } else { 0.0 }
                    }
                };
                let overall = ((current_file - 1) as f64 + file_progress) / (total_files as f64);
                let percent = (overall * 100.0).clamp(0.0, 100.0);
                let payload = DownloadOrderProgress {
                    percent,
                    current_file,
                    total_files,
                    filename: name.to_string(),
                    downloaded,
                    total,
                };
                let _ = app.emit("download-order-progress", payload);
            };

            let current_file = index + 1;
            emit_progress(false, downloaded, total, &name, current_file);

            loop {
                let read = resp.read(&mut buffer).map_err(|e| e.to_string())?;
                if read == 0 {
                    break;
                }
                file.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
                downloaded = downloaded.saturating_add(read as u64);
                if is_cancelled() {
                    drop(file);
                    let _ = fs::remove_file(&path);
                    return Err("Download cancelled".to_string());
                }
                if last_emit.elapsed() >= Duration::from_millis(120) {
                    emit_progress(false, downloaded, total, &name, current_file);
                    last_emit = Instant::now();
                }
            }
            emit_progress(true, downloaded, total, &name, current_file);

            results.push(DownloadOrderDownloadResult {
                url,
                filename: name,
                path: path.to_string_lossy().into_owned(),
            });
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn download_order_cmd(payload: DownloadOrderRequest) -> Result<DownloadOrderResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let debug_logs = cfg!(debug_assertions)
            || std::env::var_os("CONFIGARC_DEBUG_DOWNLOAD_ORDER").is_some();
        let url = payload.url.trim().to_string();
        if url.is_empty() {
            return Err("URL is required".to_string());
        }
        let game_id = payload.game_id.trim().to_string();
        if game_id.is_empty() {
            return Err("gameId is required".to_string());
        }
        let ver = payload.ver.trim().to_string();
        if ver.is_empty() {
            return Err("ver is required".to_string());
        }
        let serial = payload.serial.trim().to_string();
        if serial.is_empty() {
            return Err("serial is required".to_string());
        }

        let encode_request = payload.encode_request.unwrap_or(true);
        let timeout_secs = payload.timeout_secs.unwrap_or(15);
        let proxy = payload
            .proxy
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let header_lines = payload.headers;

        if debug_logs {
            eprintln!(
                "[download_order] request url={} game_id={} ver={} serial={} encode_request={} timeout_secs={} proxy={}",
                url,
                game_id,
                ver,
                serial,
                encode_request,
                timeout_secs,
                proxy.as_deref().unwrap_or("<none>")
            );
        }

        let query = format!("game_id={}&ver={}&serial={}", game_id, ver, serial);
        let compression_level = Compression::new(6);
        let encode_zlib = |input: &str| -> Result<String, String> {
            let mut encoder = ZlibEncoder::new(Vec::new(), compression_level);
            encoder.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
            let compressed = encoder.finish().map_err(|e| e.to_string())?;
            Ok(general_purpose::STANDARD.encode(compressed))
        };
        let encode_deflate = |input: &str| -> Result<String, String> {
            let mut encoder = DeflateEncoder::new(Vec::new(), compression_level);
            encoder.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
            let compressed = encoder.finish().map_err(|e| e.to_string())?;
            Ok(general_purpose::STANDARD.encode(compressed))
        };
        let (primary_body, primary_label) = if encode_request {
            (encode_zlib(&query)?, "zlib")
        } else {
            (query.clone(), "plain")
        };

        let timeout = Duration::from_secs(timeout_secs);
        let mut builder = Client::builder().timeout(timeout).no_proxy();
        if let Some(proxy) = proxy.as_deref() {
            builder = builder.proxy(Proxy::all(proxy).map_err(|e| e.to_string())?);
        }
        let client = builder.build().map_err(|e| e.to_string())?;

        let mut headers = HeaderMap::new();
        let mut has_content_type = false;
        let mut has_user_agent = false;
        for raw in header_lines {
            let line = raw.trim();
            if line.is_empty() {
                continue;
            }
            let (name, value) = line
                .split_once(':')
                .ok_or_else(|| format!("Invalid header: {}", line))?;
            let name = name.trim();
            let value = value.trim();
            if name.is_empty() || value.is_empty() {
                return Err(format!("Invalid header: {}", line));
            }
            let header_name = HeaderName::from_bytes(name.as_bytes()).map_err(|e| e.to_string())?;
            let header_value = HeaderValue::from_str(value).map_err(|e| e.to_string())?;
            if header_name == CONTENT_TYPE {
                has_content_type = true;
            }
            if header_name == USER_AGENT {
                has_user_agent = true;
            }
            headers.insert(header_name, header_value);
        }
        if !has_content_type {
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/x-www-form-urlencoded"));
        }
        if !has_user_agent {
            headers.insert(USER_AGENT, HeaderValue::from_static("ALL.Net"));
        }
        // DownloadOrder requires Pragma: DFI; force it to avoid empty responses.
        headers.insert(HeaderName::from_static("pragma"), HeaderValue::from_static("DFI"));

        if debug_logs {
            let header_dump = headers
                .iter()
                .map(|(name, value)| {
                    let value = value.to_str().unwrap_or("<binary>");
                    format!("{}: {}", name.as_str(), value)
                })
                .collect::<Vec<_>>()
                .join("; ");
            eprintln!("[download_order] headers {}", header_dump);
        }

        let send_request = |body: &str, label: &str| -> Result<(u16, String, Option<u64>, String), String> {
            if debug_logs {
                let body_head = body.chars().take(80).collect::<String>();
                eprintln!(
                    "[download_order] sending {} body_len={} body_head={}",
                    label,
                    body.len(),
                    body_head
                );
            }

            if proxy.is_none() {
                // Use raw TCP to ensure header casing (Pragma: DFI) which reqwest/hyper lowercases
                use std::net::TcpStream;
                use std::io::{Read, Write};
                
                let parsed_url = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
                let host = parsed_url.host_str().ok_or("Invalid host")?;
                let port = parsed_url.port_or_known_default().unwrap_or(80);
                let path = parsed_url.path();
                
                let addr = format!("{}:{}", host, port);
                let mut stream = TcpStream::connect(&addr).map_err(|e| format!("Connection failed: {}", e))?;
                stream.set_read_timeout(Some(timeout)).ok();
                stream.set_write_timeout(Some(timeout)).ok();
                
                let request = format!(
                    "POST {} HTTP/1.1\r\n\
                     Host: {}\r\n\
                     User-Agent: ALL.Net\r\n\
                     Pragma: DFI\r\n\
                     Content-Type: application/x-www-form-urlencoded\r\n\
                     Content-Length: {}\r\n\
                     Connection: close\r\n\
                     \r\n\
                     {}",
                    path, host, body.len(), body
                );
                
                stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
                
                let mut response_bytes = Vec::new();
                stream.read_to_end(&mut response_bytes).map_err(|e| e.to_string())?;
                
                let response_str = String::from_utf8_lossy(&response_bytes);
                let mut parts = response_str.splitn(2, "\r\n\r\n");
                let header_part = parts.next().unwrap_or("");
                let body_part = parts.next().unwrap_or("");
                
                let status_line = header_part.lines().next().unwrap_or("");
                let mut status_parts = status_line.split_whitespace();
                let _http_ver = status_parts.next();
                let status_code_str = status_parts.next().unwrap_or("0");
                let status_code: u16 = status_code_str.parse().unwrap_or(0);
                let status_text = status_parts.collect::<Vec<_>>().join(" ");
                
                let content_length = header_part.lines()
                    .find(|l| l.to_lowercase().starts_with("content-length:"))
                    .and_then(|l| l.split(':').nth(1))
                    .and_then(|v| v.trim().parse::<u64>().ok());

                if debug_logs {
                     eprintln!("[download_order] raw response status={} len={}", status_code, body_part.len());
                }

                Ok((status_code, status_text, content_length, body_part.to_string()))
            } else {
                let response = client
                    .post(&url)
                    .headers(headers.clone())
                    .body(body.to_string())
                    .send()
                    .map_err(|e| e.to_string())?;
                let status = response.status();
                let status_code = status.as_u16();
                let status_text = status.canonical_reason().unwrap_or("").to_string();
                let content_length = response.content_length();
                if debug_logs {
                    let header_dump = response
                        .headers()
                        .iter()
                        .map(|(name, value)| {
                            let value = value.to_str().unwrap_or("<binary>");
                            format!("{}: {}", name.as_str(), value)
                        })
                        .collect::<Vec<_>>()
                        .join("; ");
                    eprintln!(
                        "[download_order] response url={} version={:?} status={} {} content_length={:?} headers={}",
                        response.url(),
                        response.version(),
                        status_code,
                        status_text,
                        content_length,
                        header_dump
                    );
                }
                let text = response.text().map_err(|e| e.to_string())?;
                Ok((status_code, status_text, content_length, text))
            }
        };

        let (mut status_code, mut status_text, mut content_length, mut text) =
            send_request(&primary_body, primary_label)?;

        if encode_request && text.trim().is_empty() {
            if debug_logs {
                eprintln!("[download_order] empty response, retrying with raw deflate");
            }
            let fallback_body = encode_deflate(&query)?;
            let (fallback_status, fallback_status_text, fallback_length, fallback_raw) =
                send_request(&fallback_body, "deflate_raw")?;
            status_code = fallback_status;
            status_text = fallback_status_text;
            content_length = fallback_length;
            text = fallback_raw;
        }
        let trimmed = text.trim();
        let mut decoded_text = String::new();
        let mut decode_error = None;
        if !trimmed.is_empty() {
            match general_purpose::STANDARD.decode(trimmed) {
                Ok(decoded) => {
                    let mut decoder = ZlibDecoder::new(decoded.as_slice());
                    let mut output = Vec::new();
                    if let Err(err) = decoder.read_to_end(&mut output) {
                        decode_error = Some(err.to_string());
                    } else {
                        decoded_text = String::from_utf8_lossy(&output).to_string();
                    }
                }
                Err(err) => {
                    decode_error = Some(err.to_string());
                }
            }
        }
        if debug_logs {
            let raw_head = text.chars().take(120).collect::<String>();
            eprintln!(
                "[download_order] response status={} {} content_length={:?} raw_len={} raw_head={}",
                status_code,
                status_text,
                content_length,
                text.len(),
                raw_head
            );
            if let Some(ref err) = decode_error {
                eprintln!("[download_order] decode_error={}", err);
            }
            if !decoded_text.is_empty() {
                let decoded_head = decoded_text.chars().take(120).collect::<String>();
                eprintln!(
                    "[download_order] decoded_len={} decoded_head={}",
                    decoded_text.len(),
                    decoded_head
                );
            }
        }
        Ok(DownloadOrderResponse {
            raw: text,
            decoded: decoded_text,
            decode_error,
            status_code,
            status_text,
            content_length,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn segatools_trust_status_cmd() -> Result<SegatoolsTrustStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        verify_segatoools_for_active().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub fn deploy_segatoools_cmd(force: bool) -> Result<DeployResult, String> {
    deploy_segatoools_for_active(force).map_err(|e| e.to_string())
}

#[command]
pub fn rollback_segatoools_cmd() -> Result<RollbackResult, String> {
    rollback_segatoools_for_active().map_err(|e| e.to_string())
}
