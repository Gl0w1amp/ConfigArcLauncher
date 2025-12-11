import { useEffect, useMemo, useState } from 'react';
import SegatoolsEditor from '../components/config/SegatoolsEditor';
import { useConfigState, useProfilesState } from '../state/configStore';
import { useGamesState } from '../state/gamesStore';
import { ConfigProfile } from '../types/games';
import { SegatoolsConfig } from '../types/config';
import { useToast, ToastContainer } from '../components/common/Toast';
import { PromptDialog } from '../components/common/PromptDialog';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

function ConfigEditorPage() {
  const { config, setConfig, loading, saving, error, activeGameId, reload, save, resetToDefaults } = useConfigState();
  const { profiles, reload: reloadProfiles, saveProfile, deleteProfile, loadProfile } = useProfilesState();
  const { games } = useGamesState();
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const { toasts, showToast } = useToast();

  const [showNewProfileDialog, setShowNewProfileDialog] = useState(false);
  const [showDeleteProfileDialog, setShowDeleteProfileDialog] = useState(false);

  const activeGame = useMemo(() => games.find(g => g.id === activeGameId), [games, activeGameId]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    reloadProfiles();
  }, [reloadProfiles]);

  useEffect(() => {
    if (profiles.length > 0 && activeGameId && !initialized) {
      setInitialized(true);
      const last = localStorage.getItem(`lastProfile:${activeGameId}`);
      if (last && profiles.some(p => p.id === last)) {
        setSelectedProfileId(last);
      } else {
        // Try to find "Original INI" first, otherwise default to first
        const original = profiles.find(p => p.name === "Original INI");
        if (original) {
          setSelectedProfileId(original.id);
        } else {
          setSelectedProfileId(profiles[0].id);
        }
      }
    }
  }, [profiles, activeGameId, initialized]);

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
    showToast('Profile saved successfully!', 'success');
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
    showToast('Profile deleted', 'info');
    setShowDeleteProfileDialog(false);
  };

  const handleCreateProfile = () => {
    if (!config) return;
    setShowNewProfileDialog(true);
  };

  const onConfirmCreateProfile = async (name: string) => {
    if (!config || !name) return;
    const profile: ConfigProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`,
      name,
      description: '',
      segatools: config,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await saveProfile(profile);
    setSelectedProfileId(profile.id);
    if (activeGameId) localStorage.setItem(`lastProfile:${activeGameId}`, profile.id);
    reloadProfiles();
    showToast('Profile created', 'success');
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
      showToast('Loaded current file', 'info');
      return;
    }
    const prof = await loadProfile(id);
    setConfig({ ...prof.segatools });
    showToast(`Loaded profile: ${prof.name}`, 'info');
  };

  if (loading) return (
    <div className="empty-state">
      <h3>Loading Config...</h3>
    </div>
  );

  if (!activeGameId) {
    return (
      <div className="empty-state">
        <h3>No Active Game Selected</h3>
        <p>Please activate a game in the Game List to edit its configuration.</p>
        <p style={{ fontSize: '0.9em', opacity: 0.7, marginTop: '8px' }}>请先在游戏列表激活一个游戏后再编辑配置。</p>
      </div>
    );
  }

  if (!config) return (
    <div className="empty-state">
      <h3 style={{ color: 'var(--danger)' }}>Configuration Error</h3>
      <p className="error-message">{error || "Failed to load configuration."}</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0' }}>
            Config Editor {activeGame ? <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>— {activeGame.name}</span> : ''}
          </h2>
          <small>Edit segatools.ini values and manage profiles.</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedProfileId} onChange={(e) => handleProfileLoad(e.target.value)}>
            <option value="">Current File (segatools.ini)</option>
            {profileOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={handleCreateProfile}>New Profile</button>
          <button onClick={handleProfileSave}>Save Profile</button>
          <button onClick={handleProfileDelete} disabled={!selectedProfileId}>Delete Profile</button>
        </div>
      </div>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <SegatoolsEditor
        config={config}
        onChange={(next: SegatoolsConfig) => setConfig(next)}
        activeGame={activeGame}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => { save(config); showToast('Config saved to disk', 'success'); }} disabled={saving}>Save Config</button>
        <button onClick={resetToDefaults}>Reset to Defaults</button>
        <button onClick={() => { reload(); showToast('Reloaded from disk', 'info'); }}>Reload from Disk</button>
      </div>
      {showNewProfileDialog && (
        <PromptDialog
          title="Create New Profile"
          label="Enter a name for the new profile:"
          defaultValue=""
          onConfirm={onConfirmCreateProfile}
          onCancel={() => setShowNewProfileDialog(false)}
        />
      )}
      {showDeleteProfileDialog && (
        <ConfirmDialog
          title="Delete Profile"
          message="Are you sure you want to delete this profile? This action cannot be undone."
          onConfirm={onConfirmDeleteProfile}
          onCancel={() => setShowDeleteProfileDialog(false)}
          isDangerous={true}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default ConfigEditorPage;
