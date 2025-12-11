use crate::config::{
    paths::{
        ensure_default_segatoools_exists, get_active_game_id, segatoools_path_for_active,
        set_active_game_id,
    },
    profiles::{delete_profile, list_profiles, load_profile, save_profile, ConfigProfile},
    segatools::SegatoolsConfig,
    {default_segatoools_config, load_segatoools_config, save_segatoools_config as persist_segatoools_config},
};
use crate::games::{launcher::launch_game, model::Game, store};
use tauri::command;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn scan_game_folder_logic(path: &str) -> Result<Game, String> {
    let dir = Path::new(path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Invalid directory".to_string());
    }

    let mut game = Game {
        id: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis().to_string(),
        name: "".to_string(),
        executable_path: "".to_string(),
        working_dir: Some(path.to_string()),
        launch_args: vec![],
        enabled: true,
        tags: vec![],
    };

    let join_path = |p: &str| dir.join(p).to_str().unwrap_or("").to_string();
    let _inject_path = join_path("inject.exe");

    if dir.join("Sinmai.exe").exists() {
        game.name = "Sinmai".to_string();
        game.executable_path = join_path("Sinmai.exe");
        game.launch_args = vec![
            "-screen-fullscreen".into(), "0".into(),
            "-popupwindow".into(),
            "-screen-width".into(), "2160".into(),
            "-screen-height".into(), "1920".into(),
            "-silent-crashes".into()
        ];
    } else if dir.join("chusanApp.exe").exists() {
        game.name = "Chunithm".to_string();
        game.executable_path = join_path("chusanApp.exe");
        game.launch_args = vec![
            "-screen-fullscreen".into(), "0".into(),
            "-popupwindow".into(),
            "-screen-width".into(), "1080".into(),
            "-screen-height".into(), "1920".into()
        ];
    } else if dir.join("mu3.exe").exists() {
        game.name = "Ongeki".to_string();
        game.executable_path = join_path("mu3.exe");
        game.launch_args = vec![
            "-screen-fullscreen".into(), "0".into(),
            "-popupwindow".into(),
            "-screen-width".into(), "1080".into(),
            "-screen-height".into(), "1920".into()
        ];
    } else {
        return Err("No supported game executable found (Sinmai.exe, chusanApp.exe, mu3.exe)".to_string());
    }

    Ok(game)
}

#[command]
pub fn pick_game_folder_cmd() -> Result<Game, String> {
    let ps_script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }";
    
    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", ps_script])
        .output()
        .map_err(|e| e.to_string())?;
        
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    if path.is_empty() {
        return Err("No folder selected".to_string());
    }
    
    scan_game_folder_logic(&path)
}

#[command]
pub fn get_segatoools_config() -> Result<SegatoolsConfig, String> {
    ensure_default_segatoools_exists().map_err(|e| e.to_string())?;
    let path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    load_segatoools_config(&path).map_err(|e| e.to_string())
}

#[command]
pub fn save_segatoools_config(config: SegatoolsConfig) -> Result<(), String> {
    let path = segatoools_path_for_active().map_err(|e| e.to_string())?;
    persist_segatoools_config(&path, &config).map_err(|e| e.to_string())
}

#[command]
pub fn list_profiles_cmd() -> Result<Vec<ConfigProfile>, String> {
    list_profiles().map_err(|e| e.to_string())
}

#[command]
pub fn load_profile_cmd(id: String) -> Result<ConfigProfile, String> {
    load_profile(&id).map_err(|e| e.to_string())
}

#[command]
pub fn save_profile_cmd(profile: ConfigProfile) -> Result<(), String> {
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
pub fn delete_game_cmd(id: String) -> Result<(), String> {
    store::delete_game(&id).map_err(|e| e.to_string())
}

#[command]
pub fn launch_game_cmd(id: String, profile_id: Option<String>) -> Result<(), String> {
    let games = store::list_games().map_err(|e| e.to_string())?;
    let game = games
        .into_iter()
        .find(|g| g.id == id)
        .ok_or_else(|| "Game not found".to_string())?;

    if let Some(pid) = profile_id.filter(|s| !s.is_empty()) {
        let profile = load_profile(&pid).map_err(|e| e.to_string())?;
        let game_root = store::game_root_dir(&game).ok_or_else(|| "Game path missing".to_string())?;
        let seg_path = game_root.join("segatools.ini");
        persist_segatoools_config(&seg_path, &profile.segatools).map_err(|e| e.to_string())?;
    }

    launch_game(&game).map_err(|e| e.to_string())
}

#[command]
pub fn default_segatoools_config_cmd() -> Result<SegatoolsConfig, String> {
    Ok(default_segatoools_config())
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
pub fn get_active_game_cmd() -> Result<Option<String>, String> {
    get_active_game_id().map_err(|e| e.to_string())
}

#[command]
pub fn set_active_game_cmd(id: String) -> Result<(), String> {
    set_active_game_id(&id).map_err(|e| e.to_string())?;

    // Auto-backup logic: Check if "Original INI" profile exists, if not, create it from current file
    if let Ok(path) = segatoools_path_for_active() {
        if path.exists() {
            let profiles = list_profiles().unwrap_or_default();
            let has_original = profiles.iter().any(|p| p.name == "Original INI");
            
            if !has_original {
                if let Ok(current_cfg) = load_segatoools_config(&path) {
                    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
                    let backup_profile = ConfigProfile {
                        id: format!("original-{}", timestamp),
                        name: "Original INI".to_string(),
                        description: Some("Automatically created from initial configuration".to_string()),
                        segatools: current_cfg,
                        created_at: timestamp.to_string(),
                        updated_at: timestamp.to_string(),
                    };
                    let _ = save_profile(&backup_profile);
                }
            }
        }
    }

    Ok(())
}
