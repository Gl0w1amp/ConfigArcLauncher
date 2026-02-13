use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{Duration, Utc};
use configarc_core::privexec::{
    AuditLogEntry, CommandRequestPayload, CommandRunner, ParamRule, PolicyCommand,
    PolicyDefaultAction, PolicySecurity, PolicyUpdatePayload, PrivExecConfig, PrivExecCore,
    PrivExecPolicy, RunnerOutput, SignatureEnvelope, SignedCommandRequest,
    SignedPolicyUpdateRequest,
};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

#[derive(Default)]
struct MockRunner {
    scripts: Mutex<Vec<String>>,
}

impl MockRunner {
    fn script_count(&self) -> usize {
        self.scripts.lock().unwrap().len()
    }

    fn script_contains(&self, needle: &str) -> bool {
        self.scripts
            .lock()
            .unwrap()
            .iter()
            .any(|script| script.contains(needle))
    }
}

impl CommandRunner for MockRunner {
    fn run_powershell(&self, script: &str) -> Result<RunnerOutput, String> {
        self.scripts.lock().unwrap().push(script.to_string());
        let stdout = if script.contains("Get-Service") {
            r#"{"Name":"TermService","Status":"Running"}"#.to_string()
        } else if script.contains("Get-BitLockerVolume") {
            r#"{"MountPoint":"X:","LockStatus":"Unlocked","ProtectionStatus":"On"}"#.to_string()
        } else if script.contains("Get-Disk") {
            r#"[{"Number":1,"FriendlyName":"MockDisk"}]"#.to_string()
        } else {
            r#"{"ok":true}"#.to_string()
        };
        Ok(RunnerOutput {
            status_code: 0,
            stdout,
            stderr: String::new(),
        })
    }
}

struct TestContext {
    _tmp: TempDir,
    core: PrivExecCore,
    runner: Arc<MockRunner>,
    signing_key: SigningKey,
    vhd_root: PathBuf,
}

fn setup(fail_policy_swap: bool) -> TestContext {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("privexec");
    let vhd_root = tmp.path().join("vhd");
    let log_root = tmp.path().join("logs");
    fs::create_dir_all(&vhd_root).unwrap();
    fs::create_dir_all(&log_root).unwrap();

    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let pubkey = B64.encode(signing_key.verifying_key().as_bytes());

    let mut config = PrivExecConfig::new(root, "device-1");
    config
        .bootstrap_public_keys
        .insert("k1".to_string(), pubkey.clone());
    config.policy_replace_fail_after_backup = fail_policy_swap;

    let runner = Arc::new(MockRunner::default());
    let core = PrivExecCore::with_runner(config, runner.clone()).unwrap();

    let policy = build_policy(1, &pubkey, &vhd_root, &log_root);
    fs::write(
        core.policy_path(),
        serde_json::to_vec_pretty(&policy).unwrap(),
    )
    .unwrap();

    TestContext {
        _tmp: tmp,
        core,
        runner,
        signing_key,
        vhd_root,
    }
}

