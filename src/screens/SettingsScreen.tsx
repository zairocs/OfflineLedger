// OfflineLedger — Settings Screen
// Backup/restore, PIN management, Fingerprint setup, and App Info.
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { exportBackup, restoreBackup } from '../utils/exportBackup';
import { restartApp } from '../utils/restartApp';
import { CustomModal, ModalVariant } from '../components/CustomModal';
import { storage, StorageKeys } from '../utils/storage';
import { formatDate, formatTime } from '../utils/formatters';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';

function getBiometricsInstance() {
  try {
    const BiometricsClass = (ReactNativeBiometrics as any)?.default || ReactNativeBiometrics;
    if (typeof BiometricsClass === 'function') {
      return new BiometricsClass({ allowDeviceCredentials: false });
    }
  } catch (e) {
    console.warn('[SettingsScreen] Biometrics initialization skipped:', e);
  }
  return null;
}

// ── Setting Row Component ────────────────────────────────────────────────────

interface SettingRowProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
}

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  rightContent,
  destructive,
  loading,
  disabled,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.rowIconWrap}>
        <Text style={styles.rowIcon}>{icon}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDestructive]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        {loading ? (
          <ActivityIndicator size="small" color={darkColors.primary} />
        ) : (
          rightContent ?? (onPress ? <Text style={styles.rowChevron}>›</Text> : null)
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionText}>{text}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

// ── Settings Screen ──────────────────────────────────────────────────────────

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    clearPin,
    isBiometricEnabled,
    setBiometricEnabled,
    isPinSet,
  } = useAuthStore();

  const { themeMode, setThemeMode } = useThemeStore();

  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [sensorType, setSensorType] = useState<string>('Fingerprint');

  // Custom Dark Popups state
  const [exportSuccessPath, setExportSuccessPath]         = useState<string | null>(null);
  const [restoreConfirmVisible, setRestoreConfirmVisible] = useState(false);
  const [restoreSuccessVisible, setRestoreSuccessVisible] = useState(false);
  const [resetPinConfirmVisible, setResetPinConfirmVisible] = useState(false);
  const [customAlert, setCustomAlert]                     = useState<{
    title: string;
    message: string;
    icon?: string;
    variant?: ModalVariant;
  } | null>(null);

  // Check biometrics sensor availability
  useEffect(() => {
    const instance = getBiometricsInstance();
    if (!instance) return;

    instance
      .isSensorAvailable()
      .then(({ available, biometryType }: { available: boolean; biometryType?: string }) => {
        setBioAvailable(available);
        if (biometryType === 'FaceID') setSensorType('Face ID');
        else if (biometryType === 'TouchID') setSensorType('Touch ID');
        else setSensorType('Fingerprint');
      })
      .catch(() => setBioAvailable(false));
  }, []);

  const lastBackup = storage.getString(StorageKeys.BACKUP_LAST_AT);
  const lastBackupLabel = lastBackup
    ? `Last backup: ${formatDate(new Date(lastBackup))} at ${formatTime(new Date(lastBackup))}`
    : 'Never backed up';

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const zipPath = await exportBackup();
      setExportSuccessPath(zipPath);
    } catch (err: any) {
      setCustomAlert({
        title: 'Backup Failed',
        message: err?.message ?? 'Could not create backup file. Please check device permissions and storage.',
        icon: '⚠️',
        variant: 'danger',
      });
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Restore ──────────────────────────────────────────────────────────────
  const restoreStartedRef = useRef(false);

  const runRestore = useCallback(async () => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    setRestoring(true);
    try {
      const result = await restoreBackup();
      if (result === 'cancelled') return;
      if (result === 'restored') {
        setRestoreSuccessVisible(true);
        return;
      }
      setCustomAlert({
        title: 'Restore Failed',
        message: 'Could not restore from the selected backup file.',
        icon: '⚠️',
        variant: 'danger',
      });
    } catch (err: any) {
      setCustomAlert({
        title: 'Restore Failed',
        message: err?.message ?? 'Could not restore from the selected backup file.',
        icon: '⚠️',
        variant: 'danger',
      });
    } finally {
      setRestoring(false);
    }
  }, []);

  const handleConfirmRestore = useCallback(() => {
    restoreStartedRef.current = false;
    setRestoreConfirmVisible(false);

    setTimeout(() => {
      void runRestore();
    }, 450);
  }, [runRestore]);

  // ── Reset PIN ────────────────────────────────────────────────────────────
  const handleResetPin = useCallback(() => {
    setResetPinConfirmVisible(true);
  }, []);

  // ── Toggle Biometrics ────────────────────────────────────────────────────
  const handleToggleBiometrics = useCallback(
    async (val: boolean) => {
      if (!isPinSet) {
        setCustomAlert({
          title: 'PIN Required',
          message: 'Please set up a 4-digit PIN lock first before enabling biometric authentication.',
          icon: '🔑',
          variant: 'warning',
        });
        return;
      }

      if (!val) {
        setBiometricEnabled(false);
        return;
      }

      // Test sensor prompt before enabling
      try {
        const instance = getBiometricsInstance();
        if (!instance) {
          setCustomAlert({
            title: 'Biometrics Error',
            message: 'Biometrics sensor non-responsive or unavailable on device.',
            icon: '☝️',
            variant: 'danger',
          });
          return;
        }
        const { success } = await instance.simplePrompt({
          promptMessage: `Verify ${sensorType} to enable lock`,
          cancelButtonText: 'Cancel',
        });

        if (success) {
          setBiometricEnabled(true);
          setCustomAlert({
            title: 'Biometrics Active',
            message: `${sensorType} unlock is now active.`,
            icon: '☝️',
            variant: 'success',
          });
        }
      } catch (e) {
        // User cancelled prompt
      }
    },
    [isPinSet, sensorType, setBiometricEnabled],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) + 95 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Screen Title Area */}
      <View style={styles.titleArea}>
        <Text style={styles.screenTitle}>Settings</Text>
        <Text style={styles.screenSubtitle}>Manage preferences, security & backup</Text>
      </View>

      {/* ── Backup & Restore ──────────────────────────────────────────── */}
      <SectionLabel text={t('backup.title')} />

      <View style={styles.card}>
        <SettingRow
          icon="📦"
          title={t('backup.export')}
          subtitle={lastBackupLabel}
          onPress={handleExport}
          loading={exporting}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🔄"
          title={t('backup.import')}
          subtitle={t('backup.importHint')}
          onPress={() => setRestoreConfirmVisible(true)}
          loading={restoring}
        />
      </View>

      {/* ── Security & Biometrics ──────────────────────────────────────────── */}
      <SectionLabel text="Security & Biometrics" />

      <View style={styles.card}>
        <SettingRow
          icon="☝️"
          title={`${sensorType} Unlock`}
          subtitle={
            bioAvailable
              ? isBiometricEnabled
                ? `Enabled for quick access`
                : `Tap switch to setup ${sensorType} lock`
              : `Sensor not detected on device`
          }
          disabled={!bioAvailable}
          rightContent={
            <Switch
              value={isBiometricEnabled}
              onValueChange={handleToggleBiometrics}
              disabled={!bioAvailable}
              trackColor={{ false: darkColors.border, true: darkColors.primaryContainer }}
              thumbColor={isBiometricEnabled ? darkColors.primary : darkColors.textDisabled}
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🔑"
          title="Reset PIN Code"
          subtitle="Remove current PIN and biometrics"
          onPress={handleResetPin}
          destructive
        />
      </View>

      {/* ── About ─────────────────────────────────────────────────────── */}
      <SectionLabel text="About App" />

      <View style={styles.card}>
        <View style={styles.aboutHeaderRow}>
          <View style={styles.aboutLogoContainer}>
            <Image source={require('../assets/logo.png')} style={styles.aboutLogo} resizeMode="cover" />
          </View>
          <View style={styles.aboutHeaderText}>
            <Text style={styles.aboutTitle}>OfflineLedger</Text>
            <Text style={styles.aboutSubtitle}>Version 1.0.0 — Privacy Focused Ledger</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <SettingRow
          icon="🔒"
          title="100% Offline Storage"
          subtitle="Zero cloud servers. All data stays local."
          rightContent={<View />}
        />
      </View>

      <View style={styles.footerContainer}>
        <View style={styles.footerLogoContainer}>
          <Image source={require('../assets/logo.png')} style={styles.footerLogo} resizeMode="cover" />
        </View>
        <Text style={styles.footerBrand}>OfflineLedger v1.0.0</Text>
        <Text style={styles.footerDev}>Engineered by CORE TECH AI Team</Text>
        <Text style={styles.footerCopy}>© {new Date().getFullYear()} CORE TECH. All Rights Reserved.</Text>
      </View>

      {/* ── Export Success Custom Popup ───────────────────────────────────── */}
      <CustomModal
        visible={!!exportSuccessPath}
        title="Backup Saved Successfully"
        icon="📄"
        variant="success"
        singleButton
        message={
          exportSuccessPath
            ? `Your backup file has been created and saved to your Downloads folder!\n\n📄 File: ${exportSuccessPath.split('/').pop()}\n📍 Location: ${exportSuccessPath}`
            : ''
        }
        confirmText="Great!"
        onConfirm={() => setExportSuccessPath(null)}
      />

      {/* ── Restore Confirmation Custom Popup ─────────────────────────────── */}
      {restoreConfirmVisible ? (
        <CustomModal
          visible
          title="Restore Backup"
          icon="📥"
          variant="warning"
          message="This will replace ALL current client records, notes, and balances with the backup file. This cannot be undone."
          confirmText="Restore Data"
          cancelText="Cancel"
          onConfirm={handleConfirmRestore}
          onCancel={() => setRestoreConfirmVisible(false)}
        />
      ) : null}

      {restoreSuccessVisible ? (
        <CustomModal
          visible
          title="Restore Complete"
          icon="🎉"
          variant="success"
          singleButton
          message="Your records, profile photos, and documents are ready. Tap OK to restart the app and load them. If the app does not restart, close it from Recents and open it again."
          confirmText="OK & Restart App"
          onConfirm={() => {
            try {
              restartApp();
            } catch (e: any) {
              setRestoreSuccessVisible(false);
              setCustomAlert({
                title: 'Restart the App',
                message:
                  e?.message ??
                  'Please close OfflineLedger from Recents, then open it again to load the restored data.',
                icon: '🔄',
                variant: 'info',
              });
            }
          }}
        />
      ) : null}

      {/* ── Reset PIN Confirmation Popup ─────────────────────────────────── */}
      <CustomModal
        visible={resetPinConfirmVisible}
        title="Reset PIN Code"
        icon="🔑"
        variant="danger"
        message="This will remove your PIN lock and disable biometrics. You will be prompted to set a new PIN on next launch."
        confirmText="Reset PIN"
        cancelText="Cancel"
        onConfirm={() => {
          setResetPinConfirmVisible(false);
          clearPin();
          setCustomAlert({
            title: 'PIN Removed',
            message: 'Your PIN has been cleared. Set a new one on next launch.',
            icon: '🔑',
            variant: 'info',
          });
        }}
        onCancel={() => setResetPinConfirmVisible(false)}
      />

      {/* ── Custom Alert Popup ───────────────────────────────────────────── */}
      <CustomModal
        visible={!!customAlert}
        title={customAlert?.title ?? 'Notification'}
        message={customAlert?.message ?? ''}
        icon={customAlert?.icon ?? 'ℹ️'}
        variant={customAlert?.variant ?? 'info'}
        singleButton
        confirmText="OK"
        onConfirm={() => setCustomAlert(null)}
      />
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkColors.background },
  content: { padding: spacing[4], paddingBottom: spacing[12] },

  titleArea: {
    paddingHorizontal: spacing[1],
    paddingTop: spacing[1],
    paddingBottom: spacing[3],
    gap: 2,
  },
  screenTitle: {
    ...typography.h1,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    ...typography.bodySmall,
    color: darkColors.textSecondary,
  },

  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[5],
    marginBottom: spacing[2],
    gap: spacing[3],
  },
  sectionText: {
    ...typography.labelSmall,
    color: darkColors.primary,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: darkColors.divider,
  },

  card: {
    backgroundColor: darkColors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: darkColors.cardBorder,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: darkColors.divider,
    marginHorizontal: spacing[4],
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  rowDisabled: { opacity: 0.5 },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon: { fontSize: 20 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: {
    ...typography.labelLarge,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  rowTitleDestructive: { color: darkColors.error },
  rowSubtitle: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    flexShrink: 1,
  },
  rowRight: { alignItems: 'center', justifyContent: 'center' },
  rowChevron: {
    fontSize: 22,
    color: darkColors.textDisabled,
  },

  aboutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    gap: spacing[3],
  },
  aboutLogoContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  aboutHeaderText: {
    flex: 1,
    gap: 2,
  },
  aboutTitle: {
    ...typography.labelLarge,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  aboutSubtitle: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
  },

  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[8],
    marginBottom: spacing[4],
    gap: spacing[1],
  },
  footerLogoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  footerLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  footerBrand: {
    ...typography.labelMedium,
    color: darkColors.primary,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  footerDev: {
    ...typography.bodySmall,
    color: darkColors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  footerCopy: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
