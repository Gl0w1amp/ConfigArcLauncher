use crate::config::paths::segatools_root_for_game_id;
use crate::error::ConfigError;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::os::windows::process::CommandExt;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::thread::sleep;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VhdConfig {
    pub base_path: String,
    pub patch_path: String,
    #[serde(default = "default_true")]
    pub delta_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct ResolvedVhdConfig {
    pub base_path: PathBuf,
    pub patch_path: PathBuf,
    pub delta_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct MountedVhd {
    pub mount_path: PathBuf,
    pub runtime_path: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct ElevatedVhdMount {
    pub script_path: PathBuf,
    pub result_path: PathBuf,
    pub signal_path: PathBuf,
    pub done_path: PathBuf,
}

#[derive(Debug, Clone)]
pub enum VhdMountHandle {
    Direct(MountedVhd),
    Elevated(ElevatedVhdMount),
}

#[derive(Debug, Serialize, Deserialize)]
struct HelperResult {
    ok: bool,
    mount_path: Option<String>,
    runtime_path: Option<String>,
    error: Option<String>,
}

const VHD_HELPER_SCRIPT: &str = include_str!("../scripts/vhd-helper.ps1");

pub fn vhd_config_path_for_game_id(game_id: &str) -> PathBuf {
    segatools_root_for_game_id(game_id).join("vhd.json")
}

pub fn load_vhd_config(game_id: &str) -> Result<VhdConfig, ConfigError> {
    let path = vhd_config_path_for_game_id(game_id);
    if !path.exists() {
        return Err(ConfigError::NotFound("vhd.json not found".to_string()));
    }
    let data = fs::read_to_string(&path)?;
    let cfg: VhdConfig = serde_json::from_str(&data)?;
    Ok(cfg)
}

pub fn save_vhd_config(game_id: &str, cfg: &VhdConfig) -> Result<(), ConfigError> {
    let path = vhd_config_path_for_game_id(game_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(cfg)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn resolve_vhd_config(game_id: &str, cfg: &VhdConfig) -> Result<ResolvedVhdConfig, String> {
    let base_dir = vhd_config_path_for_game_id(game_id)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Missing vhd.json parent directory".to_string())?;
    let base_path = resolve_with_base(&base_dir, &cfg.base_path);
    let patch_path = resolve_with_base(&base_dir, &cfg.patch_path);

    if !base_path.exists() {
        return Err(format!("Base VHD not found: {}", base_path.to_string_lossy()));
    }
    if !patch_path.exists() {
        return Err(format!("Patch VHD not found: {}", patch_path.to_string_lossy()));
    }

    Ok(ResolvedVhdConfig {
        base_path,
        patch_path,
        delta_enabled: cfg.delta_enabled,
    })
}

fn resolve_with_base(base: &Path, raw: &str) -> PathBuf {
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        path
    } else {
        base.join(path)
    }
}

fn runtime_path_for_patch(patch_path: &Path) -> PathBuf {
    let parent = patch_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = patch_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("runtime");
    let ext = patch_path.extension().and_then(OsStr::to_str).unwrap_or("vhd");
    parent.join(format!("{}-runtime.{}", stem, ext))
}

fn run_powershell(command: &str) -> Result<(), String> {
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", command])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let msg = if !stderr.is_empty() { stderr } else { stdout };
    Err(if msg.is_empty() {
        "PowerShell command failed".to_string()
    } else {
        msg
    })
}

fn run_diskpart(script: &str) -> Result<(), String> {
    let script_path = std::env::temp_dir().join("configarc_vhd_diskpart.txt");
    fs::write(&script_path, script.as_bytes()).map_err(|e| e.to_string())?;
    let output = Command::new("diskpart.exe")
        .args(&["/s", script_path.to_string_lossy().as_ref()])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&script_path);
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let msg = if !stderr.is_empty() { stderr } else { stdout };
    Err(if msg.is_empty() {
        "DiskPart command failed".to_string()
    } else {
        msg
    })
}

fn close_explorer_for_x_drive() {
    let cmd = "Start-Sleep -Milliseconds 300; $shell = New-Object -ComObject Shell.Application; $shell.Windows() | Where-Object { $_.LocationURL -like 'file:///X:*' -or $_.LocationURL -like 'file:///X:/*' } | ForEach-Object { $_.Quit() }";
    let _ = run_powershell(cmd);
}

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
extern "system" {
    fn IsUserAnAdmin() -> i32;
}

fn is_running_as_admin() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        return IsUserAnAdmin() != 0;
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn temp_tag() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn ensure_x_drive_free() -> Result<(), String> {
    if Path::new("X:\\").exists() {
        return Err("Drive X: is already in use. Please eject or change the assigned drive.".to_string());
    }
    Ok(())
}

fn wait_for_helper_result(path: &Path, timeout: Duration) -> Result<HelperResult, String> {
    let start = Instant::now();
    let mut last_err: Option<String> = None;
    while start.elapsed() < timeout {
        if path.exists() {
            let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
            let trimmed = data.trim();
            if trimmed.is_empty() {
                sleep(Duration::from_millis(200));
                continue;
            }
            let trimmed = trimmed.strip_prefix('\u{feff}').unwrap_or(trimmed);
            match serde_json::from_str::<HelperResult>(trimmed) {
                Ok(result) => return Ok(result),
                Err(err) => {
                    last_err = Some(err.to_string());
                }
            }
        }
        sleep(Duration::from_millis(200));
    }
    if let Some(err) = last_err {
        Err(format!("Failed to parse elevated helper result: {err}"))
    } else {
        Err("Timed out waiting for elevated mount helper".to_string())
    }
}

fn mount_vhd_via_helper(cfg: &ResolvedVhdConfig) -> Result<ElevatedVhdMount, String> {
    let tag = temp_tag();
    let temp = std::env::temp_dir();
    let script_path = temp.join(format!("configarc_vhd_helper_{tag}.ps1"));
    let result_path = temp.join(format!("configarc_vhd_result_{tag}.json"));
    let signal_path = temp.join(format!("configarc_vhd_signal_{tag}.flag"));
    let done_path = temp.join(format!("configarc_vhd_done_{tag}.flag"));

    fs::write(&script_path, VHD_HELPER_SCRIPT.as_bytes()).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&result_path);
    let _ = fs::remove_file(&signal_path);
    let _ = fs::remove_file(&done_path);

    let args = vec![
        "-NoProfile".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-File".to_string(),
        script_path.to_string_lossy().to_string(),
        "--base".to_string(),
        cfg.base_path.to_string_lossy().to_string(),
        "--patch".to_string(),
        cfg.patch_path.to_string_lossy().to_string(),
        "--delta".to_string(),
        if cfg.delta_enabled { "1".to_string() } else { "0".to_string() },
        "--result".to_string(),
        result_path.to_string_lossy().to_string(),
        "--signal".to_string(),
        signal_path.to_string_lossy().to_string(),
        "--done".to_string(),
        done_path.to_string_lossy().to_string(),
    ];

    let arg_list = args
        .iter()
        .map(|a| ps_quote(a))
        .collect::<Vec<_>>()
        .join(", ");

    let cmd = format!(
        "Start-Process -Verb RunAs -WindowStyle Hidden -FilePath powershell.exe -ArgumentList @({}) | Out-Null",
        arg_list
    );
    run_powershell(&cmd)?;

    let result = wait_for_helper_result(&result_path, Duration::from_secs(60))?;
    if !result.ok {
        let message = result.error.unwrap_or_else(|| "Elevated mount helper failed".to_string());
        return Err(message);
    }

    let _ = result.mount_path;
    let _ = result.runtime_path;

    Ok(ElevatedVhdMount {
        script_path,
        result_path,
        signal_path,
        done_path,
    })
}

pub fn mount_vhd(cfg: &ResolvedVhdConfig) -> Result<MountedVhd, String> {
    ensure_x_drive_free()?;

    let mut mount_path = cfg.patch_path.clone();
    let mut runtime_path = None;
    if cfg.delta_enabled {
        let delta_path = runtime_path_for_patch(&cfg.patch_path);
        let dismount = format!(
            "Dismount-DiskImage -ImagePath \"{}\" -Confirm:$false -ErrorAction SilentlyContinue",
            delta_path.to_string_lossy()
        );
        let _ = run_powershell(&dismount);
        if delta_path.exists() {
            let _ = fs::remove_file(&delta_path);
        }
        let script = format!("create vdisk file=\"{}\" parent=\"{}\"\n",
            delta_path.to_string_lossy(),
            cfg.patch_path.to_string_lossy()
        );
        run_diskpart(&script)?;
        if !delta_path.exists() {
            return Err("Failed to create runtime VHD".to_string());
        }
        mount_path = delta_path.clone();
        runtime_path = Some(delta_path);
    }

    let mount_cmd = format!(
        "Mount-DiskImage -ImagePath \"{}\" -StorageType VHD -NoDriveLetter -Passthru -Access ReadWrite -Confirm:$false -ErrorAction Stop | Get-Disk | Get-Partition | Where-Object {{ ($_ | Get-Volume) -ne $Null }} | Add-PartitionAccessPath -AccessPath \"X:\\\" -ErrorAction Stop | Out-Null",
        mount_path.to_string_lossy()
    );
    if let Err(err) = run_powershell(&mount_cmd) {
        if let Some(runtime_path) = &runtime_path {
            let dismount_runtime = format!(
                "Dismount-DiskImage -ImagePath \"{}\" -Confirm:$false -ErrorAction SilentlyContinue",
                runtime_path.to_string_lossy()
            );
            let _ = run_powershell(&dismount_runtime);
            if runtime_path.exists() {
                let _ = fs::remove_file(runtime_path);
            }
        }
        return Err(err);
    }

    close_explorer_for_x_drive();

    Ok(MountedVhd {
        mount_path,
        runtime_path,
    })
}

pub fn unmount_vhd(mounted: &MountedVhd) -> Result<(), String> {
    let dismount = format!(
        "Dismount-DiskImage -ImagePath \"{}\" -Confirm:$false -ErrorAction SilentlyContinue",
        mounted.mount_path.to_string_lossy()
    );
    let _ = run_powershell(&dismount);

    if let Some(runtime_path) = &mounted.runtime_path {
        let dismount_runtime = format!(
            "Dismount-DiskImage -ImagePath \"{}\" -Confirm:$false -ErrorAction SilentlyContinue",
            runtime_path.to_string_lossy()
        );
        let _ = run_powershell(&dismount_runtime);
        if runtime_path.exists() {
            let _ = fs::remove_file(runtime_path);
        }
    }
    Ok(())
}

pub fn mount_vhd_with_elevation(cfg: &ResolvedVhdConfig) -> Result<VhdMountHandle, String> {
    if is_running_as_admin() {
        mount_vhd(cfg).map(VhdMountHandle::Direct)
    } else {
        mount_vhd_via_helper(cfg).map(VhdMountHandle::Elevated)
    }
}

pub fn unmount_vhd_handle(handle: &VhdMountHandle) -> Result<(), String> {
    match handle {
        VhdMountHandle::Direct(mounted) => unmount_vhd(mounted),
        VhdMountHandle::Elevated(mounted) => {
            fs::write(&mounted.signal_path, b"1").map_err(|e| e.to_string())?;
            let start = Instant::now();
            let timeout = Duration::from_secs(30);
            let mut done = false;
            while start.elapsed() < timeout {
                if mounted.done_path.exists() {
                    done = true;
                    break;
                }
                sleep(Duration::from_millis(200));
            }
            if done {
                let _ = fs::remove_file(&mounted.signal_path);
                let _ = fs::remove_file(&mounted.result_path);
                let _ = fs::remove_file(&mounted.done_path);
                let _ = fs::remove_file(&mounted.script_path);
                Ok(())
            } else {
                Err("Timed out waiting for elevated unmount".to_string())
            }
        }
    }
}
