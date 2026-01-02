import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import SegatoolsEditor from '../components/config/SegatoolsEditor';
import { useConfigState, useProfilesState } from '../state/configStore';
import { useGamesState } from '../state/gamesStore';
import { ConfigProfile } from '../types/games';
import { SegatoolsConfig } from '../types/config';
import { useToast, ToastContainer } from '../components/common/Toast';
import { PromptDialog } from '../components/common/PromptDialog';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Link } from 'react-router-dom';
import { exportProfile, importProfile, loadDefaultSegatoolsConfig, openSegatoolsFolder, scanGameVfsFolders } from '../api/configApi';
import '../components/config/config.css';

function ConfigEditorPage() {
  const { t } = useTranslation();
  const { config, setConfig, loading, saving, error, activeGameId, reload, save, resetToDefaults, trustStatus, trustLoading, refreshTrust } = useConfigState();
  const { profiles, reload: reloadProfiles, saveProfile, deleteProfile, loadProfile } = useProfilesState();
  const { games } = useGamesState();
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const { toasts, showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewProfileDialog, setShowNewProfileDialog] = useState(false);
  const [showDeleteProfileDialog, setShowDeleteProfileDialog] = useState(false);
  const [showAdvancedConfirm, setShowAdvancedConfirm] = useState(false);
  const [advancedMode, setAdvancedMode] = useState<boolean>(() => {
    return localStorage.getItem('config:advancedMode') === '1';
  });

  const handleAutoCompleteVfs = async () => {
    try {
      const result = await scanGameVfsFolders();
      if (!config) return;
      
      const newVfs = { ...config.vfs };
      let changed = false;
      
      if (result.amfs) { newVfs.amfs = result.amfs; changed = true; }
      if (result.appdata) { newVfs.appdata = result.appdata; changed = true; }
      if (result.option) { newVfs.option = result.option; changed = true; }
      
      if (changed) {
        setConfig({
          ...config,
          vfs: newVfs
        });
        showToast(t('config.vfsAutoCompleted', { defaultValue: 'VFS paths auto-completed' }), 'success');
      } else {
        showToast(t('config.vfsNoPathsFound', { defaultValue: 'No VFS folders found' }), 'info');
      }
    } catch (err) {
      showToast(t('config.vfsScanFailed', { reason: String(err), defaultValue: `Scan failed: ${String(err)}` }), 'error');
    }
  };

  const handleAdvancedModeChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setShowAdvancedConfirm(true);
    } else {
      setAdvancedMode(false);
    }
  };

  const activeGame = useMemo(() => games.find(g => g.id === activeGameId), [games, activeGameId]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    reloadProfiles();
  }, [reloadProfiles]);

  useEffect(() => {
    localStorage.setItem('config:advancedMode', advancedMode ? '1' : '0');
  }, [advancedMode]);

  // Removed redundant useEffect that was causing double-load issues

  const profileOptions = useMemo(() => profiles.map((p) => ({ value: p.id, label: p.name })), [profiles]);

  const handleProfileSave = async () => {
    if (!config) return;
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) {
      setShowNewProfileDialog(true);
      return;
    }
    
    const updatedProfile = {
      ...profile,
      segatools: config,
      updated_at: new Date().toISOString()
    };
    await saveProfile(updatedProfile);
    reloadProfiles();
    showToast(t('config.profileSaved'), 'success');
  };

  const handleProfileDelete = () => {
    if (!selectedProfileId) return;
    setShowDeleteProfileDialog(true);
  };

  const onConfirmDeleteProfile = async () => {
    if (!selectedProfileId) return;
    await deleteProfile(selectedProfileId);
    setSelectedProfileId('');
    if (activeGameId) localStorage.removeItem(`lastProfile:${activeGameId}`);
    reloadProfiles();
    reload();
    showToast(t('config.profileDeleted'), 'info');
    setShowDeleteProfileDialog(false);
  };

  const handleCreateProfile = () => {
    if (!config) return;
    setShowNewProfileDialog(true);
  };

  const onConfirmCreateProfile = async (name: string) => {
    if (!config || !name) return;
    const defaultConfig = await loadDefaultSegatoolsConfig();
    const profile: ConfigProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`,
      name,
      description: '',
      segatools: defaultConfig,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await saveProfile(profile);
    setSelectedProfileId(profile.id);
    if (activeGameId) localStorage.setItem(`lastProfile:${activeGameId}`, profile.id);
    reloadProfiles();
    showToast(t('config.profileCreated'), 'success');
    setShowNewProfileDialog(false);
  };

  const handleProfileLoad = async (id: string) => {
    setSelectedProfileId(id);
    if (activeGameId) {
      if (id) {
        localStorage.setItem(`lastProfile:${activeGameId}`, id);
      } else {
        localStorage.removeItem(`lastProfile:${activeGameId}`);
      }
    }
    if (!id) {
      await reload();
      showToast(t('config.loadedCurrent'), 'info');
      return;
    }
    const prof = await loadProfile(id);
    setConfig({ ...prof.segatools });
    showToast(t('config.loadedProfile', { name: prof.name }), 'info');
  };

  const handleExportIni = async () => {
    try {
      const content = await exportProfile(selectedProfileId || undefined);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'segatools_profile.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('config.exportedIni', { defaultValue: 'Profile exported' }), 'success');
    } catch (err) {
      showToast(t('config.exportFailed', { reason: String(err), defaultValue: `Export failed: ${String(err)}` }), 'error');
    }
  };

  const handleImportIni = () => {
    fileInputRef.current?.click();
  };

  const handleOpenConfigFolder = async () => {
    try {
      await openSegatoolsFolder();
    } catch (err) {
      showToast(
        t('config.openConfigFolderFailed', {
          reason: String(err),
          defaultValue: `Failed to open config folder: ${String(err)}`
        }),
        'error'
      );
    }
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const profile = await importProfile(text);
      await reloadProfiles();
      setSelectedProfileId(profile.id);
      setConfig(profile.segatools);
      showToast(t('config.importedIni', { name: profile.name, defaultValue: 'Profile imported' }), 'success');
    } catch (err) {
      showToast(t('config.importFailed', { reason: String(err), defaultValue: `Import failed: ${String(err)}` }), 'error');
    } finally {
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (profiles.length > 0 && activeGameId && !initialized) {
      setInitialized(true);
      const last = localStorage.getItem(`lastProfile:${activeGameId}`);
      let targetId: string | null = null;
      if (last && profiles.some(p => p.id === last)) {
        targetId = last;
      } else {
        const original = profiles.find(p => p.name === "Original INI");
        targetId = original ? original.id : profiles[0].id;
      }

      if (targetId) {
        handleProfileLoad(targetId);
      } else {
        setSelectedProfileId('');
      }
    }
  }, [profiles, activeGameId, initialized]);

  if (loading) return (
    <div className="empty-state">
      <h3>{t('config.loading')}</h3>
    </div>
  );

  if (!activeGameId) {
    return (
      <div className="empty-state">
        <h3>{t('config.noActiveGame')}</h3>
        <p>{t('config.activateFirst')}</p>
      </div>
    );
  }

  if (!config) return (
    <div className="empty-state">
      <h3 style={{ color: 'var(--danger)' }}>{t('common.error')}</h3>
      <p className="error-message">{error || t('config.loadError')}</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0' }}>
            {t('config.title')} {activeGame ? <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>— {activeGame.name}</span> : ''}
          </h2>
          <small>{t('config.subtitle')}</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedProfileId} onChange={(e) => handleProfileLoad(e.target.value)}>
            <option value="">{t('games.currentFile')}</option>
            {profileOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={handleCreateProfile}>{t('config.newProfile')}</button>
          <button onClick={handleProfileSave}>{t('config.saveProfile')}</button>
          <button onClick={handleProfileDelete} disabled={!selectedProfileId}>{t('config.deleteProfile')}</button>
        </div>
      </div>
      <div className="config-toolbar">
        <div className="config-toolbar-left">
          <span
            className="config-trust-status"
            style={{ color: trustStatus?.trusted ? 'var(--success)' : 'var(--warning)' }}
          >
            {trustLoading ? t('config.trustChecking') : trustStatus?.trusted ? t('config.trustOk') : trustStatus?.missing_files ? t('config.trustMissing') : t('config.trustFailed')}
          </span>
          <button className="config-toolbar-button" onClick={refreshTrust} disabled={trustLoading}>
            {trustLoading ? t('config.trustChecking') : t('config.trustRefresh')}
          </button>
          <Link to="/deploy" style={{ textDecoration: 'none' }}>
            <button className="config-toolbar-button" type="button">{t('config.openDeploy')}</button>
          </Link>
          <button className="config-toolbar-button" type="button" onClick={handleOpenConfigFolder}>
            {t('config.openConfigFolder', { defaultValue: 'Open Config Folder' })}
          </button>
        </div>

        <div className="config-toolbar-right">
          <button className="config-toolbar-button" onClick={handleAutoCompleteVfs}>
            {t('config.autoComplete', { defaultValue: 'Auto Complete' })}
          </button>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={handleAdvancedModeChange}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">{t('config.advancedMode', { defaultValue: 'Advanced mode' })}</span>
          </label>
        </div>
      </div>
      {!trustStatus?.trusted && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--danger)', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <strong>{trustStatus?.missing_files ? t('config.trustMissingTitle') : t('config.trustWarningTitle')}</strong>
          <div>{trustStatus?.missing_files ? t('config.trustMissingMessage') : t('config.trustWarningMessage')}</div>
          {trustStatus?.reason && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{t('config.trustReason', { reason: trustStatus.reason })}</div>}
        </div>
      )}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <SegatoolsEditor
        config={config}
        onChange={(next: SegatoolsConfig) => setConfig(next)}
        activeGame={activeGame}
        advanced={advancedMode}
        onDropError={(message) =>
          showToast(
            t('config.ioDropFailed', {
              error: message,
              defaultValue: `Failed to store IO file: ${message}`
            }),
            'error'
          )
        }
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => { save(config); showToast(t('config.saved'), 'success'); }} disabled={saving}>{t('config.saveConfig')}</button>
        <button onClick={resetToDefaults}>{t('config.resetDefaults')}</button>
        <button onClick={() => { reload(); showToast(t('config.reloaded'), 'info'); }}>{t('config.reloadDisk')}</button>
        <button onClick={handleExportIni}>{t('config.exportIni', { defaultValue: 'Export Profile' })}</button>
        <button onClick={handleImportIni}>{t('config.importIni', { defaultValue: 'Import Profile' })}</button>
      </div>
      <input
        type="file"
        accept=".json,application/json,text/plain"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleImportFileChange}
      />
      {showNewProfileDialog && (
        <PromptDialog
          title={t('config.createProfileTitle')}
          label={t('config.createProfileMessage')}
          defaultValue=""
          onConfirm={onConfirmCreateProfile}
          onCancel={() => setShowNewProfileDialog(false)}
        />
      )}
      {showDeleteProfileDialog && (
        <ConfirmDialog
          title={t('config.deleteProfileTitle')}
          message={t('config.deleteProfileMessage')}
          onConfirm={onConfirmDeleteProfile}
          onCancel={() => setShowDeleteProfileDialog(false)}
          isDangerous={true}
        />
      )}      {showAdvancedConfirm && (
        <ConfirmDialog
          title={t('config.advancedModeTitle', 'Enable Advanced Mode?')}
          message={t('config.advancedModeWarning', 'Advanced mode allows you to edit all configuration fields. Incorrect settings may cause the game to fail to start or behave unexpectedly. Are you sure you know what you are doing?')}
          confirmLabel={t('common.enable', 'Enable')}
          onConfirm={() => {
            setAdvancedMode(true);
            setShowAdvancedConfirm(false);
          }}
          onCancel={() => setShowAdvancedConfirm(false)}
          isDangerous
        />
      )}      {createPortal(<ToastContainer toasts={toasts} />, document.body)}
    </div>
  );
}

export default ConfigEditorPage;
