import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { BodyMeasurement, BodyMeasurements, Category, FeelEntry, Garment, Measurements, StretchLevel } from '../types';

/**
 * FitCheck's export/import path for the offline-only closet (AUDIT_REPORT.md P1:
 * no backup path existed for data that lives only in this app's local SQLite db).
 * Entirely offline itself — export hands the file to the OS share sheet (the same
 * kind of OS-level boundary the photo picker already crosses, per
 * DESIGN_GUIDELINES.md's "Everything stays on this phone"), and import reads a
 * file the user picks. FitCheck never sends this data anywhere on its own.
 *
 * Deliberately real stored fields only — never the feels/history/ref fields
 * hydrate() derives (src/data/hydrate.ts) — so the file can't be mistaken for
 * holding more than it does (Measurement integrity: don't present derived data as
 * if it were separately recorded).
 */

export const BACKUP_VERSION = 1;

export interface BackupObservation { at: number; note: string; comfort: FeelEntry[]; visual?: string }

export interface BackupGarment {
  id: number;
  brand: string;
  name: string;
  cat: Category;
  size: string;
  fit: string;
  sil: string;
  stretch: StretchLevel;
  tags: string[];
  cap: string;
  bg: [string, string];
  m: Measurements;
  visual: string;
  // A local file path, meaningful only on the device that exported it — see
  // sanitizeImportedPhotos below. The photo itself is never embedded in the file.
  photo: string | null;
  createdAt: number;
  observations: BackupObservation[];
}

export interface BackupBodyMeasurement { at: number; m: BodyMeasurements }

export interface BackupFile {
  version: number;
  exportedAt: number;
  garments: BackupGarment[];
  bodyMeasurements: BackupBodyMeasurement[];
}

export function buildBackupFile(garments: Garment[], bodyMeasurements: BodyMeasurement[]): BackupFile {
  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    garments: garments.map((g) => ({
      id: g.id,
      brand: g.brand,
      name: g.name,
      cat: g.cat,
      size: g.size,
      fit: g.fit,
      sil: g.sil,
      stretch: g.stretch,
      tags: g.tags,
      cap: g.cap,
      bg: g.bg,
      m: g.m,
      visual: g.visual,
      photo: g.photo,
      createdAt: g.createdAt,
      observations: g.observations.map((o) => ({ at: o.at, note: o.note, comfort: o.comfort, visual: o.visual })),
    })),
    bodyMeasurements: bodyMeasurements.map((b) => ({ at: b.at, m: b.m })),
  };
}

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

export class BackupParseError extends Error {}

/** Opens the OS file picker for a previously exported backup and validates its
 * shape before ever handing it back — never returns a partially-valid object.
 * Resolves null when the user cancels the picker (not an error). No MIME-type
 * filter: file managers report .json inconsistently (some as text/plain), so
 * content validation below is the real gate, not the picker's own filtering. */
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupParseError("That file isn't a valid FitCheck backup.");
  }
  return validateBackup(parsed);
}

function validateBackup(data: unknown): BackupFile {
  const invalid = () => new BackupParseError("That file isn't a valid FitCheck backup.");
  if (!data || typeof data !== 'object') throw invalid();
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'number' || !Array.isArray(d.garments) || !Array.isArray(d.bodyMeasurements)) throw invalid();

  for (const g of d.garments) {
    if (!g || typeof g !== 'object') throw invalid();
    const gg = g as Record<string, unknown>;
    if (
      typeof gg.id !== 'number' ||
      typeof gg.brand !== 'string' ||
      typeof gg.name !== 'string' ||
      typeof gg.cat !== 'string' ||
      typeof gg.m !== 'object' ||
      !Array.isArray(gg.observations)
    ) {
      throw invalid();
    }
  }
  for (const b of d.bodyMeasurements) {
    if (!b || typeof b !== 'object') throw invalid();
    const bb = b as Record<string, unknown>;
    if (typeof bb.at !== 'number' || typeof bb.m !== 'object') throw invalid();
  }

  return d as unknown as BackupFile;
}
