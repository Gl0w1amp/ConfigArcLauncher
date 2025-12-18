export interface FileCheckResult {
  path: string;
  expected_sha256: string;
  actual_sha256?: string | null;
  exists: boolean;
  matches: boolean;
}

export interface SegatoolsTrustStatus {
  trusted: boolean;
  reason?: string | null;
  build_id?: string | null;
  generated_at?: string | null;
  artifact_name?: string | null;
  artifact_sha256?: string | null;
  checked_files: FileCheckResult[];
  has_backup?: boolean;
  missing_files?: boolean;
  local_build_time?: string | null;
}

export interface DeployResult {
  deployed: boolean;
  needs_confirmation: boolean;
  existing_files: string[];
  backup_dir?: string | null;
  message?: string | null;
  verification?: SegatoolsTrustStatus;
}

export interface RollbackResult {
  restored: boolean;
  message?: string | null;
  verification?: SegatoolsTrustStatus;
}
