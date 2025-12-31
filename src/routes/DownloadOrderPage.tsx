import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { requestDownloadOrder } from '../api/downloadOrderApi';
import { useToast, ToastContainer } from '../components/common/Toast';
import './DownloadOrderPage.css';

type DownloadOrderConfig = Record<string, any>;

const defaultHeaders = ['Pragma: DFI', 'User-Agent: ALL.Net'].join('\n');

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
  const [rawResponse, setRawResponse] = useState('');
  const [responseMode, setResponseMode] = useState<'decoded' | 'raw'>('decoded');
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const parseHeaders = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

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
      setRawResponse(result.raw || '');
      setDecodeError(result.decode_error ?? null);
      if (!result.decoded && result.raw) {
        setResponseMode('raw');
        showToast(t('downloadOrder.decodedEmpty'), 'warning');
      } else {
        setResponseMode('decoded');
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

  const handleCopy = async () => {
    try {
      const text = responseMode === 'decoded' ? response : rawResponse;
      await navigator.clipboard.writeText(text);
      showToast(t('downloadOrder.copyOk'), 'success');
    } catch (err) {
      showToast(t('downloadOrder.copyError', { error: String(err) }), 'error');
    }
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
              <div
                className="download-order-toggle"
                data-mode={responseMode}
                aria-label={t('downloadOrder.responseTitle')}
              >
                <span className="download-order-toggle-indicator" aria-hidden="true" />
                <button
                  type="button"
                  className={responseMode === 'decoded' ? 'active' : ''}
                  onClick={() => setResponseMode('decoded')}
                  aria-pressed={responseMode === 'decoded'}
                >
                  {t('downloadOrder.decoded')}
                </button>
                <button
                  type="button"
                  className={responseMode === 'raw' ? 'active' : ''}
                  onClick={() => setResponseMode('raw')}
                  aria-pressed={responseMode === 'raw'}
                >
                  {t('downloadOrder.raw')}
                </button>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={responseMode === 'decoded' ? !response : !rawResponse}
              >
                {t('downloadOrder.copy')}
              </button>
            </div>
          </div>
          <div className="download-order-card-body">
            <textarea
              className="download-order-response"
              value={responseMode === 'decoded' ? response : rawResponse}
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
    </div>
  );
}

export default DownloadOrderPage;
