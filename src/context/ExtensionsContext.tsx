import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EXTENSIONS_ENABLED_STORAGE_KEY } from '../constants/storage';
import { ExtensionDefinition, getAllExtensions, subscribeExtensions } from '../extensions/registry';

type ExtensionsContextValue = {
  extensions: ExtensionDefinition[];
  enabledExtensions: ExtensionDefinition[];
  enabledMap: Record<string, boolean>;
  isEnabled: (id: string) => boolean;
  setEnabled: (id: string, enabled: boolean) => void;
};

const ExtensionsContext = createContext<ExtensionsContextValue | undefined>(undefined);

const loadEnabledMap = (): Record<string, boolean> => {
  const raw = localStorage.getItem(EXTENSIONS_ENABLED_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return {};
  }
  return {};
};

function ExtensionsProvider({ children }: { children: ReactNode }) {
  const [extensions, setExtensions] = useState<ExtensionDefinition[]>(() => getAllExtensions());
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() => loadEnabledMap());

  useEffect(() => {
    return subscribeExtensions(() => {
      setExtensions(getAllExtensions());
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === EXTENSIONS_ENABLED_STORAGE_KEY) {
        setEnabledMap(loadEnabledMap());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isEnabled = useCallback((id: string) => {
    const stored = enabledMap[id];
    if (typeof stored === 'boolean') {
      return stored;
    }
    const ext = extensions.find((item) => item.id === id);
    return ext?.defaultEnabled ?? true;
  }, [enabledMap, extensions]);

  const setEnabled = useCallback((id: string, enabled: boolean) => {
    setEnabledMap((prev) => {
      const next = { ...prev, [id]: enabled };
      localStorage.setItem(EXTENSIONS_ENABLED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const enabledExtensions = useMemo(
    () => extensions.filter((extension) => isEnabled(extension.id)),
    [extensions, isEnabled],
  );

  const value = useMemo(
    () => ({
      extensions,
      enabledExtensions,
      enabledMap,
      isEnabled,
      setEnabled,
    }),
    [enabledExtensions, enabledMap, extensions, isEnabled, setEnabled],
  );

  return (
    <ExtensionsContext.Provider value={value}>
      {children}
    </ExtensionsContext.Provider>
  );
}

const useExtensions = () => {
  const ctx = useContext(ExtensionsContext);
  if (!ctx) {
    throw new Error('useExtensions must be used within ExtensionsProvider');
  }
  return ctx;
};

export { ExtensionsProvider, useExtensions };
