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
- `SESSION_REQUIRED`
- `SESSION_NOT_FOUND`
- `SESSION_EXPIRED`
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
7. If command requires a session (`requiresSession=true`), validate and refresh `sessionId`.
8. Execute command backend (`begin_session`, `heartbeat`, `end_session`, `mount_vhd`, `unmount_vhd`, `query_bitlocker_status`, `unlock_bitlocker`, `lock_bitlocker`, `query_disk`, `query_service_status`, `collect_log`; `restart_service` hard-disabled).
9. Persist idempotency result and append audit log.

## Recommended End-to-End Flow
1. `begin_session` to obtain `sessionId`.
2. `mount_vhd` with `sessionId`.
3. `query_bitlocker_status` for target mount point (for example `X:`).
4. If locked, call `unlock_bitlocker` with `sessionId` and one credential:
   - `recoveryPassword` (recommended for remote automation), or
   - `password` (plain password path).
5. Run game/update operations.
6. Optional: call `lock_bitlocker` with `sessionId` before teardown.
7. `unmount_vhd` with `sessionId`.
8. `end_session`.

## BitLocker Notes
- Keep decryption material out of static config files. Prefer short-lived retrieval (remote signer/KMS/secure operator input) per session.
- Use policy `requiresSession=true` for `unlock_bitlocker` and `lock_bitlocker`.
- Restrict `mountPoint` with `allowValues` (for example `X:`, `Y:`, `Z:`) and deny arbitrary targets.
- Avoid storing recovery/password in logs; only store command outcome metadata in audit.
- `unlock_bitlocker` is executed with secret injected via process environment (not embedded in the PowerShell command string).
- If `query_bitlocker_status` reports unlocked and policy allows, use `skipIfUnlocked=true` to avoid redundant unlock attempts.

## Launcher Chain (VHD)
`launch_game_cmd` now runs the VHD chain as:
1. mount images (`X:`/`Y:`/`Z:`)
2. unlock BitLocker volumes if needed
3. detect/configure/launch game
4. on process exit: lock BitLocker best-effort, then unmount

For launcher-side auto-unlock, these env vars are checked per drive:
- `CONFIGARC_BITLOCKER_X_RECOVERY_PASSWORD` / `CONFIGARC_BITLOCKER_X_PASSWORD`
- `CONFIGARC_BITLOCKER_Y_RECOVERY_PASSWORD` / `CONFIGARC_BITLOCKER_Y_PASSWORD`
- `CONFIGARC_BITLOCKER_Z_RECOVERY_PASSWORD` / `CONFIGARC_BITLOCKER_Z_PASSWORD`
- global fallback: `CONFIGARC_BITLOCKER_RECOVERY_PASSWORD` / `CONFIGARC_BITLOCKER_PASSWORD`

## Policy Update Flow
1. Parse `SignedPolicyUpdateRequest`.
2. Verify signed payload and monotonic `version`.
3. Write new policy as temp file.
4. Move current policy to backup.
5. Replace with new policy atomically.
6. On failure, restore backup and return `POLICY_UPDATE_ROLLBACK`.
