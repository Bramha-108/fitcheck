import { BodyMeasurement, BodyMeasurements, Category, FeelEntry, Garment, Measurements, StretchLevel } from '../types';
import { ALL_ZONE_KEYS, BODY_MEASURES, STRETCH_LEVELS } from '../data/constants';

/**
 * The backup file's shape, builder and validator — pure data logic with no Expo
 * imports, so it can be unit-tested directly (see __tests__/backupFormat.test.ts).
 * The file-picker / share-sheet side lives in ./backup.ts.
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
  // sanitizeImportedGarments in store.tsx. The photo itself is never embedded in the file.
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

export class BackupParseError extends Error {}

const CATEGORIES: readonly string[] = ['tops', 'pants', 'jackets'];
const VERDICTS: readonly string[] = ['Too tight', 'Tight', 'Good', 'Loose', 'Too loose'];
const GARMENT_ZONES: ReadonlySet<string> = new Set(ALL_ZONE_KEYS);
const BODY_ZONES: ReadonlySet<string> = new Set(BODY_MEASURES.map(([k]) => k));

const invalid = () => new BackupParseError("That file isn't a valid FitCheck backup.");

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isTimestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** A measurement map must hold only known zone keys with real, positive numbers —
 * a 0/NaN/negative value would otherwise flow into comparisons as if it were real. */
function checkMeasurements(m: unknown, zones: ReadonlySet<string>): Record<string, number> {
  if (!isRecord(m)) throw invalid();
  for (const [k, v] of Object.entries(m)) {
    if (!zones.has(k) || typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw invalid();
  }
  return m as Record<string, number>;
}

function checkObservation(o: unknown): BackupObservation {
  if (!isRecord(o) || !isTimestamp(o.at) || typeof o.note !== 'string' || !Array.isArray(o.comfort)) throw invalid();
  if (o.visual !== undefined && o.visual !== null && typeof o.visual !== 'string') throw invalid();
  const comfort = o.comfort.map((c: unknown) => {
    if (!isRecord(c) || typeof c.area !== 'string' || typeof c.verdict !== 'string' || !VERDICTS.includes(c.verdict)) throw invalid();
    return { area: c.area, verdict: c.verdict } as FeelEntry;
  });
  return { at: o.at, note: o.note, comfort, visual: typeof o.visual === 'string' ? o.visual : undefined };
}

function checkGarment(g: unknown): BackupGarment {
  if (!isRecord(g)) throw invalid();
  if (typeof g.id !== 'number' || !Number.isInteger(g.id)) throw invalid();
  // Same minimum identity saveGarment requires (store.tsx) — a backup can't smuggle
  // in a garment the app itself would have refused to save.
  for (const k of ['brand', 'name', 'size'] as const) {
    if (typeof g[k] !== 'string' || !(g[k] as string).trim()) throw invalid();
  }
  if (typeof g.cat !== 'string' || !CATEGORIES.includes(g.cat)) throw invalid();
  const m = checkMeasurements(g.m, GARMENT_ZONES);
  if (Object.keys(m).length === 0) throw invalid();
  if (!Array.isArray(g.observations)) throw invalid();
  if (!isTimestamp(g.createdAt)) throw invalid();

  // Genuinely optional fields: absent → the same empty value a fresh garment has,
  // never an invented one. Present-but-wrong-typed → reject rather than coerce.
  const optString = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw invalid();
    return v;
  };
  const stretch = g.stretch === undefined ? 'Some stretch' : g.stretch;
  if (typeof stretch !== 'string' || !STRETCH_LEVELS.includes(stretch as StretchLevel)) throw invalid();
  const tags = g.tags === undefined ? [] : g.tags;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) throw invalid();
  const bg = g.bg === undefined ? ['#E3E0DA', '#EDEAE4'] : g.bg;
  if (!Array.isArray(bg) || bg.length !== 2 || !bg.every((c) => typeof c === 'string')) throw invalid();
  if (g.photo !== undefined && g.photo !== null && typeof g.photo !== 'string') throw invalid();

  return {
    id: g.id,
    brand: g.brand as string,
    name: g.name as string,
    cat: g.cat as Category,
    size: g.size as string,
    fit: optString(g.fit),
    sil: optString(g.sil),
    stretch: stretch as StretchLevel,
    tags: tags as string[],
    cap: optString(g.cap),
    bg: bg as [string, string],
    m: m as Measurements,
    visual: optString(g.visual),
    photo: typeof g.photo === 'string' ? g.photo : null,
    createdAt: g.createdAt,
    observations: g.observations.map(checkObservation),
  };
}

/** Validates an already-parsed JSON value and returns a normalized BackupFile —
 * never a partially-valid one. Throws BackupParseError on the first problem. */
export function validateBackup(data: unknown): BackupFile {
  if (!isRecord(data)) throw invalid();
  if (typeof data.version !== 'number' || !Array.isArray(data.garments) || !Array.isArray(data.bodyMeasurements)) throw invalid();
  if (data.version > BACKUP_VERSION) {
    throw new BackupParseError('That backup was made by a newer version of FitCheck — update the app to import it.');
  }
  if (data.version < 1) throw invalid();

  const garments = data.garments.map(checkGarment);
  if (new Set(garments.map((g) => g.id)).size !== garments.length) throw invalid();

  const bodyMeasurements = data.bodyMeasurements.map((b: unknown): BackupBodyMeasurement => {
    if (!isRecord(b) || !isTimestamp(b.at)) throw invalid();
    return { at: b.at, m: checkMeasurements(b.m, BODY_ZONES) as BodyMeasurements };
  });

  return {
    version: data.version,
    exportedAt: isTimestamp(data.exportedAt) ? data.exportedAt : 0,
    garments,
    bodyMeasurements,
  };
}

/** Parses the raw text of a backup file. */
export function parseBackupText(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid();
  }
  return validateBackup(parsed);
}
