#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod error;
mod fsdecrypt;
mod games;
mod icf;
mod trusted;
mod vhd;

use commands::*;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_segatoools_config,
            save_segatoools_config,
            export_segatoools_config_cmd,
            import_segatoools_config_cmd,
            export_profile_cmd,
            import_profile_cmd,
            list_profiles_cmd,
            load_profile_cmd,
            save_profile_cmd,
            delete_profile_cmd,
            list_games_cmd,
            save_game_cmd,
            load_vhd_config_cmd,
            save_vhd_config_cmd,
            delete_game_cmd,
            launch_game_cmd,
            apply_profile_to_game_cmd,
            pick_game_folder_cmd,
            pick_game_auto_cmd,
            pick_vhd_game_cmd,
            pick_decrypt_files_cmd,
            default_segatoools_config_cmd,
            segatoools_path_cmd,
            get_data_paths_cmd,
            get_active_game_cmd,
            scan_game_vfs_folders_cmd,
            set_active_game_cmd,
            list_json_configs_cmd,
            load_json_config_cmd,
            save_json_config_cmd,
            load_icf_cmd,
            save_icf_cmd,
            list_option_files_cmd,
            get_mods_status_cmd,
            list_aimes_cmd,
            save_aime_cmd,
            update_aime_cmd,
            delete_aime_cmd,
            apply_aime_to_active_cmd,
            get_active_aime_cmd,
            store_io_dll_cmd,
            load_changelog_cmd,
            add_mods_cmd,
            delete_mod_cmd,
            load_fsdecrypt_keys_cmd,
            decrypt_game_files_cmd,
            segatools_trust_status_cmd,
            deploy_segatoools_cmd,
            rollback_segatoools_cmd
        ])
        .setup(|app| {
            app.handle();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
