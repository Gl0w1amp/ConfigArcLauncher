use super::model::Game;
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

  let inject_path = working_dir.join("inject.exe");
  
  // Check if we should use inject (Segatools style)
  if inject_path.exists() {
    let exe_name = exe_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let (hook_dll, target_name) = match exe_name.as_str() {
      "Sinmai.exe" => ("mai2hook.dll", "sinmai"),
      "chusanApp.exe" => ("chuhook.dll", "chusanApp"),
      "mu3.exe" => ("mu3hook.dll", "mu3"),
      _ => ("", "")
    };

    if !hook_dll.is_empty() {
      // Create a batch script to handle the complex launch sequence
      let amdaemon_path = working_dir.join("amdaemon.exe");
      let has_amdaemon = amdaemon_path.exists();
      
      let mut batch_content = String::from("@echo off\r\n");
      batch_content.push_str("cd /d \"%~dp0\"\r\n");
      
      if has_amdaemon {
        batch_content.push_str(&format!("start \"AM Daemon\" /min inject -d -k {} amdaemon.exe -f -c config_common.json config_server.json config_client.json\r\n", hook_dll));
      }
      
      // Construct game args string
      let args_str = game.launch_args.join(" ");
      batch_content.push_str(&format!("inject -d -k {} {} {}\r\n", hook_dll, target_name, args_str));
      
      if has_amdaemon {
        batch_content.push_str("taskkill /f /im amdaemon.exe > nul 2>&1\r\n");
      }

      let batch_path = working_dir.join("launch_temp.bat");
      fs::write(&batch_path, batch_content).map_err(|e| GameError::Launch(format!("Failed to write batch file: {}", e)))?;

      let mut cmd = Command::new("cmd");
      cmd.args(&["/c", batch_path.to_str().unwrap()]);
      cmd.current_dir(working_dir);
      cmd.creation_flags(CREATE_NEW_CONSOLE);
      
      // We spawn it. The batch file will handle the waiting for game process because 'inject' blocks until the injected process exits?
      // Actually 'inject' usually blocks.
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
