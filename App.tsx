/**
 * OfflineLedger — Root Application (Final)
 * Bootstraps: i18n → GestureHandler → SafeArea → Paper → NavigationContainer → RootNavigator
 * Phase 9: AppState listener → auto-locks app on background
 * Phase 10: i18next initialized as a side-effect import
 */

// Phase 10: initialize i18next before anything renders
import './src/locales/i18n';

import React, { useEffect, useState } from 'react';
import { AppState, StatusBar, useColorScheme, NativeModules, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppDarkTheme, AppLightTheme } from './src/theme';
import { darkColors, lightColors } from './src/theme/colors';
import { useAuthStore } from './src/store/useAuthStore';
import { useThemeStore } from './src/store/useThemeStore';
import { applyPendingRestore } from './src/utils/exportBackup';

const NAV_DARK_THEME = {
  dark: true,
  colors: {
    primary:      '#FFFFFF',
    background:   '#121212',
    card:         '#222222',
    text:         '#FFFFFF',
    border:       '#333333',
    notification: '#D8D8D8',
  },
  fonts: {
    regular:  { fontFamily: 'Roboto',        fontWeight: '400' as const },
    medium:   { fontFamily: 'Roboto-Medium', fontWeight: '500' as const },
    bold:     { fontFamily: 'Roboto-Bold',   fontWeight: '700' as const },
    heavy:    { fontFamily: 'Roboto-Bold',   fontWeight: '900' as const },
  },
};

const NAV_LIGHT_THEME = {
  dark: false,
  colors: {
    primary:      '#1A1A1A',
    background:   '#F5F5F5',
    card:         '#FFFFFF',
    text:         '#0A0A0A',
    border:       '#D8D8D8',
    notification: '#4D4D4D',
  },
  fonts: {
    regular:  { fontFamily: 'Roboto',        fontWeight: '400' as const },
    medium:   { fontFamily: 'Roboto-Medium', fontWeight: '500' as const },
    bold:     { fontFamily: 'Roboto-Bold',   fontWeight: '700' as const },
    heavy:    { fontFamily: 'Roboto-Bold',   fontWeight: '900' as const },
  },
};

function App() {
  const [bootReady, setBootReady] = useState(false);
  const initFromStorage = useAuthStore(state => state.initFromStorage);
  const { themeMode, initTheme } = useThemeStore();
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await applyPendingRestore();
      } catch (e) {
        console.warn('[App] Pending restore failed:', e);
      }
      if (cancelled) return;
      initFromStorage();
      initTheme();
      setBootReady(true);
    })();

    // Auto-lock ONLY when returning after device screen was locked (not on simple minimize to recent apps)
    const subscription = AppState.addEventListener('change', async nextAppState => {
      if (nextAppState === 'active') {
        const { isPinSet, lock } = useAuthStore.getState();
        if (isPinSet) {
          try {
            const isLocked = await NativeModules.ScreenLockModule?.isPhoneLocked();
            if (isLocked) {
              lock();
            }
          } catch (e) {
            // Fallback
          }
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [initFromStorage, initTheme]);

  // Determine active theme
  const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const paperTheme = isDark ? AppDarkTheme : AppLightTheme;
  const navTheme = isDark ? NAV_DARK_THEME : NAV_LIGHT_THEME;

  // Note: App only requires PIN unlock on complete cold start / app launch or manual lock

  if (!bootReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <StatusBar
            barStyle={isDark ? 'light-content' : 'dark-content'}
            backgroundColor={isDark ? darkColors.background : lightColors.background}
            translucent={false}
            animated={true}
          />
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
