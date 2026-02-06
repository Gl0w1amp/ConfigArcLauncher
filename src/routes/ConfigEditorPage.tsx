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
import { exportProfile, importProfile, loadGameDirSegatoolsConfig, openSegatoolsFolder, scanGameVfsFolders } from '../api/configApi';
import '../components/config/config.css';
import { formatError } from '../errors';
import { 
  IconPlus, IconSave, IconTrash, IconRefresh, IconRocket, 
  IconFolderOpen, IconWand, IconUndo, IconDownload, IconUpload, 
  IconFileImport, IconHardDrive 
} from '../components/common/Icons';

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
  const [showImportCurrentDialog, setShowImportCurrentDialog] = useState(false);
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
      const message = formatError(t, err);
      showToast(t('config.vfsScanFailed', { reason: message, defaultValue: `Scan failed: ${message}` }), 'error');
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

  const handleMainSave = async () => {
    if (!config) return;

    try {
      // Save to disk
      await save(config);

      // Save to profile if selected
      if (selectedProfileId) {
        const profile = profiles.find((p) => p.id === selectedProfileId);
        if (profile) {
          const updatedProfile = {
            ...profile,
            segatools: config,
            updated_at: new Date().toISOString()
          };
          await saveProfile(updatedProfile);
          reloadProfiles();
          showToast(t('config.savedAndProfile', { defaultValue: 'Saved to Disk & Profile' }), 'success');
          return;
        }
      }
      showToast(t('config.saved'), 'success');
    } catch (err) {
      const message = formatError(t, err);
      showToast(
        t('config.saveFailed', {
          reason: message,
          defaultValue: `Save failed: ${message}`
        }),
        'error'
      );
    }
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

  const handleImportCurrentIni = () => {
    setShowImportCurrentDialog(true);
  };

  const onConfirmCreateProfile = async (name: string) => {
    if (!config || !name) return;
    const now = new Date().toISOString();
    const profile: ConfigProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`,
      name,
      description: '',
      segatools: config,
      created_at: now,
      updated_at: now
    };
    await saveProfile(profile);
    setSelectedProfileId(profile.id);
    if (activeGameId) localStorage.setItem(`lastProfile:${activeGameId}`, profile.id);
    reloadProfiles();
    showToast(t('config.profileCreated'), 'success');
    setShowNewProfileDialog(false);
  };

  const onConfirmImportCurrentIni = async (name: string) => {
    if (!name) return;
    try {
      const currentConfig = await loadGameDirSegatoolsConfig();
      const now = new Date().toISOString();
      const profile: ConfigProfile = {
        id: crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`,
        name,
        description: '',
        segatools: currentConfig,
        created_at: now,
        updated_at: now
      };
      await saveProfile(profile);
      setSelectedProfileId(profile.id);
      if (activeGameId) localStorage.setItem(`lastProfile:${activeGameId}`, profile.id);
      reloadProfiles();
      setConfig(currentConfig);
      showToast(
        t('config.importFromCurrentIniOk', {
          name,
          defaultValue: 'Profile created from game INI'
        }),
        'success'
      );
      setShowImportCurrentDialog(false);
    } catch (err) {
      const message = formatError(t, err);
      showToast(
        t('config.importFromCurrentIniFailed', {
          reason: message,
          defaultValue: `Failed to import game INI: ${message}`
        }),
        'error'
      );
    }
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
      const message = formatError(t, err);
      showToast(t('config.exportFailed', { reason: message, defaultValue: `Export failed: ${message}` }), 'error');
    }
  };

  const handleImportIni = () => {
    fileInputRef.current?.click();
  };

  const handleOpenConfigFolder = async () => {
    try {
      await openSegatoolsFolder();
    } catch (err) {
      const message = formatError(t, err);
      showToast(
        t('config.openConfigFolderFailed', {
          reason: message,
          defaultValue: `Failed to open config folder: ${message}`
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
      const message = formatError(t, err);
      showToast(t('config.importFailed', { reason: message, defaultValue: `Import failed: ${message}` }), 'error');
    } finally {
      e.target.value = '';
    }
  };

  useEffect(() => {
    setInitialized(false);
    setSelectedProfileId('');
  }, [activeGameId]);

  useEffect(() => {
    if (!activeGameId || initialized || profiles.length === 0) return;

    setInitialized(true);
    const last = localStorage.getItem(`lastProfile:${activeGameId}`);
    if (last && profiles.some((p) => p.id === last)) {
      void handleProfileLoad(last);
      return;
    }

    // No persisted profile selection: keep using current disk-backed segatools.ini.
    setSelectedProfileId('');
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
      <p className="error-message">{error ? formatError(t, error, { fallbackKey: 'config.loadError' }) : t('config.loadError')}</p>
    </div>
  );

  const trustChecking = !trustStatus;

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
          <button onClick={handleCreateProfile} title={t('config.newProfile')}>
            <IconPlus />
          </button>
          <button onClick={handleProfileSave} title={t('config.saveProfile')}>
            <IconSave />
          </button>
          <button onClick={handleOpenConfigFolder} title={t('config.openConfigFolder', { defaultValue: 'Open Config Folder' })}>
            <IconFolderOpen />
          </button>
          <button onClick={handleProfileDelete} disabled={!selectedProfileId} title={t('config.deleteProfile')} className="danger">
            <IconTrash />
          </button>
        </div>
      </div>
      <div className="config-toolbar">
        <div className="config-toolbar-left">
          <span
            className="config-trust-status"
            style={{ color: trustStatus?.trusted ? 'var(--success)' : 'var(--warning)' }}
          >
            {trustChecking ? t('config.trustChecking') : trustStatus?.trusted ? t('config.trustOk') : trustStatus?.missing_files ? t('config.trustMissing') : t('config.trustFailed')}
          </span>
          <button className="config-toolbar-button" onClick={refreshTrust} disabled={trustLoading}>
            <IconRefresh className={trustLoading ? "spin" : ""} />
            {trustLoading ? t('config.trustChecking') : t('config.trustRefresh')}
          </button>
          <Link to="/deploy" style={{ textDecoration: 'none' }}>
            <button className="config-toolbar-button" type="button">
              <IconRocket />
              {t('config.openDeploy')}
            </button>
          </Link>
        </div>

        <div className="config-toolbar-right">
          <button className="config-toolbar-button" onClick={handleAutoCompleteVfs}>
            <IconWand />
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
      {trustStatus && !trustStatus.trusted && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--danger)', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <strong>{trustStatus.missing_files ? t('config.trustMissingTitle') : t('config.trustWarningTitle')}</strong>
          <div>{trustStatus.missing_files ? t('config.trustMissingMessage') : t('config.trustWarningMessage')}</div>
          {trustStatus.reason && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{t('config.trustReason', { reason: trustStatus.reason })}</div>}
        </div>
      )}
      {error && <p style={{ color: '#f87171' }}>{formatError(t, error)}</p>}
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
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={handleMainSave} disabled={saving} className="primary">
          <IconSave />
          {t('config.saveConfig', { defaultValue: 'Save Config' })}
        </button>
        <button onClick={resetToDefaults}>
          <IconUndo />
          {t('config.resetDefaults')}
        </button>
        <button onClick={handleExportIni}>
          <IconDownload />
          {t('config.exportIni', { defaultValue: 'Export Profile' })}
        </button>
        <button onClick={handleImportIni}>
          <IconUpload />
          {t('config.importIni', { defaultValue: 'Import Profile' })}
        </button>
        <button onClick={handleImportCurrentIni}>
          <IconFileImport />
          {t('config.importFromCurrentIni', { defaultValue: 'Profile from Game INI' })}
        </button>
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
      )}
      {showAdvancedConfirm && (
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
      )}
      {showImportCurrentDialog && (
        <PromptDialog
          title={t('config.importFromCurrentIniTitle', 'Create Profile from Game INI')}
          label={t('config.importFromCurrentIniMessage', 'Enter a name for the new profile:')}
          defaultValue=""
          onConfirm={onConfirmImportCurrentIni}
          onCancel={() => setShowImportCurrentDialog(false)}
        />
      )}
      {createPortal(<ToastContainer toasts={toasts} />, document.body)}
    </div>
  );
}

export default ConfigEditorPage;
