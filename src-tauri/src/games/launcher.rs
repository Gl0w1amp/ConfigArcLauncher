use super::model::Game;
use crate::config::paths::segatools_root_for_game_id;
use crate::error::GameError;
use std::path::Path;
use std::process::Command;
use std::fs;
use std::os::windows::process::CommandExt;

const CREATE_NEW_CONSOLE: u32 = 0x00000010;

pub fn launch_game(game: &Game) -> Result<(), GameError> {
  if !game.enabled {
    return Err(GameError::Launch("Game is disabled".to_string()));
  }

  let exe_path = Path::new(&game.executable_path);
  let working_dir = if let Some(dir) = &game.working_dir {
    Path::new(dir)
  } else {
    exe_path.parent().unwrap_or(Path::new("."))
  };

  let segatools_root = segatools_root_for_game_id(&game.id);
  let inject_path = segatools_root.join("inject.exe");
  let inject_x64_path = segatools_root.join("inject_x64.exe");
  let inject_x86_path = segatools_root.join("inject_x86.exe");
  let hook_chusan_x64 = segatools_root.join("chusanhook_x64.dll");
  let hook_chusan_x86 = segatools_root.join("chusanhook_x86.dll");
  let hook_mai2 = segatools_root.join("mai2hook.dll");
  let hook_mu3 = segatools_root.join("mu3hook.dll");
  let has_inject = inject_path.exists() || inject_x86_path.exists() || inject_x64_path.exists();
  
  // Check if we should use inject (Segatools style)
  if has_inject {
    let exe_name = exe_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    
    let mut batch_content = String::new();
    let mut handled = false;

    if exe_name == "chusanApp.exe" {
      let inject_x64 = if inject_x64_path.exists() {
        Some(&inject_x64_path)
      } else if inject_path.exists() {
        Some(&inject_path)
      } else {
        None
      };
      let inject_x86 = if inject_x86_path.exists() { Some(&inject_x86_path) } else { None };

      if let (Some(inject_x64), Some(inject_x86)) = (inject_x64, inject_x86) {
        batch_content.push_str("@echo off\r\n");
        batch_content.push_str(&format!("cd /d \"{}\"\r\n", working_dir.to_string_lossy()));
        batch_content.push_str(&format!(
          "start \"\" /min \"{}\" -d -k \"{}\" amdaemon.exe -c config_common.json config_server.json config_client.json config_cvt.json config_sp.json config_hook.json\r\n",
          inject_x64.to_string_lossy(),
          hook_chusan_x64.to_string_lossy()
        ));
        
        let args_str = game.launch_args.join(" ");
        batch_content.push_str(&format!(
          "\"{}\" -d -k \"{}\" chusanApp.exe {}\r\n",
          inject_x86.to_string_lossy(),
          hook_chusan_x86.to_string_lossy(),
          args_str
        ));
        batch_content.push_str("taskkill /f /im amdaemon.exe > nul 2>&1\r\n");
        handled = true;
      }
    } else {
      let (hook_dll, target_name) = match exe_name.as_str() {
        "Sinmai.exe" => (Some(&hook_mai2), "sinmai"),
        "mu3.exe" => (Some(&hook_mu3), "mu3"),
        _ => (None, "")
      };

      let inject = if inject_path.exists() {
        Some(&inject_path)
      } else if inject_x64_path.exists() {
        Some(&inject_x64_path)
      } else {
        None
      };

      if hook_dll.is_some() && inject.is_some() {
        let amdaemon_path = working_dir.join("amdaemon.exe");
        let has_amdaemon = amdaemon_path.exists();
        let inject = inject.unwrap();
        let hook_dll = hook_dll.unwrap();
        
        batch_content.push_str("@echo off\r\n");
        batch_content.push_str(&format!("cd /d \"{}\"\r\n", working_dir.to_string_lossy()));
        
        if has_amdaemon {
          batch_content.push_str(&format!(
            "start \"\" /min \"{}\" -d -k \"{}\" amdaemon.exe -f -c config_common.json config_server.json config_client.json\r\n",
            inject.to_string_lossy(),
            hook_dll.to_string_lossy()
          ));
        }
        
        let args_str = game.launch_args.join(" ");
        batch_content.push_str(&format!(
          "\"{}\" -d -k \"{}\" {} {}\r\n",
          inject.to_string_lossy(),
          hook_dll.to_string_lossy(),
          target_name,
          args_str
        ));
        
        if has_amdaemon {
          batch_content.push_str("taskkill /f /im amdaemon.exe > nul 2>&1\r\n");
        }
        handled = true;
      }
    }

    if handled {
      let batch_path = segatools_root.join("launch_temp.bat");
      if let Some(parent) = batch_path.parent() {
        fs::create_dir_all(parent).map_err(|e| GameError::Launch(format!("Failed to create segatools dir: {}", e)))?;
      }
      fs::write(&batch_path, batch_content).map_err(|e| GameError::Launch(format!("Failed to write batch file: {}", e)))?;

      let mut cmd = Command::new("cmd");
      cmd.args(&["/c", batch_path.to_str().unwrap()]);
      cmd.current_dir(working_dir);
      cmd.creation_flags(CREATE_NEW_CONSOLE);
      
      cmd.spawn().map_err(|e| GameError::Launch(e.to_string()))?;
      
      return Ok(());
    }
  }

  // Fallback to normal launch
  let mut cmd = Command::new(&game.executable_path);
  if let Some(dir) = &game.working_dir {
    if !dir.is_empty() {
      cmd.current_dir(dir);
    }
  }
  cmd.args(&game.launch_args);
  cmd.creation_flags(CREATE_NEW_CONSOLE);
  cmd.spawn().map_err(|e| GameError::Launch(e.to_string()))?;
  Ok(())
}
