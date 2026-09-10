// OfflineLedger — Generic Notes Modal
// Generic notepad modal allowing users to create, view, edit, and delete multiple global notes.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
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
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';
import { formatDateTimeDay } from '../utils/formatters';

interface GenericNotesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function GenericNotesModal({ visible, onClose }: GenericNotesModalProps) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor mode state
  const [isEditing, setIsEditing] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
        // Update existing
        await database.write(async () => {
          await selectedNote.saveContent(trimmed);
        });
      } else {
        // Create new
        await database.write(async () => {
          await notesCollection.create(r => {
            r.userId = 'generic';
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

  // Delete a note
  const handleDeleteNote = useCallback((note: Note) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                await note.destroyPermanently();
              });
            } catch (err) {
              console.warn('[GenericNotesModal] Delete note error:', err);
              Alert.alert('Error', 'Failed to delete note.');
            }
          },
        },
      ],
    );
  }, []);

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
        <TouchableOpacity
          style={styles.noteCard}
          onPress={() => handleOpenEdit(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.noteContent} numberOfLines={4}>
            {item.content || 'Untitled Note'}
          </Text>

          <View style={styles.noteFooter}>
            <Text style={styles.noteDate}>{formattedDate}</Text>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleOpenEdit(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.actionIcon}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDeleteNote(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.actionIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleOpenEdit, handleDeleteNote],
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
            data={notes}
            renderItem={renderNoteItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

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

  // List styles
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
