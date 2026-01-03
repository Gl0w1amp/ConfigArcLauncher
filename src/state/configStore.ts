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

export function useConfigState() {
  const [config, setConfig] = useState<SegatoolsConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [trustStatus, setTrustStatus] = useState<SegatoolsTrustStatus | null>(null);
  const [trustLoading, setTrustLoading] = useState<boolean>(false);

  const refreshTrust = useCallback(async () => {
    setTrustLoading(true);
    try {
      const status = await fetchTrustStatus();
      setTrustStatus(status);
    } catch (err) {
      setTrustStatus({
        trusted: false,
        reason: String(err),
        build_id: undefined,
        generated_at: undefined,
        artifact_name: undefined,
        artifact_sha256: undefined,
        checked_files: [],
        has_backup: false,
      });
    } finally {
      setTrustLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getActiveGame();
      setActiveGameId(active);
      if (!active) {
        setConfig(null);
        setError('No active game selected');
        setTrustStatus(null);
        return;
      }
      const cfg = await loadSegatoolsConfig();
      setConfig(cfg);
      setError(null);
      void refreshTrust();
    } catch (err) {
      setError(String(err));
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
      setError(String(err));
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
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProfiles();
      setProfiles(list);
      setError(null);
    } catch (err) {
      setError(String(err));
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
