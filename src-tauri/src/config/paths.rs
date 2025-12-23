use crate::error::ConfigError;
use crate::games::store;
use std::fs;
use std::env;
use std::path::{Path, PathBuf};

fn active_game_file() -> PathBuf {
  Path::new(".").join("configarc_active_game.json")
}

pub fn get_active_game_id() -> Result<Option<String>, ConfigError> {
  let path = active_game_file();
  if !path.exists() {
    return Ok(None);
  }
  let data = fs::read_to_string(path)?;
  if data.trim().is_empty() {
    return Ok(None);
  }
  Ok(Some(data.trim().to_string()))
}

pub fn set_active_game_id(id: &str) -> Result<(), ConfigError> {
  fs::write(active_game_file(), id)?;
  Ok(())
}

pub fn game_dir(game_id: &str) -> Result<PathBuf, ConfigError> {
  let games = store::list_games().map_err(|e| ConfigError::Parse(e.to_string()))?;
  let game = games
    .into_iter()
    .find(|g| g.id == game_id)
    .ok_or_else(|| ConfigError::NotFound(format!("Game {} not found", game_id)))?;
  store::game_root_dir(&game)
    .ok_or_else(|| ConfigError::NotFound("Game path missing".to_string()))
}

pub fn active_game_dir() -> Result<PathBuf, ConfigError> {
  let active = get_active_game_id()?
    .ok_or_else(|| ConfigError::NotFound("No active game selected".to_string()))?;
  game_dir(&active)
}

fn app_root_dir() -> PathBuf {
  std::env::current_exe()
    .ok()
    .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
    .unwrap_or_else(|| Path::new(".").to_path_buf())
}

fn segatools_base_dir() -> PathBuf {
  app_root_dir().join("Segatools")
}

pub fn segatools_root_for_game_id(game_id: &str) -> PathBuf {
  segatools_base_dir().join(game_id)
}

pub fn segatools_root_for_active() -> Result<PathBuf, ConfigError> {
  let active = get_active_game_id()?
    .ok_or_else(|| ConfigError::NotFound("No active game selected".to_string()))?;
  let _ = game_dir(&active)?;
  Ok(segatools_root_for_game_id(&active))
}

pub fn segatoools_path_for_active() -> Result<PathBuf, ConfigError> {
  let custom = env::var("SEGATOOLS_CONFIG_PATH").ok();
  if let Some(p) = custom {
    return Ok(PathBuf::from(p));
  }
  Ok(segatools_root_for_active()?.join("segatools.ini"))
}

pub fn segatoools_path_for_game_id(game_id: &str) -> Result<PathBuf, ConfigError> {
  let custom = env::var("SEGATOOLS_CONFIG_PATH").ok();
  if let Some(p) = custom {
    return Ok(PathBuf::from(p));
  }
  Ok(segatools_root_for_game_id(game_id).join("segatools.ini"))
}

pub fn profiles_dir_for_game(game_id: &str) -> Result<PathBuf, ConfigError> {
  Ok(segatools_root_for_game_id(game_id).join("Segatools_Config"))
}

pub fn profiles_dir_for_active() -> Result<PathBuf, ConfigError> {
  Ok(segatools_root_for_active()?.join("Segatools_Config"))
}

pub fn ensure_default_segatoools_exists() -> Result<(), ConfigError> {
  let path = segatoools_path_for_active()?;
  if !path.exists() {
    return Err(ConfigError::NotFound(
      "segatools.ini not found. Please deploy first.".to_string(),
    ));
  }
  Ok(())
}
