// OfflineLedger — Auth Store (Phase 9)
// PIN + biometric lock state backed by MMKV (synchronous) and Zustand.
import { create } from 'zustand';
import { storage, StorageKeys } from '../utils/storage';

function hashPin(pin: string): string {
  let hash = 0x811c9dc5;
  const salted = `ol_salt_2026_${pin}_ledger_secured`;
  for (let i = 0; i < salted.length; i++) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

interface AuthStore {
  // State
  isLocked: boolean;
  isPinSet: boolean;
  isBiometricEnabled: boolean;
  isPickingMedia: boolean;
  ignoreLockUntil: number;

  // Actions
  initFromStorage: () => void;
  setPickingMedia: (picking: boolean) => void;
  lock: () => void;
  unlock: () => void;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setBiometricEnabled: (enabled: boolean) => void;
  biometricUnlock: () => void;
  clearPin: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // ── Default initial state ─────────────────────────────────────────
  isLocked: true,
  isPinSet: false,
  isBiometricEnabled: false,
  isPickingMedia: false,
  ignoreLockUntil: 0,

  setPickingMedia: (picking: boolean) => {
    set({
      isPickingMedia: picking,
      // When picker closes, set 3-second grace period where lock calls are ignored
      ignoreLockUntil: picking ? Date.now() + 60000 : Date.now() + 3000,
    });
  },

  // ── Load state runtime from MMKV ─────────────────────────────────────────
  initFromStorage: () => {
    try {
      const isPinSet = storage.getBoolean(StorageKeys.PIN_IS_SET) ?? false;
      const isBiometricEnabled = storage.getBoolean(StorageKeys.BIOMETRIC_ENABLED) ?? false;
      set({
        isPinSet,
        isLocked: isPinSet, // Always lock on fresh app launch if PIN is configured
        isBiometricEnabled,
      });
    } catch (e) {
      console.warn('[useAuthStore] initFromStorage error:', e);
    }
  },

  lock: () => {
    const state = get();
    // If user is currently picking media OR inside the post-picker grace period, ignore lock
    if (state.isPickingMedia || Date.now() < state.ignoreLockUntil) return;
    try { storage.set(StorageKeys.IS_LOCKED, true); } catch {}
    set({ isLocked: true });
  },

  unlock: () => {
    try { storage.set(StorageKeys.IS_LOCKED, false); } catch {}
    set({ isLocked: false });
  },

  setPin: async (pin: string) => {
    const hashed = hashPin(pin);
    try {
      storage.set(StorageKeys.PIN_HASH, hashed);
      storage.set(StorageKeys.PIN_IS_SET, true);
      storage.set(StorageKeys.IS_LOCKED, false);
    } catch (e) {
      console.warn('[useAuthStore] Failed to persist PIN:', e);
    }
    set({ isPinSet: true, isLocked: false });
  },

  verifyPin: async (pin: string): Promise<boolean> => {
    try {
      const stored = storage.getString(StorageKeys.PIN_HASH);
      if (!stored) return false;

      return hashPin(pin) === stored;
    } catch (e) {
      console.warn('[useAuthStore] verifyPin error:', e);
      return false;
    }
  },

  setBiometricEnabled: (enabled: boolean) => {
    try {
      storage.set(StorageKeys.BIOMETRIC_ENABLED, enabled);
    } catch (e) {
      console.warn('[useAuthStore] Failed to set biometric enabled:', e);
    }
    set({ isBiometricEnabled: enabled });
  },

  biometricUnlock: () => {
    try { storage.set(StorageKeys.IS_LOCKED, false); } catch {}
    set({ isLocked: false });
  },

  clearPin: () => {
    try {
      storage.delete(StorageKeys.PIN_HASH);
      storage.set(StorageKeys.PIN_IS_SET, false);
      storage.set(StorageKeys.IS_LOCKED, false);
      storage.set(StorageKeys.BIOMETRIC_ENABLED, false);
    } catch {}
    set({ isPinSet: false, isLocked: false, isBiometricEnabled: false });
  },
}));
