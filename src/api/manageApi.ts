import { invokeTauri } from './tauriClient';
import { DataPaths, IcfEntry, OptionEntry, ModEntry, ModsStatus } from '../types/manage';

export const getDataPaths = () => invokeTauri<DataPaths>('get_data_paths_cmd');
export const loadIcf = (kind: string) => invokeTauri<IcfEntry[]>('load_icf_cmd', { kind });
export const saveIcf = (kind: string, entries: IcfEntry[]) => invokeTauri<void>('save_icf_cmd', { kind, entries });
export const listOptionFiles = () => invokeTauri<OptionEntry[]>('list_option_files_cmd');

export const getModsStatus = () => invokeTauri<ModsStatus>('get_mods_status_cmd');
export const addMods = (paths: string[]) => invokeTauri<ModEntry[]>('add_mods_cmd', { paths });
export const deleteMod = (name: string) => invokeTauri<ModEntry[]>('delete_mod_cmd', { name });
