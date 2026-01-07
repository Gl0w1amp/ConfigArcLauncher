use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LaunchMode {
  Folder,
  Vhd,
}

impl Default for LaunchMode {
  fn default() -> Self {
    LaunchMode::Folder
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
  pub id: String,
  pub name: String,
  pub executable_path: String,
  pub working_dir: Option<String>,
  pub launch_args: Vec<String>,
  pub enabled: bool,
  pub tags: Vec<String>,
  #[serde(default)]
  pub launch_mode: LaunchMode,
}
