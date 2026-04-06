use crate::config::paths::segatools_root_for_game_id;
use crate::error::ConfigError;
use serde::{Deserialize, Deserializer, Serialize};
use std::ffi::c_void;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::os::windows::process::CommandExt;
use std::os::windows::ffi::OsStrExt;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::thread::sleep;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn default_true() -> bool {
    true
}

fn normalize_patch_paths(paths: Vec<String>) -> Vec<String> {
    paths
        .into_iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect()
}

#[derive(Debug, Deserialize)]
struct RawVhdConfig {
    pub app_base_path: String,
    #[serde(default)]
    pub app_patch_paths: Vec<String>,
    #[serde(default)]
    pub app_patch_path: Option<String>,
    pub appdata_path: String,
    pub option_path: String,
    #[serde(default = "default_true")]
    pub delta_enabled: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct VhdConfig {
    pub app_base_path: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub app_patch_paths: Vec<String>,
    pub appdata_path: String,
    pub option_path: String,
    #[serde(default = "default_true")]
    pub delta_enabled: bool,
}

impl<'de> Deserialize<'de> for VhdConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = RawVhdConfig::deserialize(deserializer)?;
        let mut app_patch_paths = normalize_patch_paths(raw.app_patch_paths);
        if app_patch_paths.is_empty() {
            if let Some(legacy_path) = raw.app_patch_path {
                app_patch_paths = normalize_patch_paths(vec![legacy_path]);
            }
        }
        Ok(Self {
            app_base_path: raw.app_base_path,
            app_patch_paths,
            appdata_path: raw.appdata_path,
            option_path: raw.option_path,
            delta_enabled: raw.delta_enabled,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedVhdConfig {
    pub app_base_path: PathBuf,
    pub app_patch_paths: Vec<PathBuf>,
    pub appdata_path: PathBuf,
    pub option_path: PathBuf,
    pub delta_enabled: bool,
}

impl ResolvedVhdConfig {
    fn app_parent_path(&self) -> &Path {
        self.app_patch_paths
            .last()
            .map(PathBuf::as_path)
            .unwrap_or_else(|| self.app_base_path.as_path())
    }
}

#[derive(Debug, Clone)]
pub struct MountedVhd {
    pub app_mount_path: PathBuf,
    pub app_runtime_path: Option<PathBuf>,
    pub appdata_mount_path: PathBuf,
    pub option_mount_path: PathBuf,
    pub repair_root: Option<PathBuf>,
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
    app_mount_path: Option<String>,
    app_runtime_path: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VhdHelperParams {
    pub app_base: PathBuf,
    pub app_patches: Vec<PathBuf>,
    pub app_data: PathBuf,
    pub option: PathBuf,
    pub delta: bool,
    pub repair_root: Option<PathBuf>,
    pub result_path: PathBuf,
    pub signal_path: PathBuf,
    pub done_path: PathBuf,
}

#[derive(Debug, Clone)]
struct PreparedPatchChain {
    app_patch_paths: Vec<PathBuf>,
    repair_root: PathBuf,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
struct Guid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
struct VirtualStorageType {
    device_id: u32,
    vendor_id: Guid,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
struct OpenVirtualDiskParametersVersion1 {
    rw_depth: u32,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
union OpenVirtualDiskParametersUnion {
    version1: OpenVirtualDiskParametersVersion1,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
struct OpenVirtualDiskParameters {
    version: u32,
    union_data: OpenVirtualDiskParametersUnion,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
union SetVirtualDiskInfoUnion {
    parent_file_path: *const u16,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
#[repr(C)]
struct SetVirtualDiskInfo {
    version: u32,
    union_data: SetVirtualDiskInfoUnion,
}

#[cfg(target_os = "windows")]
const VIRTUAL_STORAGE_TYPE_DEVICE_VHD: u32 = 2;
#[cfg(target_os = "windows")]
const VIRTUAL_STORAGE_TYPE_DEVICE_VHDX: u32 = 3;
#[cfg(target_os = "windows")]
const VIRTUAL_DISK_ACCESS_METAOPS: u32 = 0x0020_0000;
#[cfg(target_os = "windows")]
const OPEN_VIRTUAL_DISK_VERSION_1: u32 = 1;
#[cfg(target_os = "windows")]
const OPEN_VIRTUAL_DISK_FLAG_NO_PARENTS: u32 = 0x0000_0001;
#[cfg(target_os = "windows")]
const SET_VIRTUAL_DISK_INFO_PARENT_PATH: u32 = 1;

#[cfg(target_os = "windows")]
#[link(name = "VirtDisk")]
extern "system" {
    fn OpenVirtualDisk(
        virtual_storage_type: *const VirtualStorageType,
        path: *const u16,
        virtual_disk_access_mask: u32,
        flags: u32,
        parameters: *const OpenVirtualDiskParameters,
        handle: *mut *mut c_void,
    ) -> u32;

    fn SetVirtualDiskInformation(
        virtual_disk_handle: *mut c_void,
        virtual_disk_info: *const SetVirtualDiskInfo,
    ) -> u32;
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn CloseHandle(handle: *mut c_void) -> i32;
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
    let app_base_path = resolve_with_base(&base_dir, cfg.app_base_path.trim());
    let app_patch_paths = normalize_patch_paths(cfg.app_patch_paths.clone())
        .iter()
        .map(|path| resolve_with_base(&base_dir, path))
        .collect::<Vec<_>>();
    let appdata_path = resolve_with_base(&base_dir, cfg.appdata_path.trim());
    let option_path = resolve_with_base(&base_dir, cfg.option_path.trim());

    if !app_base_path.exists() {
        return Err(format!("App base VHD not found: {}", app_base_path.to_string_lossy()));
    }
    for (index, app_patch_path) in app_patch_paths.iter().enumerate() {
        if !app_patch_path.exists() {
            return Err(format!(
                "App patch VHD not found at position {}: {}",
                index + 1,
                app_patch_path.to_string_lossy()
            ));
        }
    }
    if !appdata_path.exists() {
        return Err(format!("AppData VHD not found: {}", appdata_path.to_string_lossy()));
    }
    if !option_path.exists() {
        return Err(format!("Option VHD not found: {}", option_path.to_string_lossy()));
    }

    Ok(ResolvedVhdConfig {
        app_base_path,
        app_patch_paths,
        appdata_path,
        option_path,
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

fn runtime_path_for_parent(parent_path: &Path) -> PathBuf {
    let parent = parent_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = parent_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("runtime");
    let ext = parent_path.extension().and_then(OsStr::to_str).unwrap_or("vhd");
    parent.join(format!("{}-runtime.{}", stem, ext))
}

fn ensure_drive_free(drive_letter: char) -> Result<(), String> {
    let root = format!("{}:\\", drive_letter.to_ascii_uppercase());
    if Path::new(&root).exists() {
        return Err(format!(
            "Drive {}: is already in use. Please eject or change the assigned drive.",
            drive_letter.to_ascii_uppercase()
        ));
    }
    Ok(())
}

fn ensure_mount_points_free() -> Result<(), String> {
    ensure_drive_free('X')?;
    ensure_drive_free('Y')?;
    ensure_drive_free('Z')?;
    Ok(())
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
    let cmd = "Start-Sleep -Milliseconds 300; $shell = New-Object -ComObject Shell.Application; $shell.Windows() | Where-Object { $_.LocationURL -like 'file:///X:*' -or $_.LocationURL -like 'file:///X:/*' -or $_.LocationURL -like 'file:///Y:*' -or $_.LocationURL -like 'file:///Y:/*' -or $_.LocationURL -like 'file:///Z:*' -or $_.LocationURL -like 'file:///Z:/*' } | ForEach-Object { $_.Quit() }";
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

fn cleanup_repair_root(repair_root: &Option<PathBuf>) {
    if let Some(root) = repair_root {
        if root.exists() {
            let _ = fs::remove_dir_all(root);
        }
    }
}

#[cfg(target_os = "windows")]
fn win32_error(status: u32) -> String {
    std::io::Error::from_raw_os_error(status as i32).to_string()
}

#[cfg(target_os = "windows")]
fn to_wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(target_os = "windows")]
fn device_id_for_path(path: &Path) -> Result<u32, String> {
    match path
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("vhd") => Ok(VIRTUAL_STORAGE_TYPE_DEVICE_VHD),
        Some("vhdx") => Ok(VIRTUAL_STORAGE_TYPE_DEVICE_VHDX),
        _ => Err(format!(
            "Unsupported virtual disk type for auto-repair: {}",
            path.to_string_lossy()
        )),
    }
}

#[cfg(target_os = "windows")]
fn set_vhd_parent_path(child_path: &Path, parent_path: &Path) -> Result<(), String> {
    let storage_type = VirtualStorageType {
        device_id: device_id_for_path(child_path)?,
        vendor_id: Guid {
            data1: 0xec98_4aec,
            data2: 0xa0f9,
            data3: 0x47e9,
            data4: [0x90, 0x1f, 0x71, 0x41, 0x5a, 0x66, 0x34, 0x5b],
        },
    };
    let child_wide = to_wide_path(child_path);
    let parent_wide = to_wide_path(parent_path);
    let open_params = OpenVirtualDiskParameters {
        version: OPEN_VIRTUAL_DISK_VERSION_1,
        union_data: OpenVirtualDiskParametersUnion {
            version1: OpenVirtualDiskParametersVersion1 { rw_depth: 1 },
        },
    };
    let mut handle: *mut c_void = std::ptr::null_mut();
    let open_status = unsafe {
        OpenVirtualDisk(
            &storage_type,
            child_wide.as_ptr(),
            VIRTUAL_DISK_ACCESS_METAOPS,
            OPEN_VIRTUAL_DISK_FLAG_NO_PARENTS,
            &open_params,
            &mut handle,
        )
    };
    if open_status != 0 {
        return Err(format!(
            "Failed to open differencing VHD for repair ({}): {}",
            child_path.to_string_lossy(),
            win32_error(open_status)
        ));
    }

    let set_info = SetVirtualDiskInfo {
        version: SET_VIRTUAL_DISK_INFO_PARENT_PATH,
        union_data: SetVirtualDiskInfoUnion {
            parent_file_path: parent_wide.as_ptr(),
        },
    };
    let set_status = unsafe { SetVirtualDiskInformation(handle, &set_info) };
    unsafe {
        let _ = CloseHandle(handle);
    }
    if set_status != 0 {
        return Err(format!(
            "Failed to set differencing VHD parent (child: {}, parent: {}): {}",
            child_path.to_string_lossy(),
            parent_path.to_string_lossy(),
            win32_error(set_status)
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_vhd_parent_path(_child_path: &Path, _parent_path: &Path) -> Result<(), String> {
    Err("Auto-repair is only supported on Windows".to_string())
}

fn prepare_repaired_patch_chain(cfg: &ResolvedVhdConfig) -> Result<PreparedPatchChain, String> {
    let repair_root = std::env::temp_dir().join(format!("configarc_vhd_repair_{}", temp_tag()));
    fs::create_dir_all(&repair_root).map_err(|e| e.to_string())?;

    let mut parent_path = cfg.app_base_path.clone();
    let mut repaired_patch_paths = Vec::with_capacity(cfg.app_patch_paths.len());
    for (index, patch_path) in cfg.app_patch_paths.iter().enumerate() {
        let file_name = patch_path
            .file_name()
            .and_then(OsStr::to_str)
            .ok_or_else(|| format!("Invalid patch VHD filename: {}", patch_path.to_string_lossy()))?;
        let repaired_path = repair_root.join(format!("{:02}_{}", index + 1, file_name));
        fs::copy(patch_path, &repaired_path).map_err(|e| {
            format!(
                "Failed to copy patch VHD for auto-repair ({}): {}",
                patch_path.to_string_lossy(),
                e
            )
        })?;
        if let Err(err) = set_vhd_parent_path(&repaired_path, &parent_path) {
            cleanup_repair_root(&Some(repair_root.clone()));
            return Err(err);
        }
        parent_path = repaired_path.clone();
        repaired_patch_paths.push(repaired_path);
    }

    Ok(PreparedPatchChain {
        app_patch_paths: repaired_patch_paths,
        repair_root,
    })
}

fn mount_image_to_drive(image_path: &Path, drive_letter: char) -> Result<(), String> {
    let drive = drive_letter.to_ascii_uppercase();
    let access_path = format!("{}:\\", drive);
    let mount_cmd = format!(
        "Mount-DiskImage -ImagePath \"{}\" -StorageType VHD -NoDriveLetter -Passthru -Access ReadWrite -Confirm:$false -ErrorAction Stop | Get-Disk | Get-Partition | Where-Object {{ ($_ | Get-Volume) -ne $Null }} | Add-PartitionAccessPath -AccessPath \"{}\" -ErrorAction Stop | Out-Null",
        image_path.to_string_lossy(),
        access_path
    );
    run_powershell(&mount_cmd)
}

fn dismount_image(image_path: &Path) {
    let dismount = format!(
        "Dismount-DiskImage -ImagePath \"{}\" -Confirm:$false -ErrorAction SilentlyContinue",
        image_path.to_string_lossy()
    );
    let _ = run_powershell(&dismount);
}

fn cleanup_runtime(runtime_path: &Option<PathBuf>) {
    if let Some(path) = runtime_path {
        dismount_image(path);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }
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

fn mount_vhd_via_helper(cfg: &ResolvedVhdConfig, repair_root: Option<PathBuf>) -> Result<ElevatedVhdMount, String> {
    let tag = temp_tag();
    let temp = std::env::temp_dir();
    let script_path = temp.join(format!("configarc_vhd_helper_{tag}.ps1"));
    let params_path = temp.join(format!("configarc_vhd_params_{tag}.json"));
    let result_path = temp.join(format!("configarc_vhd_result_{tag}.json"));
    let signal_path = temp.join(format!("configarc_vhd_signal_{tag}.flag"));
    let done_path = temp.join(format!("configarc_vhd_done_{tag}.flag"));

    fs::write(&script_path, VHD_HELPER_SCRIPT.as_bytes()).map_err(|e| e.to_string())?;
    // Cleanup old files
    let _ = fs::remove_file(&result_path);
    let _ = fs::remove_file(&signal_path);
    let _ = fs::remove_file(&done_path);
    let _ = fs::remove_file(&params_path);

    let params = VhdHelperParams {
        app_base: cfg.app_base_path.clone(),
        app_patches: cfg.app_patch_paths.clone(),
        app_data: cfg.appdata_path.clone(),
        option: cfg.option_path.clone(),
        delta: cfg.delta_enabled,
        repair_root,
        result_path: result_path.clone(),
        signal_path: signal_path.clone(),
        done_path: done_path.clone(),
    };

    let params_json = serde_json::to_string_pretty(&params).map_err(|e| e.to_string())?;
    fs::write(&params_path, params_json).map_err(|e| e.to_string())?;

    let args = vec![
        "-NoProfile".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-File".to_string(),
        script_path.to_string_lossy().to_string(),
        "-ConfigPath".to_string(),
        params_path.to_string_lossy().to_string(),
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

    let result = wait_for_helper_result(&result_path, Duration::from_secs(30))?;
    if !result.ok {
        let message = result.error.unwrap_or_else(|| "Elevated mount helper failed".to_string());
        return Err(message);
    }

    let _ = result.app_mount_path;
    let _ = result.app_runtime_path;

    Ok(ElevatedVhdMount {
        script_path,
        result_path,
        signal_path,
        done_path,
    })
}

fn mount_vhd_once(cfg: &ResolvedVhdConfig, repair_root: Option<PathBuf>) -> Result<MountedVhd, String> {
    ensure_mount_points_free()?;

    let app_parent_path = cfg.app_parent_path();
    let mut app_mount_path = app_parent_path.to_path_buf();
    let mut app_runtime_path = None;
    if cfg.delta_enabled {
        let delta_path = runtime_path_for_parent(app_parent_path);
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
            app_parent_path.to_string_lossy()
        );
        run_diskpart(&script)?;
        if !delta_path.exists() {
            return Err("Failed to create runtime VHD".to_string());
        }
        app_mount_path = delta_path.clone();
        app_runtime_path = Some(delta_path);
    }

    if let Err(err) = mount_image_to_drive(&app_mount_path, 'X') {
        cleanup_runtime(&app_runtime_path);
        cleanup_repair_root(&repair_root);
        return Err(err);
    }
    if let Err(err) = mount_image_to_drive(&cfg.appdata_path, 'Y') {
        dismount_image(&app_mount_path);
        cleanup_runtime(&app_runtime_path);
        cleanup_repair_root(&repair_root);
        return Err(err);
    }
    if let Err(err) = mount_image_to_drive(&cfg.option_path, 'Z') {
        dismount_image(&cfg.appdata_path);
        dismount_image(&app_mount_path);
        cleanup_runtime(&app_runtime_path);
        cleanup_repair_root(&repair_root);
        return Err(err);
    }

    close_explorer_for_x_drive();

    Ok(MountedVhd {
        app_mount_path,
        app_runtime_path,
        appdata_mount_path: cfg.appdata_path.clone(),
        option_mount_path: cfg.option_path.clone(),
        repair_root,
    })
}

pub fn mount_vhd(cfg: &ResolvedVhdConfig) -> Result<MountedVhd, String> {
    mount_vhd_once(cfg, None)
}

pub fn unmount_vhd(mounted: &MountedVhd) -> Result<(), String> {
    dismount_image(&mounted.option_mount_path);
    dismount_image(&mounted.appdata_mount_path);
    dismount_image(&mounted.app_mount_path);
    cleanup_runtime(&mounted.app_runtime_path);
    cleanup_repair_root(&mounted.repair_root);
    Ok(())
}

pub fn mount_vhd_with_elevation(cfg: &ResolvedVhdConfig) -> Result<VhdMountHandle, String> {
    let try_mount = |cfg: &ResolvedVhdConfig, repair_root: Option<PathBuf>| -> Result<VhdMountHandle, String> {
        if is_running_as_admin() {
            mount_vhd_once(cfg, repair_root).map(VhdMountHandle::Direct)
        } else {
            mount_vhd_via_helper(cfg, repair_root).map(VhdMountHandle::Elevated)
        }
    };

    match try_mount(cfg, None) {
        Ok(handle) => Ok(handle),
        Err(first_err) if !cfg.app_patch_paths.is_empty() => {
            let prepared = prepare_repaired_patch_chain(cfg)
                .map_err(|repair_err| format!("{first_err} | Auto-repair setup failed: {repair_err}"))?;
            let mut repaired_cfg = cfg.clone();
            repaired_cfg.app_patch_paths = prepared.app_patch_paths.clone();
            let repair_root = prepared.repair_root.clone();
            match try_mount(&repaired_cfg, Some(repair_root.clone())) {
                Ok(handle) => Ok(handle),
                Err(second_err) => {
                    cleanup_repair_root(&Some(repair_root));
                    Err(format!("{first_err} | Auto-repair retry failed: {second_err}"))
                }
            }
        }
        Err(err) => Err(err),
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

#[cfg(test)]
mod tests {
    use super::{ResolvedVhdConfig, VhdConfig};
    use std::path::Path;
    use std::path::PathBuf;

    #[test]
    fn deserializes_legacy_single_patch_config() {
        let cfg: VhdConfig = serde_json::from_str(
            r#"{
                "app_base_path":"base.vhd",
                "app_patch_path":"patch-1.vhd",
                "appdata_path":"appdata.vhd",
                "option_path":"option.vhd",
                "delta_enabled":true
            }"#,
        )
        .unwrap();

        assert_eq!(cfg.app_patch_paths, vec!["patch-1.vhd"]);
    }

    #[test]
    fn deserializes_multi_patch_config_and_drops_blank_entries() {
        let cfg: VhdConfig = serde_json::from_str(
            r#"{
                "app_base_path":"base.vhd",
                "app_patch_paths":["patch-1.vhd"," ","patch-2.vhd"],
                "appdata_path":"appdata.vhd",
                "option_path":"option.vhd"
            }"#,
        )
        .unwrap();

        assert_eq!(cfg.app_patch_paths, vec!["patch-1.vhd", "patch-2.vhd"]);
        assert!(cfg.delta_enabled);
    }

    #[test]
    fn uses_latest_patch_as_runtime_parent_or_base_when_empty() {
        let with_patches = ResolvedVhdConfig {
            app_base_path: PathBuf::from("base.vhd"),
            app_patch_paths: vec![PathBuf::from("patch-1.vhd"), PathBuf::from("patch-2.vhd")],
            appdata_path: PathBuf::from("appdata.vhd"),
            option_path: PathBuf::from("option.vhd"),
            delta_enabled: true,
        };
        assert_eq!(with_patches.app_parent_path(), Path::new("patch-2.vhd"));

        let without_patches = ResolvedVhdConfig {
            app_base_path: PathBuf::from("base.vhd"),
            app_patch_paths: vec![],
            appdata_path: PathBuf::from("appdata.vhd"),
            option_path: PathBuf::from("option.vhd"),
            delta_enabled: true,
        };
        assert_eq!(without_patches.app_parent_path(), Path::new("base.vhd"));
    }
}
