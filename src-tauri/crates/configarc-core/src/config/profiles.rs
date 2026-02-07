use super::paths::{profiles_dir_for_active, profiles_dir_for_game};
use super::SegatoolsConfig;
use crate::error::ConfigError;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigProfile {
  pub id: String,
  pub name: String,
  pub description: Option<String>,
  pub segatools: SegatoolsConfig,
  pub created_at: String,
  pub updated_at: String,
}

fn profiles_path(game_id: Option<&str>) -> Result<std::path::PathBuf, ConfigError> {
  let dir = match game_id {
    Some(id) => profiles_dir_for_game(id)?,
    None => profiles_dir_for_active()?,
  };
  Ok(dir.join("configarc_profiles.json"))
}

pub fn list_profiles(game_id: Option<&str>) -> Result<Vec<ConfigProfile>, ConfigError> {
  let path = profiles_path(game_id)?;
  if !path.exists() {
    return Ok(vec![]);
  }
  let data = fs::read_to_string(&path)?;
  if data.trim().is_empty() {
    return Ok(vec![]);
  }
  let profiles: Vec<ConfigProfile> = serde_json::from_str(&data)?;
  Ok(profiles)
}

pub fn load_profile(id: &str, game_id: Option<&str>) -> Result<ConfigProfile, ConfigError> {
  let profiles = list_profiles(game_id)?;
  profiles
    .into_iter()
    .find(|p| p.id == id)
    .ok_or_else(|| ConfigError::NotFound(format!("Profile {}", id)))
}

pub fn save_profile(profile: &ConfigProfile) -> Result<(), ConfigError> {
  let mut profiles = list_profiles(None)?;
  profiles.retain(|p| p.id != profile.id);
  profiles.push(profile.clone());

  let path = profiles_path(None)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  let json = serde_json::to_string_pretty(&profiles)?;
  fs::write(path, json)?;
  Ok(())
}

pub fn save_profile_for_game(profile: &ConfigProfile, game_id: &str) -> Result<(), ConfigError> {
  let mut profiles = list_profiles(Some(game_id))?;
  profiles.retain(|p| p.id != profile.id);
  profiles.push(profile.clone());

  let path = profiles_path(Some(game_id))?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  let json = serde_json::to_string_pretty(&profiles)?;
  fs::write(path, json)?;
  Ok(())
}

pub fn delete_profile(id: &str) -> Result<(), ConfigError> {
  let mut profiles = list_profiles(None)?;
  let before = profiles.len();
  profiles.retain(|p| p.id != id);
  if profiles.len() == before {
    return Err(ConfigError::NotFound(id.to_string()));
  }
  let path = profiles_path(None)?;
  let json = serde_json::to_string_pretty(&profiles)?;
  fs::write(path, json)?;
  Ok(())
}
