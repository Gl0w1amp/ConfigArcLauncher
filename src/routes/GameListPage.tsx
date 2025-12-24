import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import GameList from '../components/games/GameList';
import GameEditorDialog from '../components/games/GameEditorDialog';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AlertDialog } from '../components/common/AlertDialog';
import { useGamesState } from '../state/gamesStore';
import { useProfilesState } from '../state/configStore';
import { Game } from '../types/games';
import { applyProfileToGame, launchGame } from '../api/gamesApi';

type LaunchProgress = {
  game_id: string;
  stage: string;
};

const emptyGame = (): Game => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `game-${Date.now()}`,
  name: '',
  executable_path: '',
  working_dir: '',
  launch_args: [],
  enabled: true,
  tags: [],
  launch_mode: 'folder',
});

function GameListPage() {
  const { t } = useTranslation();
  const { games, loading, error, activeGameId, reload, saveGame, deleteGame, activateGame } = useGamesState();
  const { profiles, loading: profilesLoading, reload: reloadProfiles } = useProfilesState();
  const [editing, setEditing] = useState<Game | null>(null);
  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [launchProgress, setLaunchProgress] = useState<LaunchProgress | null>(null);


  useEffect(() => {
    if (activeGameId) {
      reloadProfiles();
    }
  }, [activeGameId, reloadProfiles]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<LaunchProgress>('launch-progress', (event) => {
      setLaunchProgress(event.payload);
      if (event.payload.stage === 'started' || event.payload.stage === 'error') {
        setTimeout(() => setLaunchProgress(null), 1500);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const sortedGames = useMemo(() => [...games].sort((a, b) => a.name.localeCompare(b.name)), [games]);

  const handleSave = async (game: Game) => {
    await saveGame(game);
    setEditing(null);
  };

  const handleLaunch = async (gameId: string, profileId?: string) => {
    try {
      await launchGame(gameId, profileId);
    } catch (err) {
      console.error(err);
      setAlertMessage(t('games.launchFailed', { error: err }));
      setLaunchProgress(null);
    }
  };

  const handleApplyProfile = async (gameId: string, profileId: string) => {
    try {
      await applyProfileToGame(gameId, profileId);
    } catch (err) {
      console.error(err);
      setAlertMessage(t('games.launchFailed', { error: err }));
    }
  };

  const handleDeleteRequest = async (id: string) => {
    setGameToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (gameToDelete) {
      await deleteGame(gameToDelete);
      setGameToDelete(null);
    }
  };

  const launchingGame = launchProgress ? games.find(g => g.id === launchProgress.game_id) : undefined;
  const launchMessage = (() => {
    if (!launchProgress) return '';
    switch (launchProgress.stage) {
      case 'mounting':
        return t('games.launchProgress.mounting');
      case 'detecting':
        return t('games.launchProgress.detecting');
      case 'configuring':
        return t('games.launchProgress.configuring');
      case 'launching':
        return t('games.launchProgress.launching');
      case 'started':
        return t('games.launchProgress.started');
      case 'error':
        return t('games.launchProgress.error');
      default:
        return launchProgress.stage;
    }
  })();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0' }}>{t('games.title')}</h2>
          <small>{t('games.subtitle')}</small>
        </div>
        <button onClick={() => setEditing(emptyGame())}>{t('games.add')}</button>
      </div>
      {launchProgress && (
        <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid var(--accent-primary)', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <strong>{t('games.launchProgress.title', { name: launchingGame?.name ?? '' })}</strong>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{launchMessage}</div>
        </div>
      )}
      {loading && <p>{t('common.loading')}</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <GameList
        games={sortedGames}
        profiles={profiles}
        profilesLoading={profilesLoading}
        activeGameId={activeGameId || undefined}
        onEdit={setEditing}
        onDelete={handleDeleteRequest}
        onLaunch={handleLaunch}
        onActivate={activateGame}
        onApplyProfile={handleApplyProfile}
        onRefresh={reload}
      />
      {editing && (
        <GameEditorDialog
          game={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
      {gameToDelete && (
        <ConfirmDialog
          title={t('games.deleteConfirmTitle')}
          message={t('games.deleteConfirmMessage')}
          onConfirm={handleConfirmDelete}
          onCancel={() => setGameToDelete(null)}
          isDangerous={true}
        />
      )}
      {alertMessage && (
        <AlertDialog
          title={t('common.error')}
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      )}
    </div>
  );
}

export default GameListPage;
