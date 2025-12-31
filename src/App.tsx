import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import GameListPage from './routes/GameListPage';
import ConfigEditorPage from './routes/ConfigEditorPage';
import SettingsPage from './routes/SettingsPage';
import JsonEditorPage from './routes/JsonEditorPage';
import AppLayout from './components/Layout/AppLayout';
import SegatoolsDeployPage from './routes/SegatoolsDeployPage';
import ManageDataPage from './routes/ManageDataPage';
import ManageModsPage from './routes/ManageModsPage';
import ManageAimePage from './routes/ManageAimePage';
import ExtensionsPage from './routes/ExtensionsPage';
import { AlertDialog } from './components/common/AlertDialog';
import { UpdateDialog } from './components/common/UpdateDialog';
import { useUpdate } from './context/UpdateContext';
import { ExtensionsProvider, useExtensions } from './context/ExtensionsContext';
import ExtensionRoute from './components/extensions/ExtensionRoute';

function AppRoutes() {
  const { extensions } = useExtensions();
  const utilities = extensions.filter((ext) => ext.category === 'utility');
  const decrypterRoute = utilities.find((ext) => ext.id === 'game-image-decrypter')?.route || '/extensions';

  return (
    <Routes>
      <Route path="/games" element={<GameListPage />} />
      <Route path="/config" element={<ConfigEditorPage />} />
      <Route path="/deploy" element={<SegatoolsDeployPage />} />
      <Route path="/extensions" element={<ExtensionsPage />} />
      {utilities.map((extension) => (
        <Route
          key={extension.id}
          path={extension.route}
          element={<ExtensionRoute extension={extension} />}
        />
      ))}
      <Route path="/utilities" element={<Navigate to="/extensions" replace />} />
      <Route path="/deploy/games" element={<Navigate to={decrypterRoute} replace />} />
      <Route path="/json" element={<JsonEditorPage />} />
      <Route path="/manage/data" element={<ManageDataPage />} />
      <Route path="/manage/aime" element={<ManageAimePage />} />
      <Route path="/manage/mods" element={<ManageModsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/games" replace />} />
    </Routes>
  );
}

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
      <ExtensionsProvider>
        <HashRouter>
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </HashRouter>
      </ExtensionsProvider>
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
