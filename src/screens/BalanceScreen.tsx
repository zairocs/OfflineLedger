// OfflineLedger — Balance / Ledger Screen (Phase 6)
// Per-user financial ledger: total balance, advance entries, remaining balance.
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ListRenderItem,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { BalanceCard } from '../components/BalanceCard';
import { AdvanceRow } from '../components/AdvanceRow';
import { AdvanceEntry } from '../db/models/AdvanceEntry';
import { User } from '../db/models/User';
import { database, usersCollection, advancesCollection } from '../db';
import { CustomModal } from '../components/CustomModal';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';

interface BalanceScreenProps {
  userId: string;
}

// ── Add Advance Modal ────────────────────────────────────────────────────────

interface AddAdvanceModalProps {
  visible: boolean;
  onSave: (amount: number, description: string) => Promise<void>;
  onClose: () => void;
}

function AddAdvanceModal({ visible, onSave, onClose }: AddAdvanceModalProps) {
  const [amount, setAmount]     = useState('');
  const [desc, setDesc]         = useState('');
  const [saving, setSaving]     = useState(false);

  const reset = () => { setAmount(''); setDesc(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed, desc.trim());
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.addModal}>
          <View style={styles.addModalHeader}>
            <Text style={styles.addModalTitle}>Add Advance</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Amount (PKR) *</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 5000"
            placeholderTextColor={darkColors.textDisabled}
            keyboardType="numeric"
            autoFocus
            returnKeyType="next"
            selectionColor={darkColors.primary}
          />

          <Text style={styles.fieldLabel}>Description (optional)</Text>
          <TextInput
            style={styles.input}
            value={desc}
            onChangeText={setDesc}
            placeholder='e.g. "Eid advance", "Medical emergency"'
            placeholderTextColor={darkColors.textDisabled}
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            selectionColor={darkColors.primary}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={darkColors.textOnPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Record Advance</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Edit Total Balance Modal ─────────────────────────────────────────────────

interface EditBalanceModalProps {
  visible: boolean;
  current: number;
  onSave: (newTotal: number) => Promise<void>;
  onClose: () => void;
}

function EditBalanceModal({
  visible,
  current,
  onSave,
  onClose,
}: EditBalanceModalProps) {
  const [value, setValue]   = useState('');
  const [saving, setSaving] = useState(false);

  // Pre-fill with current value when modal opens
  useEffect(() => {
    if (visible) setValue(current > 0 ? String(current) : '');
  }, [visible, current]);

  const handleSave = async () => {
    const parsed = parseFloat(value.replace(/,/g, ''));
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert('Invalid', 'Please enter a valid balance amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.editModal}>
          <Text style={styles.addModalTitle}>Set Total Balance</Text>
          <Text style={styles.editModalHint}>
            This is the total agreed salary or contract amount for this client.
          </Text>
          <TextInput
            style={[styles.input, styles.inputLarge]}
            value={value}
            onChangeText={setValue}
            placeholder="e.g. 25000"
            placeholderTextColor={darkColors.textDisabled}
            keyboardType="numeric"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
            selectionColor={darkColors.primary}
          />
          <View style={styles.editModalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, styles.saveBtnSmall, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={darkColors.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Balance Screen ────────────────────────────────────────────────────────────

export function BalanceScreen({ userId }: BalanceScreenProps) {
  const [user, setUser]               = useState<User | null>(null);
  const [advances, setAdvances]       = useState<AdvanceEntry[]>([]);
  const [addVisible, setAddVisible]   = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  // ── Live subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    const userSub = usersCollection
      .findAndObserve(userId)
      .subscribe(u => setUser(u));

    const advSub = advancesCollection
      .query(Q.where('user_id', userId), Q.sortBy('created_at', Q.desc))
      .observe()
      .subscribe(entries => setAdvances(entries));

    return () => {
      userSub.unsubscribe();
      advSub.unsubscribe();
    };
  }, [userId]);

  // ── Computed totals ──────────────────────────────────────────────────────
  const totalAdvances = useMemo(
    () => advances.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [advances],
  );

  // ── Add advance ──────────────────────────────────────────────────────────
  const handleAddAdvance = useCallback(
    async (amount: number, description: string) => {
      await database.write(async () => {
        await advancesCollection.create(record => {
          record.userId      = userId;
          record.amount      = amount;
          record.description = description;
        });
      });
      setAddVisible(false);
    },
    [userId],
  );

  const [deleteTargetEntry, setDeleteTargetEntry] = useState<AdvanceEntry | null>(null);

  // ── Delete advance trigger ───────────────────────────────────────────────
  const handleDeleteAdvance = useCallback((entry: AdvanceEntry) => {
    setDeleteTargetEntry(entry);
  }, []);

  // ── Confirm delete advance ───────────────────────────────────────────────
  const handleConfirmDeleteAdvance = useCallback(async () => {
    if (!deleteTargetEntry) return;
    try {
      await database.write(() => deleteTargetEntry.destroyPermanently());
      setDeleteTargetEntry(null);
    } catch (err) {
      console.warn('[BalanceScreen] Delete advance error:', err);
    }
  }, [deleteTargetEntry]);

  // ── Update total balance ─────────────────────────────────────────────────
  const handleSaveTotalBalance = useCallback(
    async (newTotal: number) => {
      if (!user) return;
      await user.updateDetails({ totalBalance: newTotal });
    },
    [user],
  );

  // ── Render advance row ───────────────────────────────────────────────────
  const renderItem: ListRenderItem<AdvanceEntry> = useCallback(
    ({ item }) => (
      <AdvanceRow entry={item} onDelete={handleDeleteAdvance} />
    ),
    [handleDeleteAdvance],
  );

  const keyExtractor = useCallback((item: AdvanceEntry) => item.id, []);

  // ── List header (the balance card + section title) ───────────────────────
  const ListHeader = useCallback(
    () => (
      <>
        {user && (
          <BalanceCard
            totalBalance={user.totalBalance ?? 0}
            totalAdvances={totalAdvances}
            onEditTotal={() => setEditVisible(true)}
          />
        )}

        {/* Section title */}
        {advances.length > 0 && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Advance History</Text>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionCount}>
              {advances.length} {advances.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
        )}
      </>
    ),
    [user, totalAdvances, advances.length],
  );

  return (
    <View style={styles.screen}>
      {/* ── Main list ──────────────────────────────────────────────────── */}
      <FlatList
        data={advances}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💸</Text>
            <Text style={styles.emptyTitle}>No advances yet</Text>
            <Text style={styles.emptyHint}>
              Tap the + button to record an advance payment
            </Text>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          advances.length === 0 && styles.listEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        keyboardShouldPersistTaps="handled"
      />

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* ── Add Advance Modal ────────────────────────────────────────────── */}
      <AddAdvanceModal
        visible={addVisible}
        onSave={handleAddAdvance}
        onClose={() => setAddVisible(false)}
      />

      {/* ── Edit Total Balance Modal ──────────────────────────────────────── */}
      {user && (
        <EditBalanceModal
          visible={editVisible}
          current={user.totalBalance ?? 0}
          onSave={handleSaveTotalBalance}
          onClose={() => setEditVisible(false)}
        />
      )}

      {/* Delete Advance Custom Modal (Danger: 2 buttons, Cancel gray & Delete Red) */}
      <CustomModal
        visible={Boolean(deleteTargetEntry)}
        title="Delete Advance"
        icon="🗑️"
        variant="danger"
        message={
          deleteTargetEntry
            ? `Delete this advance record of PKR ${deleteTargetEntry.amount.toLocaleString()}? This cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDeleteAdvance}
        onCancel={() => setDeleteTargetEntry(null)}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkColors.background },

  listContent: { paddingBottom: 90 },
  listEmpty:   { flexGrow: 1 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginTop: spacing[3],
    marginBottom: spacing[1],
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: darkColors.primary,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: darkColors.divider,
  },
  sectionCount: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    paddingTop: spacing[6],
    gap: spacing[3],
  },
  emptyIcon:  { fontSize: 56 },
  emptyTitle: { ...typography.h3, color: darkColors.textPrimary, textAlign: 'center' },
  emptyHint:  {
    ...typography.bodySmall,
    color: darkColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing[5],
    right: spacing[5],
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: darkColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  fabIcon: {
    fontSize: 28,
    color: darkColors.textOnPrimary,
    lineHeight: 32,
    fontWeight: fontWeight.bold,
  },

  // Shared modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: darkColors.overlay,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },

  // Add advance modal
  addModal: {
    backgroundColor: darkColors.surface,
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[3],
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  addModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addModalTitle: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: darkColors.textSecondary,
    fontSize: 14,
    fontWeight: fontWeight.bold,
  },
  fieldLabel: {
    ...typography.labelSmall,
    color: darkColors.textSecondary,
    marginBottom: -spacing[1],
  },
  input: {
    backgroundColor: darkColors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...typography.bodyMedium,
    color: darkColors.textPrimary,
  },
  inputLarge: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    letterSpacing: 1,
  },
  saveBtn: {
    backgroundColor: darkColors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[1],
    shadowColor: darkColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  saveBtnSmall: {
    flex: 1,
    paddingVertical: spacing[3],
    marginTop: 0,
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },

  // Edit balance modal
  editModal: {
    backgroundColor: darkColors.surface,
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[3],
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  editModalHint: {
    ...typography.bodySmall,
    color: darkColors.textSecondary,
    marginTop: -spacing[1],
  },
  editModalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    borderRadius: radius.xl,
    backgroundColor: darkColors.surfaceVariant,
  },
  cancelBtnText: {
    ...typography.labelLarge,
    color: darkColors.textSecondary,
  },
});
