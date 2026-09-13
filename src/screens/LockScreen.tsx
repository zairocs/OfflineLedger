// OfflineLedger — Modernized Lock Screen with Animated PIN & Biometrics
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useAuthStore } from '../store/useAuthStore';
import { CustomModal } from '../components/CustomModal';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius, shadow } from '../theme/spacing';

function getBiometricsInstance() {
  try {
    const BiometricsClass = (ReactNativeBiometrics as any)?.default || ReactNativeBiometrics;
    if (typeof BiometricsClass === 'function') {
      return new BiometricsClass({ allowDeviceCredentials: false });
    }
  } catch (e) {
    console.warn('[LockScreen] Biometrics initialization skipped:', e);
  }
  return null;
}

type LockMode = 'unlock' | 'setup' | 'confirm';
const PIN_LENGTH = 4;

// ── PIN Dot Indicators with Scale Animation ───────────────────────────────────

function PinDots({ count, shake }: { count: number; shake: Animated.Value }) {
  const dotScales = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1)),
  ).current;

  useEffect(() => {
    Array.from({ length: PIN_LENGTH }).forEach((_, i) => {
      Animated.spring(dotScales[i], {
        toValue: i < count ? 1.25 : 1,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }).start(() => {
        Animated.spring(dotScales[i], {
          toValue: i < count ? 1.1 : 1,
          useNativeDriver: true,
          friction: 6,
        }).start();
      });
    });
  }, [count, dotScales]);

  return (
    <Animated.View
      style={[
        styles.dotsRow,
        {
          transform: [
            {
              translateX: shake.interpolate({
                inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
                outputRange: [0, -14, 14, -14, 14, 0],
              }),
            },
          ],
        },
      ]}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            i < count && styles.dotFilled,
            { transform: [{ scale: dotScales[i] }] },
          ]}
        />
      ))}
    </Animated.View>
  );
}

// ── Number Pad Item with Press Animation ──────────────────────────────────────

