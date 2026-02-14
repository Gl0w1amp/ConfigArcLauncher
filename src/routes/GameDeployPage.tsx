import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import {
  cancelDownloadOrder,
  downloadOrderFiles,
  fetchDownloadOrderInstruction,
  type DownloadOrderDownloadItem,
  type DownloadOrderDownloadResult,
} from '../api/downloadOrderApi';
import { saveGame, setActiveGame } from '../api/gamesApi';
import { saveVhdConfig } from '../api/vhdApi';
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconFile,
  IconGamepad,
  IconLink,
  IconX,
} from '../components/common/Icons';
import { useToast, ToastContainer } from '../components/common/Toast';
import { formatError } from '../errors';
import type { Game } from '../types/games';
import { useOfflineMode } from '../state/offlineMode';
import './SegatoolsDeployPage.css';
import './GameDeployPage.css';

type DownloadProgress = {
  percent: number;
  current_file: number;
  total_files: number;
  filename: string;
  downloaded: number;
  total?: number | null;
};

type VhdPaths = {
  app_base_path: string;
  app_patch_path: string;
  appdata_path: string;
  option_path: string;
};

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

const dirname = (path: string) => {
  const match = path.match(/^(.+)[\\/][^\\/]+$/);
  return match ? match[1] : null;
};

const sanitizeFilename = (value: string) => {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .replace(/\.+$/g, '');
  return cleaned || 'deploy-games';
};

const isVhdUrl = (url: string) => /\.vhdx?(?:$|[?#])/i.test(url.trim());

const extFromUrl = (url: string) => (url.toLowerCase().includes('.vhdx') ? '.vhdx' : '.vhd');

const gameNameFromPath = (path: string) => {
  const name = basename(path).replace(/\.(vhd|vhdx)$/i, '').trim();
  return name || 'Deploy Games';
};

const extractInstallUrls = (text: string) => {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) {
      continue;
    }
    const match = trimmed.match(/^INSTALL\d*\s*=\s*(.+)$/i);
    if (!match) {
      continue;
    }
    const value = match[1].split(';')[0].trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    urls.push(value);
  }

  return urls;
};

const sourceKey = (item: DownloadOrderDownloadResult) =>
  `${item.filename} ${item.url} ${basename(item.path)}`.toLowerCase();

const pickByKeywords = (
  items: DownloadOrderDownloadResult[],
  used: Set<string>,
  keywords: string[],
) => {
  const found = items.find((item) => {
    if (used.has(item.path)) {
      return false;
    }
    const key = sourceKey(item);
    return keywords.some((kw) => key.includes(kw));
  });
  if (found) {
    used.add(found.path);
    return found.path;
  }
  return undefined;
};

const mapVhdPaths = (items: DownloadOrderDownloadResult[]): VhdPaths => {
  if (items.length === 1) {
    const same = items[0].path;
    return {
      app_base_path: same,
      app_patch_path: same,
      appdata_path: same,
      option_path: same,
    };
  }

  const used = new Set<string>();
  const mapped: Partial<VhdPaths> = {
    appdata_path: pickByKeywords(items, used, ['appdata', 'data']),
    option_path: pickByKeywords(items, used, ['option', '/opt', '_opt', '-opt']),
    app_patch_path: pickByKeywords(items, used, ['patch', 'delta', 'update']),
    app_base_path: pickByKeywords(items, used, ['base', 'app', 'os']),
  };

  const remaining = items
    .filter((item) => !used.has(item.path))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  const fallbackOrder: (keyof VhdPaths)[] = [
    'app_base_path',
    'app_patch_path',
    'appdata_path',
    'option_path',
  ];

  let fallbackIndex = 0;
  for (const slot of fallbackOrder) {
    if (mapped[slot]) {
      continue;
    }
    const next = remaining[fallbackIndex] ?? items[0];
    mapped[slot] = next.path;
    fallbackIndex += 1;
  }

  return mapped as VhdPaths;
};

