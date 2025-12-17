import { invokeTauri } from './tauriClient';
import { DataPaths, IcfEntry, OptionEntry, ModEntry, ModsStatus, AimeEntry } from '../types/manage';

export const getDataPaths = () => invokeTauri<DataPaths>('get_data_paths_cmd');
export const loadIcf = (kind: string) => invokeTauri<IcfEntry[]>('load_icf_cmd', { kind });
export const saveIcf = (kind: string, entries: IcfEntry[]) => invokeTauri<void>('save_icf_cmd', { kind, entries });
export const listOptionFiles = () => invokeTauri<OptionEntry[]>('list_option_files_cmd');

export const getModsStatus = () => invokeTauri<ModsStatus>('get_mods_status_cmd');
export const addMods = (paths: string[]) => invokeTauri<ModEntry[]>('add_mods_cmd', { paths });
export const deleteMod = (name: string) => invokeTauri<ModEntry[]>('delete_mod_cmd', { name });

export const listAimes = () => invokeTauri<AimeEntry[]>('list_aimes_cmd');
export const saveAime = (name: string, number: string) => invokeTauri<AimeEntry>('save_aime_cmd', { name, number });
export const updateAime = (id: string, name: string, number: string) => invokeTauri<AimeEntry>('update_aime_cmd', { id, name, number });
export const deleteAime = (id: string) => invokeTauri<void>('delete_aime_cmd', { id });
export const applyAimeToActive = (id: string) => invokeTauri<void>('apply_aime_to_active_cmd', { id });
export const getActiveAime = () => invokeTauri<string | null>('get_active_aime_cmd');
