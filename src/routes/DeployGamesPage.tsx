import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decryptGameFiles, loadDecryptKeys, pickDecryptFiles } from '../api/deployGamesApi';
import { DecryptResult, KeyStatus } from '../types/deployGames';
import { useToast, ToastContainer } from '../components/common/Toast';
import './DeployGamesPage.css';

const Icons = {
  Key: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M12 15.5h9"/><path d="M16 15.5v-3"/><path d="M20 15.5v-3"/></svg>,
  Link: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L9.99 4"/><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 20"/></svg>,
  File: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Folder: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

function DeployGamesPage() {
  const { t } = useTranslation();
  const { toasts, showToast } = useToast();

  const [files, setFiles] = useState<string[]>([]);
  const [keyUrl, setKeyUrl] = useState<string>('');
  const [noExtract, setNoExtract] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<DecryptResult[]>([]);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [checkingKeys, setCheckingKeys] = useState<boolean>(false);

  const handlePickFiles = async () => {
    try {
      const selected = await pickDecryptFiles();
      setFiles(selected);
    } catch (err) {
      showToast(String(err), 'error');
    }
  };

  const handleClearFiles = () => {
    setFiles([]);
    setResults([]);
  };

  const handleDecrypt = async () => {
    if (files.length === 0) {
      showToast(t('deployGames.noFiles'), 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await decryptGameFiles(files, noExtract, keyUrl.trim() || undefined);
      setResults(res.results);
      setKeyStatus({ key_source: res.key_source, key_game_count: res.key_game_count });
      showToast(t('deployGames.resultOk'), 'success');
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckKeys = async () => {
    setCheckingKeys(true);
    try {
      const status = await loadDecryptKeys(keyUrl.trim() || undefined);
      setKeyStatus(status);
      showToast(t('deployGames.keyStatusLoaded'), 'success');
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setCheckingKeys(false);
    }
  };

  return (
    <div className="deploy-games-container">
      <div className="deploy-games-header">
        <div>
          <h2>{t('deployGames.title')}</h2>
          <small>{t('deployGames.subtitle')}</small>
        </div>
      </div>

      <div className="deploy-games-grid">
        <div className="deploy-games-card">
          <div className="card-header">
            <h3><Icons.Key /> {t('deployGames.keyTitle')}</h3>
            <div className="card-badges">
              <span className={`meta-badge ${keyStatus ? 'key-loaded' : 'key-missing'}`}>
                {keyStatus ? t('deployGames.keyStatusLoaded') : t('deployGames.keyStatusMissing')}
              </span>
              {keyStatus?.key_source && (
                <span className="meta-badge">
                  <Icons.Link />
                  {t('deployGames.keySource')}: {keyStatus.key_source}
                </span>
              )}
              {typeof keyStatus?.key_game_count === 'number' && (
                <span className="meta-badge">
                  {t('deployGames.keyCount', { count: keyStatus.key_game_count })}
                </span>
              )}
            </div>
          </div>
          <div className="card-content">
            <div className="hint-text">{t('deployGames.keySubtitle')}</div>
            
            <div className="key-input-group">
              <div className="input-wrapper">
                <span className="input-icon"><Icons.Link /></span>
                <input
                  value={keyUrl}
                  onChange={(e) => setKeyUrl(e.target.value)}
                  placeholder={t('deployGames.keyUrlPlaceholder')}
                />
              </div>
              <button className="action-btn btn-secondary icon-only" onClick={handleCheckKeys} disabled={checkingKeys} title={t('deployGames.checkKeys')}>
                {checkingKeys ? <span className="spinner-sm" /> : <Icons.Check />}
              </button>
            </div>
            
            <div className="hint-text">{t('deployGames.keyLocalHint')}</div>
          </div>
        </div>

        <div className="deploy-games-card">
          <div className="card-header">
            <h3><Icons.File /> {t('deployGames.filesTitle')}</h3>
            <span className="file-count">{files.length}</span>
          </div>
          <div className="card-content">
            <div className="hint-text">{t('deployGames.filesSubtitle')}</div>
            <div className="file-actions">
              <button className="action-btn btn-secondary" onClick={handlePickFiles}>
                <Icons.Folder /> {t('deployGames.pickFiles')}
              </button>
              <button className="action-btn btn-danger-ghost" onClick={handleClearFiles} disabled={files.length === 0}>
                <Icons.Trash /> {t('deployGames.clearFiles')}
              </button>
            </div>
            <div className="file-list">
              {files.length === 0 && (
                <div className="empty-text">{t('deployGames.noFiles')}</div>
              )}
              {files.map((file) => (
                <div key={file} className="file-item" title={file}>{file}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="deploy-games-actions">
        <button className="action-btn btn-primary" onClick={handleDecrypt} disabled={loading}>
          <Icons.Play /> {loading ? t('deployGames.decrypting') : t('deployGames.decrypt')}
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

      <div className="deploy-games-card results-card">
        <div className="card-header">
          <h3>{t('deployGames.resultsTitle')}</h3>
        <div className="card-content">
          {results.length === 0 && (
            <div className="empty-text">{t('deployGames.resultsEmpty')}</div>
          )}
          <div className="results-list">
            {results.map((result, idx) => {
              const statusText = result.error ? t('deployGames.resultFailed') : t('deployGames.resultOk');
              const outputText = result.extracted ? t('deployGames.resultExtracted') : t('deployGames.resultWritten');
              return (
                <div key={`${result.input}-${idx}`} className={`result-row ${result.error ? 'error' : 'ok'}`}>
                  <div className="result-info">
                    <div className="result-path" title={result.input}>{result.input}</div>
                    {result.output && (
                      <div className="result-output" title={result.output}>→ {result.output}</div>
                    )}
                    <div className="result-meta">
                      {result.container_type && <span className="meta-pill">{result.container_type}</span>}
                      {!result.error && <span className="meta-pill">{outputText}</span>}
                    </div>
                    {result.error && (
                      <div className="result-error">{result.error}</div>
                    )}
                    {result.warnings.map((warning, idx) => (
                      <div key={`${result.input}-warn-${idx}`} className="result-warning">{warning}</div>
                    ))}
                  </div>
                  <span className={`result-badge ${result.error ? 'error' : 'ok'}`}>
                    {result.error ? <Icons.X /> : <Icons.Check />}
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div> </div>
            );
          })}
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default DeployGamesPage;
