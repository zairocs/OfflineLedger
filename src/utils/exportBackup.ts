// OfflineLedger — Backup & Restore
// Records are dumped through WatermelonDB (ledger.json) so WAL/lock issues cannot
// produce an empty ZIP. SQLite files are copied only as a sidecar for older ZIPs.
import RNFS from 'react-native-fs';
import { zip, unzip } from 'react-native-zip-archive';
import { pick, keepLocalCopy, saveDocuments, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { storage, StorageKeys } from './storage';
import { useAuthStore } from '../store/useAuthStore';
import { database } from '../db';

export type RestoreBackupResult = 'restored' | 'cancelled';

const LEDGER_JSON = 'ledger.json';
const BACKUP_FORMAT_VERSION = 1;
const MEDIA_FOLDERS = ['avatars', 'docs'] as const;
const TABLE_NAMES = ['users', 'documents', 'notes', 'advance_entries'] as const;

const MEDIA_DIR = RNFS.DocumentDirectoryPath;
const TEMP_BACKUP_DIR = `${RNFS.CachesDirectoryPath}/ol_backup_temp`;
const TEMP_RESTORE_DIR = `${RNFS.CachesDirectoryPath}/ol_restore_temp`;
const PENDING_RESTORE_PATH = `${RNFS.DocumentDirectoryPath}/pending_restore.json`;

type LedgerDump = {
  version: number;
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, Record<string, unknown>[]>;
};

function toFsPath(uri: string): string {
  return decodeURIComponent(uri).replace(/^file:\/\//, '');
}

function appDataDir(): string {
  return RNFS.DocumentDirectoryPath.replace(/\/files\/?$/, '');
}

/** WatermelonDB Android stores SQLite beside the app data dir, not in /databases. */
function watermelonSqlitePath(): string {
  const name = database.adapter.dbName || 'offlineledger';
  return `${appDataDir()}/${name}.db`;
}

function isJournalFile(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('-wal') || n.includes('-shm') || n.includes('journal') || n.endsWith('.tmp');
}

function isDatabaseFile(name: string): boolean {
  const n = name.toLowerCase();
  if (isJournalFile(n)) return false;
  return n.includes('offlineledger') || n.includes('watermelon') || n.endsWith('.db');
}

async function copyFileForced(src: string, dest: string): Promise<void> {
  if (await RNFS.exists(dest)) {
    await RNFS.unlink(dest);
  }

  try {
    await RNFS.copyFile(src, dest);
  } catch {
    const destDir = dest.substring(0, dest.lastIndexOf('/'));
    if (destDir && !(await RNFS.exists(destDir))) {
      await RNFS.mkdir(destDir).catch(() => {});
    }
    const data = await RNFS.readFile(src, 'base64');
    await RNFS.writeFile(dest, data, 'base64');
  }

  if (!(await RNFS.exists(dest))) {
    throw new Error(`Failed to write restored file to ${dest}`);
  }
}

async function removeDirRecursive(dir: string): Promise<void> {
  if (!(await RNFS.exists(dir))) return;
  try {
    const items = await RNFS.readDir(dir);
    for (const item of items) {
      if (item.isDirectory()) {
        await removeDirRecursive(item.path);
      } else {
        await RNFS.unlink(item.path).catch(() => {});
      }
    }
  } catch {
    // Directory may already be gone.
  }
  await RNFS.unlink(dir).catch(() => {});
}

async function findFileRecursive(
  dir: string,
  matcher: (name: string) => boolean,
): Promise<string | null> {
  try {
    const items = await RNFS.readDir(dir);
    for (const item of items) {
      if (item.isFile() && matcher(item.name)) return item.path;
      if (item.isDirectory()) {
        const nested = await findFileRecursive(item.path, matcher);
        if (nested) return nested;
      }
    }
  } catch (e) {
    console.warn('[findFileRecursive] Error listing directory:', dir, e);
  }
  return null;
}

async function findDirRecursive(dir: string, targetName: string): Promise<string | null> {
  try {
    const items = await RNFS.readDir(dir);
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (item.name === targetName) return item.path;
      const nested = await findDirRecursive(item.path, targetName);
      if (nested) return nested;
    }
  } catch (e) {
    console.warn('[findDirRecursive] Error listing directory:', dir, e);
  }
  return null;
}

async function fileSize(path: string): Promise<number> {
  try {
    if (!(await RNFS.exists(path))) return 0;
    const stat = await RNFS.stat(path);
    return Number(stat.size ?? 0);
  } catch {
    return 0;
  }
}

async function dumpLedger(): Promise<LedgerDump> {
  return database.read(async () => {
    const data: LedgerDump['data'] = {};
    for (const table of TABLE_NAMES) {
      const records = await database.get(table).query().fetch();
      data[table] = records.map(record => ({ ...(record as { _raw: Record<string, unknown> })._raw }));
    }
    return {
      version: BACKUP_FORMAT_VERSION,
      schemaVersion: database.schema.version,
      exportedAt: new Date().toISOString(),
      data,
    };
  });
}

function recordCount(dump: LedgerDump): number {
  return TABLE_NAMES.reduce((sum, table) => sum + (dump.data[table]?.length ?? 0), 0);
}

async function checkpointSqlite(): Promise<void> {
  try {
    await database.adapter.unsafeExecute({
      sqls: [['PRAGMA wal_checkpoint(TRUNCATE);', []]],
    });
  } catch (e) {
    console.warn('[checkpointSqlite] WAL checkpoint skipped:', e);
  }
}

async function restoreLedgerDump(dump: LedgerDump): Promise<void> {
  if (!dump?.data || typeof dump.data !== 'object') {
    throw new Error('Invalid backup file. ledger.json is missing record data.');
  }

  await database.write(async () => {
    await database.unsafeResetDatabase();
  });

  await database.write(async () => {
    const operations = [];
    for (const table of TABLE_NAMES) {
      const collection = database.get(table);
      for (const raw of dump.data[table] ?? []) {
        if (!raw || (raw as { _status?: string })._status === 'deleted') continue;
        operations.push(collection.prepareCreateFromDirtyRaw({ ...raw, _changed: '' }));
      }
    }
    if (operations.length > 0) {
      await database.batch(operations);
    }
  });

  await checkpointSqlite();
}

export async function applyPendingRestore(): Promise<boolean> {
  if (!(await RNFS.exists(PENDING_RESTORE_PATH))) return false;

  const adapter = (database.adapter as { underlyingAdapter?: { initializingPromise?: Promise<void> } })
    .underlyingAdapter;
  if (adapter?.initializingPromise) {
    await adapter.initializingPromise;
  }

  console.log('[restoreBackup] Applying pending restore from cold start');
  const text = await RNFS.readFile(PENDING_RESTORE_PATH, 'utf8');
  const dump = JSON.parse(text) as LedgerDump;
  await restoreLedgerDump(dump);
  await RNFS.unlink(PENDING_RESTORE_PATH).catch(() => {});
  console.log('[restoreBackup] Pending restore applied, records:', recordCount(dump));
  return true;
}

async function findLiveSqlitePath(): Promise<string | null> {
  const preferred = watermelonSqlitePath();
  const searchDirs = Array.from(
    new Set([appDataDir(), `${appDataDir()}/databases`, RNFS.DocumentDirectoryPath]),
  );

  let best: { path: string; score: number } | null = null;

  for (const dir of searchDirs) {
    if (!(await RNFS.exists(dir))) continue;
    try {
      const items = await RNFS.readDir(dir);
      for (const item of items) {
        if (!item.isFile() || !isDatabaseFile(item.name)) continue;
        const dbBytes = Number(item.size ?? 0);
        const walBytes = await fileSize(`${item.path}-wal`);
        const score = dbBytes + walBytes;
        console.log(
          `[findLiveSqlitePath] Candidate: ${item.path} (db=${dbBytes}, wal=${walBytes})`,
        );
        if (!best || score > best.score || (score === best.score && item.path === preferred)) {
          best = { path: item.path, score };
        }
      }
    } catch (e) {
      console.warn('[findLiveSqlitePath] Read dir error:', dir, e);
    }
  }

  if (best && best.score > 0) {
    console.log(`[findLiveSqlitePath] Selected: ${best.path} (score=${best.score})`);
    return best.path;
  }

  if (await RNFS.exists(preferred)) return preferred;
  return null;
}

async function copySqliteSidecar(destDir: string): Promise<void> {
  const dbPath = await findLiveSqlitePath();
  if (!dbPath) {
    console.warn('[exportBackup] No SQLite sidecar found; JSON dump is still valid.');
    return;
  }

  await copyFileForced(dbPath, `${destDir}/offlineledger.db`);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (await RNFS.exists(walPath)) {
    await copyFileForced(walPath, `${destDir}/offlineledger.db-wal`);
  }
  if (await RNFS.exists(shmPath)) {
    await copyFileForced(shmPath, `${destDir}/offlineledger.db-shm`);
  }
}

async function copyMediaForBackup(destRoot: string): Promise<void> {
  const mediaDest = `${destRoot}/media`;
  await RNFS.mkdir(mediaDest);
  for (const folder of MEDIA_FOLDERS) {
    const src = `${MEDIA_DIR}/${folder}`;
    if (await RNFS.exists(src)) {
      await copyDirRecursive(src, `${mediaDest}/${folder}`);
    }
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  if (!(await RNFS.exists(dest))) await RNFS.mkdir(dest);

  try {
    const items = await RNFS.readDir(src);
    for (const item of items) {
      if (item.name.startsWith('ol_backup') || item.name.startsWith('ol_restore')) continue;
      if (item.isFile() && (isDatabaseFile(item.name) || isJournalFile(item.name))) continue;
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

async function restoreMedia(root: string): Promise<void> {
  const mediaRestoreDir =
    (await RNFS.exists(`${root}/media`))
      ? `${root}/media`
      : await findDirRecursive(root, 'media');

  if (!mediaRestoreDir) return;

  console.log('[restoreBackup] Restoring media from:', mediaRestoreDir);
  for (const folder of MEDIA_FOLDERS) {
    const src = `${mediaRestoreDir}/${folder}`;
    const dest = `${MEDIA_DIR}/${folder}`;
    if (!(await RNFS.exists(src))) continue;
    await removeDirRecursive(dest);
    await copyDirRecursive(src, dest);
  }
}

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

export async function exportBackup(): Promise<string> {
  await removeDirRecursive(TEMP_BACKUP_DIR);
  await RNFS.mkdir(TEMP_BACKUP_DIR);

  try {
    const dump = await dumpLedger();
    console.log(
      '[exportBackup] JSON dump counts:',
      TABLE_NAMES.map(table => `${table}=${dump.data[table]?.length ?? 0}`).join(', '),
    );

    await RNFS.writeFile(`${TEMP_BACKUP_DIR}/${LEDGER_JSON}`, JSON.stringify(dump), 'utf8');
    await copySqliteSidecar(TEMP_BACKUP_DIR);
    await copyMediaForBackup(TEMP_BACKUP_DIR);

    const fileName = `OfflineLedger_backup_${timestamp()}.zip`;
    const primaryZipPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

    if (await RNFS.exists(primaryZipPath)) {
      await RNFS.unlink(primaryZipPath).catch(() => {});
    }

    await zip(TEMP_BACKUP_DIR, primaryZipPath);
    console.log('[exportBackup] ZIP created at:', primaryZipPath);

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
        console.log('[exportBackup] Direct saved to Downloads:', targetPath);
        break;
      } catch {
        // Try the next public location.
      }
    }

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

    storage.set(StorageKeys.BACKUP_LAST_AT, new Date().toISOString());
    return savedPath;
  } finally {
    await removeDirRecursive(TEMP_BACKUP_DIR);
  }
}

export async function restoreBackup(): Promise<RestoreBackupResult> {
  useAuthStore.getState().setPickingMedia(true);

  try {
    let results;
    try {
      results = await pick({
        type: [types.zip, 'application/zip', 'application/x-zip-compressed'],
      });
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        return 'cancelled';
      }
      throw err;
    }

    const result = results?.[0];
    if (!result?.uri) return 'cancelled';

    const pickedName = result.name ?? '';
    const lowerName = pickedName.toLowerCase();
    if (/\.(pdf|jpe?g|png|webp|txt|csv|doc|docx|xls|xlsx|mp4|mp3)$/i.test(lowerName)) {
      throw new Error('Please select a valid .zip backup file.');
    }

    const [copyResult] = await keepLocalCopy({
      files: [
        {
          uri: result.uri,
          fileName: pickedName || `offlineledger_restore_${Date.now()}.zip`,
        },
      ],
      destination: 'cachesDirectory',
    });

    if (copyResult.status !== 'success' || !copyResult.localUri) {
      throw new Error(
        (copyResult as any).copyError ||
          'Could not copy the selected backup file into app storage.',
      );
    }

    const zipFileToUnzip = toFsPath(copyResult.localUri);
    if (!(await RNFS.exists(zipFileToUnzip))) {
      throw new Error('Could not access the selected backup file on device storage.');
    }

    await removeDirRecursive(TEMP_RESTORE_DIR);
    await RNFS.mkdir(TEMP_RESTORE_DIR);

    try {
      console.log('[restoreBackup] Unzipping backup file:', zipFileToUnzip);
      try {
        await unzip(zipFileToUnzip, TEMP_RESTORE_DIR);
      } catch {
        await unzip(`file://${zipFileToUnzip}`, TEMP_RESTORE_DIR);
      }

      const jsonPath =
        (await RNFS.exists(`${TEMP_RESTORE_DIR}/${LEDGER_JSON}`))
          ? `${TEMP_RESTORE_DIR}/${LEDGER_JSON}`
          : await findFileRecursive(TEMP_RESTORE_DIR, name => name.toLowerCase() === LEDGER_JSON);

      if (!jsonPath) {
        throw new Error(
          'This backup does not contain ledger.json. Create a new backup in this app version, then restore that file.',
        );
      }

      const text = await RNFS.readFile(jsonPath, 'utf8');
      const dump = JSON.parse(text) as LedgerDump;
      if (!dump?.data || typeof dump.data !== 'object') {
        throw new Error('Invalid backup file. ledger.json is missing record data.');
      }

      console.log('[restoreBackup] Saving pending restore, records:', recordCount(dump));
      await RNFS.writeFile(PENDING_RESTORE_PATH, JSON.stringify(dump), 'utf8');
      await restoreMedia(TEMP_RESTORE_DIR);

      try {
        await restoreLedgerDump(dump);
      } catch (e) {
        console.warn(
          '[restoreBackup] Live database apply failed; pending file will be applied on next launch',
          e,
        );
      }

      console.log('[restoreBackup] Restore completed successfully.');
      return 'restored';
    } catch (err: any) {
      const message = String(err?.message ?? err ?? '');
      if (
        message.startsWith('Invalid backup') ||
        message.startsWith('Could not') ||
        message.startsWith('Please select') ||
        message.startsWith('This backup')
      ) {
        throw err;
      }
      if (message.toLowerCase().includes('unzip') || message.toLowerCase().includes('archive')) {
        throw new Error(
          'Could not read that file as a ZIP backup. Please pick an OfflineLedger backup ZIP.',
        );
      }
      throw err;
    } finally {
      await removeDirRecursive(TEMP_RESTORE_DIR);
      await RNFS.unlink(zipFileToUnzip).catch(() => {});
    }
  } finally {
    useAuthStore.getState().setPickingMedia(false);
  }
}