function DeployGamesPage() {
  const { t } = useTranslation();
  const { toasts, showToast } = useToast();
  const offlineModeEnabled = useOfflineMode();

  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [gameName, setGameName] = useState<string>('');
  const [activateAfterDeploy, setActivateAfterDeploy] = useState<boolean>(true);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [resolvedItems, setResolvedItems] = useState<DownloadOrderDownloadItem[]>([]);
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadOrderDownloadResult[]>([]);
  const [createdGame, setCreatedGame] = useState<Game | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<DownloadProgress>('download-order-progress', (event) => {
      setProgress(event.payload);
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

  const blocksRemoteOps = offlineModeEnabled && sourceUrl.trim().length > 0;

  const resolveDownloadItems = async (url: string, prefix: string): Promise<DownloadOrderDownloadItem[]> => {
    const trimmed = url.trim();
    if (!trimmed) {
      return [];
    }

    if (isVhdUrl(trimmed)) {
      return [{
        url: trimmed,
        filename: `${prefix}-1${extFromUrl(trimmed)}`,
      }];
    }

    try {
      const text = await fetchDownloadOrderInstruction(trimmed);
      const installUrls = extractInstallUrls(text);
      const vhdUrls = installUrls.filter((item) => isVhdUrl(item));

      if (vhdUrls.length === 0) {
        throw new Error(t('gameDeploy.noVhdFound'));
      }

      return vhdUrls.map((item, index) => ({
        url: item,
        filename: `${prefix}-${index + 1}${extFromUrl(item)}`,
      }));
    } catch (err) {
      const message = formatError(t, err);
      throw new Error(t('gameDeploy.instructionFetchFailed', { error: message }));
    }
  };

  const handleDeploy = async () => {
    if (blocksRemoteOps) {
      return;
    }

    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) {
      showToast(t('gameDeploy.requiredUrl'), 'error');
      return;
    }

    setDeploying(true);
    setProgress(null);
    setResolvedItems([]);
    setDownloadedFiles([]);
    setCreatedGame(null);
    setLastError(null);

    try {
      const now = Date.now();
      const prefix = sanitizeFilename(gameName.trim() || `deploy-games-${now}`);

      const items = await resolveDownloadItems(trimmedUrl, prefix);
      setResolvedItems(items);

      const downloads = await downloadOrderFiles(items);
      if (downloads.length === 0) {
        throw new Error(t('gameDeploy.noVhdFound'));
      }

      setDownloadedFiles(downloads);

      const mapped = mapVhdPaths(downloads);
      const resolvedGameName = gameName.trim() || gameNameFromPath(mapped.app_base_path);
      const id = `dg-${now}`;
      const game: Game = {
        id,
        name: resolvedGameName,
        executable_path: mapped.app_base_path,
        working_dir: dirname(mapped.app_base_path),
        launch_args: [],
        enabled: true,
        tags: ['deploy-games'],
        launch_mode: 'vhd',
      };

      await saveGame(game);
      await saveVhdConfig(id, {
        ...mapped,
        delta_enabled: true,
      });

      if (activateAfterDeploy) {
        await setActiveGame(id);
      }

      setCreatedGame(game);
      showToast(t('gameDeploy.deployDone', { name: resolvedGameName }), 'success');
    } catch (err) {
      const message = formatError(t, err);
      setLastError(message);
      showToast(t('gameDeploy.deployFailed', { error: message }), 'error');
    } finally {
      setDeploying(false);
    }
  };

  const handleCancelDeploy = async () => {
    if (!deploying) {
      return;
    }
    try {
      await cancelDownloadOrder();
      showToast(t('gameDeploy.deployCanceling'), 'info');
    } catch (err) {
      showToast(formatError(t, err), 'error');
    }
  };

  const statusClass = useMemo(() => {
    if (deploying) {
      return 'update-available';
    }
    if (lastError) {
      return 'missing';
    }
    if (createdGame) {
      return 'trusted';
    }
    return 'untrusted';
  }, [deploying, lastError, createdGame]);

  const statusTitle = useMemo(() => {
    if (deploying) {
      return t('gameDeploy.deploying');
    }
    if (lastError) {
      return t('common.error');
    }
    if (createdGame) {
      return t('gameDeploy.deployDone', { name: createdGame.name });
    }
    return t('gameDeploy.autoHint');
  }, [deploying, lastError, createdGame, t]);

  const statusSubtitle = useMemo(() => {
    if (lastError) {
      return lastError;
    }
    if (createdGame) {
      return t('gameDeploy.resultGameCreated');
    }
    return t('gameDeploy.subtitle');
  }, [createdGame, lastError, t]);

  const progressPercent = Math.min(100, Math.max(0, progress?.percent ?? 0));
  const offlineDisabledTitle = t('settings.offlineMode.enabledHint', {
    defaultValue: 'Offline mode is enabled',
  });

  return (
    <div className="deploy-container deploy-games-container">
      <div className="page-header page-header-lined">
        <div>
          <h2>{t('gameDeploy.title')}</h2>
          <small>{t('gameDeploy.subtitle')}</small>
        </div>
      </div>

      {offlineModeEnabled && (
        <div className="deploy-offline-panel" role="status" aria-live="polite">
          <div className="deploy-offline-center">
            <div className="deploy-offline-icon">
              <IconAlertCircle width={36} height={36} />
            </div>
            <div className="deploy-offline-title">
              {t('settings.offlineMode.enabledHint', { defaultValue: 'Offline mode is enabled' })}
            </div>
            <div className="deploy-offline-desc">
              {t('gameDeploy.offlineHint')}
            </div>
          </div>
        </div>
      )}

      <div className={`status-hero ${statusClass}`}>
        <div className="hero-icon">
          {lastError
            ? <IconX width={64} height={64} strokeWidth={1.5} />
            : createdGame
              ? <IconCheck width={64} height={64} strokeWidth={1.5} />
              : <IconDownload width={64} height={64} strokeWidth={1.5} />}
        </div>
        <div className="hero-content">
          <div className="hero-title">{statusTitle}</div>
          <div className="hero-subtitle">{statusSubtitle}</div>
          <div className="hero-metadata">
            <div className="meta-badge">
              <IconGamepad />
              <span>{t('gameDeploy.urlTitle')}</span>
            </div>
            <div className="meta-badge">
              <IconFile />
              <span>{t('gameDeploy.detectedTitle')}: {resolvedItems.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="file-section">
        <div className="file-section-header">
          <h3><IconLink /> {t('gameDeploy.sourceTitle')}</h3>
        </div>
        <div className="section-card-body deploy-games-form-body">
          <label className="deploy-games-label">
            <span>{t('gameDeploy.sourceUrlLabel')}</span>
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder={t('gameDeploy.sourceUrlPlaceholder')}
            />
          </label>
          <label className="deploy-games-label">
            <span>{t('gameDeploy.gameNameLabel')}</span>
            <input
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder={t('gameDeploy.gameNamePlaceholder')}
            />
          </label>
          <label className="deploy-games-check">
            <input
              type="checkbox"
              checked={activateAfterDeploy}
              onChange={(event) => setActivateAfterDeploy(event.target.checked)}
            />
            <span>{t('gameDeploy.activateAfterDeploy')}</span>
          </label>
          <div className="hint-text">{t('gameDeploy.autoHint')}</div>
        </div>
      </div>

      <div className="action-bar">
        <button
          className={`action-btn btn-lg btn-primary ${blocksRemoteOps ? 'offline-disabled' : ''}`}
          onClick={handleDeploy}
          disabled={deploying || blocksRemoteOps}
          title={blocksRemoteOps ? offlineDisabledTitle : undefined}
        >
          <IconDownload width={18} height={18} />
          {deploying ? t('gameDeploy.deploying') : t('gameDeploy.deploy')}
        </button>
        <button
          className="action-btn btn-lg btn-danger"
          onClick={handleCancelDeploy}
          disabled={!deploying}
        >
          <IconX width={18} height={18} />
          {t('gameDeploy.deployCancel')}
        </button>
      </div>

      {deploying && (
        <div className="file-section">
          <div className="file-section-header">
            <h3>{t('gameDeploy.downloading')}</h3>
            <span className="file-count">{progressPercent.toFixed(0)}%</span>
          </div>
          <div className="section-card-body deploy-games-progress-body">
            <div className="deploy-games-progress-track">
              <div className="deploy-games-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
            {progress && (
              <div className="hint-text">
                {progress.filename} ({progress.current_file}/{progress.total_files})
              </div>
            )}
          </div>
        </div>
      )}

      <div className="file-section">
        <div className="file-section-header">
          <h3><IconFile /> {t('gameDeploy.resultsTitle')}</h3>
          <span className="file-count">{downloadedFiles.length}</span>
        </div>
        <div className="file-list-grid">
          {downloadedFiles.length === 0 && (
            <div className="empty-files">{t('gameDeploy.scanEmpty')}</div>
          )}
          {downloadedFiles.map((item) => (
            <div key={item.path} className="file-card">
              <div className="file-info">
                <span className="file-path">{basename(item.path)}</span>
                <span className="file-hash">{item.path}</span>
              </div>
              <span className="file-status-badge ok">
                <IconCheck />
                {t('gameDeploy.resultDownloaded')}
              </span>
            </div>
          ))}
          {createdGame && (
            <div className="file-card">
              <div className="file-info">
                <span className="file-path">{createdGame.name}</span>
                <span className="file-hash">{createdGame.id}</span>
              </div>
              <span className="file-status-badge ok">
                <IconCheck />
                {t('gameDeploy.resultGameCreated')}
              </span>
            </div>
          )}
        </div>
      </div>

      {createPortal(<ToastContainer toasts={toasts} />, document.body)}
    </div>
  );
}

export default DeployGamesPage;
