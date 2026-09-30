import { hydrate, GarmentCore } from '../hydrate';
import { FitObservation } from '../../types';

const REF_RECENT_MS = 1000 * 60 * 60 * 24 * 30 * 12; // ~12 months, mirrors hydrate.ts's own constant

/** A "tops" garment with every zone measured — the minimum needed for the
 * `complete` leg of isStrongReference()'s gate to ever pass. */
function makeCore(overrides: Partial<GarmentCore> = {}): GarmentCore {
  return {
    id: 1,
    brand: 'Test Brand',
    name: 'Test Garment',
    cat: 'tops',
    size: 'M',
    fit: 'Regular',
    sil: 'Regular',
    stretch: 'Some stretch',
    tags: [],
    cap: 'garment photo',
    bg: ['#E3E0DA', '#EDEAE4'],
    m: { chest: 100, shoulder: 45, length: 70, sleeve: 60, waist: 90 },
    photo: null,
    createdAt: Date.now(),
    visual: 'No visual note yet.',
    ...overrides,
  };
}

function obs(overrides: Partial<FitObservation> = {}): FitObservation {
  return { id: 1, garmentId: 1, at: Date.now(), note: 'Fits great', comfort: [], ...overrides };
}

describe('hydrate() → isStrongReference() (the "ref" flag)', () => {
  it('is false when measurements are incomplete, even with perfect recent feedback', () => {
    const core = makeCore({ m: { chest: 100, shoulder: 45, length: 70, sleeve: 60 } }); // waist missing
    const g = hydrate(core, [obs({ comfort: [{ area: 'Chest', verdict: 'Good' }] })]);
    expect(g.ref).toBe(false);
  });

  it('is false with complete measurements but no observations at all', () => {
    const g = hydrate(makeCore(), []);
    expect(g.ref).toBe(false);
  });

  it('is false when observations exist but none carry any per-zone comfort (holistic-only notes)', () => {
    const g = hydrate(makeCore(), [obs({ comfort: [] })]);
    expect(g.ref).toBe(false);
  });

  it('is false when the only feedback is recorded but not recent (beyond ~12 months)', () => {
    const old = obs({ at: Date.now() - REF_RECENT_MS - 1000, comfort: [{ area: 'Chest', verdict: 'Good' }] });
    const g = hydrate(makeCore(), [old]);
    expect(g.ref).toBe(false);
  });

  it('pants: outseam is optional for "measured completely" — a fully measured pair without it still qualifies', () => {
    const m = { waist: 82, rise: 28, hip: 104, thigh: 62, knee: 44, inseam: 81, legOpening: 40 };
    const g = hydrate(makeCore({ cat: 'pants', m }), [obs({ comfort: [{ area: 'Waist', verdict: 'Good' }] })]);
    expect(g.ref).toBe(true);
    const missingInseam = { ...m, inseam: undefined, outseam: 104 };
    expect(hydrate(makeCore({ cat: 'pants', m: missingInseam }), [obs({ comfort: [{ area: 'Waist', verdict: 'Good' }] })]).ref).toBe(false);
  });

  it('is true for complete measurements + recent, fully positive feedback', () => {
    const g = hydrate(makeCore(), [obs({ comfort: [{ area: 'Chest', verdict: 'Good' }] })]);
    expect(g.ref).toBe(true);
  });

  it('is false for complete measurements + recent, fully negative feedback (avg well under 0.8)', () => {
    const g = hydrate(makeCore(), [obs({ comfort: [{ area: 'Chest', verdict: 'Tight' }] })]);
    expect(g.ref).toBe(false);
  });

  it('stays true just above the 0.8 threshold (4 Good + 1 Tight → avg 0.8375)', () => {
    const comfort = [
      { area: 'Chest', verdict: 'Good' as const },
      { area: 'Shoulder', verdict: 'Good' as const },
      { area: 'Length', verdict: 'Good' as const },
      { area: 'Sleeve', verdict: 'Good' as const },
      { area: 'Waist', verdict: 'Tight' as const },
    ];
    const g = hydrate(makeCore(), [obs({ comfort })]);
    expect(g.ref).toBe(true);
  });

  it('flips false just below the 0.8 threshold (3 Good + 2 Tight → avg 0.74)', () => {
    const comfort = [
      { area: 'Chest', verdict: 'Good' as const },
      { area: 'Shoulder', verdict: 'Good' as const },
      { area: 'Length', verdict: 'Good' as const },
      { area: 'Sleeve', verdict: 'Tight' as const },
      { area: 'Waist', verdict: 'Tight' as const },
    ];
    const g = hydrate(makeCore(), [obs({ comfort })]);
    expect(g.ref).toBe(false);
  });

  it('reads only the latest verdict per zone, not the full history — an old bad rating superseded by a later Good does not keep it out forever', () => {
    const g = hydrate(makeCore(), [
      obs({ at: Date.now() - 1000, comfort: [{ area: 'Chest', verdict: 'Too tight' }] }),
      obs({ at: Date.now(), comfort: [{ area: 'Chest', verdict: 'Good' }] }),
    ]);
    expect(g.feels).toEqual([{ area: 'Chest', verdict: 'Good' }]);
    expect(g.ref).toBe(true);
  });
});
