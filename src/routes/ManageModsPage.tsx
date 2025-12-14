import { DragEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGamesState } from '../state/gamesStore';
import { ModsStatus } from '../types/manage';
import { addMods, deleteMod, getModsStatus } from '../api/manageApi';
import { useToast, ToastContainer } from '../components/common/Toast';

const formatSize = (size: number) => {
  if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
};

function ManageModsPage() {
  const { t } = useTranslation();
  const { games, activeGameId } = useGamesState();
  const activeGame = useMemo(() => games.find((g) => g.id === activeGameId), [games, activeGameId]);

  const [status, setStatus] = useState<ModsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [dragging, setDragging] = useState<boolean>(false);
  const [manualPath, setManualPath] = useState<string>('');
  const { toasts, showToast } = useToast();

  const loadStatus = async () => {
    if (!activeGameId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const res = await getModsStatus();
      setStatus(res);
    } catch (err) {
      showToast(t('manage.mods.statusError', { error: String(err) }), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [activeGameId]);

  const handleAdd = async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    try {
      const mods = await addMods(paths);
      setStatus((prev) => (prev ? { ...prev, mods } : prev));
      showToast(t('manage.mods.addOk'), 'success');
    } catch (err) {
      showToast(t('manage.mods.addError', { error: String(err) }), 'error');
    }
  };

  const handleManualAdd = async () => {
    const parts = manualPath
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) return;
    await handleAdd(parts);
    setManualPath('');
  };

  const handleDelete = async (name: string) => {
    try {
      const mods = await deleteMod(name);
      setStatus((prev) => (prev ? { ...prev, mods } : prev));
      showToast(t('manage.mods.deleteOk'), 'success');
    } catch (err) {
      showToast(t('manage.mods.deleteError', { error: String(err) }), 'error');
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files
      .map((f: any) => (f.path as string) || '')
      .filter((p) => p.length > 0);
    setDragging(false);
    if (paths.length === 0) return;
    await handleAdd(paths);
  };

  if (loading) {
    return (
      <div className="empty-state">
        <h3>{t('common.loading')}</h3>
      </div>
    );
  }

  if (!activeGameId) {
    return (
      <div className="empty-state">
        <h3>{t('manage.mods.noActiveGame')}</h3>
      </div>
    );
  }

  const unsupported = status && !status.supported;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>{t('manage.mods.title')}{activeGame ? ` · ${activeGame.name}` : ''}</h2>
          <small>{t('manage.mods.subtitle')}</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadStatus}>{t('manage.mods.refresh')}</button>
        </div>
      </div>

      {unsupported && (
        <div className="empty-state" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)' }}>
          <h3>{t('manage.mods.unsupported')}</h3>
          <p style={{ color: 'var(--text-muted)' }}>{status?.message || t('manage.mods.unsupportedGame')}</p>
        </div>
      )}

      {!unsupported && status && (
        <>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>{t('manage.mods.modsDir')}</h3>
                <small>{status.mods_dir || '-'}</small>
              </div>
              <div style={{ color: status.melonloader_installed ? 'var(--success)' : 'var(--warning)' }}>
                {status.melonloader_installed ? t('manage.mods.melonloaderOk') : t('manage.mods.melonloaderMissing')}
              </div>
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              padding: 18,
              borderRadius: 12,
              background: dragging ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
          >
            <div style={{ fontWeight: 600 }}>{t('manage.mods.dropHint')}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>{status.mods_dir}</div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder={t('manage.mods.add')}
                style={{ minWidth: 240 }}
              />
              <button onClick={handleManualAdd}>{t('manage.mods.add')}</button>
              <button onClick={loadStatus}>{t('manage.mods.refresh')}</button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{t('manage.mods.listTitle')}</h3>
              <div style={{ color: 'var(--text-muted)' }}>{status.mods.length}</div>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {status.mods.length === 0 && (
                <div style={{ color: 'var(--text-muted)' }}>{t('manage.mods.empty')}</div>
              )}
              {status.mods.map((mod) => (
                <div key={mod.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{mod.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatSize(mod.size)}</div>
                  </div>
                  <button className="danger" onClick={() => handleDelete(mod.name)}>{t('manage.mods.delete')}</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default ManageModsPage;