function KeyButton({
  val,
  onPress,
  disabled,
}: {
  val: string;
  onPress: (k: string) => void;
  disabled?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => onPress(val)}
      style={styles.padKey}
    >
      <Animated.View
        style={[
          styles.padKeyBtn,
          disabled && styles.padKeyDisabled,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={[styles.padKeyText, val === '⌫' && styles.padKeyTextBackspace]}>
          {val}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Number Pad ────────────────────────────────────────────────────────────────

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

function NumberPad({
  onKey,
  disabled,
}: {
  onKey: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.pad}>
      {KEYS.map((key, idx) =>
        key ? (
          <KeyButton key={idx} val={key} onPress={onKey} disabled={disabled} />
        ) : (
          <View key={idx} style={styles.padKey} />
        ),
      )}
    </View>
  );
}

// ── Lock Screen ───────────────────────────────────────────────────────────────

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const {
    isPinSet,
    setPin,
    verifyPin,
    unlock,
    isBiometricEnabled,
    setBiometricEnabled,
    biometricUnlock,
  } = useAuthStore();

  const [mode, setMode] = useState<LockMode>(isPinSet ? 'unlock' : 'setup');
  const [pin, setPin_] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Verifying Security PIN...');
  const [biometricAvail, setBioAvail] = useState(false);
  const [showBioPrompt, setShowBioPrompt] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Syncing animation launcher ───────────────────────────────────────────
  const startSyncSequence = useCallback((onComplete: () => void) => {
    setSyncing(true);
    progressAnim.setValue(0);

    // Animate progress bar across 1.8 seconds
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 1800,
      useNativeDriver: false,
    }).start();

    // Sequence of realistic status updates
    setTimeout(() => setSyncStatus('Decrypting Offline Storage...'), 400);
    setTimeout(() => setSyncStatus('Loading Client Records & Media...'), 900);
    setTimeout(() => setSyncStatus('Preparing Ledger Workspace...'), 1400);

    setTimeout(() => {
      onComplete();
    }, 1850);
  }, [progressAnim]);

  // ── Check biometric availability ─────────────────────────────────────────
  useEffect(() => {
    const instance = getBiometricsInstance();
    if (!instance) {
      setBioAvail(false);
      return;
    }
    instance
      .isSensorAvailable()
      .then(({ available }: { available: boolean }) => setBioAvail(available))
      .catch(() => setBioAvail(false));
  }, []);

  // ── Trigger biometric prompt ──────────────────────────────────────────────
  const triggerBiometric = useCallback(async () => {
    try {
      const instance = getBiometricsInstance();
      if (!instance) return;
      const { success } = await instance.simplePrompt({
        promptMessage: 'Unlock RB Co. with Fingerprint',
        cancelButtonText: 'Use PIN',
      });
      if (success) {
        startSyncSequence(() => biometricUnlock());
      }
    } catch {
      // User cancelled or biometric failed — fall back to PIN
    }
  }, [biometricUnlock, startSyncSequence]);

  // Auto-trigger if biometric is enabled
  useEffect(() => {
    if (mode === 'unlock' && biometricAvail && isBiometricEnabled && !syncing) {
      triggerBiometric();
    }
  }, [mode, biometricAvail, isBiometricEnabled, syncing, triggerBiometric]);

  // Re-trigger biometric prompt when app comes back to foreground (e.g. phone unlock)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (
        nextState === 'active' &&
        mode === 'unlock' &&
        biometricAvail &&
        isBiometricEnabled &&
        !syncing
      ) {
        triggerBiometric();
      }
    });
    return () => subscription.remove();
  }, [mode, biometricAvail, isBiometricEnabled, syncing, triggerBiometric]);

  // ── Shake animation for wrong PIN ────────────────────────────────────────
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => shakeAnim.setValue(0));
  }, [shakeAnim]);

  // ── Handle PIN digit entry ────────────────────────────────────────────────
  const handleKey = useCallback(
    async (key: string) => {
      if (loading || syncing) return;

      if (key === '⌫') {
        setPin_(prev => prev.slice(0, -1));
        setError('');
        return;
      }

      const next = pin + key;
      setPin_(next);
      setError('');

      if (next.length < PIN_LENGTH) return;

      // PIN complete — process it
      setLoading(true);

      if (mode === 'setup') {
        setSetupPin(next);
        setMode('confirm');
        setPin_('');
        setLoading(false);
      } else if (mode === 'confirm') {
        if (next === setupPin) {
          await setPin(next);
          // Ask user to enable biometric unlock if sensor available
          if (biometricAvail && !isBiometricEnabled) {
            setShowBioPrompt(true);
          }
        } else {
          triggerShake();
          setError("PINs don't match. Try again.");
          setMode('setup');
          setSetupPin('');
          setPin_('');
        }
        setLoading(false);
      } else {
        // 'unlock' mode
        const valid = await verifyPin(next);
        if (valid) {
          setLoading(false);
          startSyncSequence(() => {
            unlock();
          });
        } else {
          triggerShake();
          setError('Incorrect PIN. Try again.');
          setPin_('');
          setLoading(false);
        }
      }
    },
    [
      pin,
      mode,
      loading,
      syncing,
      setupPin,
      setPin,
      verifyPin,
      unlock,
      triggerShake,
      biometricAvail,
      isBiometricEnabled,
      setBiometricEnabled,
      startSyncSequence,
    ],
  );

  const titles: Record<LockMode, string> = {
    unlock: 'Enter Security PIN',
    setup: 'Set Access PIN',
    confirm: 'Confirm Access PIN',
  };
  const subtitles: Record<LockMode, string> = {
    unlock: 'Enter your 4-digit PIN to access your ledger',
    setup: 'Create a 4-digit PIN to secure your data',
    confirm: 'Re-enter your 4-digit PIN to confirm',
  };

  const topPadding = Math.max(insets.top, 24) + spacing[6];

  return (
    <View style={[styles.screen, { paddingTop: topPadding }]}>
      <StatusBar barStyle="light-content" backgroundColor={darkColors.background} translucent />

      {/* Header Logo */}
      <View style={styles.logoArea}>
        <View style={styles.logoCircle}>
          <Image source={require('../assets/logo.png')} style={{ width: 68, height: 68, borderRadius: 34 }} resizeMode="cover" />
        </View>
        <Text style={styles.appName}>RB Co.</Text>
        <Text style={styles.tagline}>Encrypted & Saved 100% Offline</Text>
      </View>

      {syncing ? (
        <View style={styles.syncContainer}>
          <ActivityIndicator size="large" color={darkColors.primary} style={{ marginBottom: spacing[4] }} />
          <Text style={styles.syncTitle}>Access Granted</Text>
          <Text style={styles.syncSubtitle}>{syncStatus}</Text>

          {/* Animated Gold Progress Bar */}
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      ) : (
        <>
          {/* Mode Title & Subtitle */}
          <Text style={styles.title}>{titles[mode]}</Text>
          <Text style={styles.subtitle}>{subtitles[mode]}</Text>

          {/* PIN Dots */}
          <PinDots count={pin.length} shake={shakeAnim} />

          {/* Error Message */}
          <View style={styles.errorArea}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          {loading && <ActivityIndicator color={darkColors.primary} style={styles.spinner} />}

          {/* Number Pad */}
          <NumberPad onKey={handleKey} disabled={loading} />

          {/* Biometric Unlock Action Button */}
          {mode === 'unlock' && biometricAvail && (
            <TouchableOpacity
              style={styles.bioBtn}
              onPress={triggerBiometric}
              activeOpacity={0.8}
            >
              <Text style={styles.bioBtnIcon}>☝️</Text>
              <Text style={styles.bioBtnText}>Use Fingerprint Unlock</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Fingerprint Setup Prompt Custom Modal */}
      <CustomModal
        visible={showBioPrompt}
        title="Fingerprint Unlock"
        icon="☝️"
        variant="info"
        message="Would you like to enable fingerprint unlock for quick access?"
        confirmText="Enable"
        cancelText="No Thanks"
        onConfirm={() => {
          setShowBioPrompt(false);
          setBiometricEnabled(true);
        }}
        onCancel={() => setShowBioPrompt(false)}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: darkColors.background,
    alignItems: 'center',
    paddingTop: spacing[10],
    paddingHorizontal: spacing[6],
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: spacing[6],
    gap: spacing[1],
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: darkColors.surfaceVariant,
    borderWidth: 1.5,
    borderColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
    ...shadow.md,
  },
  logoEmoji: { fontSize: 32 },
  appName: {
    ...typography.h1,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  tagline: {
    ...typography.bodySmall,
    color: darkColors.textDisabled,
  },
  title: {
    ...typography.h2,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[1],
  },
  subtitle: {
    ...typography.bodySmall,
    color: darkColors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing[4],
    marginBottom: spacing[2],
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: darkColors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: darkColors.primary,
    borderColor: darkColors.primary,
    shadowColor: darkColors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  errorArea: { height: 24, justifyContent: 'center' },
  errorText: {
    ...typography.labelSmall,
    color: darkColors.error,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  spinner: { marginBottom: spacing[2] },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    gap: spacing[3],
    justifyContent: 'center',
    marginTop: spacing[3],
  },
  padKey: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padKeyBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  padKeyDisabled: { opacity: 0.5 },
  padKeyText: {
    ...typography.h2,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  padKeyTextBackspace: {
    fontSize: 22,
    color: darkColors.textSecondary,
  },
  bioBtn: {
    marginTop: spacing[6],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderRadius: radius.full,
    backgroundColor: darkColors.surfaceVariant,
    borderWidth: 1,
    borderColor: darkColors.primary,
  },
  bioBtnIcon: { fontSize: 20 },
  bioBtnText: {
    ...typography.labelMedium,
    color: darkColors.primary,
    fontWeight: fontWeight.semibold,
  },
  // Syncing / Loading Overlay
  syncContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[8],
    paddingHorizontal: spacing[4],
    width: '100%',
  },
  syncTitle: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
    marginBottom: spacing[1],
  },
  syncSubtitle: {
    ...typography.bodyMedium,
    color: darkColors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing[6],
  },
  progressBarTrack: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    backgroundColor: darkColors.surfaceVariant,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: darkColors.primary,
    borderRadius: 3,
  },
});
