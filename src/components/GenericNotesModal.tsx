// OfflineLedger — Generic Notes Modal
// Generic notepad modal with Search, Date Picker Scroller, Pagination, and Delete Confirmation.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { Note } from '../db/models/Note';
import { database, notesCollection } from '../db';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius, shadow } from '../theme/spacing';
import { formatDateTimeDay } from '../utils/formatters';

// ── Date Helper Utilities ───────────────────────────────────────────────────

function getIsoDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateDateChips() {
  const chips = [];
  const now = new Date();

  chips.push({ id: 'all', label: 'All Dates' });
  chips.push({ id: 'today', label: 'Today' });
  chips.push({ id: 'yesterday', label: 'Yesterday' });
  chips.push({ id: 'this_week', label: 'This Week' });
  chips.push({ id: 'this_month', label: 'This Month' });

  // Add chips for past 10 specific days
  for (let i = 2; i < 12; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const iso = getIsoDateString(d);
    const dayLabel = d.toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric' });
    chips.push({ id: iso, label: dayLabel });
  }

  chips.push({ id: 'custom_picker', label: '📅 Pick Date' });
  return chips;
}

// ── Custom Dark Date Picker Modal ───────────────────────────────────────────

interface CustomDatePickerModalProps {
  visible: boolean;
  selectedDate: string;
  onSelectDate: (isoDate: string) => void;
  onClose: () => void;
}

