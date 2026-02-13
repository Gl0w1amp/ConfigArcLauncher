import { Game } from './games';

export interface VhdConfig {
  app_base_path: string;
  app_patch_path: string;
  appdata_path: string;
  option_path: string;
  delta_enabled: boolean;
}

export interface VhdDetectResult {
  game: Game;
  vhd: VhdConfig;
}

export interface AutoDetectResult {
  game: Game;
  vhd: VhdConfig | null;
}
