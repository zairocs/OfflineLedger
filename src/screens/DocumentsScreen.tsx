// OfflineLedger — Documents Screen
// 2-col grid of user document images. Camera/gallery add, zoomable viewer, long-press delete.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ListRenderItem,
} from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { Q } from '@nozbe/watermelondb';
import { DocumentThumb, TILE_SIZE } from '../components/DocumentThumb';
import { BottomSheet } from '../components/BottomSheet';
import { useImagePicker } from '../hooks/useImagePicker';
import { Document } from '../db/models/Document';
import { database, documentsCollection } from '../db';
import { deletePrivateFile, toImageUri } from '../utils/fileStorage';
import { CustomModal } from '../components/CustomModal';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius, shadow } from '../theme/spacing';

interface DocumentsScreenProps {
  userId: string;
}

// ── Title Input Modal ────────────────────────────────────────────────────────

interface TitleModalProps {
  visible: boolean;
  imagePath: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}

function TitleModal({ visible, imagePath, onSave, onCancel }: TitleModalProps) {
  const [title, setTitle] = useState('');

  const handleSave = () => {
    const trimmed = title.trim();
    setTitle('');
    onSave(trimmed || 'Untitled');
  };

  const handleCancel = () => {
    setTitle('');
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.titleModal}>
          <Text style={styles.titleModalHeading}>Name this document</Text>
          <Text style={styles.titleModalHint}>
            e.g. "CNIC Front", "Contract", "Receipt"
          </Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Document title (optional)"
            placeholderTextColor={darkColors.textDisabled}
            autoFocus
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={styles.titleModalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Documents Screen ─────────────────────────────────────────────────────────

export function DocumentsScreen({ userId }: DocumentsScreenProps) {
  const [documents, setDocuments]           = useState<Document[]>([]);
  const [sheetVisible, setSheetVisible]     = useState(false);
  const [titleModalVisible, setTitleModal]  = useState(false);
  const [pendingImagePath, setPendingPath]  = useState<string>('');
  const [viewerVisible, setViewerVisible]   = useState(false);
  const [viewerIndex, setViewerIndex]       = useState(0);
  const [saving, setSaving]                 = useState(false);

  // ── Live DB subscription filtered by userId ──────────────────────────────
  useEffect(() => {
    const subscription = documentsCollection
      .query(Q.where('user_id', userId))
      .observe()
      .subscribe(docs => setDocuments(docs));
    return () => subscription.unsubscribe();
  }, [userId]);

  // ── Image picker — copies to private storage, then shows title prompt ─────
  const { pickFromCamera, pickFromGallery } = useImagePicker({
    subDir: `docs/${userId}`,
    onSuccess: (privatePath) => {
      setPendingPath(privatePath);
      setTitleModal(true);
    },
    onError: (msg) => Alert.alert('Photo Error', msg),
    onCancel: () => {},
  });

  // ── Save document to WatermelonDB ─────────────────────────────────────────
  const handleSaveDocument = useCallback(
    async (title: string) => {
      if (!pendingImagePath) return;
      setSaving(true);
      try {
        await database.write(async () => {
          await documentsCollection.create(record => {
            record.userId    = userId;
            record.title     = title;
            record.imagePath = pendingImagePath;
          });
        });
        setPendingPath('');
        setTitleModal(false);
      } catch (err: any) {
        Alert.alert('Save Failed', err?.message ?? 'Could not save document');
      } finally {
        setSaving(false);
      }
    },
    [pendingImagePath, userId],
  );

  // ── Cancel title entry — clean up the already-copied file ─────────────────
  const handleCancelTitle = useCallback(async () => {
    setTitleModal(false);
    if (pendingImagePath) {
      await deletePrivateFile(pendingImagePath);
      setPendingPath('');
    }
  }, [pendingImagePath]);

  // ── Open full-screen viewer ───────────────────────────────────────────────
  const handleDocPress = useCallback(
    (doc: Document) => {
      const idx = documents.findIndex(d => d.id === doc.id);
      setViewerIndex(Math.max(0, idx));
      setViewerVisible(true);
    },
    [documents],
  );

  // Delete document state
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<Document | null>(null);
  const [isDeletingDoc, setIsDeletingDoc]     = useState(false);

  // ── Long-press delete trigger ──────────────────────────────────────────────
  const handleDocLongPress = useCallback((doc: Document) => {
    setDeleteTargetDoc(doc);
  }, []);

  // ── Confirm delete document ────────────────────────────────────────────────
  const handleConfirmDeleteDoc = useCallback(async () => {
    if (!deleteTargetDoc) return;
    setIsDeletingDoc(true);
    try {
      if (deleteTargetDoc.imagePath) {
        await deletePrivateFile(deleteTargetDoc.imagePath);
      }
      await database.write(() => deleteTargetDoc.destroyPermanently());
      setDeleteTargetDoc(null);
    } catch (err) {
      console.warn('[DocumentsScreen] Delete doc error:', err);
    } finally {
      setIsDeletingDoc(false);
    }
  }, [deleteTargetDoc]);

  // ── Prepare image URL list for ImageViewer ────────────────────────────────
  const imageUrls = documents.map(doc => ({
    url: toImageUri(doc.imagePath) ?? '',
    props: { resizeMode: 'contain' as const },
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<Document> = useCallback(
    ({ item }) => (
      <DocumentThumb
        document={item}
        onPress={handleDocPress}
        onLongPress={handleDocLongPress}
      />
    ),
    [handleDocPress, handleDocLongPress],
  );

  const keyExtractor = useCallback((item: Document) => item.id, []);

  return (
    <View style={styles.screen}>
      {/* ── Document Grid ──────────────────────────────────────────────── */}
      <FlatList
        data={documents}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.gridContent,
          documents.length === 0 && styles.gridEmpty,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyTitle}>No documents yet</Text>
            <Text style={styles.emptyHint}>
              Tap the + button to add a photo from camera or gallery
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
      />

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={darkColors.textOnPrimary} />
        ) : (
          <Text style={styles.fabIcon}>+</Text>
        )}
      </TouchableOpacity>

      {/* ── Source Picker Bottom Sheet ───────────────────────────────────── */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="Add Document"
        subtitle="Choose a source for your document photo"
        actions={[
          {
            label: 'Take Photo',
            icon: '📷',
            onPress: pickFromCamera,
          },
          {
            label: 'Choose from Gallery',
            icon: '🖼️',
            onPress: pickFromGallery,
          },
        ]}
      />

      {/* ── Title Input Modal ────────────────────────────────────────────── */}
      <TitleModal
        visible={titleModalVisible}
        imagePath={pendingImagePath}
        onSave={handleSaveDocument}
        onCancel={handleCancelTitle}
      />

      {/* ── Full-screen Zoomable Viewer ──────────────────────────────────── */}
      <Modal
        visible={viewerVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerContainer}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.viewerCloseBtn}
            onPress={() => setViewerVisible(false)}
          >
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>

          {/* Document title at top */}
          {documents[viewerIndex] && (
            <View style={styles.viewerTitleBar}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {documents[viewerIndex].title || 'Document'}
              </Text>
              <Text style={styles.viewerCounter}>
                {viewerIndex + 1} / {documents.length}
              </Text>
            </View>
          )}

          <ImageViewer
            imageUrls={imageUrls}
            index={viewerIndex}
            onChange={idx => setViewerIndex(idx ?? 0)}
            enableSwipeDown
            onSwipeDown={() => setViewerVisible(false)}
            onCancel={() => setViewerVisible(false)}
            saveToLocalByLongPress={false}
            enableImageZoom
            backgroundColor={darkColors.background}
            renderIndicator={() => null} // We render our own counter
            style={{ flex: 1 }}
          />
        </View>
      </Modal>

      {/* Delete Document Custom Modal (Danger: 2 buttons, Cancel gray & Delete Red) */}
      <CustomModal
        visible={Boolean(deleteTargetDoc)}
        title="Delete Document"
        icon="🗑️"
        variant="danger"
        message={
          deleteTargetDoc
            ? `Delete "${deleteTargetDoc.title || 'this document'}"? This cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        loading={isDeletingDoc}
        onConfirm={handleConfirmDeleteDoc}
        onCancel={() => setDeleteTargetDoc(null)}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkColors.background },

  // Grid
  gridContent: {
    padding: spacing[4],
    paddingBottom: 90,
    gap: spacing[2],
  },
  gridEmpty: { flex: 1 },
  row: {
    gap: spacing[2],
    justifyContent: 'flex-start',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  emptyIcon:  { fontSize: 64 },
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

  // Title modal
  modalOverlay: {
    flex: 1,
    backgroundColor: darkColors.overlay,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  titleModal: {
    backgroundColor: darkColors.surface,
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[3],
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  titleModalHeading: {
    ...typography.h3,
    color: darkColors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  titleModalHint: {
    ...typography.bodySmall,
    color: darkColors.textSecondary,
    marginTop: -spacing[1],
  },
  titleInput: {
    backgroundColor: darkColors.surfaceVariant,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...typography.bodyMedium,
    color: darkColors.textPrimary,
  },
  titleModalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: spacing[2] + 2,
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
  },
  cancelBtnText: {
    ...typography.labelLarge,
    color: darkColors.textSecondary,
  },
  saveBtn: {
    paddingVertical: spacing[2] + 2,
    paddingHorizontal: spacing[5],
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
  },
  saveBtnText: {
    ...typography.labelLarge,
    color: darkColors.textOnPrimary,
    fontWeight: fontWeight.bold,
  },

  // Full-screen viewer
  viewerContainer: {
    flex: 1,
    backgroundColor: darkColors.background,
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: spacing[10],
    right: spacing[4],
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: fontWeight.bold,
  },
  viewerTitleBar: {
    position: 'absolute',
    top: spacing[10],
    left: spacing[4],
    right: 60,
    zIndex: 10,
    gap: 2,
  },
  viewerTitle: {
    ...typography.h3,
    color: '#FFFFFF',
    fontWeight: fontWeight.semibold,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  viewerCounter: {
    ...typography.labelSmall,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
