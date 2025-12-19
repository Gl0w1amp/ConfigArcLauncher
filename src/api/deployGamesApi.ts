import { invokeTauri } from './tauriClient';
import { DecryptSummary, KeyStatus } from '../types/deployGames';

export const pickDecryptFiles = () => invokeTauri<string[]>('pick_decrypt_files_cmd');

export const decryptGameFiles = (files: string[], noExtract: boolean, keyUrl?: string) =>
  invokeTauri<DecryptSummary>('decrypt_game_files_cmd', {
    files,
    no_extract: noExtract,
    key_url: keyUrl,
  });

export const loadDecryptKeys = (keyUrl?: string) =>
  invokeTauri<KeyStatus>('load_fsdecrypt_keys_cmd', {
    key_url: keyUrl,
  });
