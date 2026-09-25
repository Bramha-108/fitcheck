import { FitCheckDraft, Garment } from '../../types';

let nextId = 1;

/** A minimal, fully-typed Garment with sensible defaults — each test only
 * overrides what it actually cares about, matching the pattern the rest of
 * this codebase already documents ("never fabricate a field the test didn't
 * ask for"). `feels`/`history` are NOT derived from `observations` here (that
 * is hydrate.ts's job, covered separately) — pass them explicitly when a test
 * needs them to agree. */
export function makeGarment(overrides: Partial<Garment> = {}): Garment {
  return {
    id: nextId++,
    brand: 'Test Brand',
    name: 'Test Garment',
    cat: 'tops',
    size: 'M',
    fit: '—',
    sil: '—',
    stretch: 'Some stretch',
    tags: [],
    ref: false,
    cap: 'garment photo',
    bg: ['#E3E0DA', '#EDEAE4'],
    m: {},
    photo: null,
    createdAt: Date.now(),
    observations: [],
    feels: [],
    visual: 'No visual note yet.',
    history: [],
    ...overrides,
  };
}

export function makeFc(overrides: Partial<FitCheckDraft> = {}): FitCheckDraft {
  return {
    category: 'tops',
    size: '',
    fit: '',
    silhouette: '',
    ...overrides,
  };
}
