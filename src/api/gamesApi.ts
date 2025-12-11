import { invokeTauri } from './tauriClient';
import { Game } from '../types/games';

export const listGames = () => invokeTauri<Game[]>('list_games_cmd');
export const saveGame = (game: Game) => invokeTauri<void>('save_game_cmd', { game });
export const deleteGame = (id: string) => invokeTauri<void>('delete_game_cmd', { id });
export const launchGame = (id: string, profileId?: string) => invokeTauri<void>('launch_game_cmd', { id, profileId });
export const getActiveGame = () => invokeTauri<string | null>('get_active_game_cmd');
export const setActiveGame = (id: string) => invokeTauri<void>('set_active_game_cmd', { id });