function CustomDatePickerModal({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
}: CustomDatePickerModalProps) {
  const now = new Date();
  const initialDate = selectedDate && selectedDate.includes('-') ? new Date(selectedDate) : now;

  const [year, setYear]   = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth());
  const [day, setDay]     = useState(initialDate.getDate());

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray   = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const yearsArray  = [2024, 2025, 2026, 2027];

  const handleApply = () => {
    const validDay = Math.min(day, daysInMonth);
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(validDay).padStart(2, '0');
    const iso = `${year}-${mStr}-${dStr}`;
    onSelectDate(iso);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.card}>
          <Text style={pickerStyles.title}>📅 Select Filter Date</Text>

          {/* Month Selector */}
          <Text style={pickerStyles.label}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scroller}>
            {MONTHS.map((mName, idx) => (
              <TouchableOpacity
                key={mName}
                style={[pickerStyles.chip, month === idx && pickerStyles.chipActive]}
                onPress={() => setMonth(idx)}
                activeOpacity={0.75}
              >
                <Text style={[pickerStyles.chipText, month === idx && pickerStyles.chipTextActive]}>
                  {mName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Day Selector */}
          <Text style={pickerStyles.label}>Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scroller}>
            {daysArray.map(dNum => (
              <TouchableOpacity
                key={dNum}
                style={[pickerStyles.chip, day === dNum && pickerStyles.chipActive]}
                onPress={() => setDay(dNum)}
                activeOpacity={0.75}
              >
                <Text style={[pickerStyles.chipText, day === dNum && pickerStyles.chipTextActive]}>
                  {dNum}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Year Selector */}
          <Text style={pickerStyles.label}>Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scroller}>
            {yearsArray.map(yNum => (
              <TouchableOpacity
                key={yNum}
                style={[pickerStyles.chip, year === yNum && pickerStyles.chipActive]}
                onPress={() => setYear(yNum)}
                activeOpacity={0.75}
              >
                <Text style={[pickerStyles.chipText, year === yNum && pickerStyles.chipTextActive]}>
                  {yNum}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Actions */}
          <View style={pickerStyles.actions}>
            <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose}>
              <Text style={pickerStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pickerStyles.applyBtn} onPress={handleApply}>
              <Text style={pickerStyles.applyText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Generic Notes Modal Component ───────────────────────────────────────────

interface GenericNotesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function GenericNotesModal({ visible, onClose }: GenericNotesModalProps) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes]     = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor mode state
  const [isEditing, setIsEditing]       = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editContent, setEditContent]   = useState('');
  const [isSaving, setIsSaving]         = useState(false);

  // Search, Date Filter & Pagination State
  const PAGE_SIZE = 12;
  const [searchQuery, setSearchQuery]               = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState('all');
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false);
  const [page, setPage]                             = useState(1);

  // Custom delete popup state
  const [deleteTargetNote, setDeleteTargetNote] = useState<Note | null>(null);
  const [isDeleting, setIsDeleting]             = useState(false);

  const dateChips = generateDateChips();

  // Subscribe to generic notes (user_id = 'generic')
  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    const subscription = notesCollection
      .query(Q.where('user_id', 'generic'))
      .observe()
      .subscribe(rows => {
        // Sort newest updated first
        const sorted = [...rows].sort((a, b) => {
          const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tB - tA;
        });
        setNotes(sorted);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [visible]);

  // Filter notes by text search AND date filter
  const filteredNotes = useMemo(() => {
    let result = notes;

    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => (n.content ?? '').toLowerCase().includes(q));
    }

    // 2. Date Filter
    if (selectedDateFilter !== 'all') {
      const now = new Date();
      const todayIso = getIsoDateString(now);

      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayIso = getIsoDateString(yesterday);

      result = result.filter(n => {
        if (!n.updatedAt) return false;
        const noteDate = new Date(n.updatedAt);
        const noteIso  = getIsoDateString(noteDate);

        if (selectedDateFilter === 'today') {
          return noteIso === todayIso;
        } else if (selectedDateFilter === 'yesterday') {
          return noteIso === yesterdayIso;
        } else if (selectedDateFilter === 'this_week') {
          const diffDays = (now.getTime() - noteDate.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 7;
        } else if (selectedDateFilter === 'this_month') {
          return (
            noteDate.getMonth() === now.getMonth() &&
            noteDate.getFullYear() === now.getFullYear()
          );
        } else {
          // Specific ISO date match (e.g. 2026-09-12)
          return noteIso === selectedDateFilter;
        }
      });
    }

    return result;
  }, [notes, searchQuery, selectedDateFilter]);

  // Paginated list slice
  const paginatedNotes = useMemo(() => {
    return filteredNotes.slice(0, page * PAGE_SIZE);
  }, [filteredNotes, page, PAGE_SIZE]);

  const handleLoadMore = useCallback(() => {
    if (paginatedNotes.length < filteredNotes.length) {
      setPage(prev => prev + 1);
    }
  }, [paginatedNotes.length, filteredNotes.length]);

  // Open editor to create a new note
  const handleOpenCreate = useCallback(() => {
    setSelectedNote(null);
    setEditContent('');
    setIsEditing(true);
  }, []);

  // Open editor to edit an existing note
  const handleOpenEdit = useCallback((note: Note) => {
    setSelectedNote(note);
    setEditContent(note.content ?? '');
    setIsEditing(true);
  }, []);

  // Save (create or update) note
  const handleSaveNote = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      Alert.alert('Empty Note', 'Please enter some text for your note.');
      return;
    }

    setIsSaving(true);
    try {
      if (selectedNote) {
        await database.write(async () => {
          await selectedNote.saveContent(trimmed);
        });
      } else {
        await database.write(async () => {
          await notesCollection.create(r => {
            r.userId  = 'generic';
            r.content = trimmed;
          });
        });
      }
      setIsEditing(false);
      setSelectedNote(null);
      setEditContent('');
    } catch (err) {
      console.warn('[GenericNotesModal] Save note error:', err);
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [editContent, selectedNote]);

  // Confirm delete note handler
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTargetNote) return;
    setIsDeleting(true);
    try {
      await database.write(async () => {
        await deleteTargetNote.destroyPermanently();
      });
    } catch (err) {
      console.warn('[GenericNotesModal] Delete note error:', err);
      Alert.alert('Error', 'Failed to delete note.');
    } finally {
      setIsDeleting(false);
      setDeleteTargetNote(null);
    }
  }, [deleteTargetNote]);

  // Back from editor to list
  const handleBackToList = useCallback(() => {
    setIsEditing(false);
    setSelectedNote(null);
    setEditContent('');
  }, []);

  // Render item for the notes list
  const renderNoteItem: ListRenderItem<Note> = useCallback(
    ({ item }) => {
      const formattedDate = formatDateTimeDay(item.updatedAt);

      return (
        <View style={styles.noteCard}>
          <TouchableOpacity
            style={styles.noteCardContent}
            onPress={() => handleOpenEdit(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.noteContent} numberOfLines={4}>
              {item.content || 'Untitled Note'}
            </Text>
          </TouchableOpacity>

          <View style={styles.noteFooter}>
            <Text style={styles.noteDate}>{formattedDate}</Text>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleOpenEdit(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Text style={styles.actionIcon}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setDeleteTargetNote(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Text style={styles.actionIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    },
    [handleOpenEdit],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        if (isEditing) {
          handleBackToList();
        } else {
          onClose();
        }
      }}
    >
      <KeyboardAvoidingView
        style={styles.modalScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header Bar */}
        <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, spacing[4]) + spacing[2] }]}>
          {isEditing ? (
            <TouchableOpacity onPress={handleBackToList} style={styles.headerBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.headerTitle}>📝 General Notes</Text>
          )}

          {isEditing ? (
            <TouchableOpacity
              onPress={handleSaveNote}
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={darkColors.textOnPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.headerRightActions}>
              <TouchableOpacity
                onPress={handleOpenCreate}
                style={styles.plusBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.plusBtnText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Modal Content */}
        {isEditing ? (
          /* Note Editor View */
          <View style={styles.editorContainer}>
            <TextInput
              style={styles.editorInput}
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Type your note here..."
              placeholderTextColor={darkColors.textDisabled}
              multiline
              textAlignVertical="top"
              autoFocus
              selectionColor={darkColors.primary}
            />
            <View style={styles.editorFooter}>
              <Text style={styles.charCountText}>
                {editContent.length.toLocaleString()} characters
              </Text>
              {selectedNote?.updatedAt && (
                <Text style={styles.editorDateText}>
                  Last edited: {formatDateTimeDay(selectedNote.updatedAt)}
                </Text>
              )}
            </View>
          </View>
        ) : loading ? (
          /* Loading State */
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={darkColors.primary} />
          </View>
        ) : notes.length === 0 ? (
          /* Empty Notes State */
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>No General Notes</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button above to add your first note.
            </Text>
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={handleOpenCreate}
              activeOpacity={0.8}
            >
              <Text style={styles.addFirstBtnText}>+ Create Note</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Notes List View */
          <FlatList
            data={paginatedNotes}
            renderItem={renderNoteItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View style={styles.searchBarContainer}>
                {/* Search Input Bar */}
                <View style={styles.searchBar}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search notes..."
                    placeholderTextColor={darkColors.textDisabled}
                    value={searchQuery}
                    onChangeText={q => {
                      setSearchQuery(q);
                      setPage(1);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Text style={styles.clearBtn}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Horizontal Date Filter Scroller */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dateScrollerContent}
                  style={styles.dateScroller}
                >
                  {dateChips.map(chip => {
                    const isSelected = selectedDateFilter === chip.id;
                    return (
                      <TouchableOpacity
                        key={chip.id}
                        style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                        onPress={() => {
                          if (chip.id === 'custom_picker') {
                            setCustomDatePickerOpen(true);
                          } else {
                            setSelectedDateFilter(chip.id);
                            setPage(1);
                          }
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.dateChipText, isSelected && styles.dateChipTextSelected]}>
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Active Date Filter Reset Indicator */}
                {selectedDateFilter !== 'all' && (
                  <View style={styles.activeFilterBadgeRow}>
                    <Text style={styles.activeFilterLabel}>
                      Date Filter: <Text style={{ color: darkColors.primary, fontWeight: 'bold' }}>{selectedDateFilter}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedDateFilter('all')}>
                      <Text style={styles.clearDateFilterBtn}>Reset Date ✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.countText}>
                  Showing {paginatedNotes.length} of {filteredNotes.length} notes
                </Text>
              </View>
            }
          />
        )}

        {/* Delete Confirmation Popup */}
        <ConfirmDeleteModal
          visible={!!deleteTargetNote}
          title="Delete Note"
          message="Are you sure you want to permanently delete this note? This action cannot be undone."
          loading={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTargetNote(null)}
        />

        {/* Custom Dark Date Picker Modal */}
        <CustomDatePickerModal
          visible={customDatePickerOpen}
          selectedDate={selectedDateFilter.includes('-') ? selectedDateFilter : ''}
          onSelectDate={iso => {
            setSelectedDateFilter(iso);
            setPage(1);
          }}
          onClose={() => setCustomDatePickerOpen(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Date Picker Styles ───────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: darkColors.card,
    borderRadius: radius.xl,
    padding: spacing[5],
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.12)',
    ...shadow.lg,
  },
  title: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  label: {
    ...typography.labelSmall,
    color: darkColors.primary,
    fontWeight: fontWeight.bold,
    marginBottom: spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scroller: {
    marginBottom: spacing[4],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: darkColors.surfaceVariant,
    marginRight: spacing[2],
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  chipActive: {
    backgroundColor: darkColors.primary,
    borderColor: darkColors.primary,
  },
  chipText: {
    ...typography.labelMedium,
    color: darkColors.textSecondary,
  },
  chipTextActive: {
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.labelLarge,
    color: darkColors.textPrimary,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
  },
  applyText: {
    ...typography.labelLarge,
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },
});

// ── Main Screen Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalScreen: {
    flex: 1,
    backgroundColor: darkColors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingTop: Platform.OS === 'ios' ? spacing[10] : spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: darkColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  headerTitle: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  headerBtn: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  backBtnText: {
    ...typography.bodyLarge,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBtnText: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: darkColors.textOnPrimary,
    lineHeight: 24,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: darkColors.textPrimary,
  },
  saveBtn: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: darkColors.primary,
    borderRadius: radius.md,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },

  // List & Search styles
  searchBarContainer: {
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    gap: spacing[2],
  },
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMedium,
    color: darkColors.textPrimary,
    padding: 0,
    margin: 0,
  },
  clearBtn: {
    fontSize: 14,
    color: darkColors.textDisabled,
    paddingHorizontal: spacing[1],
  },

  // Date Scroller
  dateScroller: {
    marginTop: spacing[1],
  },
  dateScrollerContent: {
    paddingRight: spacing[4],
    gap: spacing[2],
  },
  dateChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    borderRadius: radius.full,
    backgroundColor: darkColors.surfaceVariant,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  dateChipSelected: {
    backgroundColor: darkColors.primary,
    borderColor: darkColors.primary,
  },
  dateChipText: {
    ...typography.labelSmall,
    color: darkColors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  dateChipTextSelected: {
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },

  activeFilterBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: darkColors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginTop: spacing[1],
  },
  activeFilterLabel: {
    ...typography.labelSmall,
    color: darkColors.textSecondary,
  },
  clearDateFilterBtn: {
    ...typography.labelSmall,
    color: darkColors.error,
    fontWeight: fontWeight.bold,
  },

  countText: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    textAlign: 'right',
    paddingRight: spacing[1],
    fontSize: 10,
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
  },
  noteCard: {
    backgroundColor: darkColors.card,
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: darkColors.cardBorder,
  },
  noteCardContent: {
    paddingBottom: spacing[1],
  },
  noteContent: {
    ...typography.bodyMedium,
    color: darkColors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing[3],
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: darkColors.divider,
  },
  noteDate: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  actionBtn: {
    padding: spacing[1],
  },
  actionIcon: {
    fontSize: 16,
  },

  // Editor styles
  editorContainer: {
    flex: 1,
    padding: spacing[4],
  },
  editorInput: {
    flex: 1,
    ...typography.bodyLarge,
    color: darkColors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  editorFooter: {
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: darkColors.divider,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCountText: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
  },
  editorDateText: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
  },

  // Empty & Loading states
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing[3],
  },
  emptyTitle: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.bold,
    marginBottom: spacing[1],
  },
  emptySubtitle: {
    ...typography.bodyMedium,
    color: darkColors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  addFirstBtn: {
    backgroundColor: darkColors.primary,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
  },
  addFirstBtnText: {
    ...typography.labelLarge,
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },
});
