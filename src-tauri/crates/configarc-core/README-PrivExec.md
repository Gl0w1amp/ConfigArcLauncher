# PrivExec (SYSTEM Remote Privileged Command Executor)

## Threat Model
- Untrusted caller can submit forged/replayed requests.
- Caller may try command injection via parameters or path traversal.
- Caller may try policy downgrade or unsigned policy replacement.
- Caller may retry same command and cause repeated side effects.

Security controls in this implementation:
- `default deny`: command must exist in `policy.json` and be `enabled=true`.
- Signed request verification (`ed25519` currently, verifier registry is extensible).
- `device_id` binding, request time-window validation, nonce replay defense.
- `command_id` idempotency with conflict detection.
- Path canonicalization + allowed root + allowed extension checks.
- Structured JSON audit log (`audit.jsonl`) for all outcomes.
- Signed policy package update with version check + atomic replace + rollback.

## Key Rotation
1. Prepare new keypair.
2. Publish new public key in active policy `security.publicKeys` (signed by current key).
3. Start signing requests with new `keyId`.
4. After migration window, remove old key from policy with another signed policy update.
5. Keep `bootstrap_public_keys` for bootstrap/recovery only.

## Error Codes
- `OK`
- `INVALID_SCHEMA`
- `POLICY_NOT_FOUND`
- `POLICY_INVALID`
- `POLICY_DENY`
- `COMMAND_DISABLED`
- `UNSUPPORTED_SIGNATURE_ALGORITHM`
- `INVALID_SIGNATURE`
- `DEVICE_ID_MISMATCH`
- `REQUEST_EXPIRED`
- `REQUEST_NOT_YET_VALID`
- `NONCE_REPLAY`
- `COMMAND_ID_CONFLICT`
- `INVALID_PARAMETER`
- `PATH_NOT_FOUND`
- `PATH_NOT_ALLOWED`
- `COMMAND_EXECUTION_FAILED`
- `INTERNAL_ERROR`
- `POLICY_UPDATE_INVALID_SIGNATURE`
- `POLICY_UPDATE_VERSION_REJECTED`
- `POLICY_UPDATE_ROLLBACK`

## Runtime Flow
1. Parse `SignedCommandRequest`.
2. Verify schema + load policy.
3. Verify signature / device binding / time window.
4. Check `command_id` idempotency record.
5. Reserve nonce (replay reject).
6. Enforce policy + validate parameters.
7. Execute command backend (`mount_vhd`, `unmount_vhd`, `query_disk`, `query_service_status`, `collect_log`; `restart_service` hard-disabled).
8. Persist idempotency result and append audit log.

## Policy Update Flow
1. Parse `SignedPolicyUpdateRequest`.
2. Verify signed payload and monotonic `version`.
3. Write new policy as temp file.
4. Move current policy to backup.
5. Replace with new policy atomically.
6. On failure, restore backup and return `POLICY_UPDATE_ROLLBACK`.
