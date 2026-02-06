import { useCallback, useEffect, useState } from 'react';
import { Game } from '../types/games';
import { listGames, saveGame as saveGameApi, deleteGame as deleteGameApi, getActiveGame, setActiveGame } from '../api/gamesApi';
import { AppError, normalizeError } from '../errors';

export function useGamesState() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<AppError | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const reload = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const list = await listGames();
      const active = await getActiveGame();
      setGames(list);
      setActiveGameId(active);
      setError(null);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      if (!silent) setLoading(false);
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

  const activateGame = useCallback(async (id: string, profileId?: string) => {
    await setActiveGame(id, profileId);
    await reload(true);
  }, [reload]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { games, loading, error, activeGameId, reload, saveGame, deleteGame, activateGame };
}
