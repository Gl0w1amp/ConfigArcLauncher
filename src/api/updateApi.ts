import { invokeTauri } from './tauriClient';

export const loadChangelog = () => invokeTauri<string>('load_changelog_cmd');