fn build_policy(
    version: u64,
    pubkey: &str,
    vhd_root: &PathBuf,
    log_root: &PathBuf,
) -> PrivExecPolicy {
    let mut keys = HashMap::new();
    keys.insert("k1".to_string(), pubkey.to_string());

    let mut mount_params = HashMap::new();
    mount_params.insert(
        "path".to_string(),
        ParamRule::Path {
            required: true,
            default: None,
            allow_roots: vec![vhd_root.to_string_lossy().to_string()],
            allow_extensions: vec![".vhd".to_string(), ".vhdx".to_string()],
            fixed_value: None,
        },
    );
    mount_params.insert(
        "readOnly".to_string(),
        ParamRule::Bool {
            required: false,
            default: Some(false),
            fixed_value: None,
        },
    );
    mount_params.insert(
        "mountPoint".to_string(),
        ParamRule::String {
            required: false,
            default: None,
            allow_values: vec![],
            fixed_value: Some("X:\\".to_string()),
        },
    );

    let mut unmount_params = HashMap::new();
    unmount_params.insert(
        "path".to_string(),
        ParamRule::Path {
            required: true,
            default: None,
            allow_roots: vec![vhd_root.to_string_lossy().to_string()],
            allow_extensions: vec![".vhd".to_string(), ".vhdx".to_string()],
            fixed_value: None,
        },
    );
    unmount_params.insert(
        "sessionId".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );

    mount_params.insert(
        "sessionId".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );

    let mut session_params = HashMap::new();
    session_params.insert(
        "sessionId".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );

    let mut service_params = HashMap::new();
    service_params.insert(
        "serviceName".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec!["TermService".to_string(), "W32Time".to_string()],
            fixed_value: None,
        },
    );

    let mut collect_params = HashMap::new();
    collect_params.insert(
        "path".to_string(),
        ParamRule::Path {
            required: true,
            default: None,
            allow_roots: vec![log_root.to_string_lossy().to_string()],
            allow_extensions: vec![".log".to_string(), ".txt".to_string()],
            fixed_value: None,
        },
    );

    let mut bitlocker_query_params = HashMap::new();
    bitlocker_query_params.insert(
        "mountPoint".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec!["X:".to_string(), "Y:".to_string(), "Z:".to_string()],
            fixed_value: None,
        },
    );

    let mut bitlocker_unlock_params = HashMap::new();
    bitlocker_unlock_params.insert(
        "mountPoint".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec!["X:".to_string(), "Y:".to_string(), "Z:".to_string()],
            fixed_value: None,
        },
    );
    bitlocker_unlock_params.insert(
        "sessionId".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );
    bitlocker_unlock_params.insert(
        "recoveryPassword".to_string(),
        ParamRule::String {
            required: false,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );
    bitlocker_unlock_params.insert(
        "password".to_string(),
        ParamRule::String {
            required: false,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );
    bitlocker_unlock_params.insert(
        "skipIfUnlocked".to_string(),
        ParamRule::Bool {
            required: false,
            default: Some(true),
            fixed_value: None,
        },
    );

    let mut bitlocker_lock_params = HashMap::new();
    bitlocker_lock_params.insert(
        "mountPoint".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec!["X:".to_string(), "Y:".to_string(), "Z:".to_string()],
            fixed_value: None,
        },
    );
    bitlocker_lock_params.insert(
        "sessionId".to_string(),
        ParamRule::String {
            required: true,
            default: None,
            allow_values: vec![],
            fixed_value: None,
        },
    );
    bitlocker_lock_params.insert(
        "forceDismount".to_string(),
        ParamRule::Bool {
            required: false,
            default: Some(true),
            fixed_value: None,
        },
    );
    collect_params.insert(
        "maxBytes".to_string(),
        ParamRule::Int {
            required: false,
            default: Some(1_048_576),
            min: Some(1),
            max: Some(5_242_880),
            fixed_value: None,
        },
    );

    PrivExecPolicy {
        schema_version: 1,
        policy_name: "test-policy".to_string(),
        version,
        default_action: PolicyDefaultAction::Deny,
        security: PolicySecurity {
            require_signature: true,
            signature_algorithm: "ed25519".to_string(),
            require_device_binding: true,
            require_nonce: true,
            nonce_ttl_seconds: 120,
            max_clock_skew_seconds: 30,
            session_ttl_seconds: 120,
            public_keys: keys,
        },
        allowed_commands: vec![
            PolicyCommand {
                name: "begin_session".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: HashMap::new(),
            },
            PolicyCommand {
                name: "heartbeat".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: session_params.clone(),
            },
            PolicyCommand {
                name: "end_session".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: session_params,
            },
            PolicyCommand {
                name: "mount_vhd".to_string(),
                enabled: true,
                requires_session: true,
                risk_level: Some("medium".to_string()),
                params: mount_params,
            },
            PolicyCommand {
                name: "unmount_vhd".to_string(),
                enabled: true,
                requires_session: true,
                risk_level: Some("medium".to_string()),
                params: unmount_params,
            },
            PolicyCommand {
                name: "query_disk".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: HashMap::new(),
            },
            PolicyCommand {
                name: "query_bitlocker_status".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: bitlocker_query_params,
            },
            PolicyCommand {
                name: "unlock_bitlocker".to_string(),
                enabled: true,
                requires_session: true,
                risk_level: Some("high".to_string()),
                params: bitlocker_unlock_params,
            },
            PolicyCommand {
                name: "lock_bitlocker".to_string(),
                enabled: true,
                requires_session: true,
                risk_level: Some("high".to_string()),
                params: bitlocker_lock_params,
            },
            PolicyCommand {
                name: "query_service_status".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: service_params,
            },
            PolicyCommand {
                name: "restart_service".to_string(),
                enabled: false,
                requires_session: false,
                risk_level: Some("high".to_string()),
                params: HashMap::new(),
            },
            PolicyCommand {
                name: "collect_log".to_string(),
                enabled: true,
                requires_session: false,
                risk_level: Some("low".to_string()),
                params: collect_params,
            },
        ],
    }
}

