import { invokeTauri } from './tauriClient';
import { VhdConfig, VhdDetectResult } from '../types/vhd';

export const pickVhdGame = () => invokeTauri<VhdDetectResult>('pick_vhd_game_cmd');
export const loadVhdConfig = (gameId: string) => invokeTauri<VhdConfig>('load_vhd_config_cmd', { gameId });
export const saveVhdConfig = (gameId: string, config: VhdConfig) =>
  invokeTauri<void>('save_vhd_config_cmd', { gameId, config });
