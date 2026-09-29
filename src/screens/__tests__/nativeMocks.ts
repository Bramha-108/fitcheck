/**
 * Fakes for the file/photo/share boundaries the screens cross. Each is a plain
 * object of jest.fn()s so a test can steer or assert on it:
 *
 *   backup.pickBackupFile.mockResolvedValueOnce(validatedFile)
 *   expect(backup.shareBackupFile).toHaveBeenCalledWith(...)
 *
 * The pure backup logic (build/validate/parse) is the real implementation from
 * utils/backupFormat.ts — only the picker and share sheet are faked.
 */
import { BackupFile } from '../../utils/backupFormat';

const format = jest.requireActual('../../utils/backupFormat');

export const backup = {
  BACKUP_VERSION: format.BACKUP_VERSION,
  BackupParseError: format.BackupParseError,
  buildBackupFile: format.buildBackupFile,
  validateBackup: format.validateBackup,
  shareBackupFile: jest.fn<Promise<boolean>, [BackupFile]>(async () => true),
  pickBackupFile: jest.fn<Promise<BackupFile | null>, []>(async () => null),
};

export const photo = {
  pickGarmentPhoto: jest.fn(async () => null),
  localPhotoExists: jest.fn(() => false),
  deleteGarmentPhoto: jest.fn(),
};
