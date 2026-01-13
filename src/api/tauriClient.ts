import { invoke } from '@tauri-apps/api/core';
import { withErrorSource } from '../errors';

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw withErrorSource(err, cmd);
  }
}
