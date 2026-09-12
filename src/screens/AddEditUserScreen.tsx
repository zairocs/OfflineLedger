// OfflineLedger — Add / Edit User Screen (Full Implementation)
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Avatar } from '../components/Avatar';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { useImagePicker } from '../hooks/useImagePicker';
import { database, usersCollection } from '../db';
import { User } from '../db/models/User';
import { deletePrivateFile } from '../utils/fileStorage';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';
import { UserStackParamList } from '../navigation/UserStackNavigator';
import {
  formatPhoneInput,
  formatCnicInput,
  isValidPhone,
  isValidCnic,
} from '../utils/formatters';

type RouteProps = RouteProp<UserStackParamList, 'AddEditUser'>;

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  cnic: string;
  avatarPath: string;
  totalBalance: string;
}

export function AddEditUserScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const userId = route.params?.userId;
  const isEdit = Boolean(userId);

  const scrollRef = useRef<ScrollView>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  const [existingUser, setExistingUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    phone: '',
    email: '',
    address: '',
    cnic: '',
    avatarPath: '',
    totalBalance: '',
  });
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [isDeleting, setIsDeleting]                     = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        setKeyboardPadding(e.endCoordinates.height + 20);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardPadding(0);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: 'RB Co.',
    });
  }, [navigation]);

  // Load existing user data if editing
  useEffect(() => {
    if (!userId) return;
    usersCollection.find(userId).then(user => {
      setExistingUser(user);
      setForm({
        name: user.name ?? '',
        phone: user.phone ?? '',
        email: user.email ?? '',
        address: user.address ?? '',
        cnic: user.cnic ?? '',
        avatarPath: user.avatarPath ?? '',
        totalBalance: String(user.totalBalance ?? 0),
      });
    });
  }, [userId]);

  const setField = useCallback(
    (key: keyof FormState) => (value: string) => {
      let formatted = value;
      if (key === 'phone') formatted = formatPhoneInput(value);
      if (key === 'cnic') formatted = formatCnicInput(value);
      setForm(prev => ({ ...prev, [key]: formatted }));
    },
    [],
  );

  // Avatar picker — images go straight to private storage
  const { pickFromCamera, pickFromGallery } = useImagePicker({
    subDir: 'avatars',
    onSuccess: path => setField('avatarPath')(path),
    onError: msg => Alert.alert('Photo Error', msg),
  });

  const showAvatarPicker = useCallback(() => {
    Alert.alert('Profile Photo', 'Choose a source', [
      { text: 'Camera', onPress: pickFromCamera },
      { text: 'Choose from Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromGallery]);

  const validate = (): boolean => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Please enter the client\'s full name.');
      return false;
    }
    if (!form.phone.trim()) {
      Alert.alert('Required', 'Please enter a phone number.');
      return false;
    }
    if (!isValidPhone(form.phone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid Pakistani phone number (e.g. 03xx-xxxxxxx).');
      return false;
    }
    if (form.cnic.trim() && !isValidCnic(form.cnic)) {
      Alert.alert('Invalid CNIC Format', 'CNIC must be 13 digits (e.g. 33303-3333333-3).');
      return false;
    }
    return true;
  };

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const balance = parseFloat(form.totalBalance) || 0;

      if (isEdit && existingUser) {
        await existingUser.updateDetails({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          cnic: form.cnic.trim(),
          avatarPath: form.avatarPath,
          totalBalance: balance,
        });
      } else {
        await database.write(async () => {
          await usersCollection.create(record => {
            record.name = form.name.trim();
            record.phone = form.phone.trim();
            record.email = form.email.trim();
            record.address = form.address.trim();
            record.cnic = form.cnic.trim();
            record.avatarPath = form.avatarPath;
            record.totalBalance = balance;
          });
        });
      }

      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Could not save client');
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, existingUser, navigation]);

  const handleDeleteClient = useCallback(async () => {
    if (!existingUser) return;
    setIsDeleting(true);
    try {
      if (existingUser.avatarPath) {
        await deletePrivateFile(existingUser.avatarPath);
      }
      await existingUser.deleteWithRelated();
      setConfirmDeleteVisible(false);
      navigation.goBack();
    } catch (err: any) {
      console.warn('[AddEditUserScreen] Delete client failed:', err);
      Alert.alert('Error', 'Could not delete client');
    } finally {
      setIsDeleting(false);
    }
  }, [existingUser, navigation]);

  const handleFieldFocus = useCallback((yOffset?: number) => {
    setTimeout(() => {
      if (yOffset !== undefined) {
        scrollRef.current?.scrollTo({ y: yOffset, animated: true });
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    }, 150);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing[12] + keyboardPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title Area */}
        <View style={styles.titleArea}>
          <Text style={styles.screenTitle}>{isEdit ? 'Edit Client' : 'Add Client'}</Text>
          <Text style={styles.screenSubtitle}>
            {isEdit ? 'Update client details and record' : 'Create a new client profile'}
          </Text>
        </View>

        {/* Avatar picker at top */}
        <View style={styles.avatarSection}>
          <Avatar
            name={form.name || 'W'}
            avatarPath={form.avatarPath}
            size={96}
            onPress={showAvatarPicker}
          />
          <TouchableOpacity onPress={showAvatarPicker} style={styles.changePhotoBtn}>
            <Text style={styles.changePhotoText}>
              {form.avatarPath ? 'Change Photo' : 'Add Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Section: Basic Info */}
        <SectionLabel text="Basic Information" />

        <Field
          label="Full Name *"
          value={form.name}
          onChange={setField('name')}
          placeholder="e.g. Ali Hassan"
          autoCapitalize="words"
          onFocusOffset={() => handleFieldFocus(60)}
        />
        <Field
          label="Phone Number *"
          value={form.phone}
          onChange={setField('phone')}
          placeholder="e.g. 03xx-xxxxxxx"
          keyboardType="phone-pad"
          onFocusOffset={() => handleFieldFocus(140)}
        />
        <Field
          label="CNIC"
          value={form.cnic}
          onChange={setField('cnic')}
          placeholder="e.g. 42201-1234567-1"
          keyboardType="numeric"
          onFocusOffset={() => handleFieldFocus(220)}
        />

        {/* Section: Optional Details */}
        <SectionLabel text="Additional Details" />

        <Field
          label="Email"
          value={form.email}
          onChange={setField('email')}
          placeholder="e.g. ali@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          onFocusOffset={() => handleFieldFocus(320)}
        />
        <Field
          label="Address"
          value={form.address}
          onChange={setField('address')}
          placeholder="e.g. House 5, Block B, Karachi"
          multiline
          onFocusOffset={() => handleFieldFocus(420)}
        />

        {/* Section: Balance */}
        <SectionLabel text="Balance" />

        <Field
          label="Total Balance (PKR)"
          value={form.totalBalance}
          onChange={setField('totalBalance')}
          placeholder="0"
          keyboardType="numeric"
          hint="This is the total salary or agreed amount for this client"
          onFocusOffset={() => handleFieldFocus(480)}
        />

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={darkColors.textOnPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>
              {isEdit ? 'Save Changes' : 'Add Client'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Delete Client button (Only shown in Edit mode) */}
        {isEdit && existingUser && (
          <TouchableOpacity
            style={styles.deleteClientBtn}
            onPress={() => setConfirmDeleteVisible(true)}
            disabled={saving || isDeleting}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteClientBtnText}>🗑 Delete Client Profile</Text>
          </TouchableOpacity>
        )}

        {/* Delete Confirmation Popup */}
        <ConfirmDeleteModal
          visible={confirmDeleteVisible}
          title="Delete Client"
          message={
            existingUser
              ? `Are you sure you want to permanently delete ${existingUser.name} and ALL associated records (documents, notes, balance)?`
              : ''
          }
          loading={isDeleting}
          onConfirm={handleDeleteClient}
          onCancel={() => setConfirmDeleteVisible(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.text}>{text}</Text>
      <View style={sectionStyles.line} />
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  hint?: string;
  onFocusOffset?: () => void;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  hint,
  onFocusOffset,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[
          fieldStyles.input,
          multiline && fieldStyles.inputMultiline,
          focused && fieldStyles.inputFocused,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={darkColors.textDisabled}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        onFocus={() => {
          setFocused(true);
          onFocusOffset?.();
        }}
        onBlur={() => setFocused(false)}
      />
      {hint && <Text style={fieldStyles.hint}>{hint}</Text>}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkColors.background },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[12],
    gap: spacing[1],
  },
  titleArea: {
    paddingBottom: spacing[4],
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing[5],
    gap: spacing[2],
  },
  changePhotoBtn: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[4],
  },
  changePhotoText: {
    ...typography.labelMedium,
    color: darkColors.primary,
    fontWeight: fontWeight.semibold,
  },
  saveBtn: {
    backgroundColor: darkColors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[6],
    ...{
      shadowColor: darkColors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    ...typography.labelLarge,
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
    fontSize: 16,
  },
  deleteClientBtn: {
    backgroundColor: 'rgba(229, 57, 53, 0.12)',
    borderRadius: radius.xl,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[3],
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.35)',
  },
  deleteClientBtnText: {
    ...typography.labelLarge,
    color: '#E53935',
    fontWeight: fontWeight.bold,
    fontSize: 15,
  },
});

const sectionStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[5],
    marginBottom: spacing[2],
    gap: spacing[3],
  },
  text: {
    ...typography.labelSmall,
    color: darkColors.primary,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: darkColors.divider,
  },
});

const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing[3] },
  label: {
    ...typography.labelSmall,
    color: darkColors.textSecondary,
    marginBottom: spacing[1],
    marginLeft: spacing[1],
  },
  input: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...typography.bodyMedium,
    color: darkColors.textPrimary,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputFocused: {
    borderColor: darkColors.primary,
    borderWidth: 1.5,
  },
  hint: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    marginTop: spacing[1],
    marginLeft: spacing[1],
  },
});
