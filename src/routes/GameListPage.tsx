import { useMemo, useState } from 'react';
import GameList from '../components/games/GameList';
import GameEditorDialog from '../components/games/GameEditorDialog';
import { useGamesState } from '../state/gamesStore';
import { useProfilesState } from '../state/configStore';
import { Game } from '../types/games';
import { launchGame } from '../api/gamesApi';

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
  const { games, loading, error, activeGameId, reload, saveGame, deleteGame, activateGame } = useGamesState();
  const { profiles } = useProfilesState();
  const [editing, setEditing] = useState<Game | null>(null);

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
      alert(`Failed to launch game: ${err}`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0' }}>Games</h2>
          <small>Manage local executables and launch with selected profile.</small>
        </div>
        <button onClick={() => setEditing(emptyGame())}>Add Game</button>
      </div>
      {loading && <p>Loading games...</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <GameList
        games={sortedGames}
        profiles={profiles}
        activeGameId={activeGameId || undefined}
        onEdit={setEditing}
        onDelete={deleteGame}
        onLaunch={handleLaunch}
        onActivate={activateGame}
        onRefresh={reload}
      />
      {editing && (
        <GameEditorDialog
          game={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default GameListPage;
