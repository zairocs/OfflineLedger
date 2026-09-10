// OfflineLedger — Theme Store (Zustand + MMKV)
import { create } from 'zustand';
import { storage, StorageKeys } from '../utils/storage';

export type ThemeMode = 'system' | 'dark' | 'light';

interface ThemeStore {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  themeMode: 'dark',

  initTheme: () => {
    try {
      const stored = storage.getString(StorageKeys.THEME_MODE) as ThemeMode | undefined;
      if (stored && ['system', 'dark', 'light'].includes(stored)) {
        set({ themeMode: stored });
      }
    } catch (e) {
      console.warn('[useThemeStore] initTheme error:', e);
    }
  },

  setThemeMode: (mode: ThemeMode) => {
    try {
      storage.set(StorageKeys.THEME_MODE, mode);
    } catch (e) {
      console.warn('[useThemeStore] setThemeMode error:', e);
    }
    set({ themeMode: mode });
  },
}));
