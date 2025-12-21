import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import GameListPage from './routes/GameListPage';
import ConfigEditorPage from './routes/ConfigEditorPage';
import SettingsPage from './routes/SettingsPage';
import JsonEditorPage from './routes/JsonEditorPage';
import AppLayout from './components/Layout/AppLayout';
import SegatoolsDeployPage from './routes/SegatoolsDeployPage';
import DeployGamesPage from './routes/DeployGamesPage';
import ManageDataPage from './routes/ManageDataPage';
import ManageModsPage from './routes/ManageModsPage';
import ManageAimePage from './routes/ManageAimePage';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { AlertDialog } from './components/common/AlertDialog';
import { AUTO_UPDATE_STORAGE_KEY } from './constants/storage';

function App() {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    if (localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) !== '1') return;

    const runCheck = async () => {
      try {
        const update = await check();
        if (update) setUpdateInfo(update);
      } catch (err) {
        console.error('Auto update check failed:', err);
      }
    };

    void runCheck();
  }, []);

  const closeUpdatePrompt = () => {
    if (installingUpdate) return;
    updateInfo?.close().catch(() => {});
    setUpdateInfo(null);
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
      setUpdateError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <HashRouter>
        <AppLayout>
          <Routes>
            <Route path="/games" element={<GameListPage />} />
            <Route path="/config" element={<ConfigEditorPage />} />
            <Route path="/deploy" element={<SegatoolsDeployPage />} />
            <Route path="/deploy/games" element={<DeployGamesPage />} />
            <Route path="/json" element={<JsonEditorPage />} />
            <Route path="/manage/data" element={<ManageDataPage />} />
            <Route path="/manage/aime" element={<ManageAimePage />} />
            <Route path="/manage/mods" element={<ManageModsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/games" replace />} />
          </Routes>
        </AppLayout>
      </HashRouter>
      {updateInfo && (
        <ConfirmDialog
          title={t('updater.title')}
          message={t('updater.message', { version: updateInfo.version })}
          confirmLabel={installingUpdate ? t('updater.installing') : t('updater.confirm')}
          cancelLabel={t('updater.cancel')}
          onConfirm={installUpdate}
          onCancel={closeUpdatePrompt}
        />
      )}
      {updateError && (
        <AlertDialog
          title={t('updater.errorTitle')}
          message={t('updater.errorMessage', { error: updateError })}
          onClose={() => setUpdateError(null)}
        />
      )}
    </>
  );
}

export default App;
