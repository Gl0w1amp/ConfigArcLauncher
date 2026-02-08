import { useEffect, useState } from 'react';
import { invokeTauri } from '../api/tauriClient';
import { OFFLINE_MODE_STORAGE_KEY } from '../constants/storage';

const OFFLINE_MODE_CHANGED_EVENT = 'configarc:offline-mode-changed';

export const isOfflineModeEnabled = () => localStorage.getItem(OFFLINE_MODE_STORAGE_KEY) === '1';

export const setOfflineModeStorage = (enabled: boolean, emitEvent = true) => {
  if (enabled) {
    localStorage.setItem(OFFLINE_MODE_STORAGE_KEY, '1');
  } else {
    localStorage.removeItem(OFFLINE_MODE_STORAGE_KEY);
  }

  if (emitEvent) {
    window.dispatchEvent(
      new CustomEvent<boolean>(OFFLINE_MODE_CHANGED_EVENT, {
        detail: enabled,
      })
    );
  }
};

export function useOfflineMode() {
  const [enabled, setEnabled] = useState<boolean>(() => isOfflineModeEnabled());

  useEffect(() => {
    let disposed = false;

    invokeTauri<boolean>('get_offline_mode_cmd')
      .then((nextEnabled) => {
        if (disposed) return;
        setOfflineModeStorage(nextEnabled, false);
        setEnabled(nextEnabled);
      })
      .catch(() => {
        // Keep local fallback state.
      });

    const handleModeChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (typeof customEvent.detail === 'boolean') {
        setEnabled(customEvent.detail);
        return;
      }
      setEnabled(isOfflineModeEnabled());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== OFFLINE_MODE_STORAGE_KEY) return;
      setEnabled(isOfflineModeEnabled());
    };

    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, handleModeChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      disposed = true;
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, handleModeChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return enabled;
}
