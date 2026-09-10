// OfflineLedger — User Detail Screen
// Tab host: Profile | Documents | Notepad | Balance
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { DocumentsScreen } from './DocumentsScreen';
import { NotepadScreen } from './NotepadScreen';
import { BalanceScreen } from './BalanceScreen';
import { ReceiptsScreen } from './ReceiptsScreen';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Avatar } from '../components/Avatar';
import { User } from '../db/models/User';
import { usersCollection } from '../db';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius, shadow } from '../theme/spacing';
import { formatDate } from '../utils/formatters';
import { UserStackParamList } from '../navigation/UserStackNavigator';
import { copyImageToPrivateStorage, deletePrivateFile } from '../utils/fileStorage';
import { useImagePicker } from '../hooks/useImagePicker';

type NavProp  = StackNavigationProp<UserStackParamList, 'UserDetail'>;
type RoutePr  = RouteProp<UserStackParamList, 'UserDetail'>;

type TabId = 'profile' | 'documents' | 'notepad' | 'balance' | 'receipts';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'profile',   label: 'Profile',   icon: '👤' },
  { id: 'documents', label: 'Docs',      icon: '📄' },
  { id: 'notepad',   label: 'Notes',     icon: '📝' },
  { id: 'balance',   label: 'Balance',   icon: '💰' },
  { id: 'receipts',  label: 'Receipts',  icon: '🧾' },
];

