import * as SQLite from 'expo-sqlite';
import { BodyMeasurement, BodyMeasurements, Category, FeelEntry, FitObservation, Garment, Measurements, StretchLevel, Units } from '../types';
import { GarmentCore, hydrate } from '../data/hydrate';

/**
 * Local SQLite store — the only place garment data lives (spec.md "Architecture:
 * fully offline, local-only"). Nothing here talks to a network, ever.
 *
 * Observations are append-only: `saveFit` inserts, it never updates or deletes an
 * earlier row. The garment's current feel and its timeline are derived on load.
 */

const DB_NAME = 'fitcheck.db';
const SCHEMA_VERSION = 4;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Every exported read/write below goes through this so a SQLite failure (disk
 * full, corrupt row, closed connection) always surfaces as a `DbError` naming
 * which operation failed — a defensive contract this module owns itself,
 * rather than leaving every call site responsible for remembering to catch
 * (today they all do, in store.tsx, but that was never guaranteed here).
 */
export class DbError extends Error {
  readonly operation: string;
  readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Database operation "${operation}" failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'DbError';
    this.operation = operation;
    this.cause = cause;
  }
}

async function withDbError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new DbError(operation, e);
  }
}

interface GarmentRow {
  id: number;
  brand: string;
  name: string;
  cat: string;
  size: string;
  fit: string;
  sil: string;
  tags: string;
  cap: string;
  bg: string;
  m: string;
  visual: string;
  photo: string | null;
  created_at: number;
  stretch: string;
}

interface ObservationRow {
  id: number;
  garment_id: number;
  at: number;
  note: string;
  comfort: string;
  visual: string | null;
}

interface BodyMeasurementRow {
  id: number;
  at: number;
  m: string;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS garments (
        id INTEGER PRIMARY KEY NOT NULL,
        brand TEXT NOT NULL,
        name TEXT NOT NULL,
        cat TEXT NOT NULL,
        size TEXT NOT NULL,
        fit TEXT NOT NULL,
        sil TEXT NOT NULL,
        tags TEXT NOT NULL,
        cap TEXT NOT NULL,
        bg TEXT NOT NULL,
        m TEXT NOT NULL,
        visual TEXT NOT NULL,
        photo TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        garment_id INTEGER NOT NULL,
        at INTEGER NOT NULL,
        note TEXT NOT NULL,
        comfort TEXT NOT NULL,
        visual TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_obs_garment ON observations (garment_id, at);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }

  // v1 had a static `ref` column; "strong reference" is now computed from the
  // observation log on every load (src/data/hydrate.ts) instead of stored, so an
  // upgrading v1 database has it dropped. A fresh install never has the column to
  // begin with (the `current < 1` branch above already omits it).
  if (current === 1) {
    await db.execAsync('ALTER TABLE garments DROP COLUMN ref;');
  }

  // v3: optional body-measurement log (CHECKLIST.md §15), entirely separate from
  // garments/observations. IF NOT EXISTS makes this safe to run unconditionally for
  // any pre-v3 database, fresh or upgrading.
  if (current < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS body_measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        m TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_body_at ON body_measurements (at);
    `);
  }

  // v4: per-garment fabric stretch, used to scale measurement tolerance in
  // src/engine/compare.ts. 'Some stretch' (1x multiplier) is the neutral default, so
  // upgrading pre-v4 garments compare exactly as they did before this column existed.
  if (current < 4) {
    await db.execAsync(`ALTER TABLE garments ADD COLUMN stretch TEXT NOT NULL DEFAULT 'Some stretch';`);
  }

  if (current !== SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = withDbError('getDb', async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

function rowToCore(r: GarmentRow): GarmentCore {
  return {
    id: r.id,
    brand: r.brand,
    name: r.name,
    cat: r.cat as Category,
    size: r.size,
    fit: r.fit,
    sil: r.sil,
    tags: JSON.parse(r.tags) as string[],
    cap: r.cap,
    bg: JSON.parse(r.bg) as [string, string],
    m: JSON.parse(r.m) as Measurements,
    visual: r.visual,
    photo: r.photo,
    createdAt: r.created_at,
    stretch: (r.stretch as StretchLevel) || 'Some stretch',
  };
}

function rowToObservation(r: ObservationRow): FitObservation {
  return {
    id: r.id,
    garmentId: r.garment_id,
    at: r.at,
    note: r.note,
    comfort: JSON.parse(r.comfort),
    visual: r.visual ?? undefined,
  };
}

export async function loadGarments(db: SQLite.SQLiteDatabase): Promise<Garment[]> {
  return withDbError('loadGarments', async () => {
    const rows = await db.getAllAsync<GarmentRow>('SELECT * FROM garments ORDER BY created_at DESC, id DESC');
    const obs = await db.getAllAsync<ObservationRow>('SELECT * FROM observations ORDER BY at ASC, id ASC');

    const byGarment = new Map<number, FitObservation[]>();
    obs.forEach((r) => {
      const list = byGarment.get(r.garment_id) ?? [];
      list.push(rowToObservation(r));
      byGarment.set(r.garment_id, list);
    });

    return rows.map((r) => hydrate(rowToCore(r), byGarment.get(r.id) ?? []));
  });
}

async function insertGarmentRow(db: SQLite.SQLiteDatabase, g: GarmentCore): Promise<void> {
  await db.runAsync(
    `INSERT INTO garments (id, brand, name, cat, size, fit, sil, tags, cap, bg, m, visual, photo, created_at, stretch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    g.id,
    g.brand,
    g.name,
    g.cat,
    g.size,
    g.fit,
    g.sil,
    JSON.stringify(g.tags),
    g.cap,
    JSON.stringify(g.bg),
    JSON.stringify(g.m),
    g.visual,
    g.photo,
    g.createdAt,
    g.stretch
  );
}

export async function insertGarment(db: SQLite.SQLiteDatabase, g: Garment): Promise<void> {
  return withDbError('insertGarment', () => insertGarmentRow(db, g));
}

/** Edits the garment record itself. Fit observations are never touched here. */
export async function updateGarment(db: SQLite.SQLiteDatabase, g: Garment): Promise<void> {
  return withDbError('updateGarment', async () => {
    await db.runAsync(
      `UPDATE garments SET brand = ?, name = ?, cat = ?, size = ?, fit = ?, sil = ?, tags = ?,
         cap = ?, bg = ?, m = ?, visual = ?, photo = ?, stretch = ? WHERE id = ?`,
      g.brand,
      g.name,
      g.cat,
      g.size,
      g.fit,
      g.sil,
      JSON.stringify(g.tags),
      g.cap,
      JSON.stringify(g.bg),
      JSON.stringify(g.m),
      g.visual,
      g.photo,
      g.stretch,
      g.id
    );
  });
}

export async function deleteGarment(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  return withDbError('deleteGarment', () =>
    db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM observations WHERE garment_id = ?', id);
      await db.runAsync('DELETE FROM garments WHERE id = ?', id);
    })
  );
}

