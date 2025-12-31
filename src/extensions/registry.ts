import type React from 'react';
import DeployGamesPage from '../routes/DeployGamesPage';

export type ExtensionCategory = 'utility';

export type ExtensionDefinition = {
  id: string;
  titleKey: string;
  descriptionKey?: string;
  route: string;
  component: React.ComponentType;
  category: ExtensionCategory;
  defaultEnabled: boolean;
  builtIn: boolean;
};

const builtInExtensions: ExtensionDefinition[] = [
  {
    id: 'game-image-decrypter',
    titleKey: 'deployGames.title',
    descriptionKey: 'deployGames.subtitle',
    route: '/extensions/game-image-decrypter',
    component: DeployGamesPage,
    category: 'utility',
    defaultEnabled: true,
    builtIn: true,
  },
];

const externalExtensions: ExtensionDefinition[] = [];
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const hasExtension = (id: string) =>
  builtInExtensions.some((ext) => ext.id === id)
  || externalExtensions.some((ext) => ext.id === id);

export const getAllExtensions = () => [...builtInExtensions, ...externalExtensions];

export const registerExternalExtension = (extension: ExtensionDefinition) => {
  if (hasExtension(extension.id)) {
    return;
  }
  externalExtensions.push({
    ...extension,
    builtIn: false,
  });
  notify();
};

export const subscribeExtensions = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

declare global {
  interface Window {
    ConfigArcExtensions?: {
      register: (extension: ExtensionDefinition) => void;
      list: () => ExtensionDefinition[];
      extensions?: ExtensionDefinition[];
    };
  }
}

if (typeof window !== 'undefined') {
  const existing = window.ConfigArcExtensions;
  if (existing?.extensions?.length) {
    existing.extensions.forEach(registerExternalExtension);
  }
  window.ConfigArcExtensions = {
    register: registerExternalExtension,
    list: getAllExtensions,
    extensions: existing?.extensions,
  };
}
