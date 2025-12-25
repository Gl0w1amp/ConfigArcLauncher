import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Game } from '../../types/games';
import { VhdConfig } from '../../types/vhd';
import { pickAutoGame } from '../../api/gamesApi';
import { loadVhdConfig, saveVhdConfig } from '../../api/vhdApi';

type Props = {
  game: Game;
  onSave: (game: Game) => Promise<void> | void;
  onCancel: () => void;
};

function GameEditorDialog({ game, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Game>(game);
  const [vhdConfig, setVhdConfig] = useState<VhdConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = draft.launch_mode ?? 'folder';
  const isVhd = mode === 'vhd';
  const vhdPanelRef = useRef<HTMLDivElement>(null);
  const folderPanelRef = useRef<HTMLDivElement>(null);
  const [vhdHeight, setVhdHeight] = useState<number | null>(null);
  const [folderHeight, setFolderHeight] = useState<number | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  useEffect(() => setDraft(game), [game]);

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
    draft.launch_args.length,
  ]);

  useLayoutEffect(() => {
    const activeHeight = isVhd ? vhdHeight : folderHeight;
    if (activeHeight !== null) {
      setPanelHeight(activeHeight);
    }
  }, [isVhd, vhdHeight, folderHeight]);

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

  const handleAutoDetect = async () => {
    setLoading(true);
    setError(null);
    try {
      const detected = await pickAutoGame();
      setDraft(prev => ({
        ...prev,
        name: detected.game.name,
        executable_path: detected.game.executable_path,
        working_dir: detected.game.working_dir,
        launch_args: detected.game.launch_args,
        launch_mode: detected.game.launch_mode,
      }));
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, width: 480, border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{game.id ? t('games.editor.editTitle') : t('games.editor.addTitle')}</h3>
          <button 
            type="button" 
            onClick={handleAutoDetect}
            disabled={loading}
            style={{ fontSize: 13, padding: '6px 12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            {loading ? t('games.editor.scanning') : t('games.editor.autoDetect')}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('common.name')}</div>
          <input 
            value={draft.name} 
            onChange={(e) => update('name', e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
            required 
          />
        </label>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.mode')}</div>
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
              onClick={() => update('launch_mode', 'folder')}
              style={{ position: 'relative', zIndex: 1, padding: '8px 12px', border: 'none', borderRadius: 8, background: 'transparent', color: mode === 'folder' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, transition: 'color 0.2s ease' }}
            >
              {t('games.editor.modeFolder')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'vhd'}
              onClick={() => update('launch_mode', 'vhd')}
              style={{ position: 'relative', zIndex: 1, padding: '8px 12px', border: 'none', borderRadius: 8, background: 'transparent', color: mode === 'vhd' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, transition: 'color 0.2s ease' }}
            >
              {t('games.editor.modeVhd')}
            </button>
          </div>
        </div>
        <div
          style={{
            marginBottom: 8,
            position: 'relative',
            height: panelHeight !== null ? `${panelHeight}px` : undefined,
            transition: panelHeight !== null ? 'height 0.25s ease' : 'none',
            overflow: 'hidden',
          }}
        >
          <div ref={vhdPanelRef} aria-hidden={!isVhd} style={panelStyle(isVhd)}>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.baseVhdPath')}</div>
              <input
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
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }}
                required
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.patchVhdPath')}</div>
              <input
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
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }}
                required
              />
            </label>
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
          </div>
          <div ref={folderPanelRef} aria-hidden={isVhd} style={panelStyle(!isVhd)}>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.execPath')}</div>
              <input 
                value={draft.executable_path} 
                disabled={isVhd}
                onChange={(e) => update('executable_path', e.target.value)} 
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
                required 
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.workdirOptional')}</div>
              <input 
                value={draft.working_dir ?? ''} 
                disabled={isVhd}
                onChange={(e) => update('working_dir', e.target.value)} 
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.launchArgs')}</div>
              <textarea 
                value={draft.launch_args.join(' ')} 
                disabled={isVhd}
                onChange={(e) => update('launch_args', e.target.value.trim().length ? e.target.value.split(/\s+/) : [])} 
                style={{ width: '100%', height: 80, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} 
              />
            </label>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
          <span>{t('common.enabled')}</span>
        </label>
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
