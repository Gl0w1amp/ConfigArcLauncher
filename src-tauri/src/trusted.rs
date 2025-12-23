use crate::config::paths::{get_active_game_id, segatools_root_for_active};
use crate::games::{model::Game, store};
use chrono::Utc;
use std::collections::HashMap;
use minisign_verify::{PublicKey, Signature};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime};
use tempfile::NamedTempFile;
use thiserror::Error;
use zip::read::ZipArchive;

const TRUSTED_BASE: &str = "https://cdn.ruminasu.org";
const TRUSTED_PREFIX: &str = "public/configarc/trusted";
const MANIFEST_NAME: &str = "manifest.json";
const PUBLIC_KEY: &str = "untrusted comment: minisign public key 56F1F4A46FE3CC02\nRWQCzONvpPTxVvBPyq/N0SSG3zssF/djaSniAjEW/iEqt6CpfimgfoYy\n";
const BACKUP_DIR: &str = "Segatools_Backup";
const BACKUP_FILES_DIR: &str = "files";
const BACKUP_META_NAME: &str = "metadata.json";
const TRUST_CACHE_TTL_SECS: u64 = 300;

#[derive(Debug, Error)]
pub enum TrustedError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Verification failed: {0}")]
    Verification(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Zip error: {0}")]
    Zip(String),
}

impl From<reqwest::Error> for TrustedError {
    fn from(err: reqwest::Error) -> Self {
        TrustedError::Network(err.to_string())
    }
}

impl From<serde_json::Error> for TrustedError {
    fn from(err: serde_json::Error) -> Self {
        TrustedError::Parse(err.to_string())
    }
}

impl From<minisign_verify::Error> for TrustedError {
    fn from(err: minisign_verify::Error) -> Self {
        TrustedError::Verification(err.to_string())
    }
}

