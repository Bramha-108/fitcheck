import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { BackupFile, BackupParseError, parseBackupText } from './backupFormat';

export { BACKUP_VERSION, BackupParseError, buildBackupFile, validateBackup } from './backupFormat';
export type { BackupFile, BackupGarment, BackupBodyMeasurement, BackupObservation } from './backupFormat';

/**
 * FitCheck's export/import path for the offline-only closet (no backup path
 * existed for data that lives only in this app's local SQLite db). Entirely
 * offline itself — export hands the file to the OS share sheet (the same kind of
 * OS-level boundary the photo picker already crosses, per DESIGN_GUIDELINES.md's
 * "Everything stays on this phone"), and import reads a file the user picks.
 * FitCheck never sends this data anywhere on its own. The file's shape and
 * validation live in ./backupFormat.ts.
 */

/** Writes the backup to a local file and opens the OS share sheet so the user
 * picks where it's saved (Files app, cloud drive, email, etc.). Returns false
 * when sharing isn't available on this platform (e.g. web) instead of throwing —
 * the caller decides how to tell the user. */
export async function shareBackupFile(backup: BackupFile): Promise<boolean> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  const file = new File(Paths.cache, `fitcheck-backup-${backup.exportedAt}.json`);
  file.create();
  file.write(JSON.stringify(backup, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save FitCheck backup' });
  return true;
}

/** Opens the OS file picker for a previously exported backup and validates its
 * shape before ever handing it back — never returns a partially-valid object.
 * Resolves null when the user cancels the picker (not an error). No MIME-type
 * filter: file managers report .json inconsistently (some as text/plain), so
 * content validation is the real gate, not the picker's own filtering. */
export async function pickBackupFile(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;

  const file = new File(result.assets[0].uri);
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new BackupParseError("Couldn't read that file.");
  }
  return parseBackupText(text);
}
