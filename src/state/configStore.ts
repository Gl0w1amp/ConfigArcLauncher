import { useCallback, useEffect, useState } from 'react';
import {
  loadSegatoolsConfig,
  saveSegatoolsConfig,
  loadDefaultSegatoolsConfig,
  listProfiles,
  saveProfile as saveProfileApi,
  deleteProfile as deleteProfileApi,
  loadProfile as loadProfileApi
} from '../api/configApi';
import { SegatoolsConfig } from '../types/config';
import { ConfigProfile } from '../types/games';
import { getActiveGame } from '../api/gamesApi';
import { fetchTrustStatus } from '../api/trustedApi';
import { SegatoolsTrustStatus } from '../types/trusted';
import { AppError, getErrorMessage, normalizeError } from '../errors';
import { isOfflineModeEnabled } from './offlineMode';

const TRUST_STATUS_STORAGE_PREFIX = 'trustStatus:';
const TRUST_STATUS_STORAGE_TTL_MS = 5 * 60 * 1000;

type CachedTrustStatus = {
  status: SegatoolsTrustStatus;
  cachedAt: number;
};

function trustStatusStorageKey(gameId: string) {
  return `${TRUST_STATUS_STORAGE_PREFIX}${gameId}`;
}

function readCachedTrustStatus(gameId: string) {
  const key = trustStatusStorageKey(gameId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedTrustStatus;
    if (!parsed || typeof parsed.cachedAt !== 'number' || !parsed.status) {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.cachedAt > TRUST_STATUS_STORAGE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.status;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeCachedTrustStatus(gameId: string, status: SegatoolsTrustStatus) {
  const payload: CachedTrustStatus = {
    status,
    cachedAt: Date.now(),
  };
  localStorage.setItem(trustStatusStorageKey(gameId), JSON.stringify(payload));
}

export function useConfigState() {
  const [config, setConfig] = useState<SegatoolsConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [trustStatus, setTrustStatus] = useState<SegatoolsTrustStatus | null>(null);
  const [trustLoading, setTrustLoading] = useState<boolean>(false);

  const refreshTrust = useCallback(async (gameId?: string | null) => {
    if (isOfflineModeEnabled()) {
      const targetGameId = gameId ?? activeGameId;
      const cachedTrust = targetGameId ? readCachedTrustStatus(targetGameId) : null;
      if (cachedTrust) {
        setTrustStatus(cachedTrust);
      } else {
        setTrustStatus({
          trusted: false,
          reason: 'Offline mode is enabled.',
          checked_files: [],
          has_backup: false,
          missing_files: false,
        });
      }
      setTrustLoading(false);
      return;
    }
    setTrustLoading(true);
    try {
      const status = await fetchTrustStatus();
      setTrustStatus(status);
      const targetGameId = gameId ?? activeGameId;
      if (targetGameId) {
        writeCachedTrustStatus(targetGameId, status);
      }
    } catch (err) {
      const status = {
        trusted: false,
        reason: getErrorMessage(err),
        build_id: undefined,
        generated_at: undefined,
        artifact_name: undefined,
        artifact_sha256: undefined,
        checked_files: [],
        has_backup: false,
      } as SegatoolsTrustStatus;
      setTrustStatus(status);
      const targetGameId = gameId ?? activeGameId;
      if (targetGameId) {
        writeCachedTrustStatus(targetGameId, status);
      }
    } finally {
      setTrustLoading(false);
    }
  }, [activeGameId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getActiveGame();
      setActiveGameId(active);
      if (!active) {
        setConfig(null);
      setError(normalizeError('No active game selected'));
      setTrustStatus(null);
      return;
      }
      const cachedTrust = active ? readCachedTrustStatus(active) : null;
      setTrustStatus(cachedTrust);
      const cfg = await loadSegatoolsConfig();
      setConfig(cfg);
      setError(null);
      void refreshTrust(active);
    } catch (err) {
      setError(normalizeError(err));
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [refreshTrust]);

  const save = useCallback(async (cfg: SegatoolsConfig) => {
    setSaving(true);
    try {
      await saveSegatoolsConfig(cfg);
      setConfig(cfg);
      setError(null);
    } catch (err) {
      const normalized = normalizeError(err);
      setError(normalized);
      throw normalized;
    } finally {
      setSaving(false);
    }
  }, []);

  const resetToDefaults = useCallback(async () => {
    const defaults = await loadDefaultSegatoolsConfig();
    setConfig(defaults);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { config, setConfig, loading, saving, error, activeGameId, reload, save, resetToDefaults, trustStatus, trustLoading, refreshTrust };
}

export function useProfilesState() {
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProfiles();
      setProfiles(list);
      setError(null);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async (profile: ConfigProfile) => {
    await saveProfileApi(profile);
    await reload();
  }, [reload]);

  const deleteProfile = useCallback(async (id: string) => {
    await deleteProfileApi(id);
    await reload();
  }, [reload]);

  const loadProfile = useCallback(async (id: string) => loadProfileApi(id), []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profiles, loading, error, reload, saveProfile, deleteProfile, loadProfile };
}
