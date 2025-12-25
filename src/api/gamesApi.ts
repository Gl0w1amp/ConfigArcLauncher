import { invokeTauri } from './tauriClient';
import { Game } from '../types/games';
import { AutoDetectResult } from '../types/vhd';

export const listGames = () => invokeTauri<Game[]>('list_games_cmd');
export const saveGame = (game: Game) => invokeTauri<void>('save_game_cmd', { game });
export const deleteGame = (id: string) => invokeTauri<void>('delete_game_cmd', { id });
export const launchGame = (id: string, profileId?: string) => invokeTauri<void>('launch_game_cmd', { id, profileId });
export const getActiveGame = () => invokeTauri<string | null>('get_active_game_cmd');
export const setActiveGame = (id: string, profileId?: string) => invokeTauri<void>('set_active_game_cmd', { id, profileId });
export const applyProfileToGame = (gameId: string, profileId: string) =>
  invokeTauri<void>('apply_profile_to_game_cmd', { gameId, profileId });
export const pickAutoGame = () => invokeTauri<AutoDetectResult>('pick_game_auto_cmd');
