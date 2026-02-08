import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { decryptGameFiles, loadDecryptKeys, pickDecryptFiles } from '../api/deployGamesApi';
import { DecryptResult, KeyStatus } from '../types/deployGames';
import { useToast, ToastContainer } from '../components/common/Toast';
import { IconCheck, IconFile, IconFolder, IconKey, IconLink, IconPlay, IconTrash, IconX } from '../components/common/Icons';
import { FSDECRYPT_KEY_URL_STORAGE_KEY } from '../constants/storage';
import { formatError } from '../errors';
import { useOfflineMode } from '../state/offlineMode';
import './DeployGamesPage.css';

type DecryptProgress = {
  percent: number;
  processed: number;
  total: number;
  current_file: number;
  total_files: number;
};

function DeployGamesPage() {
  const { t } = useTranslation();
  const { toasts, showToast } = useToast();
  const offlineModeEnabled = useOfflineMode();

  const [files, setFiles] = useState<string[]>([]);
  const [keyUrl, setKeyUrl] = useState<string>(() => localStorage.getItem(FSDECRYPT_KEY_URL_STORAGE_KEY) ?? '');
  const [noExtract, setNoExtract] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<DecryptResult[]>([]);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [checkingKeys, setCheckingKeys] = useState<boolean>(false);
  const [decryptProgress, setDecryptProgress] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(FSDECRYPT_KEY_URL_STORAGE_KEY)?.trim() || undefined;
    if (offlineModeEnabled && stored) {
      return;
    }
    loadDecryptKeys(stored).then(status => {
      setKeyStatus(status);
    }).catch(() => {
      // Ignore errors on auto-check
    });
  }, [offlineModeEnabled]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<DecryptProgress>('decrypt-progress', (event) => {
      setDecryptProgress(event.payload.percent);
    })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<DecryptResult>('decrypt-result', (event) => {
      setResults((prev) => [...prev, event.payload]);
    })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    const trimmed = keyUrl.trim();
    if (trimmed) {
      localStorage.setItem(FSDECRYPT_KEY_URL_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(FSDECRYPT_KEY_URL_STORAGE_KEY);
    }
  }, [keyUrl]);

  const handlePickFiles = async () => {
    try {
      const selected = await pickDecryptFiles();
      setFiles(selected);
    } catch (err) {
      showToast(formatError(t, err), 'error');
    }
  };

  const handleClearFiles = () => {
    setFiles([]);
    setResults([]);
  };

  const handleDecrypt = async () => {
    if (offlineModeEnabled && keyUrl.trim()) {
      return;
    }
    if (files.length === 0) {
      showToast(t('deployGames.noFiles'), 'error');
      return;
    }
    setResults([]);
    setLoading(true);
    setDecryptProgress(0);
    try {
      const res = await decryptGameFiles(files, noExtract, keyUrl.trim() || undefined);
      setResults((prev) => (prev.length > 0 ? prev : res.results));
      setKeyStatus({ key_source: res.key_source, key_game_count: res.key_game_count });
      showToast(t('deployGames.resultOk'), 'success');
    } catch (err) {
      showToast(formatError(t, err), 'error');
    } finally {
      setLoading(false);
      setDecryptProgress(null);
    }
  };

  const handleCheckKeys = async () => {
    if (offlineModeEnabled && keyUrl.trim()) {
      return;
    }
    setCheckingKeys(true);
    try {
      const status = await loadDecryptKeys(keyUrl.trim() || undefined);
      setKeyStatus(status);
      showToast(t('deployGames.keyStatusLoaded'), 'success');
    } catch (err) {
      showToast(formatError(t, err), 'error');
    } finally {
      setCheckingKeys(false);
    }
  };

  const getSourceDisplay = (source: string) => {
    if (source.startsWith('local:')) return t('deployGames.sourceLocal');
    if (source.startsWith('url:')) return t('deployGames.sourceRemote');
    return source;
  };

  const displayProgress = Math.min(100, Math.max(0, decryptProgress ?? 0));
  const blocksRemoteKeyOps = offlineModeEnabled && keyUrl.trim().length > 0;
  const offlineDisabledTitle = t('settings.offlineMode.enabledHint', {
    defaultValue: 'Offline mode is enabled',
  });
  const failedCount = results.reduce((count, result) => (
    count + (result.failed || Boolean(result.error) ? 1 : 0)
  ), 0);
  const successCount = results.length - failedCount;

  return (
    <div className="deploy-games-container">
      <div className="page-header page-header-lined">
        <div>
          <h2>{t('deployGames.title')}</h2>
          <small>{t('deployGames.subtitle')}</small>
        </div>
      </div>

      <div className="deploy-games-grid">
        <div className="deploy-games-card section-card">
          <div className="card-header section-card-header">
            <h3><IconKey width={18} height={18} /> {t('deployGames.keyTitle')}</h3>
            <div className="card-badges">
              {keyStatus ? (
                <>
                  <span className="meta-badge key-loaded">
                    {t('deployGames.keySource')}: {getSourceDisplay(keyStatus.key_source)}
                  </span>
                  <span className="meta-badge key-loaded">
                    {t('deployGames.keyCount', { count: keyStatus.key_game_count })}
                  </span>
                </>
              ) : (
                <span className="meta-badge key-missing">
                  {t('deployGames.keyStatusMissing')}
                </span>
              )}
            </div>
          </div>
          <div className="card-content section-card-body">
            <div className="hint-text">{t('deployGames.keySubtitle')}</div>
            
            <div className="key-input-group">
              <div className="input-wrapper">
                <span className="input-icon"><IconLink /></span>
                <input
                  value={keyUrl}
                  onChange={(e) => setKeyUrl(e.target.value)}
                  placeholder={t('deployGames.keyUrlPlaceholder')}
                />
              </div>
              <button
                className={`action-btn btn-secondary icon-only ${blocksRemoteKeyOps ? 'offline-disabled' : ''}`}
                onClick={handleCheckKeys}
                disabled={checkingKeys || blocksRemoteKeyOps}
                title={blocksRemoteKeyOps ? offlineDisabledTitle : t('deployGames.checkKeys')}
              >
                {checkingKeys ? <span className="spinner-sm" /> : <IconCheck />}
              </button>
            </div>
            {blocksRemoteKeyOps && (
              <div className="hint-text">
                {t('settings.offlineMode.desc', {
                  defaultValue: 'Disable all networking features, including update checks, remote sync, and online downloads.'
                })}
              </div>
            )}
            
            <div className="hint-text">{t('deployGames.keyLocalHint')}</div>
          </div>
        </div>

        <div className="deploy-games-card files-card section-card">
          <div className="card-header section-card-header">
            <h3><IconFile width={18} height={18} /> {t('deployGames.filesTitle')}</h3>
            <span className="file-count">{files.length}</span>
          </div>
          <div className="card-content section-card-body">
            <div className="hint-text">{t('deployGames.filesSubtitle')}</div>
            <div className="file-actions">
              <button className="action-btn btn-secondary" onClick={handlePickFiles}>
                <IconFolder /> {t('deployGames.pickFiles')}
              </button>
              <button className="action-btn btn-danger-ghost" onClick={handleClearFiles} disabled={files.length === 0}>
                <IconTrash /> {t('deployGames.clearFiles')}
              </button>
            </div>
            <div className="file-list">
              {files.length === 0 && (
                <div className="empty-text">{t('deployGames.noFiles')}</div>
              )}
              {files.map((file) => (
                <div key={file} className="file-item" title={file}>
                  {file.split(/[\\/]/).pop()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="deploy-games-actions">
        <button
          className={`action-btn btn-primary decrypt-btn ${loading ? 'is-loading' : ''} ${blocksRemoteKeyOps ? 'offline-disabled' : ''}`}
          onClick={handleDecrypt}
          disabled={loading || blocksRemoteKeyOps}
          title={blocksRemoteKeyOps ? offlineDisabledTitle : undefined}
        >
          {loading ? (
            <>
              <span className="btn-progress-track" aria-hidden="true" />
              <span className="btn-progress-bar" aria-hidden="true" style={{ width: `${displayProgress}%` }} />
              <span className="btn-progress-label">
                {t('deployGames.decrypting')} {displayProgress}%
              </span>
            </>
          ) : (
            <>
              <IconPlay /> {t('deployGames.decrypt')}
            </>
          )}
        </button>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={noExtract}
            onChange={(e) => setNoExtract(e.target.checked)}
          />
          <span>{t('deployGames.noExtract')}</span>
        </label>
      </div>

      <div className="deploy-games-card results-card section-card">
        <div className="card-header section-card-header">
          <h3>{t('deployGames.resultsTitle')}</h3>
          <div className="card-badges">
            <span className="meta-badge success">
              <IconCheck /> {t('deployGames.resultOk')}: {successCount}
            </span>
            <span className="meta-badge error">
              <IconX /> {t('deployGames.resultFailed')}: {failedCount}
            </span>
          </div>
        </div>
        <div className="card-content section-card-body">
          {results.length === 0 && (
            <div className="empty-text">{t('deployGames.resultsEmpty')}</div>
          )}
          <div className="results-list">
            {results.map((result, idx) => {
              const isFailed = result.failed || Boolean(result.error);
              const statusText = isFailed ? t('deployGames.resultFailed') : t('deployGames.resultOk');
              const outputText = result.extracted ? t('deployGames.resultExtracted') : t('deployGames.resultWritten');
              return (
                <div key={`${result.input}-${idx}`} className={`result-row ${isFailed ? 'error' : 'ok'}`}>
                  <div className="result-info">
                    <div className="result-path" title={result.input}>{result.input}</div>
                    {result.output && (
                      <div className="result-output" title={result.output}>→ {result.output}</div>
                    )}
                    {result.error && (
                      <div className="result-error">{result.error}</div>
                    )}
                    <div className="result-meta">
                      {result.container_type && <span className="meta-pill">{result.container_type}</span>}
                      {!isFailed && <span className="meta-pill">{outputText}</span>}
                    </div>
                    {result.warnings.map((warning, idx) => (
                      <div key={`${result.input}-warn-${idx}`} className="result-warning">{warning}</div>
                    ))}
                  </div>
                  <span className={`result-badge ${isFailed ? 'error' : 'ok'}`}>
                    {isFailed ? <IconX /> : <IconCheck />}
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {createPortal(<ToastContainer toasts={toasts} />, document.body)}
    </div>
  );
}

export default DeployGamesPage;
