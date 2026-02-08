import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchTrustStatus, deploySegatools, rollbackSegatools } from '../api/trustedApi';
import { SegatoolsTrustStatus } from '../types/trusted';
import { useGamesState } from '../state/gamesStore';
import { useToast, ToastContainer } from '../components/common/Toast';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { IconAlertCircle, IconCheck, IconDownload, IconFile, IconGamepad, IconHistory, IconRefresh, IconShield, IconShieldOff, IconTag, IconX } from '../components/common/Icons';
import { formatError } from '../errors';
import { useOfflineMode } from '../state/offlineMode';
import './SegatoolsDeployPage.css';

// Simple cache to prevent loading flicker
let cachedStatus: SegatoolsTrustStatus | null = null;
let cachedGameId: string | null = null;

function SegatoolsDeployPage() {
  const { t } = useTranslation();
  const { games, activeGameId } = useGamesState();
  const offlineModeEnabled = useOfflineMode();
  const [status, setStatus] = useState<SegatoolsTrustStatus | null>(() => {
    return (activeGameId === cachedGameId) ? cachedStatus : null;
  });
  const [loading, setLoading] = useState<boolean>(!status);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [rollbacking, setRollbacking] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const loadRequestRef = useRef(0);
  const { toasts, showToast } = useToast();

  const activeGame = useMemo(() => games.find(g => g.id === activeGameId), [games, activeGameId]);
  const offlineDisabledTitle = t('settings.offlineMode.enabledHint', {
    defaultValue: 'Offline mode is enabled',
  });

  const loadStatus = async () => {
    if (offlineModeEnabled) {
      setLoading(false);
      return;
    }
    const requestId = ++loadRequestRef.current;
    if (!activeGameId) {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
      return;
    }
    if (!status) setLoading(true);
    try {
      const res = await fetchTrustStatus();
      if (requestId !== loadRequestRef.current) return;
      setStatus(res);
      // Update cache
      cachedStatus = res;
      cachedGameId = activeGameId;
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      showToast(t('deploy.statusError', { error: formatError(t, err) }), 'error');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadStatus();
  }, [activeGameId, offlineModeEnabled]);

  const runDeploy = async (force: boolean) => {
    if (offlineModeEnabled) return;
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
      showToast(t('deploy.deployError', { error: formatError(t, err) }), 'error');
    } finally {
      setDeploying(false);
    }
  };

  const onRollback = async () => {
    if (offlineModeEnabled) return;
    setRollbacking(true);
    try {
      const res = await rollbackSegatools();
      if (res.verification) {
        setStatus(res.verification);
      } else if (!offlineModeEnabled) {
        setStatus(await fetchTrustStatus());
      }
      showToast(res.message || t('deploy.rollbackOk'), 'success');
    } catch (err) {
      showToast(t('deploy.rollbackError', { error: formatError(t, err) }), 'error');
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
      <div className="page-header page-header-lined">
        <div>
          <h2>{t('deploy.title')}</h2>
          <small>{t('deploy.subtitle')}</small>
        </div>
        <button
          className={`icon-btn ${offlineModeEnabled ? 'offline-disabled' : ''}`}
          onClick={loadStatus}
          disabled={offlineModeEnabled}
          title={offlineModeEnabled ? offlineDisabledTitle : t('deploy.refresh')}
        >
          <IconRefresh width={20} height={20} />
        </button>
      </div>
      {offlineModeEnabled && (
        <div className="deploy-offline-panel" role="status" aria-live="polite">
          <div className="deploy-offline-center">
            <div className="deploy-offline-icon">
              <IconAlertCircle width={36} height={36} />
            </div>
            <div className="deploy-offline-title">
              {t('settings.offlineMode.enabledHint', {
                defaultValue: 'Offline mode is enabled',
              })}
            </div>
            <div className="deploy-offline-desc">
              {t('settings.offlineMode.desc', {
                defaultValue: 'Disable all networking features, including update checks, remote sync, and online downloads.'
              })}
            </div>
            <span className="deploy-offline-chip">
              {t('settings.offlineMode.title', { defaultValue: 'Offline mode' })}
            </span>
          </div>
          <div className="deploy-offline-divider" />
          <div className="deploy-offline-actions">
            <span className="deploy-offline-action">{t('deploy.refresh')}</span>
            <span className="deploy-offline-action">{t('deploy.deploy')}</span>
            <span className="deploy-offline-action">{t('deploy.rollback')}</span>
          </div>
        </div>
      )}

      {status && (
        <>
          <div className={`status-hero ${getStatusClass()}`}>
            <div className="hero-icon">
              {status.trusted
                ? <IconShield width={64} height={64} strokeWidth={1.5} />
                : (isUpdateAvailable()
                    ? <IconDownload width={64} height={64} strokeWidth={1.5} />
                    : <IconShieldOff width={64} height={64} strokeWidth={1.5} />)}
            </div>
            <div className="hero-content">
              <div className="hero-title">{getStatusTitle()}</div>
              <div className="hero-subtitle">
                {getStatusDescription()}
              </div>
              
              <div className="hero-metadata">
                <div className="meta-badge">
                  <IconGamepad />
                  <span>{t('deploy.currentGame')} <strong>{activeGame ? activeGame.name : ''}</strong></span>
                </div>
                {status.build_id && (
                  <div className="meta-badge">
                    <IconTag />
                    <span>{t('deploy.buildId', { build: status.build_id })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="action-bar">
            <button 
              className={`action-btn btn-lg btn-primary ${offlineModeEnabled ? 'offline-disabled' : ''}`} 
              onClick={() => runDeploy(false)} 
              disabled={deploying || offlineModeEnabled}
              title={offlineModeEnabled ? offlineDisabledTitle : undefined}
            >
              <IconDownload width={18} height={18} />
              {deploying ? t('deploy.deploying') : t('deploy.deploy')}
            </button>
            
            <button 
              className={`action-btn btn-lg btn-danger ${offlineModeEnabled ? 'offline-disabled' : ''}`} 
              onClick={onRollback} 
              disabled={rollbacking || !status?.has_backup || offlineModeEnabled}
              title={offlineModeEnabled ? offlineDisabledTitle : undefined}
            >
              <IconHistory width={18} height={18} />
              {rollbacking ? t('deploy.rollingBack') : t('deploy.rollback')}
            </button>
          </div>

          <div className="file-section">
            <div className="file-section-header">
              <h3><IconFile /> {t('deploy.files')}</h3>
              <span className="file-count">{status.checked_files.length} files</span>
            </div>
            <div className="file-list-grid">
              {status.checked_files.map((f) => (
                <div key={f.path} className="file-card">
                  <div className="file-info">
                    <span className="file-path">{f.path}</span>
                    <span className="file-hash">{f.actual_sha256 ? f.actual_sha256.substring(0, 8) : 'No Hash'}</span>
                  </div>
                  <span className={`file-status-badge ${f.matches ? 'ok' : (f.exists ? 'mismatch' : 'missing')}`}>
                    {f.matches ? <IconCheck /> : (f.exists ? <IconX /> : <IconAlertCircle />)}
                    {f.matches ? 'Verified' : (f.exists ? 'Mismatch' : 'Missing')}
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
