use crate::config::paths::active_game_dir;
use crate::error::ConfigError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonConfigFile {
    pub name: String,
    pub path: String,
    pub kind: String,
}

fn is_allowed_json(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with("config_") && lower.ends_with(".json")
}

fn detect_kind(name: &str) -> String {
  let lower = name.to_lowercase();
  if lower.contains("common") {
      "common"
  } else if lower.contains("client") {
      "client"
  } else if lower.contains("server") {
      "server"
  } else if lower.contains("sp") {
      "sp"
  } else if lower.contains("hook") {
      "hook"
  } else if lower.contains("cvt") {
      "cvt"
  } else {
      "other"
  }
  .to_string()
}

fn sanitize_name(name: &str) -> Result<String, ConfigError> {
    if name.contains('/') || name.contains('\\') {
        return Err(ConfigError::NotFound("Invalid file name".to_string()));
    }
    if !is_allowed_json(name) {
        return Err(ConfigError::NotFound("Unsupported config json".to_string()));
    }
    Ok(name.to_string())
}

fn list_json_configs(dir: &Path) -> Result<Vec<JsonConfigFile>, ConfigError> {
    let mut items = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy().to_string();
        if !is_allowed_json(&name_str) {
            continue;
        }

        items.push(JsonConfigFile {
            name: name_str.clone(),
            path: entry.path().to_string_lossy().to_string(),
            kind: detect_kind(&name_str),
        });
    }

    items.sort_by(|a, b| {
        let priority = |k: &str| if k == "common" { 0 } else { 1 };
        priority(&a.kind).cmp(&priority(&b.kind)).then_with(|| a.name.cmp(&b.name))
    });
    Ok(items)
}

pub fn list_json_configs_for_active() -> Result<Vec<JsonConfigFile>, ConfigError> {
    let dir = active_game_dir()?;
    list_json_configs(&dir)
}

fn path_for_file(dir: &Path, name: &str) -> Result<PathBuf, ConfigError> {
    let clean = sanitize_name(name)?;
    Ok(dir.join(clean))
}

pub fn load_json_config_for_active(name: &str) -> Result<Value, ConfigError> {
    let dir = active_game_dir()?;
    let path = path_for_file(&dir, name)?;
    if !path.exists() {
        return Err(ConfigError::NotFound(format!("File not found: {}", name)));
    }
    let content = fs::read_to_string(&path)?;
    let value: Value = serde_json::from_str(&content)?;
    Ok(value)
}

pub fn save_json_config_for_active(name: &str, content: &Value) -> Result<(), ConfigError> {
    let dir = active_game_dir()?;
    let path = path_for_file(&dir, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let pretty = serde_json::to_string_pretty(content)?;
    fs::write(path, pretty)?;
    Ok(())
}
