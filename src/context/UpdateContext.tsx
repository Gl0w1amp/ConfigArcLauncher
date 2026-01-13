import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { AUTO_UPDATE_STORAGE_KEY } from '../constants/storage';
import { AppError, normalizeError } from '../errors';

interface UpdateContextType {
  updateInfo: Update | null;
  updateError: AppError | null;
  installingUpdate: boolean;
  isChecking: boolean;
  checkForUpdates: (manual?: boolean) => Promise<boolean>;
  installUpdate: () => Promise<void>;
  closeUpdatePrompt: () => void;
  clearError: () => void;
}

const UpdateContext = createContext<UpdateContextType | null>(null);

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<AppError | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const hasCheckedRef = useRef(false);

  const checkForUpdates = async (manual = false) => {
    if (isChecking) return false;
    setIsChecking(true);
    setUpdateError(null);
    
    try {
      const update = await check();
      if (update) {
        setUpdateInfo(update);
        return true;
      } else {
        setUpdateInfo(null);
        return false;
      }
    } catch (err) {
      console.error('Update check failed:', err);
      if (manual) {
        setUpdateError(normalizeError(err));
      }
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    if (!updateInfo || installingUpdate) return;
    setInstallingUpdate(true);
    try {
      await updateInfo.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateInfo(null);
      setInstallingUpdate(false);
      setUpdateError(normalizeError(err));
    }
  };

  const closeUpdatePrompt = () => {
    if (installingUpdate) return;
    updateInfo?.close().catch(() => {});
    setUpdateInfo(null);
  };

  const clearError = () => setUpdateError(null);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    if (localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) === '1') {
      checkForUpdates();
    }
  }, []);

  return (
    <UpdateContext.Provider value={{
      updateInfo,
      updateError,
      installingUpdate,
      isChecking,
      checkForUpdates,
      installUpdate,
      closeUpdatePrompt,
      clearError
    }}>
      {children}
    </UpdateContext.Provider>
  );
}
