import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Game } from '../../types/games';
import { VhdConfig } from '../../types/vhd';
import { pickAutoGame } from '../../api/gamesApi';
import { loadVhdConfig, saveVhdConfig } from '../../api/vhdApi';
import './games.css';

type Props = {
  game: Game;
  onSave: (game: Game) => Promise<void> | void;
  onCancel: () => void;
  initialField?: 'execPath' | 'workdir' | 'launchArgs' | 'baseVhdPath' | 'patchVhdPath';
  lockMode?: boolean;
};

type ArgRow = { id: string; param: string; value: string };

const generateId = () => Math.random().toString(36).substr(2, 9);

function parseArgs(args: string[]): ArgRow[] {
  const rows: ArgRow[] = [];
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    const next = args[i + 1];
    if (current.startsWith('-') && next && !next.startsWith('-')) {
      rows.push({ id: generateId(), param: current, value: next });
      i++;
    } else {
      rows.push({ id: generateId(), param: current, value: '' });
    }
  }
  return rows;
}

function flattenArgs(rows: ArgRow[]): string[] {
  const args: string[] = [];
  for (const row of rows) {
    if (row.param) args.push(row.param);
    if (row.value) args.push(row.value);
  }
  return args;
}

function GameEditorDialog({ game, onSave, onCancel, initialField, lockMode }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Game>(game);
  const [vhdConfig, setVhdConfig] = useState<VhdConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = draft.launch_mode ?? 'folder';
  const isVhd = mode === 'vhd';
  const isModeLocked = Boolean(lockMode);
  const isCompact = Boolean(initialField);
  const vhdPanelRef = useRef<HTMLDivElement>(null);
  const folderPanelRef = useRef<HTMLDivElement>(null);
  const baseVhdInputRef = useRef<HTMLInputElement>(null);
  const patchVhdInputRef = useRef<HTMLInputElement>(null);
  const execInputRef = useRef<HTMLInputElement>(null);
  const workdirInputRef = useRef<HTMLInputElement>(null);
  const argsInputRef = useRef<HTMLInputElement>(null);
  const [vhdHeight, setVhdHeight] = useState<number | null>(null);
  const [folderHeight, setFolderHeight] = useState<number | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [argRows, setArgRows] = useState<ArgRow[]>([]);

  useEffect(() => {
    setDraft(game);
    setArgRows(parseArgs(game.launch_args));
  }, [game]);

  useEffect(() => {
    const mode = (game.launch_mode ?? 'folder');
    if (mode !== 'vhd' || !game.id) {
      setVhdConfig(null);
      return;
    }
    loadVhdConfig(game.id)
      .then(setVhdConfig)
      .catch(() => {
        if (game.executable_path) {
          setVhdConfig({
            base_path: game.executable_path,
            patch_path: '',
            delta_enabled: true,
          });
        } else {
          setVhdConfig(null);
        }
      });
  }, [game]);

  useLayoutEffect(() => {
    const vhdPanel = vhdPanelRef.current;
    const folderPanel = folderPanelRef.current;
    if (vhdPanel) {
      setVhdHeight(vhdPanel.scrollHeight);
    }
    if (folderPanel) {
      setFolderHeight(folderPanel.scrollHeight);
    }
  }, [
    isVhd,
    vhdConfig?.base_path,
    vhdConfig?.patch_path,
    vhdConfig?.delta_enabled,
    draft.executable_path,
    draft.working_dir,
    draft.launch_args,
    argRows,
  ]);

  useLayoutEffect(() => {
    const activeHeight = isVhd ? vhdHeight : folderHeight;
    if (activeHeight !== null) {
      setPanelHeight(activeHeight);
    }
  }, [isVhd, vhdHeight, folderHeight]);

  useEffect(() => {
    if (!initialField) {
      return;
    }
    const targets = {
      execPath: execInputRef,
      workdir: workdirInputRef,
      launchArgs: argsInputRef,
      baseVhdPath: baseVhdInputRef,
      patchVhdPath: patchVhdInputRef,
    } as const;
    const target = targets[initialField];
    if (target?.current) {
      target.current.focus();
      target.current.select?.();
    }
  }, [initialField, isVhd]);

  const panelStyle = (active: boolean): React.CSSProperties => {
    return {
      opacity: active ? 1 : 0,
      transform: active ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 0.2s ease, transform 0.25s ease',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      pointerEvents: active ? 'auto' : 'none',
    };
  };

  const update = <K extends keyof Game>(key: K, value: Game[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const showBaseVhdPath = !isCompact || initialField === 'baseVhdPath';
  const showPatchVhdPath = !isCompact || initialField === 'patchVhdPath';
  const showExecPath = !isCompact || initialField === 'execPath';
  const showWorkdir = !isCompact || initialField === 'workdir';
  const showLaunchArgs = !isCompact || initialField === 'launchArgs';

  const handleArgRowChange = (index: number, field: 'param' | 'value', value: string) => {
    const newRows = [...argRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setArgRows(newRows);
    update('launch_args', flattenArgs(newRows));
  };

  const handleAddArgRow = () => {
    const newRows = [...argRows, { id: generateId(), param: '', value: '' }];
    setArgRows(newRows);
    update('launch_args', flattenArgs(newRows));
  };

  const handleRemoveArgRow = (index: number) => {
    const newRows = argRows.filter((_, i) => i !== index);
    setArgRows(newRows);
    update('launch_args', flattenArgs(newRows));
  };

  const handleAutoDetect = async () => {
    setLoading(true);
    setError(null);
    try {
      const detected = await pickAutoGame();
      if (isModeLocked && detected.game.launch_mode !== (draft.launch_mode ?? 'folder')) {
        setError(t('games.editor.modeLocked'));
        return;
      }
      setDraft(prev => ({
        ...prev,
        name: detected.game.name,
        executable_path: detected.game.executable_path,
        working_dir: detected.game.working_dir,
        launch_args: detected.game.launch_args,
        launch_mode: isModeLocked ? prev.launch_mode : detected.game.launch_mode,
      }));
      setArgRows(parseArgs(detected.game.launch_args));
      setVhdConfig(detected.vhd ?? null);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if ((draft.launch_mode ?? 'folder') === 'vhd') {
        if (!vhdConfig || !vhdConfig.base_path || !vhdConfig.patch_path) {
          setError(t('games.editor.vhdMissing'));
          return;
        }
        await saveVhdConfig(draft.id, vhdConfig);
      }
      await onSave(draft);
    } catch (err: any) {
      setError(String(err));
    }
  };

  return (
    <div className="game-editor-overlay">
      <form onSubmit={handleSubmit} className="game-editor-form">
        <div className="game-editor-header">
          <h3 className="game-editor-title">{game.id ? t('games.editor.editTitle') : t('games.editor.addTitle')}</h3>
          {!isCompact && (
            <button 
              type="button" 
              onClick={handleAutoDetect}
              disabled={loading}
              style={{ fontSize: 13, padding: '6px 12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              {loading ? t('games.editor.scanning') : t('games.editor.autoDetect')}
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {!isCompact && (
          <>
            <label className="game-editor-label">
              <div className="game-editor-label-text">{t('common.name')}</div>
              <input 
                value={draft.name} 
                onChange={(e) => update('name', e.target.value)} 
                className="game-editor-input"
                required 
              />
            </label>
            <div style={{ marginBottom: 16 }}>
              <div className="game-editor-label-text">{t('games.editor.mode')}</div>
              <div
                role="radiogroup"
                aria-label={t('games.editor.mode')}
                style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 4, overflow: 'hidden' }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 4,
                    bottom: 4,
                    left: 4,
                    width: 'calc(50% - 4px)',
                    borderRadius: 8,
                    background: 'var(--accent-primary)',
                    transform: isVhd ? 'translateX(100%)' : 'translateX(0%)',
                    transition: 'transform 0.25s ease',
                    pointerEvents: 'none',
                  }}
                />
                <button
                  type="button"
                  aria-pressed={mode === 'folder'}
                  onClick={() => {
                    if (!isModeLocked) {
                      update('launch_mode', 'folder');
                    }
                  }}
                  disabled={isModeLocked}
                  style={{ position: 'relative', zIndex: 1, padding: '8px 12px', border: 'none', borderRadius: 8, background: 'transparent', color: mode === 'folder' ? 'white' : 'var(--text-secondary)', cursor: isModeLocked ? 'not-allowed' : 'pointer', fontWeight: 600, transition: 'color 0.2s ease', opacity: isModeLocked ? 0.6 : 1 }}
                >
                  {t('games.editor.modeFolder')}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'vhd'}
                  onClick={() => {
                    if (!isModeLocked) {
                      update('launch_mode', 'vhd');
                    }
                  }}
                  disabled={isModeLocked}
                  style={{ position: 'relative', zIndex: 1, padding: '8px 12px', border: 'none', borderRadius: 8, background: 'transparent', color: mode === 'vhd' ? 'white' : 'var(--text-secondary)', cursor: isModeLocked ? 'not-allowed' : 'pointer', fontWeight: 600, transition: 'color 0.2s ease', opacity: isModeLocked ? 0.6 : 1 }}
                >
                  {t('games.editor.modeVhd')}
                </button>
              </div>
            </div>
          </>
        )}
        <div
          className="game-editor-panel-wrapper"
          style={{
            height: panelHeight !== null ? `${panelHeight}px` : undefined,
            transition: panelHeight !== null ? 'height 0.25s ease' : 'none',
          }}
        >
          <div ref={vhdPanelRef} aria-hidden={!isVhd} style={panelStyle(isVhd)}>
            {showBaseVhdPath && (
              <label className="game-editor-label">
                <div className="game-editor-label-text">{t('games.editor.baseVhdPath')}</div>
                <input
                  ref={baseVhdInputRef}
                  value={vhdConfig?.base_path ?? ''}
                  disabled={!isVhd}
                  onChange={(e) => {
                    const base_path = e.target.value;
                    setVhdConfig(prev => ({
                      base_path,
                      patch_path: prev?.patch_path ?? '',
                      delta_enabled: prev?.delta_enabled ?? true,
                    }));
                    update('executable_path', base_path);
                  }}
                  className="game-editor-input"
                  required
                />
              </label>
            )}
            {showPatchVhdPath && (
              <label className="game-editor-label">
                <div className="game-editor-label-text">{t('games.editor.patchVhdPath')}</div>
                <input
                  ref={patchVhdInputRef}
                  value={vhdConfig?.patch_path ?? ''}
                  disabled={!isVhd}
                  onChange={(e) => {
                    const patch_path = e.target.value;
                    setVhdConfig(prev => ({
                      base_path: prev?.base_path ?? '',
                      patch_path,
                      delta_enabled: prev?.delta_enabled ?? true,
                    }));
                  }}
                  className="game-editor-input"
                  required
                />
              </label>
            )}
            {!isCompact && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={vhdConfig?.delta_enabled ?? true}
                  disabled={!isVhd}
                  onChange={(e) => setVhdConfig(prev => ({
                    base_path: prev?.base_path ?? '',
                    patch_path: prev?.patch_path ?? '',
                    delta_enabled: e.target.checked,
                  }))}
                  style={{ width: 16, height: 16 }}
                />
                <span>{t('games.editor.deltaEnabled')}</span>
              </label>
            )}
          </div>
          <div ref={folderPanelRef} aria-hidden={isVhd} style={panelStyle(!isVhd)}>
            {showExecPath && (
              <label className="game-editor-label">
                <div className="game-editor-label-text">{t('games.editor.execPath')}</div>
                <input 
                  ref={execInputRef}
                  value={draft.executable_path} 
                  disabled={isVhd}
                  onChange={(e) => update('executable_path', e.target.value)} 
                  className="game-editor-input"
                  required 
                />
              </label>
            )}
            {showWorkdir && (
              <label className="game-editor-label">
                <div className="game-editor-label-text">{t('games.editor.workdirOptional')}</div>
                <input 
                  ref={workdirInputRef}
                  value={draft.working_dir ?? ''} 
                  disabled={isVhd}
                  onChange={(e) => update('working_dir', e.target.value)} 
                  className="game-editor-input"
                />
              </label>
            )}
            {showLaunchArgs && (
              <label className="game-editor-label">
                <div className="game-editor-label-text">{t('games.editor.launchArgs')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '300px', overflowY: 'auto', padding: '4px 2px' }}>
                  {argRows.map((row, index) => (
                    <div key={row.id} style={{ display: 'flex', gap: 8 }}>
                      <input
                        ref={index === 0 ? argsInputRef : undefined}
                        value={row.param}
                        disabled={isVhd}
                        onChange={(e) => handleArgRowChange(index, 'param', e.target.value)}
                        className="game-editor-input monospace"
                        placeholder="Parameter"
                        style={{ flex: 1 }}
                      />
                      <input
                        value={row.value}
                        disabled={isVhd}
                        onChange={(e) => handleArgRowChange(index, 'value', e.target.value)}
                        className="game-editor-input monospace"
                        placeholder="Value"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveArgRow(index)}
                        disabled={isVhd}
                        style={{
                          padding: '0 12px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: 'var(--danger)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 18,
                          lineHeight: 1,
                        }}
                        title={t('games.editor.removeArg')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddArgRow}
                    disabled={isVhd}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      width: '100%',
                      marginTop: 4,
                    }}
                  >
                    + {t('games.editor.addArg')}
                  </button>
                </div>
              </label>
            )}
          </div>
        </div>
        {!isCompact && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
            <span>{t('common.enabled')}</span>
          </label>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button 
            type="button" 
            onClick={onCancel}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
          <button 
            type="submit"
            style={{ padding: '8px 16px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
          >
            {t('games.editor.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default GameEditorDialog;
