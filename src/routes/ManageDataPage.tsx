import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGamesState } from '../state/gamesStore';
import { DataPaths, IcfEntry, OptionEntry } from '../types/manage';
import { getDataPaths, loadIcf, saveIcf, listOptionFiles } from '../api/manageApi';
import { useToast, ToastContainer } from '../components/common/Toast';
import { formatError } from '../errors';

const RefreshIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;

function ManageDataPage() {
  const { t } = useTranslation();
  const { games, activeGameId } = useGamesState();
  const activeGame = useMemo(() => games.find((g) => g.id === activeGameId), [games, activeGameId]);

  const [paths, setPaths] = useState<DataPaths | null>(null);
  const [pathsLoading, setPathsLoading] = useState<boolean>(false);
  const [icfLoading, setIcfLoading] = useState<boolean>(false);
  const [icf1Raw, setIcf1Raw] = useState<string>('');
  const [icf2Raw, setIcf2Raw] = useState<string>('');
  const [optionFiles, setOptionFiles] = useState<OptionEntry[]>([]);
  const { toasts, showToast } = useToast();

  const loadPaths = async (): Promise<DataPaths | null> => {
    if (!activeGameId) {
      setPaths(null);
      return null;
    }
    setPathsLoading(true);
    try {
      const res = await getDataPaths();
      setPaths(res);
      return res;
    } catch (err) {
      showToast(t('manage.data.pathsError', { error: formatError(t, err) }), 'error');
      return null;
    } finally {
      setPathsLoading(false);
    }
  };

  const loadIcfContent = async (kind: 'ICF1' | 'ICF2') => {
    setIcfLoading(true);
    try {
      const data = await loadIcf(kind);
      const json = JSON.stringify(data, null, 2);
      if (kind === 'ICF1') {
        setIcf1Raw(json);
      } else {
        setIcf2Raw(json);
      }
    } catch (err) {
      showToast(t('manage.data.icfLoadError', { kind, error: formatError(t, err) }), 'error');
    } finally {
      setIcfLoading(false);
    }
  };

  const loadOptions = async (hasOption?: boolean) => {
    const shouldLoad = typeof hasOption === 'boolean' ? hasOption : !!paths?.option;
    if (!shouldLoad) {
      setOptionFiles([]);
      return;
    }
    try {
      const files = await listOptionFiles();
      setOptionFiles(files);
    } catch (err) {
      showToast(t('manage.data.optionLoadError', { error: formatError(t, err) }), 'error');
    }
  };

  const reloadAll = async () => {
    const res = await loadPaths();
    if (!res) return;
    if (res.amfs) {
      await Promise.all([loadIcfContent('ICF1'), loadIcfContent('ICF2')]);
    } else {
      setIcf1Raw('');
      setIcf2Raw('');
    }
    await loadOptions(!!res.option);
  };

  useEffect(() => {
    reloadAll();
  }, [activeGameId]);

  const handleSaveIcf = async (kind: 'ICF1' | 'ICF2', raw: string) => {
    try {
      const parsed = JSON.parse(raw) as IcfEntry[];
      await saveIcf(kind, parsed);
      showToast(t('manage.data.icfSaveOk', { kind }), 'success');
      await loadIcfContent(kind);
    } catch (err) {
      showToast(t('manage.data.icfSaveError', { kind, error: formatError(t, err) }), 'error');
    }
  };

  const renderPathRow = (label: string, info?: { configured: string; resolved: string; exists: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ textAlign: 'right', maxWidth: '65%' }}>
        <div style={{ color: 'var(--text-muted)' }}>{info ? info.resolved : t('manage.data.notConfigured')}</div>
        {info && (
          <div style={{ color: info.exists ? 'var(--success)' : 'var(--danger)' }}>
            {info.exists ? t('manage.data.pathOk') : t('manage.data.missingPath')}
          </div>
        )}
      </div>
    </div>
  );

  if (pathsLoading) {
    return (
      <div className="empty-state">
        <h3>{t('common.loading')}</h3>
      </div>
    );
  }

  if (!activeGameId) {
    return (
      <div className="empty-state">
        <h3>{t('config.noActiveGame')}</h3>
        <p>{t('config.activateFirst')}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="page-header">
        <div>
          <h2>{t('manage.data.title')}{activeGame ? ` · ${activeGame.name}` : ''}</h2>
          <small>{t('manage.data.subtitle')}</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" onClick={reloadAll} title={t('manage.data.reload')}>
            <RefreshIcon />
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t('manage.data.path')}</h3>
        {paths && (
          <>
            {renderPathRow(t('manage.data.amfs'), paths.amfs)}
            {renderPathRow(t('manage.data.option'), paths.option)}
            {renderPathRow(t('manage.data.appdata'), paths.appdata)}
          </>
        )}
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>{t('manage.data.amfs')}</h3>
            <small>{paths?.amfs?.resolved || t('manage.data.notConfigured')}</small>
          </div>
          <div style={{ color: paths?.amfs?.exists ? 'var(--success)' : 'var(--danger)' }}>
            {paths?.amfs?.exists ? t('manage.data.pathOk') : t('manage.data.amfsMissing')}
          </div>
        </div>

        <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>{t('manage.data.rawEditorLabel')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t('manage.data.icf1')}</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => loadIcfContent('ICF1')} disabled={icfLoading}>{t('manage.data.reload')}</button>
                <button onClick={() => handleSaveIcf('ICF1', icf1Raw)} disabled={icfLoading}>{t('manage.data.save')}</button>
              </div>
            </div>
            <textarea
              rows={18}
              value={icf1Raw}
              onChange={(e) => setIcf1Raw(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t('manage.data.icf2')}</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => loadIcfContent('ICF2')} disabled={icfLoading}>{t('manage.data.reload')}</button>
                <button onClick={() => handleSaveIcf('ICF2', icf2Raw)} disabled={icfLoading}>{t('manage.data.save')}</button>
              </div>
            </div>
            <textarea
              rows={18}
              value={icf2Raw}
              onChange={(e) => setIcf2Raw(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>{t('manage.data.option')}</h3>
            <small>{paths?.option?.resolved || t('manage.data.notConfigured')}</small>
          </div>
          <button className="icon-btn" onClick={() => loadOptions()} title={t('manage.data.refresh')}>
            <RefreshIcon />
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {optionFiles.length === 0 && (
            <div style={{ color: 'var(--text-muted)' }}>{t('manage.data.optionEmpty')}</div>
          )}
          {optionFiles.map((file) => (
            <div key={file.path} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {file.name}{file.version ? ` - ${file.version}` : ''}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{file.path}</div>
              </div>
              <div style={{ color: 'var(--text-muted)' }}>{file.is_dir ? 'dir' : `${file.size}b`}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginTop: 0 }}>{t('manage.data.appdata')}</h3>
        <div style={{ color: 'var(--text-muted)' }}>{paths?.appdata?.resolved || t('manage.data.notConfigured')}</div>
        <p style={{ marginTop: 8 }}>{t('manage.data.appdataComing')}</p>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default ManageDataPage;
