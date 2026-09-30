/**
 * In-memory stand-in for src/db/index.ts, used by the screen tests via
 * `jest.mock('../../db', () => require('./fakeDb'))`. Same exported surface and
 * the same behavior the store relies on (observations are append-only, rows come
 * back through the real `hydrate`, deleteGarment cascades, replaceAllData is
 * all-or-nothing) — without SQLite, which needs a native module.
 *
 * Only the storage engine is fake. Everything above it (store, engine, screens)
 * is the real code under test.
 */
import { BodyMeasurement, BodyMeasurements, FeelEntry, FitObservation, Garment, Units } from '../../types';
import { GarmentCore, hydrate } from '../../data/hydrate';

export class DbError extends Error {
  readonly operation: string;
  readonly cause: unknown;
  constructor(operation: string, cause: unknown) {
    super(`Database operation "${operation}" failed`);
    this.name = 'DbError';
    this.operation = operation;
    this.cause = cause;
  }
}

interface State {
  garments: GarmentCore[];
  observations: FitObservation[];
  body: BodyMeasurement[];
  units: Units;
  onboarded: boolean;
  settings: Record<string, string>;
  nextObsId: number;
  nextBodyId: number;
  /** Set to make the next call to the named operation reject (then auto-clears). */
  failNext: string | null;
  failAlways: string | null;
}

const fresh = (): State => ({
  garments: [], observations: [], body: [], units: 'cm', onboarded: true, settings: {},
  nextObsId: 1, nextBodyId: 1, failNext: null, failAlways: null,
});

let state: State = fresh();

const guard = (op: string) => {
  if (state.failAlways === op || state.failNext === op) {
    state.failNext = null;
    throw new DbError(op, new Error('injected failure'));
  }
};

export interface SeedGarment extends GarmentCore { observations?: Array<{ at: number; note: string; comfort: FeelEntry[]; visual?: string }> }

/** Test control surface — not part of the real db module. */
export const __fake = {
  reset(seed: { garments?: SeedGarment[]; body?: Array<{ at: number; m: BodyMeasurements }>; units?: Units; onboarded?: boolean; settings?: Record<string, string> } = {}) {
    state = fresh();
    state.units = seed.units ?? 'cm';
    state.onboarded = seed.onboarded ?? true;
    state.settings = { ...seed.settings };
    for (const { observations = [], ...core } of seed.garments ?? []) {
      state.garments.push(core);
      for (const o of observations) state.observations.push({ id: state.nextObsId++, garmentId: core.id, ...o });
    }
    for (const b of seed.body ?? []) state.body.push({ id: state.nextBodyId++, ...b });
  },
  failNext(op: string) { state.failNext = op; },
  failAlways(op: string | null) { state.failAlways = op; },
  snapshot: () => ({
    garments: state.garments.map((g) => ({ ...g })),
    observations: state.observations.map((o) => ({ ...o })),
    body: state.body.map((b) => ({ ...b })),
    units: state.units,
    onboarded: state.onboarded,
    settings: { ...state.settings },
  }),
};

const db = {};
export async function getDb() { guard('getDb'); return db; }

const toCore = (g: Garment | GarmentCore): GarmentCore => {
  const { feels, history, observations, ref, ...core } = g as Garment;
  void feels; void history; void observations; void ref;
  return core as GarmentCore;
};

export async function loadGarments(): Promise<Garment[]> {
  guard('loadGarments');
  return [...state.garments]
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    .map((g) => hydrate({ ...g }, state.observations.filter((o) => o.garmentId === g.id).map((o) => ({ ...o }))));
}

export async function insertGarment(_db: unknown, g: Garment) {
  guard('insertGarment');
  state.garments.push(toCore(g));
}

export async function updateGarment(_db: unknown, g: Garment) {
  guard('updateGarment');
  state.garments = state.garments.map((x) => (x.id === g.id ? toCore(g) : x));
}

export async function deleteGarment(_db: unknown, id: number) {
  guard('deleteGarment');
  state.observations = state.observations.filter((o) => o.garmentId !== id);
  state.garments = state.garments.filter((g) => g.id !== id);
}

export async function replaceAllData(
  _db: unknown,
  data: { garments: Array<GarmentCore & { observations: Array<{ at: number; note: string; comfort: FeelEntry[]; visual?: string }> }>; bodyMeasurements: Array<{ at: number; m: BodyMeasurements }> }
) {
  guard('replaceAllData'); // throws before touching anything — same all-or-nothing outcome as the real transaction
  const next = fresh();
  next.units = state.units;
  next.onboarded = state.onboarded;
  for (const { observations, ...core } of data.garments) {
    next.garments.push(core);
    for (const o of observations) next.observations.push({ id: next.nextObsId++, garmentId: core.id, ...o });
  }
  for (const b of data.bodyMeasurements) next.body.push({ id: next.nextBodyId++, ...b });
  state = next;
}

export async function insertObservation(_db: unknown, o: Omit<FitObservation, 'id'>) {
  guard('insertObservation');
  const id = state.nextObsId++;
  state.observations.push({ id, ...o });
  return id;
}

export async function getUnits() { guard('getUnits'); return state.units; }
export async function setUnits(_db: unknown, units: Units) { guard('setUnits'); state.units = units; }
export async function getSetting(_db: unknown, key: string) { guard('getSetting'); return state.settings[key] ?? null; }
export async function setSetting(_db: unknown, key: string, value: string) { guard('setSetting'); state.settings[key] = value; }
export async function getOnboarded() { guard('getOnboarded'); return state.onboarded; }
export async function setOnboarded(_db: unknown, done: boolean) { guard('setOnboarded'); state.onboarded = done; }

export async function loadBodyMeasurements(): Promise<BodyMeasurement[]> {
  guard('loadBodyMeasurements');
  return [...state.body].sort((a, b) => a.at - b.at || a.id - b.id).map((b) => ({ ...b }));
}

export async function insertBodyMeasurement(_db: unknown, entry: Omit<BodyMeasurement, 'id'>) {
  guard('insertBodyMeasurement');
  const id = state.nextBodyId++;
  state.body.push({ id, ...entry });
  return id;
}

export async function deleteBodyMeasurement(_db: unknown, id: number) {
  guard('deleteBodyMeasurement');
  state.body = state.body.filter((b) => b.id !== id);
}