export function UserDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePr>();
  const { userId } = route.params;

  const [user, setUser]       = useState<User | null>(null);
  const [activeTab, setTab]   = useState<TabId>('profile');
  const [loading, setLoading] = useState(true);

  const { pickFromGallery } = useImagePicker({
    subDir: 'avatars',
    onSuccess: async (savedPath) => {
      if (user) {
        if (user.avatarPath) {
          await deletePrivateFile(user.avatarPath);
        }
        await user.updateDetails({ avatarPath: savedPath });
      }
    },
    onError: (msg) => Alert.alert('Avatar Error', msg),
  });

  useEffect(() => {
    let sub: any;
    usersCollection.findAndObserve(userId).subscribe(u => {
      setUser(u);
      if (u) navigation.setOptions({ title: 'RB Co.' });
      setLoading(false);
    });
    return () => sub?.unsubscribe?.();
  }, [userId, navigation]);

  const handleAvatarPress = useCallback(() => {
    pickFromGallery();
  }, [pickFromGallery]);

  const handleEdit = useCallback(() => {
    navigation.navigate('AddEditUser', { userId });
  }, [navigation, userId]);

  const handleDelete = useCallback(() => {
    if (!user) return;
    Alert.alert(
      'Delete Client',
      `This will permanently delete ${user.name} and ALL their data (documents, notes, balance). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Clean up avatar file
            if (user.avatarPath) {
              await deletePrivateFile(user.avatarPath);
            }
            await user.deleteWithRelated();
            navigation.goBack();
          },
        },
      ],
    );
  }, [user, navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={darkColors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Worker not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ── Header card ─────────────────────────────────────────────── */}
      <View style={styles.headerCard}>
        <View style={styles.avatarColumn}>
          <Avatar
            name={user.name}
            avatarPath={user.avatarPath}
            size={72}
            enablePreview
          />
          <TouchableOpacity
            style={styles.changePhotoBtn}
            onPress={handleAvatarPress}
            activeOpacity={0.7}
          >
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{user.name}</Text>
          <Text style={styles.headerPhone}>{user.phone}</Text>
          {!!user.cnic && (
            <Text style={styles.headerCnic}>{user.cnic}</Text>
          )}
          <Text style={styles.headerMeta}>
            Added {formatDate(user.createdAt)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleEdit}>
            <Text style={styles.iconBtnText}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.iconBtnDanger]}
            onPress={handleDelete}
          >
            <Text style={[styles.iconBtnText, { color: darkColors.error }]}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
            onPress={() => setTab(tab.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab Content ─────────────────────────────────────────────── */}
      <View style={styles.tabContent}>
        {activeTab === 'profile'   && <ProfileTab user={user} onEdit={handleEdit} />}
        {activeTab === 'documents' && <DocumentsScreen userId={userId} />}
        {activeTab === 'notepad'   && <NotepadScreen   userId={userId} />}
        {activeTab === 'balance'   && <BalanceScreen   userId={userId} />}
        {activeTab === 'receipts'  && <ReceiptsScreen  userId={userId} />}
      </View>
    </View>
  );
}

// ── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({ user, onEdit }: { user: User; onEdit: () => void }) {
  const rows: { label: string; value: string | undefined; icon: string }[] = [
    { label: 'Phone',   value: user.phone,   icon: '📞' },
    { label: 'CNIC',    value: user.cnic,    icon: '🪪' },
    { label: 'Email',   value: user.email,   icon: '✉️' },
    { label: 'Address', value: user.address, icon: '📍' },
  ];

  return (
    <ScrollView
      style={styles.profileScroll}
      contentContainerStyle={styles.profileContent}
      showsVerticalScrollIndicator={false}
    >
      {rows.map(row =>
        row.value ? (
          <View key={row.label} style={styles.profileRow}>
            <Text style={styles.profileRowIcon}>{row.icon}</Text>
            <View style={styles.profileRowBody}>
              <Text style={styles.profileRowLabel}>{row.label}</Text>
              <Text style={styles.profileRowValue}>{row.value}</Text>
            </View>
          </View>
        ) : null,
      )}

      <TouchableOpacity style={styles.editProfileBtn} onPress={onEdit} activeOpacity={0.8}>
        <Text style={styles.editProfileBtnText}>Edit Profile</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Placeholder for Phase 4–6 tabs ──────────────────────────────────────────

function PlaceholderTab({ icon, label, hint }: { icon: string; label: string; hint: string }) {
  return (
    <View style={styles.placeholderTab}>
      <Text style={styles.placeholderIcon}>{icon}</Text>
      <Text style={styles.placeholderLabel}>{label}</Text>
      <Text style={styles.placeholderHint}>{hint}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: darkColors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: darkColors.background },
  errorText: { color: darkColors.textSecondary, ...typography.bodyMedium },

  // Header card
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  avatarColumn: {
    alignItems: 'center',
    gap: 6,
  },
  changePhotoBtn: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: darkColors.surfaceVariant,
  },
  changePhotoText: {
    ...typography.labelSmall,
    fontSize: 10,
    color: darkColors.primary,
    fontWeight: fontWeight.bold,
  },
  headerInfo:  { flex: 1, gap: 2 },
  headerName:  { ...typography.h3, color: darkColors.textPrimary, fontWeight: fontWeight.bold },
  headerPhone: { ...typography.bodySmall, color: darkColors.textSecondary },
  headerCnic:  { ...typography.labelSmall, color: darkColors.textDisabled, letterSpacing: 0.5 },
  headerMeta:  { ...typography.labelSmall, color: darkColors.textDisabled, marginTop: 2 },
  headerActions: { gap: spacing[2] },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnDanger: { backgroundColor: darkColors.errorContainer },
  iconBtnText: { fontSize: 16, color: darkColors.textSecondary },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: darkColors.surface,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    gap: spacing[1],
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    gap: 2,
  },
  tabItemActive: {
    backgroundColor: darkColors.surfaceVariant,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tabIcon:  { fontSize: 18 },
  tabLabel: { ...typography.labelSmall, color: darkColors.textDisabled, fontSize: 11 },
  tabLabelActive: { color: darkColors.textPrimary, fontWeight: fontWeight.bold },

  // Tab content
  tabContent: { flex: 1 },

  // Profile tab
  profileScroll: { flex: 1 },
  profileContent: {
    padding: spacing[4],
    gap: spacing[1],
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: darkColors.surface,
    borderRadius: radius.md,
    padding: spacing[4],
    marginBottom: spacing[2],
    gap: spacing[3],
    borderWidth: 1,
    borderColor: darkColors.cardBorder,
  },
  profileRowIcon: { fontSize: 20, marginTop: 1 },
  profileRowBody: { flex: 1 },
  profileRowLabel: { ...typography.labelSmall, color: darkColors.textDisabled, marginBottom: 2 },
  profileRowValue: { ...typography.bodyMedium, color: darkColors.textPrimary },
  editProfileBtn: {
    backgroundColor: darkColors.primaryContainer,
    borderRadius: radius.xl,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[4],
    borderWidth: 1,
    borderColor: darkColors.primary,
  },
  editProfileBtnText: { ...typography.labelLarge, color: darkColors.primary, fontWeight: fontWeight.semibold },

  // Placeholder tab
  placeholderTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  placeholderIcon: { fontSize: 56 },
  placeholderLabel: { ...typography.h3, color: darkColors.textPrimary },
  placeholderHint:  { ...typography.bodySmall, color: darkColors.textDisabled },
});
