#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod error;
mod games;

use commands::*;
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_segatoools_config,
            save_segatoools_config,
            list_profiles_cmd,
            load_profile_cmd,
            save_profile_cmd,
            delete_profile_cmd,
            list_games_cmd,
            save_game_cmd,
            delete_game_cmd,
            launch_game_cmd,
            pick_game_folder_cmd,
            default_segatoools_config_cmd,
            segatoools_path_cmd,
            get_active_game_cmd,
            set_active_game_cmd
        ])
        .setup(|app| {
            app.handle();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
