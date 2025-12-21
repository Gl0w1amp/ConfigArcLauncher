import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { AlertDialog } from './components/common/AlertDialog';
import { UpdateDialog } from './components/common/UpdateDialog';
import { useUpdate } from './context/UpdateContext';

function App() {
  const { t } = useTranslation();
  const { 
    updateInfo, 
    updateError, 
    installingUpdate, 
    installUpdate, 
    closeUpdatePrompt, 
    clearError 
  } = useUpdate();

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
        <UpdateDialog
          updateInfo={updateInfo}
          installing={installingUpdate}
          onConfirm={installUpdate}
          onCancel={closeUpdatePrompt}
        />
      )}
      {updateError && (
        <AlertDialog
          title={t('updater.errorTitle')}
          message={t('updater.errorMessage', { error: updateError })}
          onClose={clearError}
        />
      )}
    </>
  );
}

export default App;
