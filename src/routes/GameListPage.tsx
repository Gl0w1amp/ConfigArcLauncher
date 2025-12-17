import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GameList from '../components/games/GameList';
import GameEditorDialog from '../components/games/GameEditorDialog';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AlertDialog } from '../components/common/AlertDialog';
import { useGamesState } from '../state/gamesStore';
import { useProfilesState } from '../state/configStore';
import { Game } from '../types/games';
import { applyProfileToGame, launchGame } from '../api/gamesApi';

const emptyGame = (): Game => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `game-${Date.now()}`,
  name: '',
  executable_path: '',
  working_dir: '',
  launch_args: [],
  enabled: true,
  tags: []
});

function GameListPage() {
  const { t } = useTranslation();
  const { games, loading, error, activeGameId, reload, saveGame, deleteGame, activateGame } = useGamesState();
  const { profiles, loading: profilesLoading } = useProfilesState();
  const [editing, setEditing] = useState<Game | null>(null);
  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0' }}>{t('games.title')}</h2>
          <small>{t('games.subtitle')}</small>
        </div>
        <button onClick={() => setEditing(emptyGame())}>{t('games.add')}</button>
      </div>
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
