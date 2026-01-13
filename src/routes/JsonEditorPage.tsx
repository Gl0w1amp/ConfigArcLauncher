import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listJsonConfigs, loadJsonConfig, saveJsonConfig } from '../api/jsonConfigApi';
import { CommonConfigEditable, JsonConfigData, JsonConfigFileEntry } from '../types/jsonConfig';
import { useGamesState } from '../state/gamesStore';
import { useToast, ToastContainer } from '../components/common/Toast';
import { formatError } from '../errors';
import './json-editor.css';

type PathKey = string | number;

function setNestedValue(data: JsonConfigData | null, path: PathKey[], value: any): JsonConfigData {
  const root: any = data ? structuredClone(data) : {};
  let cursor: any = root;

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const isLast = i === path.length - 1;

    if (isLast) {
      cursor[key as any] = value;
      continue;
    }

    const nextKey = path[i + 1];
    const existing = cursor[key as any];
    let nextContainer;

    if (existing === undefined || existing === null) {
      nextContainer = typeof nextKey === 'number' ? [] : {};
    } else if (Array.isArray(existing)) {
      nextContainer = [...existing];
    } else if (typeof existing === 'object') {
      nextContainer = { ...existing };
    } else {
      nextContainer = typeof nextKey === 'number' ? [] : {};
    }

    cursor[key as any] = nextContainer;
    cursor = cursor[key as any];
  }

  return root as JsonConfigData;
}

