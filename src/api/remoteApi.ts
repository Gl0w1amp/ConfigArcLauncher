import { invokeTauri } from './tauriClient';

export interface RemoteSyncStatus {
  ok: boolean;
  fetchedAt?: string | null;
  endpoint?: string | null;
  usedCache: boolean;
  error?: string | null;
}

export const getLocalOverride = () => invokeTauri<Record<string, unknown>>('get_local_override_cmd');
export const setLocalOverride = (overrideJson: Record<string, unknown>) =>
  invokeTauri<void>('set_local_override_cmd', { overrideJson });
export const getEffectiveRemoteConfig = () => invokeTauri<Record<string, unknown>>('get_effective_remote_config_cmd');
export const syncRemoteConfig = (endpoint?: string) =>
  invokeTauri<RemoteSyncStatus>('sync_remote_config_cmd', { endpoint });
