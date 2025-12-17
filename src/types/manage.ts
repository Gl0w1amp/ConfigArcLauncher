export interface PathInfo {
  configured: string;
  resolved: string;
  exists: boolean;
}

export interface DataPaths {
  game_root: string;
  amfs?: PathInfo;
  appdata?: PathInfo;
  option?: PathInfo;
}

export type IcfEntry =
  | {
      type: 'System' | 'App';
      id: string;
      version: string;
      required_system_version: string;
      datetime: string;
      is_prerelease: boolean;
    }
  | {
      type: 'Option';
      app_id: string;
      option_id: string;
      required_system_version: string;
      datetime: string;
      is_prerelease: boolean;
    }
  | {
      type: 'Patch';
      id: string;
      sequence_number: number;
      source_version: string;
      source_datetime: string;
      source_required_system_version: string;
      target_version: string;
      target_datetime: string;
      target_required_system_version: string;
      is_prerelease: boolean;
    };

export interface OptionEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  version?: string | null;
}

export interface ModEntry {
  name: string;
  path: string;
  size: number;
}

export interface ModsStatus {
  supported: boolean;
  game?: string | null;
  melonloader_installed: boolean;
  mods_dir?: string | null;
  mods: ModEntry[];
  message?: string | null;
}

export interface AimeEntry {
  id: string;
  name: string;
  number: string;
}
