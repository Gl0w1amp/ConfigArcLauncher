import { Game } from './games';

export interface VhdConfig {
  base_path: string;
  patch_path: string;
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
