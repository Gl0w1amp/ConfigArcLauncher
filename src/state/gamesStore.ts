import { useCallback, useEffect, useState } from 'react';
import { Game } from '../types/games';
import { listGames, saveGame as saveGameApi, deleteGame as deleteGameApi, getActiveGame, setActiveGame } from '../api/gamesApi';

export function useGamesState() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listGames();
      const active = await getActiveGame();
      setGames(list);
      setActiveGameId(active);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const saveGame = useCallback(async (game: Game) => {
    await saveGameApi(game);
    await reload();
  }, [reload]);

  const deleteGame = useCallback(async (id: string) => {
    await deleteGameApi(id);
    await reload();
  }, [reload]);

  const activateGame = useCallback(async (id: string) => {
    await setActiveGame(id);
    await reload();
  }, [reload]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { games, loading, error, activeGameId, reload, saveGame, deleteGame, activateGame };
}
