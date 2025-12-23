import { SegatoolsConfig } from './config';

export interface Game {
  id: string;
  name: string;
  executable_path: string;
  working_dir?: string | null;
  launch_args: string[];
  enabled: boolean;
  tags: string[];
  launch_mode?: 'folder' | 'vhd';
}

export interface ConfigProfile {
  id: string;
  name: string;
  description?: string | null;
  segatools: SegatoolsConfig;
  created_at: string;
  updated_at: string;
}
