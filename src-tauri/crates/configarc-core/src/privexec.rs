use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

const SCHEMA_VERSION: u32 = 1;
const CREATE_NO_WINDOW: u32 = 0x08000000;
const POLICY_FILE_NAME: &str = "policy.json";
const NONCE_STATE_FILE_NAME: &str = "nonces.json";
const COMMAND_STATE_FILE_NAME: &str = "commands.json";
const SESSION_STATE_FILE_NAME: &str = "sessions.json";
const AUDIT_FILE_NAME: &str = "audit.jsonl";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrivExecErrorCode {
    Ok,
    InvalidSchema,
    PolicyNotFound,
    PolicyInvalid,
    PolicyDeny,
    CommandDisabled,
    UnsupportedSignatureAlgorithm,
    InvalidSignature,
    DeviceIdMismatch,
    RequestExpired,
    RequestNotYetValid,
    NonceReplay,
    CommandIdConflict,
    SessionRequired,
    SessionNotFound,
    SessionExpired,
    InvalidParameter,
    PathNotFound,
    PathNotAllowed,
    CommandExecutionFailed,
    InternalError,
    PolicyUpdateInvalidSignature,
    PolicyUpdateVersionRejected,
    PolicyUpdateRollback,
}

impl PrivExecErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            PrivExecErrorCode::Ok => "OK",
            PrivExecErrorCode::InvalidSchema => "INVALID_SCHEMA",
            PrivExecErrorCode::PolicyNotFound => "POLICY_NOT_FOUND",
            PrivExecErrorCode::PolicyInvalid => "POLICY_INVALID",
            PrivExecErrorCode::PolicyDeny => "POLICY_DENY",
            PrivExecErrorCode::CommandDisabled => "COMMAND_DISABLED",
            PrivExecErrorCode::UnsupportedSignatureAlgorithm => "UNSUPPORTED_SIGNATURE_ALGORITHM",
            PrivExecErrorCode::InvalidSignature => "INVALID_SIGNATURE",
            PrivExecErrorCode::DeviceIdMismatch => "DEVICE_ID_MISMATCH",
            PrivExecErrorCode::RequestExpired => "REQUEST_EXPIRED",
            PrivExecErrorCode::RequestNotYetValid => "REQUEST_NOT_YET_VALID",
            PrivExecErrorCode::NonceReplay => "NONCE_REPLAY",
            PrivExecErrorCode::CommandIdConflict => "COMMAND_ID_CONFLICT",
            PrivExecErrorCode::SessionRequired => "SESSION_REQUIRED",
            PrivExecErrorCode::SessionNotFound => "SESSION_NOT_FOUND",
            PrivExecErrorCode::SessionExpired => "SESSION_EXPIRED",
            PrivExecErrorCode::InvalidParameter => "INVALID_PARAMETER",
            PrivExecErrorCode::PathNotFound => "PATH_NOT_FOUND",
            PrivExecErrorCode::PathNotAllowed => "PATH_NOT_ALLOWED",
            PrivExecErrorCode::CommandExecutionFailed => "COMMAND_EXECUTION_FAILED",
            PrivExecErrorCode::InternalError => "INTERNAL_ERROR",
            PrivExecErrorCode::PolicyUpdateInvalidSignature => "POLICY_UPDATE_INVALID_SIGNATURE",
            PrivExecErrorCode::PolicyUpdateVersionRejected => "POLICY_UPDATE_VERSION_REJECTED",
            PrivExecErrorCode::PolicyUpdateRollback => "POLICY_UPDATE_ROLLBACK",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            PrivExecErrorCode::Ok => "Success",
            PrivExecErrorCode::InvalidSchema => "Invalid request schema",
            PrivExecErrorCode::PolicyNotFound => "Policy not found",
            PrivExecErrorCode::PolicyInvalid => "Policy validation failed",
            PrivExecErrorCode::PolicyDeny => "Command denied by policy",
            PrivExecErrorCode::CommandDisabled => "Command is disabled",
            PrivExecErrorCode::UnsupportedSignatureAlgorithm => "Unsupported signature algorithm",
            PrivExecErrorCode::InvalidSignature => "Signature verification failed",
            PrivExecErrorCode::DeviceIdMismatch => "Device binding mismatch",
            PrivExecErrorCode::RequestExpired => "Request expired",
            PrivExecErrorCode::RequestNotYetValid => "Request is not yet valid",
            PrivExecErrorCode::NonceReplay => "Replay nonce detected",
            PrivExecErrorCode::CommandIdConflict => "Command ID conflict",
            PrivExecErrorCode::SessionRequired => "Command requires a valid session",
            PrivExecErrorCode::SessionNotFound => "Session not found",
            PrivExecErrorCode::SessionExpired => "Session expired",
            PrivExecErrorCode::InvalidParameter => "Invalid command parameter",
            PrivExecErrorCode::PathNotFound => "Path not found",
            PrivExecErrorCode::PathNotAllowed => "Path not allowed by policy",
            PrivExecErrorCode::CommandExecutionFailed => "Command execution failed",
            PrivExecErrorCode::InternalError => "Internal execution error",
            PrivExecErrorCode::PolicyUpdateInvalidSignature => {
                "Policy package signature verification failed"
            }
            PrivExecErrorCode::PolicyUpdateVersionRejected => "Policy package version rejected",
            PrivExecErrorCode::PolicyUpdateRollback => "Policy update failed and rolled back",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureEnvelope {
    pub algorithm: String,
    pub key_id: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequestPayload {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub command_id: String,
    pub nonce: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub device_id: String,
    pub command: String,
    #[serde(default)]
    pub params: Map<String, Value>,
}

impl CommandRequestPayload {
    pub fn signing_bytes(&self) -> Result<Vec<u8>, PrivExecErrorCode> {
        canonical_json_bytes(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedCommandRequest {
    pub payload: CommandRequestPayload,
    pub signature: SignatureEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse {
    pub schema_version: u32,
    pub command_id: String,
    pub ok: bool,
    pub code: String,
    pub message: String,
    pub executed_at: DateTime<Utc>,
    pub idempotent_replay: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyUpdatePayload {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub version: u64,
    pub issued_at: DateTime<Utc>,
    pub policy: PrivExecPolicy,
}

impl PolicyUpdatePayload {
    pub fn signing_bytes(&self) -> Result<Vec<u8>, PrivExecErrorCode> {
        canonical_json_bytes(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedPolicyUpdateRequest {
    pub payload: PolicyUpdatePayload,
    pub signature: SignatureEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyUpdateResponse {
    pub ok: bool,
    pub code: String,
    pub message: String,
    pub version: u64,
    pub rolled_back: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PolicyDefaultAction {
    Deny,
    Allow,
}

impl Default for PolicyDefaultAction {
    fn default() -> Self {
        Self::Deny
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicySecurity {
    #[serde(default = "default_true")]
    pub require_signature: bool,
    #[serde(default = "default_ed25519")]
    pub signature_algorithm: String,
    #[serde(default = "default_true")]
    pub require_device_binding: bool,
    #[serde(default = "default_true")]
    pub require_nonce: bool,
    #[serde(default = "default_nonce_ttl")]
    pub nonce_ttl_seconds: i64,
    #[serde(default = "default_clock_skew")]
    pub max_clock_skew_seconds: i64,
    #[serde(default = "default_session_ttl")]
    pub session_ttl_seconds: i64,
    #[serde(default)]
    pub public_keys: HashMap<String, String>,
}

impl Default for PolicySecurity {
    fn default() -> Self {
        Self {
            require_signature: true,
            signature_algorithm: "ed25519".to_string(),
            require_device_binding: true,
            require_nonce: true,
            nonce_ttl_seconds: 120,
            max_clock_skew_seconds: 30,
            session_ttl_seconds: 120,
            public_keys: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyCommand {
    pub name: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub requires_session: bool,
    #[serde(default)]
    pub risk_level: Option<String>,
    #[serde(default)]
    pub params: HashMap<String, ParamRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ParamRule {
    #[serde(rename_all = "camelCase")]
    String {
        #[serde(default)]
        required: bool,
        #[serde(default)]
        default: Option<String>,
        #[serde(default)]
        allow_values: Vec<String>,
        #[serde(default)]
        fixed_value: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Bool {
        #[serde(default)]
        required: bool,
        #[serde(default)]
        default: Option<bool>,
        #[serde(default)]
        fixed_value: Option<bool>,
    },
    #[serde(rename_all = "camelCase")]
    Int {
        #[serde(default)]
        required: bool,
        #[serde(default)]
        default: Option<i64>,
        #[serde(default)]
        min: Option<i64>,
        #[serde(default)]
        max: Option<i64>,
        #[serde(default)]
        fixed_value: Option<i64>,
    },
    #[serde(rename_all = "camelCase")]
    Path {
        #[serde(default)]
        required: bool,
        #[serde(default)]
        default: Option<String>,
        #[serde(default)]
        allow_roots: Vec<String>,
        #[serde(default)]
        allow_extensions: Vec<String>,
        #[serde(default)]
        fixed_value: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivExecPolicy {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub policy_name: String,
    #[serde(default = "default_policy_version")]
    pub version: u64,
    #[serde(default)]
    pub default_action: PolicyDefaultAction,
    #[serde(default)]
    pub security: PolicySecurity,
    #[serde(default)]
    pub allowed_commands: Vec<PolicyCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub schema_version: u32,
    pub timestamp: DateTime<Utc>,
    pub command_id: String,
    pub command: String,
    pub ok: bool,
    pub code: String,
    pub idempotent_replay: bool,
    pub duration_ms: u128,
    pub request_hash: String,
}

#[derive(Debug, Clone)]
pub struct PrivExecConfig {
    pub root_dir: PathBuf,
    pub device_id: String,
    pub bootstrap_public_keys: HashMap<String, String>,
    pub policy_replace_fail_after_backup: bool,
}

impl PrivExecConfig {
    pub fn new(root_dir: impl Into<PathBuf>, device_id: impl Into<String>) -> Self {
        Self {
            root_dir: root_dir.into(),
            device_id: device_id.into(),
            bootstrap_public_keys: HashMap::new(),
            policy_replace_fail_after_backup: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RunnerOutput {
    pub status_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub trait CommandRunner: Send + Sync {
    fn run_powershell(&self, script: &str) -> Result<RunnerOutput, String>;

    fn run_powershell_with_env(
        &self,
        script: &str,
        env: &HashMap<String, String>,
    ) -> Result<RunnerOutput, String> {
        let _ = env;
        self.run_powershell(script)
    }
}

#[derive(Debug, Default)]
pub struct SystemCommandRunner;

impl CommandRunner for SystemCommandRunner {
    fn run_powershell(&self, script: &str) -> Result<RunnerOutput, String> {
        let mut command = Command::new("powershell");
        command.args(["-NoProfile", "-Command", script]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let output = command.output().map_err(|e| e.to_string())?;
        Ok(RunnerOutput {
            status_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }

    fn run_powershell_with_env(
        &self,
        script: &str,
        env: &HashMap<String, String>,
    ) -> Result<RunnerOutput, String> {
        let mut command = Command::new("powershell");
        command.args(["-NoProfile", "-Command", script]);
        for (key, value) in env {
            command.env(key, value);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let output = command.output().map_err(|e| e.to_string())?;
        Ok(RunnerOutput {
            status_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

pub trait SignatureVerifier: Send + Sync {
    fn algorithm(&self) -> &'static str;
    fn verify(
        &self,
        public_key: &str,
        payload: &[u8],
        signature: &str,
    ) -> Result<(), PrivExecErrorCode>;
}

#[derive(Debug, Default)]
pub struct Ed25519Verifier;

impl SignatureVerifier for Ed25519Verifier {
    fn algorithm(&self) -> &'static str {
        "ed25519"
    }

    fn verify(
        &self,
        public_key: &str,
        payload: &[u8],
        signature: &str,
    ) -> Result<(), PrivExecErrorCode> {
        let key_bytes = B64
            .decode(public_key.as_bytes())
            .map_err(|_| PrivExecErrorCode::InvalidSignature)?;
        let key_arr: [u8; 32] = key_bytes
            .try_into()
            .map_err(|_| PrivExecErrorCode::InvalidSignature)?;
        let verify_key =
            VerifyingKey::from_bytes(&key_arr).map_err(|_| PrivExecErrorCode::InvalidSignature)?;

        let sig_bytes = B64
            .decode(signature.as_bytes())
            .map_err(|_| PrivExecErrorCode::InvalidSignature)?;
        let sig =
            Signature::from_slice(&sig_bytes).map_err(|_| PrivExecErrorCode::InvalidSignature)?;
        verify_key
            .verify(payload, &sig)
            .map_err(|_| PrivExecErrorCode::InvalidSignature)
    }
}

pub struct PrivExecCore {
    config: PrivExecConfig,
    runner: Arc<dyn CommandRunner>,
    verifiers: RwLock<HashMap<String, Arc<dyn SignatureVerifier>>>,
    state_lock: Mutex<()>,
}

impl PrivExecCore {
    pub fn new(config: PrivExecConfig) -> std::io::Result<Self> {
        Self::with_runner(config, Arc::new(SystemCommandRunner))
    }

    pub fn with_runner(
        config: PrivExecConfig,
        runner: Arc<dyn CommandRunner>,
    ) -> std::io::Result<Self> {
        fs::create_dir_all(config.root_dir.join("state"))?;
        fs::create_dir_all(config.root_dir.join("logs"))?;
        let mut verifiers: HashMap<String, Arc<dyn SignatureVerifier>> = HashMap::new();
        verifiers.insert("ed25519".to_string(), Arc::new(Ed25519Verifier));
        Ok(Self {
            config,
            runner,
            verifiers: RwLock::new(verifiers),
            state_lock: Mutex::new(()),
        })
    }

    pub fn register_signature_verifier(&self, verifier: Arc<dyn SignatureVerifier>) {
        if let Ok(mut registry) = self.verifiers.write() {
            registry.insert(verifier.algorithm().to_lowercase(), verifier);
        }
    }

    pub fn policy_path(&self) -> PathBuf {
        self.config.root_dir.join(POLICY_FILE_NAME)
    }

    pub fn audit_log_path(&self) -> PathBuf {
        self.config.root_dir.join("logs").join(AUDIT_FILE_NAME)
    }

    pub fn execute_request_json(&self, raw_json: &str) -> CommandResponse {
        match serde_json::from_str::<SignedCommandRequest>(raw_json) {
            Ok(req) => self.execute_request(req),
            Err(_) => self.error_response("", "", PrivExecErrorCode::InvalidSchema, false),
        }
    }

    pub fn execute_request(&self, request: SignedCommandRequest) -> CommandResponse {
        let start = Instant::now();
        let command_id = request.payload.command_id.clone();
        let command = request.payload.command.clone();
        let payload_bytes = match request.payload.signing_bytes() {
            Ok(v) => v,
            Err(code) => {
                let resp = self.error_response(&command_id, &command, code, false);
                self.write_audit_log(&resp, "", start.elapsed().as_millis(), &command);
                return resp;
            }
        };
        let request_hash = sha256_hex(&payload_bytes);

        let _guard = self.state_lock.lock().expect("state lock poisoned");
        let (response, should_persist) =
            self.execute_locked(request, &payload_bytes, &request_hash);
        if should_persist {
            let _ = self.store_command_record(&response.command_id, &request_hash, &response);
        }
        self.write_audit_log(
            &response,
            &request_hash,
            start.elapsed().as_millis(),
            &command,
        );
        response
    }

    pub fn apply_policy_update_json(&self, raw_json: &str) -> PolicyUpdateResponse {
        match serde_json::from_str::<SignedPolicyUpdateRequest>(raw_json) {
            Ok(req) => self.apply_policy_update(req),
            Err(_) => PolicyUpdateResponse {
                ok: false,
                code: PrivExecErrorCode::InvalidSchema.as_str().to_string(),
                message: PrivExecErrorCode::InvalidSchema.message().to_string(),
                version: 0,
                rolled_back: false,
            },
        }
    }

    pub fn apply_policy_update(&self, request: SignedPolicyUpdateRequest) -> PolicyUpdateResponse {
        let _guard = self.state_lock.lock().expect("state lock poisoned");
        let code = self.apply_policy_update_locked(request.clone());
        match code {
            Ok(version) => PolicyUpdateResponse {
                ok: true,
                code: PrivExecErrorCode::Ok.as_str().to_string(),
                message: PrivExecErrorCode::Ok.message().to_string(),
                version,
                rolled_back: false,
            },
            Err((err, rolled_back)) => PolicyUpdateResponse {
                ok: false,
                code: err.as_str().to_string(),
                message: err.message().to_string(),
                version: request.payload.version,
                rolled_back,
            },
        }
    }

    fn apply_policy_update_locked(
        &self,
        request: SignedPolicyUpdateRequest,
    ) -> Result<u64, (PrivExecErrorCode, bool)> {
        if request.payload.schema_version != SCHEMA_VERSION {
            return Err((PrivExecErrorCode::InvalidSchema, false));
        }
        if request.payload.policy.default_action != PolicyDefaultAction::Deny {
            return Err((PrivExecErrorCode::PolicyInvalid, false));
        }
        if request.payload.policy.version != request.payload.version {
            return Err((PrivExecErrorCode::PolicyInvalid, false));
        }

        let payload_bytes = request
            .payload
            .signing_bytes()
            .map_err(|code| (code, false))?;
        let existing_policy = self.load_policy().ok();
        if let Some(current) = existing_policy.as_ref() {
            if request.payload.version <= current.version {
                return Err((PrivExecErrorCode::PolicyUpdateVersionRejected, false));
            }
        }

        let keys = if let Some(current) = existing_policy {
            if !current.security.public_keys.is_empty() {
                current.security.public_keys
            } else {
                self.config.bootstrap_public_keys.clone()
            }
        } else {
            self.config.bootstrap_public_keys.clone()
        };
        if keys.is_empty() {
            return Err((PrivExecErrorCode::PolicyUpdateInvalidSignature, false));
        }
        self.verify_with_keys(
            &request.signature,
            &payload_bytes,
            &keys,
            None,
            PrivExecErrorCode::PolicyUpdateInvalidSignature,
        )
        .map_err(|code| (code, false))?;

        let next_policy_bytes = serde_json::to_vec_pretty(&request.payload.policy)
            .map_err(|_| (PrivExecErrorCode::InternalError, false))?;
        match self.replace_policy_atomically(&next_policy_bytes) {
            Ok(()) => Ok(request.payload.version),
            Err(rolled_back) => Err((PrivExecErrorCode::PolicyUpdateRollback, rolled_back)),
        }
    }

    fn replace_policy_atomically(&self, bytes: &[u8]) -> Result<(), bool> {
        let policy_path = self.policy_path();
        if let Some(parent) = policy_path.parent() {
            if fs::create_dir_all(parent).is_err() {
                return Err(false);
            }
        }
        let tmp_path = sibling_path(&policy_path, "tmp");
        let bak_path = sibling_path(&policy_path, "bak");
        if fs::write(&tmp_path, bytes).is_err() {
            return Err(false);
        }
        if !policy_path.exists() {
            return fs::rename(&tmp_path, &policy_path).map_err(|_| false);
        }

        if fs::rename(&policy_path, &bak_path).is_err() {
            let _ = fs::remove_file(&tmp_path);
            return Err(false);
        }

        if self.config.policy_replace_fail_after_backup {
            let _ = fs::remove_file(&tmp_path);
            let rolled_back = fs::rename(&bak_path, &policy_path).is_ok();
            return Err(rolled_back);
        }

        match fs::rename(&tmp_path, &policy_path) {
            Ok(()) => {
                let _ = fs::remove_file(&bak_path);
                Ok(())
            }
            Err(_) => {
                let _ = fs::remove_file(&tmp_path);
                let rolled_back = fs::rename(&bak_path, &policy_path).is_ok();
                Err(rolled_back)
            }
        }
    }

    fn execute_locked(
        &self,
        request: SignedCommandRequest,
        payload_bytes: &[u8],
        request_hash: &str,
    ) -> (CommandResponse, bool) {
        let command_id = request.payload.command_id.clone();
        let command_name = request.payload.command.clone();
        if let Err(code) = validate_payload_basic(&request.payload) {
            return (
                self.error_response(&command_id, &command_name, code, false),
                false,
            );
        }

        let policy = match self.load_policy() {
            Ok(policy) => policy,
            Err(code) => {
                return (
                    self.error_response(&command_id, &command_name, code, false),
                    false,
                )
            }
        };
        if policy.default_action != PolicyDefaultAction::Deny {
            return (
                self.error_response(
                    &command_id,
                    &command_name,
                    PrivExecErrorCode::PolicyInvalid,
                    false,
                ),
                false,
            );
        }

        if let Err(code) = self.verify_request_security(&request, payload_bytes, &policy) {
            return (
                self.error_response(&command_id, &command_name, code, false),
                false,
            );
        }

        if let Ok(Some(existing)) = self.load_command_record(&command_id) {
            if existing.request_hash == request_hash {
                let mut replayed = existing.response;
                replayed.idempotent_replay = true;
                return (replayed, false);
            }
            return (
                self.error_response(
                    &command_id,
                    &command_name,
                    PrivExecErrorCode::CommandIdConflict,
                    false,
                ),
                false,
            );
        }

        if policy.security.require_nonce {
            if let Err(code) =
                self.reserve_nonce(&request.payload.nonce, policy.security.nonce_ttl_seconds)
            {
                return (
                    self.error_response(&command_id, &command_name, code, false),
                    false,
                );
            }
        }

        let command_policy = match policy
            .allowed_commands
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(&request.payload.command))
        {
            Some(cmd) => cmd,
            None => {
                return (
                    self.error_response(
                        &command_id,
                        &command_name,
                        PrivExecErrorCode::PolicyDeny,
                        false,
                    ),
                    true,
                )
            }
        };
        if !command_policy.enabled || command_policy.name.eq_ignore_ascii_case("restart_service") {
            return (
                self.error_response(
                    &command_id,
                    &command_name,
                    PrivExecErrorCode::CommandDisabled,
                    false,
                ),
                true,
            );
        }

        if command_policy.requires_session && !request.payload.params.contains_key("sessionId") {
            return (
                self.error_response(
                    &command_id,
                    &command_name,
                    PrivExecErrorCode::SessionRequired,
                    false,
                ),
                true,
            );
        }

        let validated_params = match self.validate_params(command_policy, &request.payload.params) {
            Ok(p) => p,
            Err(code) => {
                return (
                    self.error_response(&command_id, &command_name, code, false),
                    true,
                )
            }
        };

        if command_policy.requires_session {
            let session_id = match validated_params.get("sessionId").and_then(|v| v.as_str()) {
                Some(v) if !v.trim().is_empty() => v.to_string(),
                _ => {
                    return (
                        self.error_response(
                            &command_id,
                            &command_name,
                            PrivExecErrorCode::SessionRequired,
                            false,
                        ),
                        true,
                    )
                }
            };
            if let Err(code) = self.touch_session(&session_id, &request.payload.device_id) {
                return (
                    self.error_response(&command_id, &command_name, code, false),
                    true,
                );
            }
        }

        let result = match self.execute_command(&request.payload, &policy, &validated_params) {
            Ok(value) => value,
            Err(code) => {
                return (
                    self.error_response(&command_id, &command_name, code, false),
                    true,
                )
            }
        };

        (
            CommandResponse {
                schema_version: SCHEMA_VERSION,
                command_id,
                ok: true,
                code: PrivExecErrorCode::Ok.as_str().to_string(),
                message: PrivExecErrorCode::Ok.message().to_string(),
                executed_at: Utc::now(),
                idempotent_replay: false,
                result: Some(result),
            },
            true,
        )
    }

    fn error_response(
        &self,
        command_id: &str,
        _command: &str,
        code: PrivExecErrorCode,
        idempotent_replay: bool,
    ) -> CommandResponse {
        CommandResponse {
            schema_version: SCHEMA_VERSION,
            command_id: command_id.to_string(),
            ok: false,
            code: code.as_str().to_string(),
            message: code.message().to_string(),
            executed_at: Utc::now(),
            idempotent_replay,
            result: None,
        }
    }

    fn verify_request_security(
        &self,
        request: &SignedCommandRequest,
        payload_bytes: &[u8],
        policy: &PrivExecPolicy,
    ) -> Result<(), PrivExecErrorCode> {
        if policy.security.require_signature {
            let keys = if !policy.security.public_keys.is_empty() {
                policy.security.public_keys.clone()
            } else {
                self.config.bootstrap_public_keys.clone()
            };
            self.verify_with_keys(
                &request.signature,
                payload_bytes,
                &keys,
                Some(policy.security.signature_algorithm.as_str()),
                PrivExecErrorCode::InvalidSignature,
            )?;
        }

        if policy.security.require_device_binding
            && request.payload.device_id != self.config.device_id
        {
            return Err(PrivExecErrorCode::DeviceIdMismatch);
        }

        let skew = Duration::seconds(policy.security.max_clock_skew_seconds.max(0));
        if request.payload.expires_at < request.payload.issued_at {
            return Err(PrivExecErrorCode::InvalidSchema);
        }
        let now = Utc::now();
        if now < request.payload.issued_at - skew {
            return Err(PrivExecErrorCode::RequestNotYetValid);
        }
        if now > request.payload.expires_at + skew {
            return Err(PrivExecErrorCode::RequestExpired);
        }
        Ok(())
    }

    fn verify_with_keys(
        &self,
        signature: &SignatureEnvelope,
        payload_bytes: &[u8],
        keys: &HashMap<String, String>,
        expected_algorithm: Option<&str>,
        invalid_signature_code: PrivExecErrorCode,
    ) -> Result<(), PrivExecErrorCode> {
        let key = keys.get(&signature.key_id).ok_or(invalid_signature_code)?;
        let algo = signature.algorithm.to_lowercase();
        if let Some(expected) = expected_algorithm {
            if !algo.eq_ignore_ascii_case(expected) {
                return Err(PrivExecErrorCode::UnsupportedSignatureAlgorithm);
            }
        }
        let registry = self
            .verifiers
            .read()
            .map_err(|_| PrivExecErrorCode::InternalError)?;
        let verifier = registry
            .get(&algo)
            .ok_or(PrivExecErrorCode::UnsupportedSignatureAlgorithm)?;
        verifier
            .verify(key, payload_bytes, &signature.signature)
            .map_err(|_| invalid_signature_code)
    }

    fn load_policy(&self) -> Result<PrivExecPolicy, PrivExecErrorCode> {
        let path = self.policy_path();
        if !path.exists() {
            return Err(PrivExecErrorCode::PolicyNotFound);
        }
        read_json_file::<PrivExecPolicy>(&path).map_err(|_| PrivExecErrorCode::PolicyInvalid)
    }

    fn nonce_state_path(&self) -> PathBuf {
        self.config
            .root_dir
            .join("state")
            .join(NONCE_STATE_FILE_NAME)
    }

    fn command_state_path(&self) -> PathBuf {
        self.config
            .root_dir
            .join("state")
            .join(COMMAND_STATE_FILE_NAME)
    }

    fn session_state_path(&self) -> PathBuf {
        self.config
            .root_dir
            .join("state")
            .join(SESSION_STATE_FILE_NAME)
    }

    fn load_sessions(&self) -> HashMap<String, SessionRecord> {
        let path = self.session_state_path();
        read_json_file::<HashMap<String, SessionRecord>>(&path).unwrap_or_default()
    }

    fn store_sessions(
        &self,
        sessions: &HashMap<String, SessionRecord>,
    ) -> Result<(), PrivExecErrorCode> {
        let path = self.session_state_path();
        write_json_atomic(&path, sessions).map_err(|_| PrivExecErrorCode::InternalError)
    }

    fn touch_session(&self, session_id: &str, device_id: &str) -> Result<(), PrivExecErrorCode> {
        let mut sessions = self.load_sessions();
        let now = Utc::now();
        sessions.retain(|id, record| id == &session_id || record.expires_at > now);
        let record = sessions
            .get_mut(session_id)
            .ok_or(PrivExecErrorCode::SessionNotFound)?;
        if record.device_id != device_id {
            return Err(PrivExecErrorCode::SessionNotFound);
        }
        if record.expires_at <= now {
            sessions.remove(session_id);
            self.store_sessions(&sessions)?;
            return Err(PrivExecErrorCode::SessionExpired);
        }
        record.last_heartbeat_at = now;
        let ttl = record.ttl_seconds.max(1);
        record.expires_at = now + Duration::seconds(ttl);
        self.store_sessions(&sessions)?;
        Ok(())
    }

    fn reserve_nonce(&self, nonce: &str, ttl_seconds: i64) -> Result<(), PrivExecErrorCode> {
        let path = self.nonce_state_path();
        let mut nonces = read_json_file::<HashMap<String, i64>>(&path).unwrap_or_default();
        let now = Utc::now().timestamp();
        let ttl = ttl_seconds.max(1);
        nonces.retain(|_, ts| now.saturating_sub(*ts) <= ttl);
        if nonces.contains_key(nonce) {
            return Err(PrivExecErrorCode::NonceReplay);
        }
        nonces.insert(nonce.to_string(), now);
        write_json_atomic(&path, &nonces).map_err(|_| PrivExecErrorCode::InternalError)
    }

    fn load_command_record(
        &self,
        command_id: &str,
    ) -> Result<Option<StoredCommandRecord>, PrivExecErrorCode> {
        let path = self.command_state_path();
        let store =
            read_json_file::<HashMap<String, StoredCommandRecord>>(&path).unwrap_or_default();
        Ok(store.get(command_id).cloned())
    }

    fn store_command_record(
        &self,
        command_id: &str,
        request_hash: &str,
        response: &CommandResponse,
    ) -> Result<(), PrivExecErrorCode> {
        let path = self.command_state_path();
        let mut store =
            read_json_file::<HashMap<String, StoredCommandRecord>>(&path).unwrap_or_default();
        store.insert(
            command_id.to_string(),
            StoredCommandRecord {
                request_hash: request_hash.to_string(),
                response: response.clone(),
            },
        );
        write_json_atomic(&path, &store).map_err(|_| PrivExecErrorCode::InternalError)
    }

    fn write_audit_log(
        &self,
        response: &CommandResponse,
        request_hash: &str,
        duration_ms: u128,
        command: &str,
    ) {
        let entry = AuditLogEntry {
            schema_version: SCHEMA_VERSION,
            timestamp: Utc::now(),
            command_id: response.command_id.clone(),
            command: command.to_string(),
            ok: response.ok,
            code: response.code.clone(),
            idempotent_replay: response.idempotent_replay,
            duration_ms,
            request_hash: request_hash.to_string(),
        };
        let path = self.audit_log_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let (Ok(json), Ok(mut file)) = (
            serde_json::to_string(&entry),
            OpenOptions::new().create(true).append(true).open(path),
        ) {
            let _ = writeln!(file, "{}", json);
        }
    }

    fn validate_params(
        &self,
        command_policy: &PolicyCommand,
        params: &Map<String, Value>,
    ) -> Result<Map<String, Value>, PrivExecErrorCode> {
        for key in params.keys() {
            if !command_policy.params.contains_key(key) {
                return Err(PrivExecErrorCode::InvalidParameter);
            }
        }

        let mut validated = Map::new();
        for (name, rule) in &command_policy.params {
            match rule {
                ParamRule::String {
                    required,
                    default,
                    allow_values,
                    fixed_value,
                } => {
                    let mut value = resolve_string_param(name, params, *required, default.as_deref())?;
                    if value.is_empty() {
                        if let Some(expected) = fixed_value {
                            value = expected.clone();
                        }
                    }
                    if let Some(expected) = fixed_value {
                        if value != *expected {
                            return Err(PrivExecErrorCode::InvalidParameter);
                        }
                    }
                    if value.is_empty() && !*required {
                        continue;
                    }
                    if !allow_values.is_empty() && !allow_values.iter().any(|v| v == &value) {
                        return Err(PrivExecErrorCode::InvalidParameter);
                    }
                    validated.insert(name.clone(), Value::String(value));
                }
                ParamRule::Bool {
                    required,
                    default,
                    fixed_value,
                } => {
                    let mut value = resolve_bool_param(name, params, *required, *default)?;
                    if !params.contains_key(name) {
                        if let Some(expected) = fixed_value {
                            value = *expected;
                        } else if !*required && default.is_none() {
                            continue;
                        }
                    }
                    if let Some(expected) = fixed_value {
                        if value != *expected {
                            return Err(PrivExecErrorCode::InvalidParameter);
                        }
                    }
                    validated.insert(name.clone(), Value::Bool(value));
                }
                ParamRule::Int {
                    required,
                    default,
                    min,
                    max,
                    fixed_value,
                } => {
                    let mut value = resolve_int_param(name, params, *required, *default)?;
                    if !params.contains_key(name) {
                        if let Some(expected) = fixed_value {
                            value = *expected;
                        } else if !*required && default.is_none() {
                            continue;
                        }
                    }
                    if let Some(expected) = fixed_value {
                        if value != *expected {
                            return Err(PrivExecErrorCode::InvalidParameter);
                        }
                    }
                    if let Some(min) = min {
                        if value < *min {
                            return Err(PrivExecErrorCode::InvalidParameter);
                        }
                    }
                    if let Some(max) = max {
                        if value > *max {
                            return Err(PrivExecErrorCode::InvalidParameter);
                        }
                    }
                    validated.insert(name.clone(), Value::Number(value.into()));
                }
                ParamRule::Path {
                    required,
                    default,
                    allow_roots,
                    allow_extensions,
                    fixed_value,
                } => {
                    let mut value = resolve_string_param(name, params, *required, default.as_deref())?;
                    if value.is_empty() {
                        if let Some(expected) = fixed_value {
                            value = expected.clone();
                        } else if !*required {
                            continue;
                        }
                    }
                    if let Some(expected) = fixed_value {
                        if value != *expected {
                            return Err(PrivExecErrorCode::InvalidParameter);
                        }
                    }
                    let canonical = canonicalize_secure_path(&value)?;
                    if !allow_extensions.is_empty() {
                        let ext = canonical
                            .extension()
                            .and_then(|s| s.to_str())
                            .map(|s| format!(".{}", s.to_lowercase()))
                            .ok_or(PrivExecErrorCode::PathNotAllowed)?;
                        let allowed = allow_extensions.iter().any(|v| v.to_lowercase() == ext);
                        if !allowed {
                            return Err(PrivExecErrorCode::PathNotAllowed);
                        }
                    }
                    if !allow_roots.is_empty() {
                        let mut under_any_root = false;
                        for root in allow_roots {
                            let canonical_root = canonicalize_secure_path(root)?;
                            if is_under_root(&canonical, &canonical_root) {
                                under_any_root = true;
                                break;
                            }
                        }
                        if !under_any_root {
                            return Err(PrivExecErrorCode::PathNotAllowed);
                        }
                    }
                    validated.insert(
                        name.clone(),
                        Value::String(canonical.to_string_lossy().to_string()),
                    );
                }
            }
        }
        Ok(validated)
    }

    fn execute_command(
        &self,
        payload: &CommandRequestPayload,
        policy: &PrivExecPolicy,
        params: &Map<String, Value>,
    ) -> Result<Value, PrivExecErrorCode> {
        let command = payload.command.as_str();
        if command.eq_ignore_ascii_case("restart_service") {
            return Err(PrivExecErrorCode::CommandDisabled);
        }
        match command.to_lowercase().as_str() {
            "begin_session" => self.exec_begin_session(payload, policy),
            "heartbeat" => self.exec_heartbeat(payload, params),
            "end_session" => self.exec_end_session(payload, params),
            "mount_vhd" => self.exec_mount_vhd(params),
            "unmount_vhd" => self.exec_unmount_vhd(params),
            "query_bitlocker_status" => self.exec_query_bitlocker_status(params),
            "unlock_bitlocker" => self.exec_unlock_bitlocker(params),
            "lock_bitlocker" => self.exec_lock_bitlocker(params),
            "query_disk" => self.exec_query_disk(),
            "query_service_status" => self.exec_query_service_status(params),
            "collect_log" => self.exec_collect_log(params),
            _ => Err(PrivExecErrorCode::PolicyDeny),
        }
    }

    fn exec_begin_session(
        &self,
        payload: &CommandRequestPayload,
        policy: &PrivExecPolicy,
    ) -> Result<Value, PrivExecErrorCode> {
        let now = Utc::now();
        let ttl_seconds = policy.security.session_ttl_seconds.max(1);
        let seed = format!(
            "{}:{}:{}:{}",
            payload.device_id,
            payload.command_id,
            payload.nonce,
            now.timestamp_nanos_opt().unwrap_or(0)
        );
        let session_id = sha256_hex(seed.as_bytes());

        let mut sessions = self.load_sessions();
        sessions.retain(|_, record| record.expires_at > now);
        let record = SessionRecord {
            device_id: payload.device_id.clone(),
            issued_at: now,
            expires_at: now + Duration::seconds(ttl_seconds),
            last_heartbeat_at: now,
            ttl_seconds,
        };
        sessions.insert(session_id.clone(), record.clone());
        self.store_sessions(&sessions)?;

        Ok(serde_json::json!({
            "sessionId": session_id,
            "issuedAt": record.issued_at,
            "expiresAt": record.expires_at,
            "ttlSeconds": ttl_seconds
        }))
    }

    fn exec_heartbeat(
        &self,
        payload: &CommandRequestPayload,
        params: &Map<String, Value>,
    ) -> Result<Value, PrivExecErrorCode> {
        let session_id = get_string(params, "sessionId")?;
        let mut sessions = self.load_sessions();
        let now = Utc::now();
        sessions.retain(|id, record| id == &session_id || record.expires_at > now);
        let record = sessions
            .get_mut(&session_id)
            .ok_or(PrivExecErrorCode::SessionNotFound)?;
        if record.device_id != payload.device_id {
            return Err(PrivExecErrorCode::SessionNotFound);
        }
        if record.expires_at <= now {
            sessions.remove(&session_id);
            self.store_sessions(&sessions)?;
            return Err(PrivExecErrorCode::SessionExpired);
        }
        record.last_heartbeat_at = now;
        record.expires_at = now + Duration::seconds(record.ttl_seconds.max(1));
        let expires_at = record.expires_at;
        let ttl_seconds = record.ttl_seconds;
        self.store_sessions(&sessions)?;
        Ok(serde_json::json!({
            "sessionId": session_id,
            "expiresAt": expires_at,
            "ttlSeconds": ttl_seconds
        }))
    }

    fn exec_end_session(
        &self,
        payload: &CommandRequestPayload,
        params: &Map<String, Value>,
    ) -> Result<Value, PrivExecErrorCode> {
        let session_id = get_string(params, "sessionId")?;
        let mut sessions = self.load_sessions();
        let record = sessions
            .get(&session_id)
            .ok_or(PrivExecErrorCode::SessionNotFound)?;
        if record.device_id != payload.device_id {
            return Err(PrivExecErrorCode::SessionNotFound);
        }
        sessions.remove(&session_id);
        self.store_sessions(&sessions)?;
        Ok(serde_json::json!({
            "ended": true,
            "sessionId": session_id
        }))
    }

    fn exec_mount_vhd(&self, params: &Map<String, Value>) -> Result<Value, PrivExecErrorCode> {
        let path = get_string(params, "path")?;
        let read_only = get_bool(params, "readOnly").unwrap_or(false);
        let mount_point = get_string(params, "mountPoint").unwrap_or("X:\\".to_string());
        let access = if read_only { "ReadOnly" } else { "ReadWrite" };
        let script = format!(
            "$imagePath={};$mountPoint={};$img=Mount-DiskImage -ImagePath $imagePath -StorageType VHD -NoDriveLetter -Access {} -PassThru -ErrorAction Stop;\
            if ($mountPoint -ne '') {{ $part=$img | Get-Disk | Get-Partition | Where-Object {{ ($_ | Get-Volume) -ne $null }} | Select-Object -First 1; if ($part -ne $null) {{ Add-PartitionAccessPath -DiskNumber $part.DiskNumber -PartitionNumber $part.PartitionNumber -AccessPath $mountPoint -ErrorAction Stop; }} }};\
            $img | Select-Object ImagePath,Attached | ConvertTo-Json -Compress",
            ps_quote(&path),
            ps_quote(&mount_point),
            access
        );
        self.run_powershell_json(&script)
    }

    fn exec_unmount_vhd(&self, params: &Map<String, Value>) -> Result<Value, PrivExecErrorCode> {
        let path = get_string(params, "path")?;
        let script = format!(
            "$imagePath={};Dismount-DiskImage -ImagePath $imagePath -Confirm:$false -ErrorAction Stop;@{{ok=$true;imagePath=$imagePath}} | ConvertTo-Json -Compress",
            ps_quote(&path),
        );
        self.run_powershell_json(&script)
    }

    fn exec_query_bitlocker_status(
        &self,
        params: &Map<String, Value>,
    ) -> Result<Value, PrivExecErrorCode> {
        let mount_point = get_string(params, "mountPoint")?;
        let script = format!(
            "$mountPoint={};Get-BitLockerVolume -MountPoint $mountPoint -ErrorAction Stop | Select-Object MountPoint,VolumeStatus,ProtectionStatus,LockStatus,EncryptionPercentage,AutoUnlockEnabled | ConvertTo-Json -Compress",
            ps_quote(&mount_point)
        );
        self.run_powershell_json(&script)
    }

    fn exec_unlock_bitlocker(&self, params: &Map<String, Value>) -> Result<Value, PrivExecErrorCode> {
        let mount_point = get_string(params, "mountPoint")?;
        let recovery_password = params
            .get("recoveryPassword")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string())
            .filter(|v| !v.trim().is_empty());
        let password = params
            .get("password")
            .and_then(|v| v.as_str())
            .map(|v| v.to_string())
            .filter(|v| !v.trim().is_empty());
        let skip_if_unlocked = get_bool(params, "skipIfUnlocked").unwrap_or(true);
        if recovery_password.is_some() == password.is_some() {
            return Err(PrivExecErrorCode::InvalidParameter);
        }

        let secret = if let Some(recovery) = recovery_password {
            recovery
        } else if let Some(pass) = password {
            pass
        } else {
            return Err(PrivExecErrorCode::InvalidParameter);
        };
        let env_key = "CONFIGARC_UNLOCK_SECRET";
        let mut env = HashMap::new();
        env.insert(env_key.to_string(), secret);

        let unlock_cmd = if params
            .get("recoveryPassword")
            .and_then(|v| v.as_str())
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
        {
            format!(
                "$secret=$env:{};Unlock-BitLocker -MountPoint $mountPoint -RecoveryPassword $secret -ErrorAction Stop",
                env_key
            )
        } else {
            format!(
                "$secret=$env:{};$secure=ConvertTo-SecureString -String $secret -AsPlainText -Force;Unlock-BitLocker -MountPoint $mountPoint -Password $secure -ErrorAction Stop",
                env_key
            )
        };

        let skip_flag = if skip_if_unlocked { "$true" } else { "$false" };
        let script = format!(
            "$mountPoint={};$vol=Get-BitLockerVolume -MountPoint $mountPoint -ErrorAction Stop;\
            if ($vol.LockStatus -eq 'Unlocked' -and {}) {{ @{{ok=$true;mountPoint=$mountPoint;alreadyUnlocked=$true;lockStatus=$vol.LockStatus;protectionStatus=$vol.ProtectionStatus}} | ConvertTo-Json -Compress; exit 0 }};\
            {};\
            $after=Get-BitLockerVolume -MountPoint $mountPoint -ErrorAction Stop;\
            @{{ok=$true;mountPoint=$mountPoint;alreadyUnlocked=$false;lockStatus=$after.LockStatus;protectionStatus=$after.ProtectionStatus}} | ConvertTo-Json -Compress",
            ps_quote(&mount_point),
            skip_flag,
            unlock_cmd
        );
        self.run_powershell_json_with_env(&script, &env)
    }

    fn exec_lock_bitlocker(&self, params: &Map<String, Value>) -> Result<Value, PrivExecErrorCode> {
        let mount_point = get_string(params, "mountPoint")?;
        let force_dismount = get_bool(params, "forceDismount").unwrap_or(true);
        let force_flag = if force_dismount { "$true" } else { "$false" };
        let script = format!(
            "$mountPoint={};Lock-BitLocker -MountPoint $mountPoint -ForceDismount:{} -ErrorAction Stop;\
            @{{ok=$true;mountPoint=$mountPoint;forceDismount={}}} | ConvertTo-Json -Compress",
            ps_quote(&mount_point),
            force_flag,
            force_flag
        );
        self.run_powershell_json(&script)
    }

    fn exec_query_disk(&self) -> Result<Value, PrivExecErrorCode> {
        let script = "Get-Disk | Select-Object Number,FriendlyName,OperationalStatus,PartitionStyle,Size | ConvertTo-Json -Compress";
        self.run_powershell_json(script)
    }

    fn exec_query_service_status(
        &self,
        params: &Map<String, Value>,
    ) -> Result<Value, PrivExecErrorCode> {
        let service_name = get_string(params, "serviceName")?;
        let script = format!(
            "Get-Service -Name {} -ErrorAction Stop | Select-Object Name,Status,StartType | ConvertTo-Json -Compress",
            ps_quote(&service_name)
        );
        self.run_powershell_json(&script)
    }

    fn exec_collect_log(&self, params: &Map<String, Value>) -> Result<Value, PrivExecErrorCode> {
        let path = get_string(params, "path")?;
        let max_bytes = get_i64(params, "maxBytes").unwrap_or(1_048_576).max(1) as u64;
        let file_path = PathBuf::from(path.clone());
        let mut file = File::open(&file_path).map_err(|_| PrivExecErrorCode::PathNotFound)?;
        let size = file
            .metadata()
            .map_err(|_| PrivExecErrorCode::PathNotFound)?
            .len();
        let read_len = size.min(max_bytes);
        if read_len < size {
            file.seek(SeekFrom::End(-(read_len as i64)))
                .map_err(|_| PrivExecErrorCode::CommandExecutionFailed)?;
        } else {
            file.seek(SeekFrom::Start(0))
                .map_err(|_| PrivExecErrorCode::CommandExecutionFailed)?;
        }
        let mut buf = vec![0u8; read_len as usize];
        file.read_exact(&mut buf)
            .map_err(|_| PrivExecErrorCode::CommandExecutionFailed)?;
        let mut out = Map::new();
        out.insert("path".to_string(), Value::String(path));
        out.insert("bytes".to_string(), Value::Number((read_len as i64).into()));
        out.insert("truncated".to_string(), Value::Bool(size > read_len));
        out.insert(
            "content".to_string(),
            Value::String(String::from_utf8_lossy(&buf).to_string()),
        );
        Ok(Value::Object(out))
    }

    fn run_powershell_json(&self, script: &str) -> Result<Value, PrivExecErrorCode> {
        let output = self
            .runner
            .run_powershell(script)
            .map_err(|_| PrivExecErrorCode::CommandExecutionFailed)?;
        if output.status_code != 0 {
            return Err(PrivExecErrorCode::CommandExecutionFailed);
        }
        let stdout = output.stdout.trim();
        if stdout.is_empty() {
            return Ok(Value::Object(Map::new()));
        }
        serde_json::from_str::<Value>(stdout).or_else(|_| Ok(Value::String(stdout.to_string())))
    }

    fn run_powershell_json_with_env(
        &self,
        script: &str,
        env: &HashMap<String, String>,
    ) -> Result<Value, PrivExecErrorCode> {
        let output = self
            .runner
            .run_powershell_with_env(script, env)
            .map_err(|_| PrivExecErrorCode::CommandExecutionFailed)?;
        if output.status_code != 0 {
            return Err(PrivExecErrorCode::CommandExecutionFailed);
        }
        let stdout = output.stdout.trim();
        if stdout.is_empty() {
            return Ok(Value::Object(Map::new()));
        }
        serde_json::from_str::<Value>(stdout).or_else(|_| Ok(Value::String(stdout.to_string())))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredCommandRecord {
    request_hash: String,
    response: CommandResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    device_id: String,
    issued_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    last_heartbeat_at: DateTime<Utc>,
    ttl_seconds: i64,
}

fn validate_payload_basic(payload: &CommandRequestPayload) -> Result<(), PrivExecErrorCode> {
    if payload.schema_version != SCHEMA_VERSION {
        return Err(PrivExecErrorCode::InvalidSchema);
    }
    if payload.command_id.trim().is_empty()
        || payload.command_id.len() > 128
        || payload.nonce.trim().is_empty()
        || payload.device_id.trim().is_empty()
        || payload.command.trim().is_empty()
    {
        return Err(PrivExecErrorCode::InvalidSchema);
    }
    Ok(())
}

fn canonicalize_secure_path(path: &str) -> Result<PathBuf, PrivExecErrorCode> {
    let raw = PathBuf::from(path);
    if !raw.is_absolute() {
        return Err(PrivExecErrorCode::PathNotAllowed);
    }
    fs::canonicalize(raw).map_err(|_| PrivExecErrorCode::PathNotFound)
}

fn is_under_root(path: &Path, root: &Path) -> bool {
    let mut p = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let mut r = root.to_string_lossy().replace('/', "\\").to_lowercase();
    if !p.ends_with('\\') {
        p.push('\\');
    }
    if !r.ends_with('\\') {
        r.push('\\');
    }
    p.starts_with(&r)
}

fn resolve_string_param(
    name: &str,
    params: &Map<String, Value>,
    required: bool,
    default: Option<&str>,
) -> Result<String, PrivExecErrorCode> {
    if let Some(value) = params.get(name) {
        if let Some(text) = value.as_str() {
            return Ok(text.to_string());
        }
        return Err(PrivExecErrorCode::InvalidParameter);
    }
    if let Some(value) = default {
        return Ok(value.to_string());
    }
    if required {
        return Err(PrivExecErrorCode::InvalidParameter);
    }
    Ok(String::new())
}

fn resolve_bool_param(
    name: &str,
    params: &Map<String, Value>,
    required: bool,
    default: Option<bool>,
) -> Result<bool, PrivExecErrorCode> {
    if let Some(value) = params.get(name) {
        if let Some(v) = value.as_bool() {
            return Ok(v);
        }
        return Err(PrivExecErrorCode::InvalidParameter);
    }
    if let Some(value) = default {
        return Ok(value);
    }
    if required {
        return Err(PrivExecErrorCode::InvalidParameter);
    }
    Ok(false)
}

fn resolve_int_param(
    name: &str,
    params: &Map<String, Value>,
    required: bool,
    default: Option<i64>,
) -> Result<i64, PrivExecErrorCode> {
    if let Some(value) = params.get(name) {
        if let Some(v) = value.as_i64() {
            return Ok(v);
        }
        return Err(PrivExecErrorCode::InvalidParameter);
    }
    if let Some(value) = default {
        return Ok(value);
    }
    if required {
        return Err(PrivExecErrorCode::InvalidParameter);
    }
    Ok(0)
}

fn get_string(params: &Map<String, Value>, name: &str) -> Result<String, PrivExecErrorCode> {
    params
        .get(name)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or(PrivExecErrorCode::InvalidParameter)
}

fn get_bool(params: &Map<String, Value>, name: &str) -> Result<bool, PrivExecErrorCode> {
    params
        .get(name)
        .and_then(|v| v.as_bool())
        .ok_or(PrivExecErrorCode::InvalidParameter)
}

fn get_i64(params: &Map<String, Value>, name: &str) -> Result<i64, PrivExecErrorCode> {
    params
        .get(name)
        .and_then(|v| v.as_i64())
        .ok_or(PrivExecErrorCode::InvalidParameter)
}

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn canonical_json_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, PrivExecErrorCode> {
    let json = serde_json::to_value(value).map_err(|_| PrivExecErrorCode::InvalidSchema)?;
    let normalized = sort_json_value(json);
    serde_json::to_vec(&normalized).map_err(|_| PrivExecErrorCode::InvalidSchema)
}

fn sort_json_value(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = map.into_iter().collect();
            entries.sort_by(|(a, _), (b, _)| a.cmp(b));
            let mut sorted = Map::new();
            for (k, v) in entries {
                sorted.insert(k, sort_json_value(v));
            }
            Value::Object(sorted)
        }
        Value::Array(values) => Value::Array(values.into_iter().map(sort_json_value).collect()),
        other => other,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for b in digest {
        out.push(hex_char((b >> 4) & 0x0f));
        out.push(hex_char(b & 0x0f));
    }
    out
}

fn hex_char(nibble: u8) -> char {
    match nibble {
        0..=9 => (b'0' + nibble) as char,
        10..=15 => (b'a' + (nibble - 10)) as char,
        _ => '0',
    }
}

fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, ()> {
    let bytes = fs::read(path).map_err(|_| ())?;
    serde_json::from_slice(&bytes).map_err(|_| ())
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), ()> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| ())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| ())?;
    }
    let tmp_path = sibling_path(path, "tmp");
    fs::write(&tmp_path, bytes).map_err(|_| ())?;
    if path.exists() {
        let bak_path = sibling_path(path, "bak");
        fs::rename(path, &bak_path).map_err(|_| ())?;
        match fs::rename(&tmp_path, path) {
            Ok(()) => {
                let _ = fs::remove_file(bak_path);
                Ok(())
            }
            Err(_) => {
                let _ = fs::rename(&bak_path, path);
                Err(())
            }
        }
    } else {
        fs::rename(&tmp_path, path).map_err(|_| ())
    }
}

fn sibling_path(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("state.json");
    let new_name = format!("{}.{}", file_name, suffix);
    path.with_file_name(new_name)
}

fn default_schema_version() -> u32 {
    SCHEMA_VERSION
}

fn default_policy_version() -> u64 {
    1
}

fn default_true() -> bool {
    true
}

fn default_ed25519() -> String {
    "ed25519".to_string()
}

fn default_nonce_ttl() -> i64 {
    120
}

fn default_clock_skew() -> i64 {
    30
}

fn default_session_ttl() -> i64 {
    120
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonical_json_is_stable() {
        let value = json!({
            "b": 2,
            "a": { "d": 1, "c": 2 }
        });
        let bytes1 = canonical_json_bytes(&value).unwrap();
        let bytes2 = canonical_json_bytes(&value).unwrap();
        assert_eq!(bytes1, bytes2);
    }

    #[test]
    fn root_check_is_case_insensitive() {
        let root = PathBuf::from(r"C:\IRIS\VHD");
        let child = PathBuf::from(r"C:\iris\vhd\test.vhd");
        assert!(is_under_root(&child, &root));
    }
}
