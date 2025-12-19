use crate::fsdecrypt::crypto::GameKeys;
use anyhow::{anyhow, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_KEYS_FILE: &str = "fsdecrypt_keys.json";

#[derive(Debug, Deserialize)]
struct KeyPair {
    key: String,
    iv: String,
}

#[derive(Debug, Deserialize)]
struct GameKeyEntry {
    key: String,
    #[serde(default)]
    iv: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KeyFile {
    bootid: KeyPair,
    option: KeyPair,
    games: HashMap<String, GameKeyEntry>,
}

#[derive(Clone)]
pub struct FsDecryptKeys {
    pub bootid_key: [u8; 16],
    pub bootid_iv: [u8; 16],
    pub option_key: [u8; 16],
    pub option_iv: [u8; 16],
    games: HashMap<String, GameKeys>,
}

#[derive(Clone)]
pub struct KeySourceInfo {
    pub source: String,
    pub game_count: usize,
}

fn decode_hex_16(label: &str, raw: &str) -> Result<[u8; 16]> {
    let cleaned = raw.trim().trim_start_matches("0x");
    let bytes = hex::decode(cleaned)
        .map_err(|e| anyhow!("Invalid hex for {label}: {e}"))?;
    if bytes.len() != 16 {
        return Err(anyhow!(
            "Invalid length for {label}: expected 16 bytes, got {}",
            bytes.len()
        ));
    }
    let mut arr = [0u8; 16];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

fn read_keys_from_file(path: &Path) -> Result<(FsDecryptKeys, KeySourceInfo)> {
    let content = fs::read_to_string(path)
        .map_err(|e| anyhow!("Failed to read keys from {}: {e}", path.display()))?;
    let parsed: KeyFile = serde_json::from_str(&content)
        .map_err(|e| anyhow!("Failed to parse keys json: {e}"))?;
    let keys = parse_key_file(parsed)?;
    let game_count = keys.games.len();
    Ok((
        keys,
        KeySourceInfo {
            source: format!("local:{}", path.display()),
            game_count,
        },
    ))
}

fn read_keys_from_url(url: &str) -> Result<(FsDecryptKeys, KeySourceInfo)> {
    let resp = Client::new()
        .get(url)
        .send()
        .map_err(|e| anyhow!("Failed to download keys json: {e}"))?;
    if !resp.status().is_success() {
        return Err(anyhow!("Failed to download keys json: {}", resp.status()));
    }
    let text = resp.text().map_err(|e| anyhow!("Failed to read keys json: {e}"))?;
    let parsed: KeyFile = serde_json::from_str(&text)
        .map_err(|e| anyhow!("Failed to parse keys json: {e}"))?;
    let keys = parse_key_file(parsed)?;
    let game_count = keys.games.len();
    Ok((
        keys,
        KeySourceInfo {
            source: format!("url:{url}"),
            game_count,
        },
    ))
}

fn parse_key_file(parsed: KeyFile) -> Result<FsDecryptKeys> {
    let bootid_key = decode_hex_16("bootid.key", &parsed.bootid.key)?;
    let bootid_iv = decode_hex_16("bootid.iv", &parsed.bootid.iv)?;
    let option_key = decode_hex_16("option.key", &parsed.option.key)?;
    let option_iv = decode_hex_16("option.iv", &parsed.option.iv)?;

    let mut games = HashMap::new();
    for (id, entry) in parsed.games {
        let key = decode_hex_16(&format!("{id}.key"), &entry.key)?;
        let iv = match entry.iv {
            Some(raw) => Some(decode_hex_16(&format!("{id}.iv"), &raw)?),
            None => None,
        };
        games.insert(id.trim().to_uppercase(), GameKeys { key, iv });
    }

    Ok(FsDecryptKeys {
        bootid_key,
        bootid_iv,
        option_key,
        option_iv,
        games,
    })
}

fn resolve_local_keys_file() -> Result<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let local = cwd.join(DEFAULT_KEYS_FILE);
    if local.exists() {
        return Ok(local);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(DEFAULT_KEYS_FILE);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }
    Err(anyhow!(
        "Key file not found. Place {} next to the app or provide a key URL.",
        DEFAULT_KEYS_FILE
    ))
}

pub fn load_keys(key_url: Option<&str>) -> Result<(FsDecryptKeys, KeySourceInfo)> {
    if let Some(url) = key_url {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return read_keys_from_url(trimmed);
        }
    }
    let local_path = resolve_local_keys_file()?;
    read_keys_from_file(&local_path)
}

impl FsDecryptKeys {
    pub fn game_keys_for(&self, game_id: &str) -> Option<GameKeys> {
        let key = game_id.trim().to_uppercase();
        self.games.get(&key).cloned()
    }
}
