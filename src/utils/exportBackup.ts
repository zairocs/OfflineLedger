// OfflineLedger — Backup & Restore Utility
// Export: copies DB + media files → zips → saves to accessible storage.
// Restore: picks ZIP via document picker → unzips → overwrites files → prompts restart.
import RNFS from 'react-native-fs';
import { zip, unzip } from 'react-native-zip-archive';
import { pick, saveDocuments, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { Alert, Share } from 'react-native';
import { storage, StorageKeys } from './storage';
import { useAuthStore } from '../store/useAuthStore';

// ── Path helpers ──────────────────────────────────────────────────────────────

/** All user media (avatars + docs) */
const MEDIA_DIR = RNFS.DocumentDirectoryPath;

/** Temp dir used for assembling the backup archive */
const TEMP_BACKUP_DIR = `${RNFS.CachesDirectoryPath}/ol_backup_temp`;

/** Temp dir used for unzipping a restore archive */
const TEMP_RESTORE_DIR = `${RNFS.CachesDirectoryPath}/ol_restore_temp`;

// ── Database finder helper ───────────────────────────────────────────────────

// ── Database finder helper ───────────────────────────────────────────────────

async function findDatabasePath(): Promise<string | null> {
  const filesDir = RNFS.DocumentDirectoryPath;
  const appDataDir = filesDir.replace(/\/files$/, '');
  const candidateDirs = [appDataDir, `${appDataDir}/databases`, filesDir];
  const candidateNames = [
    'rb_co.db',
    'rb_co',
    'offlineledger.db',
    'offlineledger',
    'watermelon.db',
    'watermelon',
    'watermelondb.db',
  ];

  for (const dir of candidateDirs) {
    if (await RNFS.exists(dir)) {
      for (const name of candidateNames) {
        const fullPath = `${dir}/${name}`;
        if (await RNFS.exists(fullPath)) {
          try {
            const stat = await RNFS.stat(fullPath);
            if (stat.size > 0) {
              return fullPath;
            }
          } catch (e) {
            // Ignore stat error
          }
        }
      }
    }
  }

  // Fallback: Return any non-zero DB file
  for (const dir of candidateDirs) {
    if (await RNFS.exists(dir)) {
      try {
        const items = await RNFS.readDir(dir);
        for (const item of items) {
          if (
            item.isFile() &&
            item.size > 0 &&
            (item.name.endsWith('.db') ||
              item.name.includes('ledger') ||
              item.name.includes('watermelon'))
          ) {
            return item.path;
          }
        }
      } catch (e) {
        // Skip unreadable dirs
      }
    }
  }
  return null;
}

async function ensureDatabasePath(): Promise<string> {
  const existing = await findDatabasePath();
  if (existing) return existing;

  const filesDir = RNFS.DocumentDirectoryPath;
  const appDataDir = filesDir.replace(/\/files$/, '');
  const defaultDbPath = `${appDataDir}/offlineledger.db`;

  if (!(await RNFS.exists(defaultDbPath))) {
    await RNFS.writeFile(defaultDbPath, '', 'utf8').catch(() => {});
  }
  return defaultDbPath;
}

// ── Timestamp helper ──────────────────────────────────────────────────────────

function timestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
}

