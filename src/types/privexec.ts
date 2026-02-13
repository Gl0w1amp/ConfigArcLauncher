export interface PrivExecSignatureEnvelope {
  algorithm: string;
  keyId: string;
  signature: string;
}

export interface PrivExecCommandRequestPayload {
  schemaVersion: number;
  commandId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  deviceId: string;
  command: string;
  params: Record<string, unknown>;
}

export interface PrivExecSignedCommandRequest {
  payload: PrivExecCommandRequestPayload;
  signature: PrivExecSignatureEnvelope;
}

export interface PrivExecCommandResponse {
  schemaVersion: number;
  commandId: string;
  ok: boolean;
  code: string;
  message: string;
  executedAt: string;
  idempotentReplay: boolean;
  result?: unknown;
}

export interface PrivExecPolicyUpdateResponse {
  ok: boolean;
  code: string;
  message: string;
  version: number;
  rolledBack: boolean;
}

export interface PrivExecPaths {
  rootDir: string;
  policyPath: string;
  auditLogPath: string;
}

export interface PrivExecRuntimeOptions {
  rootDir?: string;
  deviceId?: string;
  bootstrapPublicKeys?: Record<string, string>;
}
