import { NativeModules } from 'react-native';

/** Full process restart. Works in release; DevSettings.reload() does not. */
export function restartApp(): void {
  const native = NativeModules.ScreenLockModule;
  if (typeof native?.restartApp === 'function') {
    native.restartApp();
    return;
  }
  throw new Error('Could not restart the app. Close it fully from Recents, then open it again.');
}