// ── Recursive directory copy helper ─────────────────────────────────────────

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  const destExists = await RNFS.exists(dest);
  if (!destExists) await RNFS.mkdir(dest);

  try {
    const items = await RNFS.readDir(src);
    for (const item of items) {
      // Ignore cache/temp backup dirs
      if (item.name.startsWith('ol_backup') || item.name.startsWith('ol_restore')) continue;
      const destPath = `${dest}/${item.name}`;
      if (item.isDirectory()) {
        await copyDirRecursive(item.path, destPath);
      } else {
        await RNFS.copyFile(item.path, destPath).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[copyDirRecursive] Error listing directory:', src, err);
  }
}

// ── EXPORT ───────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<string> {
  // 1. Clean + create temp assembly dir
  if (await RNFS.exists(TEMP_BACKUP_DIR)) {
    await RNFS.unlink(TEMP_BACKUP_DIR).catch(() => {});
  }
  await RNFS.mkdir(TEMP_BACKUP_DIR);

  try {
    // 2. Ensure SQLite DB path exists (creates file if not initialized yet)
    const dbPath = await ensureDatabasePath();
    await RNFS.copyFile(dbPath, `${TEMP_BACKUP_DIR}/rb_co.db`);
    await RNFS.copyFile(dbPath, `${TEMP_BACKUP_DIR}/offlineledger.db`);

    // Copy WAL / SHM files if present so uncommitted transactions are included
    const walPath = `${dbPath}-wal`;
    if (await RNFS.exists(walPath)) {
      await RNFS.copyFile(walPath, `${TEMP_BACKUP_DIR}/rb_co.db-wal`).catch(() => {});
      await RNFS.copyFile(walPath, `${TEMP_BACKUP_DIR}/offlineledger.db-wal`).catch(() => {});
    }
    const shmPath = `${dbPath}-shm`;
    if (await RNFS.exists(shmPath)) {
      await RNFS.copyFile(shmPath, `${TEMP_BACKUP_DIR}/rb_co.db-shm`).catch(() => {});
      await RNFS.copyFile(shmPath, `${TEMP_BACKUP_DIR}/offlineledger.db-shm`).catch(() => {});
    }

    // 3. Copy media directory (avatars + docs)
    const mediaExists = await RNFS.exists(MEDIA_DIR);
    if (mediaExists) {
      await copyDirRecursive(MEDIA_DIR, `${TEMP_BACKUP_DIR}/media`);
    }

    // 4. Create ZIP archive in guaranteed-writable Cache directory
    const fileName = `RB_Co_backup_${timestamp()}.zip`;
    const primaryZipPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

    if (await RNFS.exists(primaryZipPath)) {
      await RNFS.unlink(primaryZipPath).catch(() => {});
    }

    await zip(TEMP_BACKUP_DIR, primaryZipPath);

    // 5. Attempt direct copy to Downloads directory
    let savedPath = '';
    const downloadsPathsToTry = [
      RNFS.DownloadDirectoryPath ? `${RNFS.DownloadDirectoryPath}/${fileName}` : null,
      '/storage/emulated/0/Download/' + fileName,
      '/sdcard/Download/' + fileName,
      RNFS.ExternalDirectoryPath ? `${RNFS.ExternalDirectoryPath}/${fileName}` : null,
    ].filter(Boolean) as string[];

    for (const targetPath of downloadsPathsToTry) {
      try {
        if (await RNFS.exists(targetPath)) {
          await RNFS.unlink(targetPath).catch(() => {});
        }
        await RNFS.copyFile(primaryZipPath, targetPath);
        savedPath = targetPath;
        break;
      } catch (e) {
        // Continue trying next location
      }
    }

    // 6. If direct filesystem copy failed (due to Scoped Storage), trigger native Save Documents dialog
    if (!savedPath) {
      const sourceUri = primaryZipPath.startsWith('file://') ? primaryZipPath : `file://${primaryZipPath}`;
      const saveResults = await saveDocuments({
        sourceUris: [sourceUri],
        mimeType: 'application/zip',
        fileName,
      });

      const firstSaved = saveResults?.[0];
      if (firstSaved?.uri) {
        savedPath = firstSaved.uri;
      } else if (firstSaved?.error) {
        throw new Error(`Failed to save backup: ${firstSaved.error}`);
      } else {
        savedPath = primaryZipPath;
      }
    }

    // Record last backup time
    storage.set(StorageKeys.BACKUP_LAST_AT, new Date().toISOString());
    return savedPath;
  } finally {
    // Clean up temp assembly dir
    await RNFS.unlink(TEMP_BACKUP_DIR).catch(() => {});
  }
}

// ── RESTORE ──────────────────────────────────────────────────────────────────