fn base_payload(
    command_id: &str,
    nonce: &str,
    command: &str,
    device_id: &str,
) -> CommandRequestPayload {
    CommandRequestPayload {
        schema_version: 1,
        command_id: command_id.to_string(),
        nonce: nonce.to_string(),
        issued_at: Utc::now() - Duration::seconds(5),
        expires_at: Utc::now() + Duration::seconds(60),
        device_id: device_id.to_string(),
        command: command.to_string(),
        params: Map::new(),
    }
}

fn sign_request(payload: CommandRequestPayload, signing_key: &SigningKey) -> SignedCommandRequest {
    let bytes = payload.signing_bytes().unwrap();
    let signature = signing_key.sign(&bytes);
    SignedCommandRequest {
        payload,
        signature: SignatureEnvelope {
            algorithm: "ed25519".to_string(),
            key_id: "k1".to_string(),
            signature: B64.encode(signature.to_bytes()),
        },
    }
}

fn begin_session(ctx: &TestContext, command_id: &str, nonce: &str) -> String {
    let payload = base_payload(command_id, nonce, "begin_session", "device-1");
    let response = ctx
        .core
        .execute_request(sign_request(payload, &ctx.signing_key));
    assert!(response.ok);
    response
        .result
        .as_ref()
        .and_then(|v| v.get("sessionId"))
        .and_then(|v| v.as_str())
        .unwrap()
        .to_string()
}

#[test]
fn tampered_signature_is_rejected() {
    let ctx = setup(false);
    let vhd = ctx.vhd_root.join("a.vhd");
    fs::write(&vhd, b"vhd").unwrap();

    let mut payload = base_payload("cmd-1", "nonce-1", "mount_vhd", "device-1");
    payload.params.insert(
        "path".to_string(),
        Value::String(vhd.to_string_lossy().to_string()),
    );
    payload
        .params
        .insert("readOnly".to_string(), Value::Bool(false));
    payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:\\".to_string()));
    let mut request = sign_request(payload, &ctx.signing_key);
    request.payload.command = "query_disk".to_string();

    let response = ctx.core.execute_request(request);
    assert!(!response.ok);
    assert_eq!(response.code, "INVALID_SIGNATURE");
}

#[test]
fn expired_request_is_rejected() {
    let ctx = setup(false);
    let mut payload = base_payload("cmd-2", "nonce-2", "query_disk", "device-1");
    payload.issued_at = Utc::now() - Duration::seconds(300);
    payload.expires_at = Utc::now() - Duration::seconds(120);
    let request = sign_request(payload, &ctx.signing_key);

    let response = ctx.core.execute_request(request);
    assert!(!response.ok);
    assert_eq!(response.code, "REQUEST_EXPIRED");
}

#[test]
fn nonce_replay_is_rejected() {
    let ctx = setup(false);
    let req1 = sign_request(
        base_payload("cmd-3", "nonce-r", "query_disk", "device-1"),
        &ctx.signing_key,
    );
    let req2 = sign_request(
        base_payload("cmd-4", "nonce-r", "query_disk", "device-1"),
        &ctx.signing_key,
    );

    let first = ctx.core.execute_request(req1);
    let second = ctx.core.execute_request(req2);
    assert!(first.ok);
    assert!(!second.ok);
    assert_eq!(second.code, "NONCE_REPLAY");
}

#[test]
fn wrong_device_id_is_rejected() {
    let ctx = setup(false);
    let req = sign_request(
        base_payload("cmd-5", "nonce-5", "query_disk", "other-device"),
        &ctx.signing_key,
    );

    let response = ctx.core.execute_request(req);
    assert!(!response.ok);
    assert_eq!(response.code, "DEVICE_ID_MISMATCH");
}

#[test]
fn out_of_bounds_path_is_rejected() {
    let ctx = setup(false);
    let session_id = begin_session(&ctx, "cmd-6s", "nonce-6s");
    let outside = ctx
        .vhd_root
        .parent()
        .unwrap()
        .join("outside")
        .join("evil.vhd");
    fs::create_dir_all(outside.parent().unwrap()).unwrap();
    fs::write(&outside, b"x").unwrap();

    let mut payload = base_payload("cmd-6", "nonce-6", "mount_vhd", "device-1");
    payload.params.insert(
        "path".to_string(),
        Value::String(outside.to_string_lossy().to_string()),
    );
    payload
        .params
        .insert("readOnly".to_string(), Value::Bool(false));
    payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:\\".to_string()));
    payload
        .params
        .insert("sessionId".to_string(), Value::String(session_id));
    let response = ctx
        .core
        .execute_request(sign_request(payload, &ctx.signing_key));

    assert!(!response.ok);
    assert_eq!(response.code, "PATH_NOT_ALLOWED");
}

