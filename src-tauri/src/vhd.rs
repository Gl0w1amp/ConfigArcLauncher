use crate::config::paths::segatools_root_for_game_id;
use crate::error::ConfigError;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::os::windows::process::CommandExt;

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

fn ensure_x_drive_free() -> Result<(), String> {
    if Path::new("X:\\").exists() {
        return Err("Drive X: is already in use. Please eject or change the assigned drive.".to_string());
    }
    Ok(())
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
