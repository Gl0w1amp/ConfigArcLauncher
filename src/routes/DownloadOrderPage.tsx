import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  downloadOrderFiles,
  fetchDownloadOrderInstruction,
  requestDownloadOrder,
} from '../api/downloadOrderApi';
import { useToast, ToastContainer } from '../components/common/Toast';
import { Modal } from '../components/common/Modal';
import '../components/common/Dialog.css';
import './DownloadOrderPage.css';

type DownloadOrderConfig = Record<string, any>;
type DownloadItem = {
  id: string;
  name: string;
  url: string;
};

const defaultHeaders = '';

function DownloadOrderPage() {
  const { t } = useTranslation();
  const { toasts, showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [url, setUrl] = useState('');
  const [gameId, setGameId] = useState('');
  const [ver, setVer] = useState('');
  const [serial, setSerial] = useState('');
  const [proxy, setProxy] = useState('');
  const [timeoutSecs, setTimeoutSecs] = useState('15');
  const [encodeRequest, setEncodeRequest] = useState(true);
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
      const text = await fetchDownloadOrderInstruction(targetUrl);
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
      showToast(
        t('downloadOrder.autoParseFailed', {
          error: String(err),
          defaultValue: `Failed to fetch instruction file: ${String(err)}`,
        }),
        'error'
      );
    }
  };

  const handleDownloadConfirm = async () => {
    const selectedItems = downloadItems.filter((item) => downloadSelection[item.id]);
    if (!selectedItems.length) return;
    setDownloadBusy(true);
    try {
      const results = await downloadOrderFiles(
        selectedItems.map((item) => ({
          url: item.url,
          filename: item.name,
        }))
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
      showToast(
        t('downloadOrder.downloadError', {
          error: String(err),
          defaultValue: `Download failed: ${String(err)}`,
        }),
        'error'
      );
    } finally {
      setDownloadBusy(false);
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

  const applyConfig = (config: DownloadOrderConfig) => {
    const nextUrl = getValue(config, ['url', 'requestUrl', 'request_url']);
    const nextGameId = getValue(config, ['gameId', 'game_id']);
    const nextVer = getValue(config, ['ver', 'version']);
    const nextSerial = getValue(config, ['serial']);
    const nextProxy = getValue(config, ['proxy', 'proxyUrl', 'proxy_url']);
    const nextTimeout = getValue(config, ['timeoutSecs', 'timeout_secs', 'timeout']);
    const nextEncode = getValue(config, ['encodeRequest', 'encode_request', 'encode']);

    if (typeof nextUrl === 'string') setUrl(nextUrl);
    if (typeof nextGameId === 'string') setGameId(nextGameId);
    if (typeof nextVer === 'string') setVer(nextVer);
    if (typeof nextSerial === 'string') setSerial(nextSerial);
    if (typeof nextProxy === 'string') setProxy(nextProxy);
    if (nextTimeout !== undefined) setTimeoutSecs(String(nextTimeout));
    if (typeof nextEncode === 'boolean') setEncodeRequest(nextEncode);

    normalizeHeaders(config);
  };

  const handleImportConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DownloadOrderConfig;
      applyConfig(parsed);
      showToast(t('downloadOrder.importOk'), 'success');
    } catch (err) {
      showToast(t('downloadOrder.importError', { error: String(err) }), 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      const headers = parseHeaders(headersText);
      const timeoutValue = Number(timeoutSecs);
      const result = await requestDownloadOrder({
        url: url.trim(),
        gameId: gameId.trim(),
        ver: ver.trim(),
        serial: serial.trim(),
        headers,
        proxy: proxy.trim() || undefined,
        timeoutSecs: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : undefined,
        encodeRequest,
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
      showToast(String(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = downloadItems.reduce(
    (count, item) => count + (downloadSelection[item.id] ? 1 : 0),
    0
  );
  const allSelected = downloadItems.length > 0 && selectedCount === downloadItems.length;

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
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                {t('downloadOrder.importConfig')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportConfig}
                hidden
              />
              <button type="button" className="primary" onClick={handleSend} disabled={loading}>
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
                  onChange={(event) => setSerial(event.target.value)}
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
              <div className="download-order-field">
                <label>{t('downloadOrder.optionsLabel')}</label>
                <div className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    id="encodeRequest"
                    checked={encodeRequest}
                    onChange={(e) => setEncodeRequest(e.target.checked)}
                  />
                  <label htmlFor="encodeRequest">{t('downloadOrder.encodeRequest')}</label>
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
          onClose={() => setDownloadDialogOpen(false)}
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
            <div className="dialog-footer">
              <button
                type="button"
                className="dialog-btn dialog-btn-secondary"
                onClick={() => setDownloadDialogOpen(false)}
                disabled={downloadBusy}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                className="dialog-btn dialog-btn-primary"
                onClick={handleDownloadConfirm}
                disabled={downloadBusy || selectedCount === 0}
              >
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
