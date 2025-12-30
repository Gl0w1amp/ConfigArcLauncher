export interface DecryptResult {
  input: string;
  output?: string | null;
  container_type?: string | null;
  extracted: boolean;
  warnings: string[];
  failed: boolean;
  error?: string | null;
}

export interface DecryptSummary {
  results: DecryptResult[];
  key_source: string;
  key_game_count: number;
}

export interface KeyStatus {
  key_source: string;
  key_game_count: number;
}
