import { useEffect, useMemo, useState } from 'react';
import SegatoolsEditor from '../components/config/SegatoolsEditor';
import { useConfigState, useProfilesState } from '../state/configStore';
import { ConfigProfile } from '../types/games';
import { SegatoolsConfig } from '../types/config';
import { useToast, ToastContainer } from '../components/common/Toast';

function ConfigEditorPage() {
  const { config, setConfig, loading, saving, error, activeGameId, reload, save, resetToDefaults } = useConfigState();
  const { profiles, reload: reloadProfiles, saveProfile, deleteProfile, loadProfile } = useProfilesState();
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const { toasts, showToast } = useToast();

  useEffect(() => {
    reloadProfiles();
  }, [reloadProfiles]);

  useEffect(() => {
    if (!selectedProfileId && profiles.length) {
      // Try to find "Original INI" first, otherwise default to first
      const original = profiles.find(p => p.name === "Original INI");
      if (original) {
        setSelectedProfileId(original.id);
      } else {
        setSelectedProfileId(profiles[0].id);
      }
    }
  }, [profiles, selectedProfileId]);

  // Removed redundant useEffect that was causing double-load issues

  const profileOptions = useMemo(() => profiles.map((p) => ({ value: p.id, label: p.name })), [profiles]);

  const handleProfileSave = async () => {
    if (!config) return;
    let profile: ConfigProfile | undefined = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) {
      const name = prompt('Profile name', 'New Profile');
      if (!name) return;
      profile = {
        id: crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`,
        name,
        description: '',
        segatools: config,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } else {
      profile = { ...profile, segatools: config, updated_at: new Date().toISOString() };
    }
    await saveProfile(profile);
    setSelectedProfileId(profile.id);
    reloadProfiles();
    showToast('Profile saved successfully!', 'success');
  };

  const handleProfileDelete = async () => {
    if (!selectedProfileId) return;
    await deleteProfile(selectedProfileId);
    setSelectedProfileId('');
    reloadProfiles();
    reload();
    showToast('Profile deleted', 'info');
  };

  const handleCreateProfile = async () => {
    if (!config) return;
    const name = prompt('New profile name');
    if (!name) return;
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
    reloadProfiles();
    showToast('Profile created', 'success');
  };

  const handleProfileLoad = async (id: string) => {
    setSelectedProfileId(id);
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
          <h2 style={{ margin: '0 0 4px 0' }}>Config Editor</h2>
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
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => { save(config); showToast('Config saved to disk', 'success'); }} disabled={saving}>Save Config</button>
        <button onClick={resetToDefaults}>Reset to Defaults</button>
        <button onClick={() => { reload(); showToast('Reloaded from disk', 'info'); }}>Reload from Disk</button>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default ConfigEditorPage;
