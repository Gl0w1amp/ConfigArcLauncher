import { invokeTauri } from './tauriClient';
import {
  PrivExecCommandResponse,
  PrivExecPaths,
  PrivExecPolicyUpdateResponse,
  PrivExecRuntimeOptions,
} from '../types/privexec';

export const getPrivExecPaths = (rootDir?: string) =>
  invokeTauri<PrivExecPaths>('privexec_get_paths_cmd', { rootDir });

export const executePrivExecRequest = (
  requestJson: string,
  options?: PrivExecRuntimeOptions,
) =>
  invokeTauri<PrivExecCommandResponse>('privexec_execute_cmd', {
    requestJson,
    rootDir: options?.rootDir,
    deviceId: options?.deviceId,
    bootstrapPublicKeys: options?.bootstrapPublicKeys,
  });

export const applyPrivExecPolicyUpdate = (
  updateJson: string,
  options?: PrivExecRuntimeOptions,
) =>
  invokeTauri<PrivExecPolicyUpdateResponse>('privexec_apply_policy_update_cmd', {
    updateJson,
    rootDir: options?.rootDir,
    deviceId: options?.deviceId,
    bootstrapPublicKeys: options?.bootstrapPublicKeys,
  });