function JsonEditorPage() {
  const { t } = useTranslation();
  const { games, activeGameId } = useGamesState();
  const [files, setFiles] = useState<JsonConfigFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [jsonData, setJsonData] = useState<JsonConfigData | null>(null);
  const [rawText, setRawText] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toasts, showToast } = useToast();

  const activeGame = useMemo(() => games.find((g) => g.id === activeGameId), [games, activeGameId]);
  const isCommon = selectedFile ? selectedFile.toLowerCase().includes('common') : false;

  const refreshFiles = useCallback(async () => {
    if (!activeGameId) {
      setFiles([]);
      setSelectedFile(null);
      setJsonData(null);
      setRawText('');
      return;
    }
    setListLoading(true);
    try {
      const list = await listJsonConfigs();
      setFiles(list);
      setSelectedFile((prev) => {
        if (prev && list.some((f) => f.name === prev)) {
          return prev;
        }
        return list.length > 0 ? list[0].name : null;
      });
      if (list.length === 0) {
        setJsonData(null);
        setRawText('');
      }
      setError(null);
    } catch (err) {
      const message = formatError(t, err);
      setError(message);
      showToast(message, 'error');
    } finally {
      setListLoading(false);
    }
  }, [activeGameId, t, showToast]);

  const loadFile = useCallback(async (name: string) => {
    if (!name || !activeGameId) return;
    setFileLoading(true);
    try {
      const data = await loadJsonConfig(name);
      setJsonData(data);
      setRawText(JSON.stringify(data, null, 2));
      setError(null);
    } catch (err) {
      const message = formatError(t, err);
      setJsonData(null);
      setRawText('');
      setError(message);
      showToast(message, 'error');
    } finally {
      setFileLoading(false);
    }
  }, [activeGameId, t, showToast]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    if (selectedFile) {
      loadFile(selectedFile);
    }
  }, [selectedFile, loadFile]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      if (isCommon) {
        if (!jsonData) throw new Error('No JSON loaded');
        await saveJsonConfig(selectedFile, jsonData);
      } else {
        const parsed = JSON.parse(rawText);
        setJsonData(parsed);
        await saveJsonConfig(selectedFile, parsed);
      }
      showToast(t('json.saved'), 'success');
      setError(null);
    } catch (err: any) {
      const message = formatError(t, err);
      setError(message);
      showToast(t('json.invalidJson', { error: message }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReloadCurrent = () => {
    if (selectedFile) {
      loadFile(selectedFile);
    }
  };

  const updateCommon = (path: PathKey[], value: any) => {
    setJsonData((prev) => setNestedValue(prev, path, value));
  };

  const common = (jsonData || {}) as CommonConfigEditable;
  const firstUnit = common.aime?.unit?.[0] || {};
  const costValue = common.credit?.config?.game_cost?.join(', ') || '';
  const firmwareValue = common.aime?.firmware_path?.join('\n') || '';
  const ignoreBrands = common.emoney?.ignore_brand?.join(', ') || '';

  if (!activeGameId) {
    return (
      <div className="empty-state">
        <h3>{t('json.noActiveGame')}</h3>
        <p>{t('json.activateFirst')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="json-header">
        <div>
          <h2 style={{ margin: '0 0 4px 0' }}>
            {t('json.title')} {activeGame ? <span className="json-header-game">- {activeGame.name}</span> : ''}
          </h2>
          <small>{t('json.subtitle')}</small>
        </div>
        <div className="json-header-actions">
          <button onClick={refreshFiles} disabled={listLoading}>
            {t('json.reloadFiles')}
          </button>
          <button onClick={handleReloadCurrent} disabled={!selectedFile || fileLoading}>
            {t('json.reloadFile')}
          </button>
          <button onClick={handleSave} disabled={!selectedFile || saving || fileLoading}>
            {saving ? t('common.loading') : t('json.save')}
          </button>
        </div>
      </div>

      {error && <p className="json-error">{error}</p>}

      <div className="json-editor-layout">
        <div className="json-editor-sidebar">
          <div className="json-sidebar-title">{t('json.fileList')}</div>
          {listLoading && <div className="json-muted">{t('json.loadingList')}</div>}
          <div className="json-file-list">
            {files.map((file) => (
              <button
                key={file.name}
                className={`json-file-button ${selectedFile === file.name ? 'active' : ''}`}
                onClick={() => setSelectedFile(file.name)}
              >
                <div className="json-file-name">{file.name}</div>
                <div className="json-file-kind">{file.kind}</div>
              </button>
            ))}
            {!listLoading && files.length === 0 && (
              <div className="json-muted">{t('json.noneFound')}</div>
            )}
          </div>
        </div>

        <div className="json-editor-panel">
          {fileLoading && <p className="json-muted">{t('common.loading')}</p>}
          {!fileLoading && !selectedFile && <p className="json-muted">{t('json.noneFound')}</p>}
          {!fileLoading && selectedFile && (
            <>
              {isCommon ? (
                jsonData && (
                  <div className="json-common-form">
                    <div className="json-notice">{t('json.commonNotice')}</div>

                    <div className="json-section">
                      <h4>credit</h4>
                      <div className="json-grid">
                        <label className="json-field">
                          <span>enable</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.credit?.enable)}
                            onChange={(e) => updateCommon(['credit', 'enable'], e.target.checked)}
                          />
                        </label>
                        <label className="json-field">
                          <span>max_credit</span>
                          <input
                            type="number"
                            value={common.credit?.max_credit ?? ''}
                            onChange={(e) => updateCommon(['credit', 'max_credit'], Number(e.target.value))}
                          />
                        </label>
                        <label className="json-field json-field-full">
                          <span>config.game_cost (comma separated)</span>
                          <input
                            type="text"
                            value={costValue}
                            onChange={(e) =>
                              updateCommon(
                                ['credit', 'config', 'game_cost'],
                                e.target.value
                                  .split(',')
                                  .map((v) => Number(v.trim()))
                                  .filter((n) => !Number.isNaN(n))
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="json-section">
                      <h4>allnet_auth</h4>
                      <div className="json-grid">
                        <label className="json-field">
                          <span>enable</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.allnet_auth?.enable)}
                            onChange={(e) => updateCommon(['allnet_auth', 'enable'], e.target.checked)}
                          />
                        </label>
                        <label className="json-field">
                          <span>type</span>
                          <input
                            type="text"
                            value={common.allnet_auth?.type ?? ''}
                            onChange={(e) => updateCommon(['allnet_auth', 'type'], e.target.value)}
                          />
                        </label>
                        <label className="json-field">
                          <span>support_line.broadband</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.allnet_auth?.support_line?.broadband)}
                            onChange={(e) =>
                              updateCommon(['allnet_auth', 'support_line', 'broadband'], e.target.checked)
                            }
                          />
                        </label>
                        <label className="json-field">
                          <span>support_line.mobile</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.allnet_auth?.support_line?.mobile)}
                            onChange={(e) =>
                              updateCommon(['allnet_auth', 'support_line', 'mobile'], e.target.checked)
                            }
                          />
                        </label>
                        <label className="json-field">
                          <span>support_line.xdsl</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.allnet_auth?.support_line?.xdsl)}
                            onChange={(e) =>
                              updateCommon(['allnet_auth', 'support_line', 'xdsl'], e.target.checked)
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="json-section">
                      <h4>allnet_accounting</h4>
                      <div className="json-grid">
                        <label className="json-field">
                          <span>enable</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.allnet_accounting?.enable)}
                            onChange={(e) => updateCommon(['allnet_accounting', 'enable'], e.target.checked)}
                          />
                        </label>
                        <label className="json-field">
                          <span>mode</span>
                          <input
                            type="text"
                            value={common.allnet_accounting?.mode ?? ''}
                            onChange={(e) => updateCommon(['allnet_accounting', 'mode'], e.target.value)}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="json-section">
                      <h4>aime</h4>
                      <div className="json-grid">
                        <label className="json-field">
                          <span>enable</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.aime?.enable)}
                            onChange={(e) => updateCommon(['aime', 'enable'], e.target.checked)}
                          />
                        </label>
                        <label className="json-field">
                          <span>high_baudrate</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.aime?.high_baudrate)}
                            onChange={(e) => updateCommon(['aime', 'high_baudrate'], e.target.checked)}
                          />
                        </label>
                        <label className="json-field">
                          <span>unit[0].port</span>
                          <input
                            type="number"
                            value={firstUnit.port ?? ''}
                            onChange={(e) => updateCommon(['aime', 'unit', 0, 'port'], Number(e.target.value))}
                          />
                        </label>
                        <label className="json-field">
                          <span>unit[0].id</span>
                          <input
                            type="number"
                            value={firstUnit.id ?? ''}
                            onChange={(e) => updateCommon(['aime', 'unit', 0, 'id'], Number(e.target.value))}
                          />
                        </label>
                        <label className="json-field json-field-full">
                          <span>firmware_path (one per line)</span>
                          <textarea
                            value={firmwareValue}
                            onChange={(e) =>
                              updateCommon(
                                ['aime', 'firmware_path'],
                                e.target.value
                                  .split(/\r?\n/)
                                  .map((line) => line.trim())
                                  .filter(Boolean)
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="json-section">
                      <h4>emoney</h4>
                      <div className="json-grid">
                        <label className="json-field">
                          <span>enable</span>
                          <input
                            type="checkbox"
                            checked={Boolean(common.emoney?.enable)}
                            onChange={(e) => updateCommon(['emoney', 'enable'], e.target.checked)}
                          />
                        </label>
                        <label className="json-field">
                          <span>resource_path</span>
                          <input
                            type="text"
                            value={common.emoney?.resource_path ?? ''}
                            onChange={(e) => updateCommon(['emoney', 'resource_path'], e.target.value)}
                          />
                        </label>
                        <label className="json-field">
                          <span>aime_unit</span>
                          <input
                            type="number"
                            value={common.emoney?.aime_unit ?? ''}
                            onChange={(e) => updateCommon(['emoney', 'aime_unit'], Number(e.target.value))}
                          />
                        </label>
                        <label className="json-field">
                          <span>display_port</span>
                          <input
                            type="number"
                            value={common.emoney?.display_port ?? ''}
                            onChange={(e) => updateCommon(['emoney', 'display_port'], Number(e.target.value))}
                          />
                        </label>
                        <label className="json-field">
                          <span>ignore_brand (comma separated)</span>
                          <input
                            type="text"
                            value={ignoreBrands}
                            onChange={(e) =>
                              updateCommon(
                                ['emoney', 'ignore_brand'],
                                e.target.value
                                  .split(',')
                                  .map((v) => v.trim())
                                  .filter(Boolean)
                              )
                            }
                          />
                        </label>
                        <label className="json-field">
                          <span>log.level</span>
                          <input
                            type="number"
                            value={common.emoney?.log?.level ?? ''}
                            onChange={(e) => updateCommon(['emoney', 'log', 'level'], Number(e.target.value))}
                          />
                        </label>
                        <label className="json-field">
                          <span>log.root_path</span>
                          <input
                            type="text"
                            value={common.emoney?.log?.root_path ?? ''}
                            onChange={(e) => updateCommon(['emoney', 'log', 'root_path'], e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="json-raw-editor">
                  <label className="json-field json-field-full">
                    <span>{t('json.rawEditorLabel')}</span>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default JsonEditorPage;