#[test]
fn valid_mount_executes_and_writes_audit_log() {
    let ctx = setup(false);
    let session_id = begin_session(&ctx, "cmd-7s", "nonce-7s");
    let vhd = ctx.vhd_root.join("ok.vhd");
    fs::write(&vhd, b"vhd").unwrap();

    let mut payload = base_payload("cmd-7", "nonce-7", "mount_vhd", "device-1");
    payload.params.insert(
        "path".to_string(),
        Value::String(vhd.to_string_lossy().to_string()),
    );
    payload
        .params
        .insert("readOnly".to_string(), Value::Bool(false));
    payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:\\".to_string()));
    payload
        .params
        .insert("sessionId".to_string(), Value::String(session_id));
    let response = ctx
        .core
        .execute_request(sign_request(payload, &ctx.signing_key));

    assert!(response.ok);
    assert_eq!(response.code, "OK");
    assert!(ctx.runner.script_count() >= 1);

    let raw = fs::read_to_string(ctx.core.audit_log_path()).unwrap();
    let last = raw.lines().last().unwrap();
    let entry: AuditLogEntry = serde_json::from_str(last).unwrap();
    assert_eq!(entry.command_id, "cmd-7");
    assert_eq!(entry.command, "mount_vhd");
    assert_eq!(entry.code, "OK");
}

#[test]
fn mount_requires_session() {
    let ctx = setup(false);
    let vhd = ctx.vhd_root.join("needs_session.vhd");
    fs::write(&vhd, b"vhd").unwrap();

    let mut payload = base_payload("cmd-7b", "nonce-7b", "mount_vhd", "device-1");
    payload.params.insert(
        "path".to_string(),
        Value::String(vhd.to_string_lossy().to_string()),
    );
    payload
        .params
        .insert("readOnly".to_string(), Value::Bool(false));
    payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:\\".to_string()));
    let response = ctx
        .core
        .execute_request(sign_request(payload, &ctx.signing_key));

    assert!(!response.ok);
    assert_eq!(response.code, "SESSION_REQUIRED");
}

#[test]
fn heartbeat_and_end_session_work() {
    let ctx = setup(false);
    let session_id = begin_session(&ctx, "cmd-7c", "nonce-7c");

    let mut heartbeat = base_payload("cmd-7d", "nonce-7d", "heartbeat", "device-1");
    heartbeat
        .params
        .insert("sessionId".to_string(), Value::String(session_id.clone()));
    let heartbeat_response = ctx
        .core
        .execute_request(sign_request(heartbeat, &ctx.signing_key));
    assert!(heartbeat_response.ok);

    let mut end = base_payload("cmd-7e", "nonce-7e", "end_session", "device-1");
    end.params
        .insert("sessionId".to_string(), Value::String(session_id.clone()));
    let end_response = ctx
        .core
        .execute_request(sign_request(end, &ctx.signing_key));
    assert!(end_response.ok);

    let mut heartbeat_after_end = base_payload("cmd-7f", "nonce-7f", "heartbeat", "device-1");
    heartbeat_after_end
        .params
        .insert("sessionId".to_string(), Value::String(session_id));
    let after_end_response = ctx
        .core
        .execute_request(sign_request(heartbeat_after_end, &ctx.signing_key));
    assert!(!after_end_response.ok);
    assert_eq!(after_end_response.code, "SESSION_NOT_FOUND");
}

#[test]
fn heartbeat_returns_session_expired_when_ttl_elapsed() {
    let ctx = setup(false);
    let mut policy: PrivExecPolicy =
        serde_json::from_slice(&fs::read(ctx.core.policy_path()).unwrap()).unwrap();
    policy.security.session_ttl_seconds = 1;
    fs::write(
        ctx.core.policy_path(),
        serde_json::to_vec_pretty(&policy).unwrap(),
    )
    .unwrap();

    let session_id = begin_session(&ctx, "cmd-7ttl-a", "nonce-7ttl-a");
    std::thread::sleep(std::time::Duration::from_millis(1200));

    let mut heartbeat = base_payload("cmd-7ttl-b", "nonce-7ttl-b", "heartbeat", "device-1");
    heartbeat
        .params
        .insert("sessionId".to_string(), Value::String(session_id));
    let response = ctx
        .core
        .execute_request(sign_request(heartbeat, &ctx.signing_key));
    assert!(!response.ok);
    assert_eq!(response.code, "SESSION_EXPIRED");
}

