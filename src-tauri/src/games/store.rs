use super::model::Game;
use crate::error::GameError;
use std::fs;
use std::path::{Path, PathBuf};

fn games_path() -> PathBuf {
  Path::new(".").join("configarc_games.json")
}

pub fn list_games() -> Result<Vec<Game>, GameError> {
  let path = games_path();
  if !path.exists() {
    return Ok(vec![]);
  }
  let data = fs::read_to_string(&path)?;
  if data.trim().is_empty() {
    return Ok(vec![]);
  }
  let games: Vec<Game> = serde_json::from_str(&data)?;
  Ok(games)
}

pub fn save_game(game: Game) -> Result<(), GameError> {
  let mut games = list_games()?;
  games.retain(|g| g.id != game.id);
  games.push(game.clone());

  let path = games_path();
  let json = serde_json::to_string_pretty(&games)?;
  fs::write(path, json)?;

  Ok(())
}

pub fn delete_game(id: &str) -> Result<(), GameError> {
  let mut games = list_games()?;
  let before = games.len();
  games.retain(|g| g.id != id);
  if games.len() == before {
    return Err(GameError::NotFound(id.to_string()));
  }
  let path = games_path();
  let json = serde_json::to_string_pretty(&games)?;
  fs::write(path, json)?;
  Ok(())
}

pub fn game_root_dir(game: &Game) -> Option<PathBuf> {
  if let Some(dir) = &game.working_dir {
    if !dir.is_empty() {
      return Some(PathBuf::from(dir));
    }
  }
  Path::new(&game.executable_path).parent().map(|p| p.to_path_buf())
}