impl From<zip::result::ZipError> for TrustedError {
    fn from(err: zip::result::ZipError) -> Self {
        TrustedError::Zip(err.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedManifest {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub build_id: String,
    #[serde(default)]
    pub upstream: Option<UpstreamInfo>,
    pub artifacts: Vec<TrustedArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpstreamInfo {
    #[serde(default)]
    pub release_tag: String,
    #[serde(default)]
    pub release_name: String,
    #[serde(default)]
    pub asset_url: String,
    #[serde(default)]
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedArtifact {
    pub kind: String,
    pub name: String,
    pub r2_key: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub minisig: Option<TrustedSignature>,
    #[serde(default)]
    pub files: Vec<TrustedFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedSignature {
    pub name: String,
    pub r2_key: String,
    #[serde(default)]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedFile {
    pub path: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileCheckResult {
    pub path: String,
    pub expected_sha256: String,
    pub actual_sha256: Option<String>,
    pub exists: bool,
    pub matches: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SegatoolsTrustStatus {
    pub trusted: bool,
    pub reason: Option<String>,
    pub build_id: Option<String>,
    pub generated_at: Option<String>,
    pub artifact_name: Option<String>,
    pub artifact_sha256: Option<String>,
    pub checked_files: Vec<FileCheckResult>,
    pub has_backup: bool,
    pub missing_files: bool,
    pub local_build_time: Option<String>,
}

fn get_pe_timestamp(path: &Path) -> Option<u32> {
    let mut file = fs::File::open(path).ok()?;
    let mut dos_header = [0u8; 0x40];
    file.read_exact(&mut dos_header).ok()?;
    
    if &dos_header[0..2] != b"MZ" {
        return None;
    }
    
    let e_lfanew = u32::from_le_bytes(dos_header[0x3C..0x40].try_into().ok()?);
    file.seek(SeekFrom::Start(e_lfanew as u64)).ok()?;
    
    let mut pe_sig = [0u8; 4];
    file.read_exact(&mut pe_sig).ok()?;
    if &pe_sig != b"PE\0\0" {
        return None;
    }
    
    // Skip Machine (2) + NumberOfSections (2)
    file.seek(SeekFrom::Current(4)).ok()?;
    
    let mut timestamp_bytes = [0u8; 4];
    file.read_exact(&mut timestamp_bytes).ok()?;
    
    Some(u32::from_le_bytes(timestamp_bytes))
}

fn format_timestamp(ts: u32) -> String {
    use chrono::DateTime;
    if let Some(datetime) = DateTime::from_timestamp(ts as i64, 0) {
        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        String::new()
    }
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub created_at: String,
    pub artifact_name: String,
    pub artifact_sha256: String,
    pub build_id: Option<String>,
    pub backed_up_files: Vec<String>,
    pub new_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeployResult {
    pub deployed: bool,
    pub needs_confirmation: bool,
    pub existing_files: Vec<String>,
    pub backup_dir: Option<String>,
    pub message: Option<String>,
    pub verification: Option<SegatoolsTrustStatus>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RollbackResult {
    pub restored: bool,
    pub message: Option<String>,
    pub verification: Option<SegatoolsTrustStatus>,
}

struct ActiveGameContext {
    game: Game,
    root: PathBuf,
}

struct DownloadedArtifact {
    path: NamedTempFile,
}

#[derive(Clone)]
struct CachedTrustEntry {
    status: SegatoolsTrustStatus,
    mtimes: HashMap<String, SystemTime>,
    cached_at: SystemTime,
}

static TRUST_CACHE: OnceLock<Mutex<HashMap<String, CachedTrustEntry>>> = OnceLock::new();

fn trust_cache() -> &'static Mutex<HashMap<String, CachedTrustEntry>> {
    TRUST_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(root: &Path) -> String {
    root.to_string_lossy().to_string()
}

fn capture_mtimes(root: &Path, files: &[FileCheckResult]) -> HashMap<String, SystemTime> {
    let mut mtimes = HashMap::new();
    for file in files {
        let path = root.join(&file.path);
        if let Ok(meta) = fs::metadata(&path) {
            if let Ok(modified) = meta.modified() {
                mtimes.insert(file.path.clone(), modified);
            }
        }
    }
    mtimes
}

fn files_unchanged(root: &Path, mtimes: &HashMap<String, SystemTime>) -> bool {
    for (rel, cached_time) in mtimes {
        let path = root.join(rel);
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => return false,
        };
        let modified = match meta.modified() {
            Ok(m) => m,
            Err(_) => return false,
        };
        if &modified != cached_time {
            return false;
        }
    }
    true
}

fn cached_status_for(root: &Path) -> Option<SegatoolsTrustStatus> {
    let key = cache_key(root);
    let cache = trust_cache().lock().ok()?;
    let entry = cache.get(&key)?;
    if entry
        .cached_at
        .elapsed()
        .unwrap_or(Duration::from_secs(TRUST_CACHE_TTL_SECS + 1))
        > Duration::from_secs(TRUST_CACHE_TTL_SECS)
    {
        return None;
    }
    if !files_unchanged(root, &entry.mtimes) {
        return None;
    }
    Some(entry.status.clone())
}

fn clear_cached_status(root: &Path) {
    if let Ok(mut cache) = trust_cache().lock() {
        cache.remove(&cache_key(root));
    }
}

fn store_status_for(root: &Path, status: &SegatoolsTrustStatus) {
    // Only cache successful trusted verifications to avoid hiding missing/untrusted states.
    if !status.trusted || status.missing_files {
        clear_cached_status(root);
        return;
    }

    let entry = CachedTrustEntry {
        status: status.clone(),
        mtimes: capture_mtimes(root, &status.checked_files),
        cached_at: SystemTime::now(),
    };

    if let Ok(mut cache) = trust_cache().lock() {
        cache.insert(cache_key(root), entry);
    }
}

fn client() -> Result<Client, TrustedError> {
    Client::builder()
        .user_agent("ConfigArcLauncher/TrustedSupplychain")
        .build()
        .map_err(|e| TrustedError::Network(e.to_string()))
}

fn trusted_url(path: &str) -> String {
    let base = TRUSTED_BASE.trim_end_matches('/');
    let trimmed = path.trim_start_matches('/');
    format!("{}/{}", base, trimmed)
}

fn manifest_url() -> String {
    trusted_url(&format!("{}/{}/{}", TRUSTED_PREFIX, "latest", MANIFEST_NAME))
}

fn manifest_sig_url() -> String {
    trusted_url(&format!(
        "{}/{}/{}.minisig",
        TRUSTED_PREFIX, "latest", MANIFEST_NAME
    ))
}

fn download_bytes(url: &str) -> Result<Vec<u8>, TrustedError> {
    let resp = client()?.get(url).send()?;
    if !resp.status().is_success() {
        return Err(TrustedError::Network(format!(
            "Failed to download {} (status {})",
            url,
            resp.status()
        )));
    }
    let bytes = resp.bytes()?;
    Ok(bytes.to_vec())
}

fn verify_manifest_signature(manifest_bytes: &[u8], sig_bytes: &[u8]) -> Result<(), TrustedError> {
    let sig_str = std::str::from_utf8(sig_bytes)
        .map_err(|e| TrustedError::Verification(format!("Invalid signature utf8: {}", e)))?;
    let pk = PublicKey::decode(PUBLIC_KEY)?;
    let sig = Signature::decode(sig_str)?;
    pk.verify(manifest_bytes, &sig, true)?;
    Ok(())
}

fn fetch_manifest() -> Result<TrustedManifest, TrustedError> {
    let manifest_bytes = download_bytes(&manifest_url())?;
    let sig_bytes = download_bytes(&manifest_sig_url())?;
    verify_manifest_signature(&manifest_bytes, &sig_bytes)?;
    let manifest: TrustedManifest = serde_json::from_slice(&manifest_bytes)?;
    Ok(manifest)
}

fn active_game_ctx() -> Result<ActiveGameContext, TrustedError> {
    let id = get_active_game_id().map_err(|e| TrustedError::NotFound(e.to_string()))?;
    let active_id = id.ok_or_else(|| TrustedError::NotFound("No active game selected".to_string()))?;
    let games = store::list_games().map_err(|e| TrustedError::Parse(e.to_string()))?;
    let game = games
        .into_iter()
        .find(|g| g.id == active_id)
        .ok_or_else(|| TrustedError::NotFound("Active game not found".to_string()))?;
    let root = segatools_root_for_active().map_err(|e| TrustedError::NotFound(e.to_string()))?;
    Ok(ActiveGameContext { game, root })
}

fn canonical_game_name(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    if lower.starts_with("sdez") {
        return "sinmai".to_string();
    }
    lower
}

fn artifact_candidates(game: &Game) -> Vec<&'static str> {
    match canonical_game_name(&game.name).as_str() {
        "chunithm" => vec!["chusan.zip", "chuni.zip"],
        "sinmai" => vec!["mai2.zip"],
        "ongeki" => vec!["mu3.zip"],
        _ => vec![],
    }
}

fn select_artifact<'a>(
    manifest: &'a TrustedManifest,
    game: &Game,
) -> Result<&'a TrustedArtifact, TrustedError> {
    let candidates = artifact_candidates(game);
    for candidate in candidates {
        if let Some(a) = manifest
            .artifacts
            .iter()
            .find(|a| a.kind == "component" && a.name.eq_ignore_ascii_case(candidate))
        {
            return Ok(a);
        }
    }
    Err(TrustedError::NotFound(format!(
        "No trusted artifact found for game {}",
        game.name
    )))
}

fn sha256_reader<R: Read>(mut reader: R) -> Result<String, TrustedError> {
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn download_artifact(artifact: &TrustedArtifact) -> Result<DownloadedArtifact, TrustedError> {
    let url = trusted_url(&artifact.r2_key);
    let mut resp = client()?.get(url).send()?;
    if !resp.status().is_success() {
        return Err(TrustedError::Network(format!(
            "Failed to download artifact {} (status {})",
            artifact.name,
            resp.status()
        )));
    }

    let mut tmp = NamedTempFile::new()?;
    let _written = resp.copy_to(&mut tmp)?;

    tmp.as_file_mut().seek(SeekFrom::Start(0))?;
    let sha = sha256_reader(tmp.as_file_mut())?;
    if !artifact.sha256.is_empty() && sha != artifact.sha256 {
        return Err(TrustedError::Verification(format!(
            "Artifact sha mismatch (expected {}, got {})",
            artifact.sha256, sha
        )));
    }

    Ok(DownloadedArtifact { path: tmp })
}

fn clean_entry_path(entry: &str) -> Option<String> {
    let normalized = entry.replace('\\', "/");
    if normalized.trim().is_empty() || normalized.ends_with('/') {
        return None;
    }
    if normalized.contains("..") {
        return None;
    }
    let trimmed = normalized.trim_start_matches('/');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn is_binary_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".dll") || lower.ends_with(".exe")
}

fn expected_files_from_zip(path: &Path) -> Result<Vec<TrustedFile>, TrustedError> {
    let file = fs::File::open(path)?;
    let mut zip = ZipArchive::new(file)?;
    let mut files = Vec::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        if !entry.is_file() {
            continue;
        }
        if let Some(name) = clean_entry_path(entry.name()) {
            if is_binary_path(&name) {
                let size = entry.size();
                let sha = sha256_reader(&mut entry)?;
                files.push(TrustedFile {
                    path: name,
                    size,
                    sha256: sha,
                });
            }
        }
    }
    Ok(files)
}

fn expected_files(
    artifact: &TrustedArtifact,
    downloaded: Option<&DownloadedArtifact>,
) -> Result<Vec<TrustedFile>, TrustedError> {
    if !artifact.files.is_empty() {
        return Ok(artifact.files.clone());
    }
    if let Some(dl) = downloaded {
        return expected_files_from_zip(dl.path.path());
    }
    Err(TrustedError::Verification(
        "Trusted file list not found for artifact".to_string(),
    ))
}

fn check_files(
    root: &Path,
    files: &[TrustedFile],
    artifact: &TrustedArtifact,
    manifest: &TrustedManifest,
) -> SegatoolsTrustStatus {
    let has_backup = root
        .join(BACKUP_DIR)
        .join(BACKUP_META_NAME)
        .exists();
    let mut results = Vec::new();
    let mut max_mismatch_ts: Option<u32> = None;

    for file in files {
        let target = root.join(Path::new(&file.path));
        if target.exists() {
            let sha = fs::File::open(&target)
                .and_then(|mut f| {
                    let res = sha256_reader(&mut f);
                    res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
                })
                .ok();
            let matches = sha.as_ref().map(|s| s == &file.sha256).unwrap_or(false);
            
            if !matches {
                let lower = file.path.to_lowercase();
                if lower.ends_with(".dll") || lower.ends_with(".exe") {
                     if let Some(ts) = get_pe_timestamp(&target) {
                         if max_mismatch_ts.map_or(true, |current| ts > current) {
                             max_mismatch_ts = Some(ts);
                         }
                     }
                }
            }

            results.push(FileCheckResult {
                path: file.path.clone(),
                expected_sha256: file.sha256.clone(),
                actual_sha256: sha,
                exists: true,
                matches,
            });
        } else {
            results.push(FileCheckResult {
                path: file.path.clone(),
                expected_sha256: file.sha256.clone(),
                actual_sha256: None,
                exists: false,
                matches: false,
            });
        }
    }

    let local_build_time = max_mismatch_ts.map(format_timestamp);

    let missing_files = results.iter().any(|r| !r.exists);
    let all_match = !results.is_empty() && results.iter().all(|r| r.matches);
    let reason = if results.is_empty() {
        Some("No trusted DLL hashes available to verify this artifact".to_string())
    } else if all_match {
        None
    } else if missing_files {
        Some("Missing segatools binaries; please deploy.".to_string())
    } else {
        Some("Detected untrusted segatools binaries".to_string())
    };

    SegatoolsTrustStatus {
        trusted: all_match,
        reason,
        build_id: Some(manifest.build_id.clone()),
        generated_at: Some(manifest.generated_at.clone()),
        artifact_name: Some(artifact.name.clone()),
        artifact_sha256: Some(artifact.sha256.clone()),
        checked_files: results,
        has_backup,
        missing_files,
        local_build_time,
    }
}

pub fn verify_segatoools_for_active() -> Result<SegatoolsTrustStatus, TrustedError> {
    let ctx = active_game_ctx()?;

    if let Some(cached) = cached_status_for(&ctx.root) {
        return Ok(cached);
    }

    let manifest = fetch_manifest()?;
    let artifact = select_artifact(&manifest, &ctx.game)?;
    let downloaded = if artifact.files.is_empty() {
        Some(download_artifact(artifact)?)
    } else {
        None
    };
    let expected = expected_files(artifact, downloaded.as_ref())?;
    let status = check_files(&ctx.root, &expected, artifact, &manifest);
    store_status_for(&ctx.root, &status);
    Ok(status)
}

fn collect_zip_entries(path: &Path) -> Result<Vec<String>, TrustedError> {
    let file = fs::File::open(path)?;
    let mut zip = ZipArchive::new(file)?;
    let mut entries = Vec::new();
    for i in 0..zip.len() {
        let entry = zip.by_index(i)?;
        if entry.is_file() {
            if let Some(name) = clean_entry_path(entry.name()) {
                entries.push(name);
            }
        }
    }
    Ok(entries)
}

fn ensure_parent(path: &Path) -> Result<(), TrustedError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn backup_existing(
    root: &Path,
    entries: &[String],
    artifact: &TrustedArtifact,
    manifest: &TrustedManifest,
) -> Result<(PathBuf, BackupMetadata), TrustedError> {
    let backup_root = root.join(BACKUP_DIR);
    if backup_root.exists() {
        fs::remove_dir_all(&backup_root)?;
    }
    let files_dir = backup_root.join(BACKUP_FILES_DIR);
    fs::create_dir_all(&files_dir)?;

    let mut backed_up = Vec::new();
    let mut new_files = Vec::new();

    for entry in entries {
        let target = root.join(entry);
        if target.exists() {
            let backup_target = files_dir.join(entry);
            ensure_parent(&backup_target)?;
            fs::copy(&target, &backup_target)?;
            backed_up.push(entry.clone());
        } else {
            new_files.push(entry.clone());
        }
    }

    let metadata = BackupMetadata {
        created_at: Utc::now().to_rfc3339(),
        artifact_name: artifact.name.clone(),
        artifact_sha256: artifact.sha256.clone(),
        build_id: Some(manifest.build_id.clone()),
        backed_up_files: backed_up,
        new_files,
    };

    let meta_path = backup_root.join(BACKUP_META_NAME);
    let meta_json = serde_json::to_string_pretty(&metadata)?;
    fs::write(meta_path, meta_json)?;

    Ok((backup_root, metadata))
}

fn extract_artifact(root: &Path, path: &Path) -> Result<(), TrustedError> {
    let file = fs::File::open(path)?;
    let mut zip = ZipArchive::new(file)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        if let Some(name) = clean_entry_path(entry.name()) {
            let target = root.join(&name);
            ensure_parent(&target)?;
            let mut out = fs::File::create(&target)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }
    Ok(())
}

pub fn deploy_segatoools_for_active(force: bool) -> Result<DeployResult, TrustedError> {
    let ctx = active_game_ctx()?;
    let manifest = fetch_manifest()?;
    let artifact = select_artifact(&manifest, &ctx.game)?;
    let downloaded = download_artifact(artifact)?;
    let entries = collect_zip_entries(downloaded.path.path())?;
    let existing: Vec<String> = entries
        .iter()
        .filter(|rel| ctx.root.join(rel).exists())
        .cloned()
        .collect();
    let has_backup = !existing.is_empty();

    if !existing.is_empty() && !force {
        return Ok(DeployResult {
            deployed: false,
            needs_confirmation: true,
            existing_files: existing,
            backup_dir: None,
            message: Some("Existing segatools files detected. Backup and confirmation required.".to_string()),
            verification: None,
        });
    }

    if !existing.is_empty() {
        let _ = backup_existing(&ctx.root, &entries, artifact, &manifest)?;
    }

    extract_artifact(&ctx.root, downloaded.path.path())?;
    let expected = expected_files(artifact, Some(&downloaded))?;
    let verification = check_files(&ctx.root, &expected, artifact, &manifest);
    store_status_for(&ctx.root, &verification);

    Ok(DeployResult {
        deployed: true,
        needs_confirmation: false,
        existing_files: existing,
        backup_dir: if has_backup {
            Some(ctx.root.join(BACKUP_DIR).to_string_lossy().to_string())
        } else {
            None
        },
        message: Some("segatools deployed successfully".to_string()),
        verification: Some(verification),
    })
}

pub fn rollback_segatoools_for_active() -> Result<RollbackResult, TrustedError> {
    let ctx = active_game_ctx()?;
    let backup_root = ctx.root.join(BACKUP_DIR);
    let meta_path = backup_root.join(BACKUP_META_NAME);
    if !meta_path.exists() {
        return Err(TrustedError::NotFound(
            "No segatools backup available to roll back".to_string(),
        ));
    }
    let meta: BackupMetadata = serde_json::from_slice(&fs::read(&meta_path)?)?;

    clear_cached_status(&ctx.root);
    for file in &meta.backed_up_files {
        let backup_path = backup_root.join(BACKUP_FILES_DIR).join(file);
        let target = ctx.root.join(file);
        ensure_parent(&target)?;
        fs::copy(&backup_path, &target)?;
    }

    for file in &meta.new_files {
        let target = ctx.root.join(file);
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
    }

    let verification = verify_segatoools_for_active().ok();

    Ok(RollbackResult {
        restored: true,
        message: Some("Restored segatools from backup".to_string()),
        verification,
    })
}