export async function restoreBackup(): Promise<void> {
  // Disable auto-lock during document picking
  useAuthStore.getState().setPickingMedia(true);

  let results;
  try {
    results = await pick({
      type: [types.zip, 'application/zip', 'application/x-zip-compressed', '*/*'],
      copyTo: 'cachesDirectory',
    });
  } catch (err: any) {
    useAuthStore.getState().setPickingMedia(false);
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return; // User cancelled
    throw err;
  } finally {
    useAuthStore.getState().setPickingMedia(false);
  }

  const result = results?.[0];
  if (!result) return;

  const uri = result.uri;
  const fileCopyUri = (result as any).fileCopyUri;
  const rawUri = fileCopyUri || uri;
  if (!rawUri) throw new Error('Could not access the selected backup file.');

  const fileName = result.name ?? rawUri;
  if (
    !fileName.toLowerCase().endsWith('.zip') &&
    !rawUri.toLowerCase().endsWith('.zip') &&
    !uri.toLowerCase().endsWith('.zip')
  ) {
    throw new Error('Please select a valid .zip backup file.');
  }

  // 1. Prepare local cached path for unzipping
  const localZipPath = `${RNFS.CachesDirectoryPath}/ol_restore_archive.zip`;
  if (await RNFS.exists(localZipPath)) {
    await RNFS.unlink(localZipPath).catch(() => {});
  }

  let fileCopied = false;

  // Option A: Try copying from fileCopyUri if it's a valid local file path
  if (fileCopyUri && typeof fileCopyUri === 'string') {
    const cleanCopyPath = decodeURIComponent(fileCopyUri).replace(/^file:\/\//, '');
    try {
      if (await RNFS.exists(cleanCopyPath)) {
        await RNFS.copyFile(cleanCopyPath, localZipPath);
        fileCopied = await RNFS.exists(localZipPath);
      }
    } catch (e) {
      console.warn('[restoreBackup] Copy from fileCopyUri failed:', e);
    }
  }

  // Option B: Resolve raw file path if URI contains document/raw:
  if (!fileCopied && uri && uri.startsWith('content://')) {
    const rawMatch = uri.match(/document\/raw%3A(.+)$/i) || uri.match(/document\/raw:(.+)$/i);
    if (rawMatch?.[1]) {
      const rawPath = decodeURIComponent(rawMatch[1]);
      try {
        if (await RNFS.exists(rawPath)) {
          await RNFS.copyFile(rawPath, localZipPath);
          fileCopied = await RNFS.exists(localZipPath);
        }
      } catch (e) {
        console.warn('[restoreBackup] Copy from rawPath failed:', e);
      }
    }
  }

  // Option C: Try direct copy if raw URI is a file:// path
  if (!fileCopied && rawUri.startsWith('file://')) {
    const cleanRawPath = decodeURIComponent(rawUri).replace(/^file:\/\//, '');
    try {
      if (await RNFS.exists(cleanRawPath)) {
        await RNFS.copyFile(cleanRawPath, localZipPath);
        fileCopied = await RNFS.exists(localZipPath);
      }
    } catch (e) {
      console.warn('[restoreBackup] Direct file:// copy failed:', e);
    }
  }

  // Option D (Failsafe for Android ContentProvider URIs like msf:35):
  // Reads content stream via RNFS.readFile(uri, 'base64') and writes to localZipPath
  if (!fileCopied && uri && uri.startsWith('content://')) {
    try {
      const base64Data = await RNFS.readFile(uri, 'base64');
      if (base64Data && base64Data.length > 0) {
        await RNFS.writeFile(localZipPath, base64Data, 'base64');
        fileCopied = await RNFS.exists(localZipPath);
      }
    } catch (base64Err) {
      console.warn('[restoreBackup] ContentProvider base64 read failed:', base64Err);
    }
  }

  if (!fileCopied || !(await RNFS.exists(localZipPath))) {
    throw new Error(
      'Could not read the selected backup file. Please select the .zip file directly from your Downloads folder.',
    );
  }

  // 2. Clean + create temp restore dir
  if (await RNFS.exists(TEMP_RESTORE_DIR)) {
    await RNFS.unlink(TEMP_RESTORE_DIR).catch(() => {});
  }
  await RNFS.mkdir(TEMP_RESTORE_DIR);

  // 3. Unzip
  await unzip(localZipPath, TEMP_RESTORE_DIR);

  // 4. Locate database file in extracted directory (checking rb_co.db, offlineledger.db, or any .db)
  let dbRestorePath = '';
  const possibleDbNames = ['rb_co.db', 'offlineledger.db', 'watermelon.db'];

  for (const name of possibleDbNames) {
    const candidate = `${TEMP_RESTORE_DIR}/${name}`;
    if (await RNFS.exists(candidate)) {
      dbRestorePath = candidate;
      break;
    }
  }

  if (!dbRestorePath) {
    try {
      const items = await RNFS.readDir(TEMP_RESTORE_DIR);
      for (const item of items) {
        if (item.isFile() && item.name.endsWith('.db')) {
          dbRestorePath = item.path;
          break;
        } else if (item.isDirectory()) {
          const subItems = await RNFS.readDir(item.path);
          for (const sub of subItems) {
            if (sub.isFile() && sub.name.endsWith('.db')) {
              dbRestorePath = sub.path;
              break;
            }
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!dbRestorePath || !(await RNFS.exists(dbRestorePath))) {
    await RNFS.unlink(TEMP_RESTORE_DIR).catch(() => {});
    await RNFS.unlink(localZipPath).catch(() => {});
    throw new Error(
      'Invalid backup file. The selected ZIP does not contain a valid RB Co. database.',
    );
  }

  // 5. Restore DB file to both root appDataDir and databases subfolder
  const filesDir = RNFS.DocumentDirectoryPath;
  const appDataDir = filesDir.replace(/\/files$/, '');
  const dbDir = `${appDataDir}/databases`;
  if (!(await RNFS.exists(dbDir))) await RNFS.mkdir(dbDir).catch(() => {});

  const targets = [
    `${appDataDir}/offlineledger.db`,
    `${appDataDir}/rb_co.db`,
    `${dbDir}/offlineledger.db`,
    `${dbDir}/rb_co.db`,
  ];

  for (const target of targets) {
    if (await RNFS.exists(target)) await RNFS.unlink(target).catch(() => {});
    await RNFS.copyFile(dbRestorePath, target).catch(() => {});
  }

  // Check if restored archive includes WAL/SHM files
  const subFolder = dbRestorePath.substring(0, dbRestorePath.lastIndexOf('/'));
  const restoredWal = `${subFolder}/offlineledger.db-wal`;
  if (await RNFS.exists(restoredWal)) {
    await RNFS.copyFile(restoredWal, `${appDataDir}/offlineledger.db-wal`).catch(() => {});
    await RNFS.copyFile(restoredWal, `${dbDir}/offlineledger.db-wal`).catch(() => {});
  } else {
    // Unlink old WAL/SHM/journal files so SQLite reads fresh database state
    await RNFS.unlink(`${appDataDir}/offlineledger.db-wal`).catch(() => {});
    await RNFS.unlink(`${appDataDir}/offlineledger.db-shm`).catch(() => {});
    await RNFS.unlink(`${appDataDir}/offlineledger.db-journal`).catch(() => {});
    await RNFS.unlink(`${dbDir}/offlineledger.db-wal`).catch(() => {});
    await RNFS.unlink(`${dbDir}/offlineledger.db-shm`).catch(() => {});
    await RNFS.unlink(`${dbDir}/offlineledger.db-journal`).catch(() => {});
  }

  // 6. Restore media files
  let mediaRestoreDir = `${TEMP_RESTORE_DIR}/media`;
  if (!(await RNFS.exists(mediaRestoreDir))) {
    try {
      const items = await RNFS.readDir(TEMP_RESTORE_DIR);
      for (const item of items) {
        if (item.isDirectory()) {
          const subMedia = `${item.path}/media`;
          if (await RNFS.exists(subMedia)) {
            mediaRestoreDir = subMedia;
            break;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  if (await RNFS.exists(mediaRestoreDir)) {
    await copyDirRecursive(mediaRestoreDir, MEDIA_DIR);
  }

  // 7. Clean up temp files
  await RNFS.unlink(TEMP_RESTORE_DIR).catch(() => {});
  await RNFS.unlink(localZipPath).catch(() => {});
}
