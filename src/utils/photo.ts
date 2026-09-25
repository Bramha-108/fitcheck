import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Garment photos, offline: the OS picker hands back a cache-directory URI that the
 * system can purge, so it isn't a durable reference on its own (spec.md Feature 1
 * wants "point at the photo, don't duplicate it" via a persistent OS identifier —
 * `expo-image-picker` doesn't expose one on Android without extra media-library
 * permissions). Copying the picked file once into the app's own document directory
 * is still fully local and no cloud is involved, and it actually survives restarts.
 */

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create();
  return dir;
}

/** Launches the OS photo picker and copies the chosen image into local app storage. Returns the local file URI, or null if canceled. */
export async function pickGarmentPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'jpg').toLowerCase();
  const dest = new File(photosDir(), `g-${Date.now()}.${ext}`);
  await new File(asset.uri).copy(dest);
  return dest.uri;
}

/** Whether a garment's photo URI still points at a real file on this device — false
 * for a URI restored from another device/install's backup (utils/backup.ts), since
 * a garment photo is never included in the backup file itself, only its local path. */
export function localPhotoExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Removes a garment's local photo file, if any. Never throws — a missing file is fine. */
export function deleteGarmentPhoto(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // best-effort cleanup only
  }
}
