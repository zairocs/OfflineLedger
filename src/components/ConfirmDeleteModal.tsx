// OfflineLedger — Custom Dynamic Styled Modal & Confirmation Dialog
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius, shadow } from '../theme/spacing';

export type ModalVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmDeleteModalProps {
  visible: boolean;
  title: string;
  message: string;
  variant?: ModalVariant;
  icon?: string;
  confirmText?: string;
  cancelText?: string | null;
  singleButton?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

const variantStyles: Record<
  ModalVariant,
  {
    defaultIcon: string;
    iconBg: string;
    iconBorder: string;
    confirmBg: string;
    confirmText: string;
  }
> = {
  danger: {
    defaultIcon: '🗑️',
    iconBg: 'rgba(229, 57, 53, 0.15)',
    iconBorder: 'rgba(229, 57, 53, 0.35)',
    confirmBg: '#E53935',
    confirmText: '#FFFFFF',
  },
  warning: {
    defaultIcon: '⚠️',
    iconBg: 'rgba(255, 179, 0, 0.15)',
    iconBorder: 'rgba(255, 179, 0, 0.35)',
    confirmBg: '#FFB300',
    confirmText: '#000000',
  },
  info: {
    defaultIcon: 'ℹ️',
    iconBg: 'rgba(41, 182, 246, 0.15)',
    iconBorder: 'rgba(41, 182, 246, 0.35)',
    confirmBg: darkColors.primary,
    confirmText: darkColors.textOnPrimary,
  },
  success: {
    defaultIcon: '✅',
    iconBg: 'rgba(76, 175, 80, 0.15)',
    iconBorder: 'rgba(76, 175, 80, 0.35)',
    confirmBg: '#4CAF50',
    confirmText: '#FFFFFF',
  },
};

export function ConfirmDeleteModal({
  visible,
  title,
  message,
  variant = 'danger',
  icon,
  confirmText,
  cancelText = 'Cancel',
  singleButton = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const currentVariant = variantStyles[variant] || variantStyles.danger;
  const displayIcon = icon || currentVariant.defaultIcon;
  const defaultConfirmText = confirmText || (variant === 'danger' ? 'Delete' : 'OK');
  const isSingleButton = singleButton || cancelText === null || !onCancel;

  const handleBackdropPress = () => {
    if (loading) return;
    if (onCancel) onCancel();
    else onConfirm();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBackdropPress}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              {/* Dynamic Icon Badge */}
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: currentVariant.iconBg,
                    borderColor: currentVariant.iconBorder,
                  },
                ]}
              >
                <Text style={styles.iconText}>{displayIcon}</Text>
              </View>

              {/* Title & Message */}
              <Text style={styles.title}>{title}</Text>
              {Boolean(message) && <Text style={styles.message}>{message}</Text>}

              {/* Actions Row */}
              <View style={styles.actionsRow}>
                {!isSingleButton && onCancel && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={onCancel}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelText}>{cancelText}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: currentVariant.confirmBg },
                    isSingleButton && styles.fullWidthBtn,
                    loading && styles.disabledBtn,
                  ]}
                  onPress={onConfirm}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={currentVariant.confirmText} />
                  ) : (
                    <Text style={[styles.confirmText, { color: currentVariant.confirmText }]}>
                      {defaultConfirmText}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// Alias for general modal use
export const CustomModal = ConfirmDeleteModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: darkColors.card,
    borderRadius: radius.xl,
    padding: spacing[5],
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...shadow.lg,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
    borderWidth: 1,
  },
  iconText: {
    fontSize: 26,
  },
  title: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  message: {
    ...typography.bodyMedium,
    color: darkColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing[5],
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  cancelText: {
    ...typography.labelLarge,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  fullWidthBtn: {
    flex: 1,
    width: '100%',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  confirmText: {
    ...typography.labelLarge,
    fontWeight: fontWeight.bold,
  },
});
