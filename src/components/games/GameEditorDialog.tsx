import { useEffect, useState } from 'react';
import { Game } from '../../types/games';
import { invokeTauri } from '../../api/tauriClient';

type Props = {
  game: Game;
  onSave: (game: Game) => void;
  onCancel: () => void;
};

function GameEditorDialog({ game, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Game>(game);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(game), [game]);

  const update = <K extends keyof Game>(key: K, value: Game[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleAutoDetect = async () => {
    setLoading(true);
    setError(null);
    try {
      const detectedGame = await invokeTauri<Game>('pick_game_folder_cmd');
      // Merge detected fields but keep ID if editing existing game?
      // Actually, if it's a new game, ID is empty. If editing, ID is set.
      // The detected game has a random ID.
      // We should probably keep the current ID if it exists.
      setDraft(prev => ({
        ...prev,
        name: detectedGame.name,
        executable_path: detectedGame.executable_path,
        working_dir: detectedGame.working_dir,
        launch_args: detectedGame.launch_args,
        // Keep enabled/tags/id from previous state if needed, or overwrite?
        // Overwriting seems safer for a "reset"
      }));
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, width: 480, border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{game.id ? 'Edit Game' : 'Add Game'}</h3>
          <button 
            type="button" 
            onClick={handleAutoDetect}
            disabled={loading}
            style={{ fontSize: 13, padding: '6px 12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            {loading ? 'Scanning...' : 'Auto-detect from Folder'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Name</div>
          <input 
            value={draft.name} 
            onChange={(e) => update('name', e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
            required 
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Executable Path</div>
          <input 
            value={draft.executable_path} 
            onChange={(e) => update('executable_path', e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
            required 
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Working Directory (optional)</div>
          <input 
            value={draft.working_dir ?? ''} 
            onChange={(e) => update('working_dir', e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', boxSizing: 'border-box' }} 
          />
        </label>
                <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Launch Arguments (space separated)</div>
          <textarea 
            value={draft.launch_args.join(' ')} 
            onChange={(e) => update('launch_args', e.target.value.trim().length ? e.target.value.split(/\s+/) : [])} 
            style={{ width: '100%', height: 80, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} 
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
          <span>Enabled</span>
        </label>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button 
            type="button" 
            onClick={onCancel}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            type="submit"
            style={{ padding: '8px 16px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
          >
            Save Game
          </button>
        </div>
      </form>
    </div>
  );
}

export default GameEditorDialog;