export interface RestoreObservation { at: number; note: string; comfort: FeelEntry[]; visual?: string }
export interface RestoreGarment extends GarmentCore { observations: RestoreObservation[] }
export interface RestoreBodyMeasurement { at: number; m: BodyMeasurements }

/**
 * Wholesale replace — used only by a backup restore (utils/backup.ts), never by
 * normal app flow. Wrapped in one transaction so a failure partway through (a bad
 * row, a closed app) rolls back everything rather than leaving the closet half
 * wiped and half restored.
 */
export async function replaceAllData(
  db: SQLite.SQLiteDatabase,
  data: { garments: RestoreGarment[]; bodyMeasurements: RestoreBodyMeasurement[] }
): Promise<void> {
  return withDbError('replaceAllData', () =>
    db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM observations');
      await db.runAsync('DELETE FROM garments');
      await db.runAsync('DELETE FROM body_measurements');
      for (const g of data.garments) {
        await insertGarmentRow(db, g);
        for (const o of g.observations) {
          await db.runAsync(
            'INSERT INTO observations (garment_id, at, note, comfort, visual) VALUES (?, ?, ?, ?, ?)',
            g.id,
            o.at,
            o.note,
            JSON.stringify(o.comfort),
            o.visual ?? null
          );
        }
      }
      for (const bm of data.bodyMeasurements) {
        await db.runAsync('INSERT INTO body_measurements (at, m) VALUES (?, ?)', bm.at, JSON.stringify(bm.m));
      }
    })
  );
}

/** Append-only — returns the row id the database assigned. */
export async function insertObservation(
  db: SQLite.SQLiteDatabase,
  o: Omit<FitObservation, 'id'>
): Promise<number> {
  return withDbError('insertObservation', async () => {
    const res = await db.runAsync(
      'INSERT INTO observations (garment_id, at, note, comfort, visual) VALUES (?, ?, ?, ?, ?)',
      o.garmentId,
      o.at,
      o.note,
      JSON.stringify(o.comfort),
      o.visual ?? null
    );
    return res.lastInsertRowId;
  });
}

export async function getUnits(db: SQLite.SQLiteDatabase): Promise<Units> {
  return withDbError('getUnits', async () => {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'units');
    return row?.value === 'in' ? 'in' : 'cm';
  });
}

export async function setUnits(db: SQLite.SQLiteDatabase, units: Units): Promise<void> {
  return withDbError('setUnits', async () => {
    await db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'units',
      units
    );
  });
}

/** Whether the first-run onboarding wizard has already been shown/dismissed. */
export async function getOnboarded(db: SQLite.SQLiteDatabase): Promise<boolean> {
  return withDbError('getOnboarded', async () => {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'onboarded');
    return row?.value === '1';
  });
}

export async function setOnboarded(db: SQLite.SQLiteDatabase, done: boolean): Promise<void> {
  return withDbError('setOnboarded', async () => {
    await db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'onboarded',
      done ? '1' : '0'
    );
  });
}

function rowToBodyMeasurement(r: BodyMeasurementRow): BodyMeasurement {
  return { id: r.id, at: r.at, m: JSON.parse(r.m) as BodyMeasurements };
}

export async function loadBodyMeasurements(db: SQLite.SQLiteDatabase): Promise<BodyMeasurement[]> {
  return withDbError('loadBodyMeasurements', async () => {
    const rows = await db.getAllAsync<BodyMeasurementRow>('SELECT * FROM body_measurements ORDER BY at ASC, id ASC');
    return rows.map(rowToBodyMeasurement);
  });
}

/** Append-only, like observations — a new entry, not an overwrite. Returns the assigned row id. */
export async function insertBodyMeasurement(
  db: SQLite.SQLiteDatabase,
  entry: Omit<BodyMeasurement, 'id'>
): Promise<number> {
  return withDbError('insertBodyMeasurement', async () => {
    const res = await db.runAsync('INSERT INTO body_measurements (at, m) VALUES (?, ?)', entry.at, JSON.stringify(entry.m));
    return res.lastInsertRowId;
  });
}

/** Deleting is for correcting a mis-entered value, not for editing history in place. */
export async function deleteBodyMeasurement(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  return withDbError('deleteBodyMeasurement', async () => {
    await db.runAsync('DELETE FROM body_measurements WHERE id = ?', id);
  });
}