#[test]
fn unlock_bitlocker_requires_session() {
    let ctx = setup(false);
    let mut payload = base_payload("cmd-7g", "nonce-7g", "unlock_bitlocker", "device-1");
    payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:".to_string()));
    payload.params.insert(
        "recoveryPassword".to_string(),
        Value::String("111111-222222-333333-444444-555555-666666-777777-888888".to_string()),
    );

    let response = ctx
        .core
        .execute_request(sign_request(payload, &ctx.signing_key));
    assert!(!response.ok);
    assert_eq!(response.code, "SESSION_REQUIRED");
}

#[test]
fn unlock_and_lock_bitlocker_with_session() {
    let ctx = setup(false);
    let session_id = begin_session(&ctx, "cmd-7h", "nonce-7h");
    let recovery_password = "111111-222222-333333-444444-555555-666666-777777-888888";

    let mut unlock_payload = base_payload("cmd-7i", "nonce-7i", "unlock_bitlocker", "device-1");
    unlock_payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:".to_string()));
    unlock_payload.params.insert(
        "recoveryPassword".to_string(),
        Value::String(recovery_password.to_string()),
    );
    unlock_payload
        .params
        .insert("sessionId".to_string(), Value::String(session_id.clone()));
    let unlock_response = ctx
        .core
        .execute_request(sign_request(unlock_payload, &ctx.signing_key));
    assert!(unlock_response.ok);
    assert!(ctx.runner.script_contains("Unlock-BitLocker"));
    assert!(!ctx.runner.script_contains(recovery_password));

    let mut lock_payload = base_payload("cmd-7j", "nonce-7j", "lock_bitlocker", "device-1");
    lock_payload
        .params
        .insert("mountPoint".to_string(), Value::String("X:".to_string()));
    lock_payload
        .params
        .insert("forceDismount".to_string(), Value::Bool(true));
    lock_payload
        .params
        .insert("sessionId".to_string(), Value::String(session_id));
    let lock_response = ctx
        .core
        .execute_request(sign_request(lock_payload, &ctx.signing_key));
    assert!(lock_response.ok);
    assert!(ctx.runner.script_contains("Lock-BitLocker"));
}

#[test]
fn command_id_is_idempotent() {
    let ctx = setup(false);
    let req = sign_request(
        base_payload("cmd-8", "nonce-8", "query_disk", "device-1"),
        &ctx.signing_key,
    );
    let req_replay = req.clone();

    let first = ctx.core.execute_request(req);
    let second = ctx.core.execute_request(req_replay);

    assert!(first.ok);
    assert!(second.ok);
    assert!(second.idempotent_replay);
}

#[test]
fn policy_hot_update_failure_rolls_back() {
    let ctx = setup(true);
    let current: PrivExecPolicy =
        serde_json::from_slice(&fs::read(ctx.core.policy_path()).unwrap()).unwrap();
    assert_eq!(current.version, 1);

    let pubkey = B64.encode(ctx.signing_key.verifying_key().as_bytes());
    let next_policy = build_policy(2, &pubkey, &ctx.vhd_root, &ctx.vhd_root);
    let payload = PolicyUpdatePayload {
        schema_version: 1,
        version: 2,
        issued_at: Utc::now(),
        policy: next_policy,
    };
    let sig = ctx.signing_key.sign(&payload.signing_bytes().unwrap());
    let request = SignedPolicyUpdateRequest {
        payload,
        signature: SignatureEnvelope {
            algorithm: "ed25519".to_string(),
            key_id: "k1".to_string(),
            signature: B64.encode(sig.to_bytes()),
        },
    };

    let response = ctx.core.apply_policy_update(request);
    assert!(!response.ok);
    assert_eq!(response.code, "POLICY_UPDATE_ROLLBACK");
    assert!(response.rolled_back);

    let after: PrivExecPolicy =
        serde_json::from_slice(&fs::read(ctx.core.policy_path()).unwrap()).unwrap();
    assert_eq!(after.version, 1);
}
