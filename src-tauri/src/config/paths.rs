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

pub fn active_game_dir() -> Result<PathBuf, ConfigError> {
  let active = get_active_game_id()?
    .ok_or_else(|| ConfigError::NotFound("No active game selected".to_string()))?;
  let games = store::list_games().map_err(|e| ConfigError::Parse(e.to_string()))?;
  let game = games
    .into_iter()
    .find(|g| g.id == active)
    .ok_or_else(|| ConfigError::NotFound("Active game not found".to_string()))?;
  store::game_root_dir(&game)
    .ok_or_else(|| ConfigError::NotFound("Game path missing".to_string()))
}

pub fn segatoools_path_for_active() -> Result<PathBuf, ConfigError> {
  let dir = active_game_dir()?;
  let custom = env::var("SEGATOOLS_CONFIG_PATH").ok();
  if let Some(p) = custom {
    return Ok(PathBuf::from(p));
  }
  Ok(dir.join("segatools.ini"))
}

pub fn profiles_dir_for_active() -> Result<PathBuf, ConfigError> {
  let dir = active_game_dir()?;
  Ok(dir.join("Segatools_Config"))
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
