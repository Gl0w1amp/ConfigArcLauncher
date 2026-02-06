import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import {
  cancelDownloadOrder,
  downloadOrderFiles,
  fetchDownloadOrderInstruction,
  requestDownloadOrder,
} from '../api/downloadOrderApi';
import { useToast, ToastContainer } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import { IconDownload, IconRocket, IconSave } from '../components/common/Icons';
import { formatError } from '../errors';
import '../components/common/Dialog.css';
import './DownloadOrderPage.css';

type DownloadOrderConfig = Record<string, any>;
type DownloadOrderExportConfig = {
  url: string;
  gameId: string;
  ver: string;
  serial: string;
  proxy: string;
  timeoutSecs: string;
  encodeRequest: boolean;
  useSerialHeader: boolean;
  headers: string[];
  autoParse: boolean;
};
type DownloadItem = {
  id: string;
  name: string;
  url: string;
};
type DownloadProgress = {
  percent: number;
  current_file: number;
  total_files: number;
  filename: string;
  downloaded: number;
  total?: number | null;
};

const defaultHeaders = '';
const savedConfigStorageKey = 'downloadOrder:savedConfig';

function DownloadOrderPage() {
  const { t } = useTranslation();
  const { toasts, showToast } = useToast();

  const [url, setUrl] = useState('');
  const [gameId, setGameId] = useState('');
  const [ver, setVer] = useState('');
  const [serial, setSerial] = useState('');
  const [proxy, setProxy] = useState('');
  const [timeoutSecs, setTimeoutSecs] = useState('15');
  const [encodeRequest, setEncodeRequest] = useState(true);
  const [useSerialHeader, setUseSerialHeader] = useState(false);
  const [headersText, setHeadersText] = useState(defaultHeaders);
  const [response, setResponse] = useState('');
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoParse, setAutoParse] = useState(true);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);
  const [downloadSelection, setDownloadSelection] = useState<Record<string, boolean>>({});
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [instructionUrl, setInstructionUrl] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const serialRef = useRef(serial);
  const useSerialHeaderRef = useRef(useSerialHeader);

  useEffect(() => {
    serialRef.current = serial;
  }, [serial]);

  useEffect(() => {
    useSerialHeaderRef.current = useSerialHeader;
  }, [useSerialHeader]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<DownloadProgress>('download-order-progress', (event) => {
      setDownloadProgress(event.payload);
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

  const parseHeaders = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const extractInstructionUrl = (decoded: string) => {
    const trimmed = decoded.trim();
    if (!trimmed) return null;
    try {
      const params = new URLSearchParams(trimmed);
      const uriParam = params.get('uri') ?? params.get('URI');
      if (uriParam) {
        const trimmedUri = uriParam.trim();
        if (!trimmedUri) return null;
        const parts = trimmedUri.split('|').map((part) => part.trim()).filter(Boolean);
        return parts[0] ?? trimmedUri.replace(/^\|+/, '');
      }
    } catch {
      // Fall back to regex parsing below.
    }
    const match = trimmed.match(/(?:^|[&?])uri=([^&]+)/i);
    if (!match) return null;
    const decodedParam = decodeURIComponent(match[1]);
    const parts = decodedParam.split('|').map((part) => part.trim()).filter(Boolean);
    return parts[0] ?? decodedParam.replace(/^\|+/, '');
  };

  const extractDownloadUrls = (text: string) => {
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const match = trimmed.match(/^INSTALL\d*\s*=\s*(.+)$/i);
      if (!match) continue;
      const value = match[1].split(';')[0].trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      urls.push(value);
    }
    return urls;
  };

  const buildDownloadItems = (urls: string[]) =>
    urls.map((url, index) => {
      let name = `download-${index + 1}`;
      try {
        const pathname = new URL(url).pathname;
        const last = pathname.split('/').filter(Boolean).pop();
        if (last) {
          name = decodeURIComponent(last);
        }
      } catch {
        // Use fallback name if URL parsing fails.
      }
      return {
        id: `${index}-${name}`,
        name,
        url,
      };
    });

  const handleAutoParse = async (decoded: string) => {
    const targetUrl = extractInstructionUrl(decoded);
    if (!targetUrl) {
      showToast(
        t('downloadOrder.autoParseNoUri', {
          defaultValue: 'No instruction file URL found in the decoded response.',
        }),
        'warning'
      );
      return;
    }
    setInstructionUrl(targetUrl);
    try {
      const serialHeader = useSerialHeaderRef.current ? serialRef.current.trim() : '';
      const text = await fetchDownloadOrderInstruction(
        targetUrl,
        serialHeader ? serialHeader : undefined,
        proxy.trim() || undefined
      );
      const urls = extractDownloadUrls(text);
      if (!urls.length) {
        showToast(
          t('downloadOrder.downloadListEmpty', {
            defaultValue: 'No download links found in the instruction file.',
          }),
          'info'
        );
        return;
      }
      const items = buildDownloadItems(urls);
      const nextSelection: Record<string, boolean> = {};
      items.forEach((item) => {
        nextSelection[item.id] = true;
      });
      setDownloadItems(items);
      setDownloadSelection(nextSelection);
      setDownloadDialogOpen(true);
    } catch (err) {
      const message = formatError(t, err);
      showToast(
        t('downloadOrder.autoParseFailed', {
          error: message,
          defaultValue: `Failed to fetch instruction file: ${message}`,
        }),
        'error'
      );
    }
  };

  const handleDownloadConfirm = async () => {
    const selectedItems = downloadItems.filter((item) => downloadSelection[item.id]);
    if (!selectedItems.length) return;
    setDownloadBusy(true);
    setDownloadProgress(null);
    try {
      const serialHeader = useSerialHeaderRef.current ? serialRef.current.trim() : '';

      const results = await downloadOrderFiles(
        selectedItems.map((item) => ({
          url: item.url,
          filename: item.name,
        })),
        serialHeader ? serialHeader : undefined,
        proxy.trim() || undefined
      );
      showToast(
        t('downloadOrder.downloadOk', {
          count: results.length,
          defaultValue: `Downloaded ${results.length} file(s).`,
        }),
        'success'
      );
      setDownloadDialogOpen(false);
    } catch (err) {
      const message = formatError(t, err);
      if (message.toLowerCase().includes('cancel')) {
        showToast(
          t('downloadOrder.downloadCancelled', {
            defaultValue: 'Download cancelled.',
          }),
          'info'
        );
      } else {
        showToast(
          t('downloadOrder.downloadError', {
            error: message,
            defaultValue: `Download failed: ${message}`,
          }),
          'error'
        );
      }
    } finally {
      setDownloadBusy(false);
      setDownloadProgress(null);
    }
  };

  const handleCancelDownload = async () => {
    if (!downloadBusy) {
      setDownloadDialogOpen(false);
      return;
    }
    try {
      await cancelDownloadOrder();
      showToast(
        t('downloadOrder.downloadCanceling', {
          defaultValue: 'Cancelling download...',
        }),
        'info'
      );
    } catch (err) {
      const message = formatError(t, err);
      showToast(
        t('downloadOrder.downloadError', {
          error: message,
          defaultValue: `Download failed: ${message}`,
        }),
        'error'
      );
    }
  };
  const getValue = (config: DownloadOrderConfig, keys: string[]) => {
    for (const key of keys) {
      if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
        return config[key];
      }
    }
    return undefined;
  };

  const normalizeHeaders = (config: DownloadOrderConfig) => {
    const headerSource = getValue(config, ['headers', 'httpHeader', 'httpHeaders', 'HTTPHEADER']);
    if (!headerSource) return;
    if (Array.isArray(headerSource)) {
      setHeadersText(headerSource.join('\n'));
      return;
    }
    if (typeof headerSource === 'string') {
      setHeadersText(headerSource);
      return;
    }
    if (typeof headerSource === 'object') {
      const lines = Object.entries(headerSource).map(([key, value]) => `${key}: ${value}`);
      setHeadersText(lines.join('\n'));
    }
  };

  const buildConfigSnapshot = (): DownloadOrderExportConfig => ({
    url: url.trim(),
    gameId: gameId.trim(),
    ver: ver.trim(),
    serial: serial.trim(),
    proxy: proxy.trim(),
    timeoutSecs: timeoutSecs.trim(),
    encodeRequest,
    useSerialHeader,
    headers: parseHeaders(headersText),
    autoParse,
  });

  const handleSaveConfig = () => {
    try {
      window.localStorage.setItem(savedConfigStorageKey, JSON.stringify(buildConfigSnapshot()));
      showToast(
        t('downloadOrder.saveOk', {
          defaultValue: 'Config saved.',
        }),
        'success'
      );
    } catch (err) {
      const message = formatError(t, err);
      showToast(
        t('downloadOrder.saveError', {
          error: message,
          defaultValue: `Failed to save config: ${message}`,
        }),
        'error'
      );
    }
  };

  const applyConfig = (config: DownloadOrderConfig) => {
    const nextUrl = getValue(config, ['url', 'requestUrl', 'request_url']);
    const nextGameId = getValue(config, ['gameId', 'game_id']);
    const nextVer = getValue(config, ['ver', 'version']);
    const nextSerial = getValue(config, ['serial']);
    const nextProxy = getValue(config, ['proxy', 'proxyUrl', 'proxy_url']);
    const nextTimeout = getValue(config, ['timeoutSecs', 'timeout_secs', 'timeout']);
    const nextEncode = getValue(config, ['encodeRequest', 'encode_request', 'encode']);
    const nextUseSerialHeader = getValue(config, ['useSerialHeader', 'use_serial_header']);
    const nextAutoParse = getValue(config, ['autoParse', 'auto_parse']);

    if (typeof nextUrl === 'string') setUrl(nextUrl);
    if (typeof nextGameId === 'string') setGameId(nextGameId);
    if (typeof nextVer === 'string') setVer(nextVer);
    if (typeof nextSerial === 'string') setSerial(nextSerial);
    if (typeof nextProxy === 'string') setProxy(nextProxy);
    if (nextTimeout !== undefined) setTimeoutSecs(String(nextTimeout));
    if (typeof nextEncode === 'boolean') setEncodeRequest(nextEncode);
    if (typeof nextUseSerialHeader === 'boolean') {
      setUseSerialHeader(nextUseSerialHeader);
      useSerialHeaderRef.current = nextUseSerialHeader;
    }
    if (typeof nextAutoParse === 'boolean') setAutoParse(nextAutoParse);

    normalizeHeaders(config);
  };

  useEffect(() => {
    try {
      const savedRaw = window.localStorage.getItem(savedConfigStorageKey);
      if (!savedRaw) return;
      const parsed = JSON.parse(savedRaw) as DownloadOrderConfig;
      if (parsed && typeof parsed === 'object') {
        applyConfig(parsed);
      }
    } catch {
      // Ignore invalid saved snapshots.
    }
  }, []);

  const handleSend = async () => {
    setLoading(true);
    try {
      const snapshot = buildConfigSnapshot();
      const timeoutValue = Number(snapshot.timeoutSecs);
      const result = await requestDownloadOrder({
        url: snapshot.url,
        gameId: snapshot.gameId,
        ver: snapshot.ver,
        serial: snapshot.serial,
        headers: snapshot.headers,
        proxy: snapshot.proxy || undefined,
        timeoutSecs: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : undefined,
        encodeRequest: snapshot.encodeRequest,
      });
      const lengthText = result.content_length ? ` · ${result.content_length}b` : '';
      const statusText = result.status_text ? ` ${result.status_text}` : '';
      setStatusSummary(`${result.status_code}${statusText}${lengthText}`);
      setResponse(result.decoded || '');
      setDecodeError(result.decode_error ?? null);
      if (!result.decoded && result.raw) {
        showToast(t('downloadOrder.decodedEmpty'), 'warning');
      }
      if (autoParse && result.decoded) {
        void handleAutoParse(result.decoded);
      }
      if (result.decode_error) {
        showToast(t('downloadOrder.decodeError', { error: result.decode_error }), 'error');
      }
      showToast(t('downloadOrder.requestOk'), 'success');
    } catch (err) {
      showToast(formatError(t, err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = downloadItems.reduce(
    (count, item) => count + (downloadSelection[item.id] ? 1 : 0),
    0
  );
  const allSelected = downloadItems.length > 0 && selectedCount === downloadItems.length;
  const progressPercent = Math.min(100, Math.max(0, downloadProgress?.percent ?? 0));
  const formatBytes = (value?: number | null) => {
    if (value === undefined || value === null) return '';
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <div className="download-order-container">
      <div className="download-order-header">
        <div>
          <h2>{t('downloadOrder.title')}</h2>
          <small>{t('downloadOrder.subtitle')}</small>
        </div>
      </div>

      <div className="download-order-grid">
        <div className="download-order-card">
          <div className="download-order-card-header">
            <h3>{t('downloadOrder.requestTitle')}</h3>
            <div className="download-order-actions">
              <button
                type="button"
                className="download-order-icon-action"
                onClick={handleSaveConfig}
              >
                <IconSave />
                {t('common.save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                className="primary download-order-icon-action"
                onClick={handleSend}
                disabled={loading}
              >
                <IconRocket />
                {loading ? t('downloadOrder.requesting') : t('downloadOrder.request')}
              </button>
            </div>
          </div>
          <div className="download-order-card-body">
            <div className="download-order-field">
              <label>{t('downloadOrder.urlLabel')}</label>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="http://..."
              />
            </div>
            <div className="download-order-row">
              <div className="download-order-field">
                <label>{t('downloadOrder.gameIdLabel')}</label>
                <input
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                  placeholder="SXXX"
                />
              </div>
              <div className="download-order-field">
                <label>{t('downloadOrder.verLabel')}</label>
                <input
                  value={ver}
                  onChange={(event) => setVer(event.target.value)}
                  placeholder="1.00"
                />
              </div>
              <div className="download-order-field">
                <label>{t('downloadOrder.serialLabel')}</label>
                <input
                  value={serial}
                  onChange={(event) => {
                    const nextSerial = event.target.value;
                    setSerial(nextSerial);
                    serialRef.current = nextSerial;
                  }}
                  placeholder="AXXXXXXXXXX"
                />
              </div>
            </div>
            <div className="download-order-row">
              <div className="download-order-field">
                <label>{t('downloadOrder.proxyLabel')}</label>
                <input
                  value={proxy}
                  onChange={(event) => setProxy(event.target.value)}
                  placeholder="socks5h://127.0.0.1:1080"
                />
              </div>
              <div className="download-order-field">
                <label>{t('downloadOrder.timeoutLabel')}</label>
                <input
                  value={timeoutSecs}
                  onChange={(event) => setTimeoutSecs(event.target.value)}
                  placeholder="15"
                />
              </div>
            </div>
            <div className="download-order-field">
              <label>{t('downloadOrder.optionsLabel')}</label>
              <div className="download-order-options">
                <div className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    id="encodeRequest"
                    checked={encodeRequest}
                    onChange={(e) => setEncodeRequest(e.target.checked)}
                  />
                  <label htmlFor="encodeRequest">{t('downloadOrder.encodeRequest')}</label>
                </div>
                <div className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    id="useSerialHeader"
                    checked={useSerialHeader}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseSerialHeader(checked);
                      useSerialHeaderRef.current = checked;
                    }}
                  />
                  <label htmlFor="useSerialHeader">
                    {t('downloadOrder.useSerialHeader', {
                      defaultValue: 'Add User-Agent when fetching instruction',
                    })}
                  </label>
                </div>
              </div>
            </div>
            <div className="download-order-field">
              <label>{t('downloadOrder.headersLabel')}</label>
              <textarea
                rows={4}
                value={headersText}
                onChange={(event) => setHeadersText(event.target.value)}
                placeholder="Pragma: DFI"
              />
              <span className="download-order-hint">{t('downloadOrder.headersHint')}</span>
            </div>
          </div>
        </div>

        <div className="download-order-card">
          <div className="download-order-card-header">
            <h3>{t('downloadOrder.responseTitle')}</h3>
            <div className="download-order-actions">
              <label className="download-order-auto-toggle">
                <input
                  type="checkbox"
                  checked={autoParse}
                  onChange={(event) => setAutoParse(event.target.checked)}
                />
                <span className="download-order-auto-slider" />
                <span className="download-order-auto-label">
                  {t('downloadOrder.autoParseLabel', { defaultValue: 'Auto parse' })}
                </span>
              </label>
            </div>
          </div>
          <div className="download-order-card-body">
            <textarea
              className="download-order-response"
              value={response}
              readOnly
              placeholder={t('downloadOrder.responseEmpty')}
            />
            {statusSummary && (
              <span className="download-order-hint">
                {t('downloadOrder.statusLabel')}: {statusSummary}
              </span>
            )}
            {decodeError && (
              <span className="download-order-hint">
                {t('downloadOrder.decodeError', { error: decodeError })}
              </span>
            )}
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} />
      {downloadDialogOpen && (
        <Modal
          title={t('downloadOrder.downloadDialogTitle', { defaultValue: 'Select downloads' })}
          onClose={handleCancelDownload}
          width={640}
        >
          <div className="download-order-dialog">
            {instructionUrl && (
              <div className="download-order-dialog-source">
                <span className="download-order-dialog-label">
                  {t('downloadOrder.downloadDialogSource', { defaultValue: 'Instruction file' })}
                </span>
                <span className="download-order-dialog-url">{instructionUrl}</span>
              </div>
            )}
            <div className="download-order-dialog-controls">
              <label className="download-order-dialog-select">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={downloadBusy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    const nextSelection: Record<string, boolean> = {};
                    downloadItems.forEach((item) => {
                      nextSelection[item.id] = checked;
                    });
                    setDownloadSelection(nextSelection);
                  }}
                />
                <span>
                  {t('downloadOrder.downloadSelectAll', { defaultValue: 'Select all' })}
                </span>
              </label>
              <span className="download-order-dialog-count">
                {selectedCount}/{downloadItems.length}
              </span>
            </div>
            <div className="download-order-dialog-list">
              {downloadItems.map((item) => (
                <label key={item.id} className="download-order-dialog-item">
                  <input
                    type="checkbox"
                    checked={Boolean(downloadSelection[item.id])}
                    disabled={downloadBusy}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setDownloadSelection((prev) => ({
                        ...prev,
                        [item.id]: checked,
                      }));
                    }}
                  />
                  <div>
                    <div className="download-order-dialog-name">{item.name}</div>
                    <div className="download-order-dialog-url">{item.url}</div>
                  </div>
                </label>
              ))}
            </div>
            {downloadProgress && (
              <div className="download-order-progress">
                <div className="download-order-progress-header">
                  <span>
                    {t('downloadOrder.downloading', { defaultValue: 'Downloading' })}
                  </span>
                  <span>{progressPercent.toFixed(0)}%</span>
                </div>
                <div className="download-order-progress-track">
                  <div
                    className="download-order-progress-bar"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="download-order-progress-meta">
                  <span>{downloadProgress.filename}</span>
                  <span>
                    {downloadProgress.current_file}/{downloadProgress.total_files}
                    {downloadProgress.total
                      ? ` · ${formatBytes(downloadProgress.downloaded)} / ${formatBytes(
                          downloadProgress.total
                        )}`
                      : ''}
                  </span>
                </div>
              </div>
            )}
            <div className="dialog-footer">
              <button
                type="button"
                className="dialog-btn dialog-btn-secondary"
                onClick={handleCancelDownload}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                className="dialog-btn dialog-btn-primary"
                onClick={handleDownloadConfirm}
                disabled={downloadBusy || selectedCount === 0}
              >
                <IconDownload />
                {downloadBusy
                  ? t('downloadOrder.downloading', { defaultValue: 'Downloading...' })
                  : t('downloadOrder.downloadSelected', { defaultValue: 'Download selected' })}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default DownloadOrderPage;
