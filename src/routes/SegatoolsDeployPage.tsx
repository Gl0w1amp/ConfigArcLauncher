import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchTrustStatus, deploySegatools, rollbackSegatools } from '../api/trustedApi';
import { SegatoolsTrustStatus } from '../types/trusted';
import { useGamesState } from '../state/gamesStore';
import { useToast, ToastContainer } from '../components/common/Toast';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import './SegatoolsDeployPage.css';

// Simple SVG Icons
const Icons = {
  Refresh: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Shield: () => <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  ShieldOff: () => <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18"/><path d="M4.73 4.73 4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  UpdateHero: () => <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Download: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  History: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>,
  Alert: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  File: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Gamepad: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>,
  Tag: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>,
};

// Simple cache to prevent loading flicker
let cachedStatus: SegatoolsTrustStatus | null = null;
let cachedGameId: string | null = null;

function SegatoolsDeployPage() {
  const { t } = useTranslation();
  const { games, activeGameId } = useGamesState();
  const [status, setStatus] = useState<SegatoolsTrustStatus | null>(() => {
    return (activeGameId === cachedGameId) ? cachedStatus : null;
  });
  const [loading, setLoading] = useState<boolean>(!status);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [rollbacking, setRollbacking] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const { toasts, showToast } = useToast();

  const activeGame = useMemo(() => games.find(g => g.id === activeGameId), [games, activeGameId]);

  const loadStatus = async () => {
    if (!status) setLoading(true);
    try {
      const res = await fetchTrustStatus();
      setStatus(res);
      // Update cache
      cachedStatus = res;
      cachedGameId = activeGameId;
    } catch (err) {
      showToast(t('deploy.statusError', { error: String(err) }), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [activeGameId]);

  const runDeploy = async (force: boolean) => {
    setDeploying(true);
    try {
      const res = await deploySegatools(force);
      if (res.needs_confirmation) {
        setPendingFiles(res.existing_files || []);
        setConfirming(true);
        return;
      }
      if (res.deployed) {
        setStatus(res.verification || await fetchTrustStatus());
        showToast(res.message || t('deploy.deployOk'), 'success');
      } else {
        showToast(res.message || t('deploy.deployUnknown'), 'warning');
      }
    } catch (err) {
      showToast(t('deploy.deployError', { error: String(err) }), 'error');
    } finally {
      setDeploying(false);
    }
  };

  const onRollback = async () => {
    setRollbacking(true);
    try {
      const res = await rollbackSegatools();
      setStatus(res.verification || await fetchTrustStatus());
      showToast(res.message || t('deploy.rollbackOk'), 'success');
    } catch (err) {
      showToast(t('deploy.rollbackError', { error: String(err) }), 'error');
    } finally {
      setRollbacking(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <h3>{t('deploy.loading')}</h3>
      </div>
    );
  }

  if (!activeGameId) {
    return (
      <div className="empty-state">
        <h3>{t('deploy.noActiveGame')}</h3>
        <p>{t('deploy.activateFirst')}</p>
      </div>
    );
  }

  const isUpdateAvailable = () => {
    if (status?.trusted || status?.missing_files || !status?.build_id || !status?.local_build_time) return false;
    return status.local_build_time < status.build_id;
  };

  const getStatusClass = () => {
    if (status?.trusted) return 'trusted';
    if (status?.missing_files) return 'missing';
    if (isUpdateAvailable()) return 'update-available';
    return 'untrusted';
  };

  const getStatusTitle = () => {
    if (status?.trusted) return t('deploy.trusted');
    if (status?.missing_files) return t('deploy.missing');
    if (isUpdateAvailable()) return t('deploy.updateAvailable');
    return t('deploy.untrusted');
  };

  const getStatusDescription = () => {
    if (status?.trusted) return t('deploy.trustedDesc', 'All segatools files are correctly installed and verified.');
    if (status?.missing_files) return t('deploy.missingDetail');
    if (isUpdateAvailable()) return t('deploy.updateDetail');
    return t('deploy.untrustedDetail');
  };

  return (
    <div className="deploy-container">
      <div className="deploy-header">
        <div>
          <h2>{t('deploy.title')}</h2>
          <small>{t('deploy.subtitle')}</small>
        </div>
        <button className="icon-btn" onClick={loadStatus} title={t('deploy.refresh')}>
          <Icons.Refresh />
        </button>
      </div>

      {status && (
        <>
          <div className={`status-hero ${getStatusClass()}`}>
            <div className="hero-icon">
              {status.trusted ? <Icons.Shield /> : (isUpdateAvailable() ? <Icons.UpdateHero /> : <Icons.ShieldOff />)}
            </div>
            <div className="hero-content">
              <div className="hero-title">{getStatusTitle()}</div>
              <div className="hero-subtitle">
                {getStatusDescription()}
              </div>
              
              <div className="hero-metadata">
                <div className="meta-badge">
                  <Icons.Gamepad />
                  <span>{t('deploy.currentGame')} <strong>{activeGame ? activeGame.name : ''}</strong></span>
                </div>
                {status.build_id && (
                  <div className="meta-badge">
                    <Icons.Tag />
                    <span>{t('deploy.buildId', { build: status.build_id })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="action-bar">
            <button 
              className="action-btn btn-primary" 
              onClick={() => runDeploy(false)} 
              disabled={deploying}
            >
              <Icons.Download />
              {deploying ? t('deploy.deploying') : t('deploy.deploy')}
            </button>
            
            <button 
              className="action-btn btn-danger" 
              onClick={onRollback} 
              disabled={rollbacking || !status?.has_backup}
            >
              <Icons.History />
              {rollbacking ? t('deploy.rollingBack') : t('deploy.rollback')}
            </button>
          </div>

          <div className="file-section">
            <div className="file-section-header">
              <h3><Icons.File /> {t('deploy.files')}</h3>
              <span className="file-count">{status.checked_files.length} files</span>
            </div>
            <div className="file-list-grid">
              {status.checked_files.map((f) => (
                <div key={f.path} className="file-card">
                  <div className="file-info">
                    <span className="file-path">{f.path}</span>
                    <span className="file-hash">{f.actual_sha256 ? f.actual_sha256.substring(0, 8) : 'No Hash'}</span>
                  </div>
                  <span className={`file-status-badge ${f.matches ? 'ok' : 'mismatch'}`}>
                    {f.matches ? <Icons.Check /> : <Icons.X />}
                    {f.matches ? 'Verified' : 'Mismatch'}
                  </span>
                </div>
              ))}
              {status.checked_files.length === 0 && (
                <div className="empty-files">
                  {t('deploy.noHashes')}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title={t('deploy.confirmTitle')}
          message={t('deploy.confirmMessage', { count: pendingFiles.length, files: pendingFiles.slice(0, 5).join(', ') })}
          onConfirm={() => { setConfirming(false); runDeploy(true); }}
          onCancel={() => setConfirming(false)}
          isDangerous={true}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default SegatoolsDeployPage;
