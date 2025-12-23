import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Game } from '../../types/games';
import { invokeTauri } from '../../api/tauriClient';
import { VhdConfig } from '../../types/vhd';
import { loadVhdConfig, pickVhdGame, saveVhdConfig } from '../../api/vhdApi';

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

  const update = <K extends keyof Game>(key: K, value: Game[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleAutoDetect = async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = draft.launch_mode ?? 'folder';
      if (mode === 'vhd') {
        const detected = await pickVhdGame();
        setDraft(prev => ({
          ...prev,
          name: detected.game.name,
          executable_path: detected.game.executable_path,
          working_dir: detected.game.working_dir,
          launch_args: detected.game.launch_args,
          launch_mode: 'vhd',
        }));
        setVhdConfig(detected.vhd);
      } else {
        const detectedGame = await invokeTauri<Game>('pick_game_folder_cmd');
        setDraft(prev => ({
          ...prev,
          name: detectedGame.name,
          executable_path: detectedGame.executable_path,
          working_dir: detectedGame.working_dir,
          launch_args: detectedGame.launch_args,
          launch_mode: 'folder',
        }));
      }
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
            {loading ? t('games.editor.scanning') : t((draft.launch_mode ?? 'folder') === 'vhd' ? 'games.editor.autoDetectVhd' : 'games.editor.autoDetect')}
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
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.mode')}</div>
          <select
            value={draft.launch_mode ?? 'folder'}
            onChange={(e) => update('launch_mode', e.target.value as Game['launch_mode'])}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }}
          >
            <option value="folder">{t('games.editor.modeFolder')}</option>
            <option value="vhd">{t('games.editor.modeVhd')}</option>
          </select>
        </label>
        {(draft.launch_mode ?? 'folder') === 'vhd' ? (
          <>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.baseVhdPath')}</div>
              <input
                value={vhdConfig?.base_path ?? ''}
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
                onChange={(e) => setVhdConfig(prev => ({
                  base_path: prev?.base_path ?? '',
                  patch_path: prev?.patch_path ?? '',
                  delta_enabled: e.target.checked,
                }))}
                style={{ width: 16, height: 16 }}
              />
              <span>{t('games.editor.deltaEnabled')}</span>
            </label>
          </>
        ) : (
          <>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.execPath')}</div>
          <input 
            value={draft.executable_path} 
            onChange={(e) => update('executable_path', e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
            required 
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.workdirOptional')}</div>
          <input 
            value={draft.working_dir ?? ''} 
            onChange={(e) => update('working_dir', e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>{t('games.editor.launchArgs')}</div>
          <textarea 
            value={draft.launch_args.join(' ')} 
            onChange={(e) => update('launch_args', e.target.value.trim().length ? e.target.value.split(/\s+/) : [])} 
            style={{ width: '100%', height: 80, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} 
          />
        </label>
          </>
        )}
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
