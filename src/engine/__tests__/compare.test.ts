import { compare, buildResult, toneFor, seedNewGarment } from '../compare';
import { keysFor } from '../../data/constants';
import { makeFc, makeGarment } from './fixtures';

const LABELS: Record<string, string> = {};
keysFor('tops').forEach(([k, l]) => { LABELS[k] = l; });
keysFor('pants').forEach(([k, l]) => { LABELS[k] = l; });

describe('compare()', () => {
  it('returns null when the closet is empty', () => {
    expect(compare(makeFc({ chest: '100' }), [])).toBeNull();
  });

  it('returns null when no measurement was typed, even with a matching closet', () => {
    const g = makeGarment({ cat: 'tops', m: { chest: 100 } });
    expect(compare(makeFc(), [g])).toBeNull();
  });

  it('returns null when the category has no garments at all', () => {
    const g = makeGarment({ cat: 'pants', m: { waist: 80 } });
    expect(compare(makeFc({ category: 'tops', chest: '100' }), [g])).toBeNull();
  });

  it('excludes a candidate that shares none of the typed zones', () => {
    // Garment only has "sleeve" measured; the draft only typed "chest" — zero
    // overlap, so this candidate must not appear in the pool at all.
    const g = makeGarment({ cat: 'tops', m: { sleeve: 60 } });
    expect(compare(makeFc({ chest: '100' }), [g])).toBeNull();
  });

  // Regression for the §3.3 bug: a candidate used to be excluded unless it had
  // *every* typed zone. A user who typed 2 measurements where a garment was
  // missing one of them got a false "no result" instead of a real comparison
  // on the zone that did overlap.
  it('includes a candidate that shares only some of the typed zones, scoring just the overlap', () => {
    const g = makeGarment({ cat: 'tops', m: { chest: 100 } }); // no shoulder recorded
    const out = compare(makeFc({ chest: '102', shoulder: '50' }), [g]);
    expect(out).not.toBeNull();
    expect(out!.scored).toHaveLength(1);
    const top = out!.scored[0];
    expect(top.matchKeys).toEqual(['chest']);
    expect(top.diffs).toEqual([2]);
  });

  it('ranks a closer measurement match ahead of a farther one', () => {
    const close = makeGarment({ cat: 'tops', m: { chest: 101 } });
    const far = makeGarment({ cat: 'tops', m: { chest: 120 } });
    const out = compare(makeFc({ chest: '100' }), [far, close]);
    expect(out!.scored[0].g).toBe(close);
    expect(out!.scored[1].g).toBe(far);
  });

  it('never treats an unset fit type ("—") as a match or a mismatch signal', () => {
    // Both sides unset — fitMatch must be false (missing evidence, not a match).
    const g = makeGarment({ cat: 'tops', m: { chest: 100 }, fit: '—' });
    const out = compare(makeFc({ chest: '100', fit: '' }), [g]);
    expect(out!.scored[0].fitMatch).toBe(false);
  });
});

describe('toneFor()', () => {
  const tol = 4;

  it('is "good" at and inside the tolerance boundary', () => {
    expect(toneFor(0, tol)).toBe('good');
    expect(toneFor(tol, tol)).toBe('good');
  });

  it('is "warn" just past tolerance, up to 1.75x', () => {
    expect(toneFor(tol + 0.01, tol)).toBe('warn');
    expect(toneFor(tol * 1.75, tol)).toBe('warn');
  });

  it('is "bad" past 1.75x tolerance', () => {
    expect(toneFor(tol * 1.75 + 0.01, tol)).toBe('bad');
    expect(toneFor(tol * 10, tol)).toBe('bad');
  });
});

describe('buildResult() confidence scoring', () => {
  it('returns null when compare() would (no overlap)', () => {
    const g = makeGarment({ cat: 'tops', m: { sleeve: 60 } });
    expect(buildResult(makeFc({ chest: '100' }), [g], LABELS)).toBeNull();
  });

  it('is Low confidence for a single-zone match, however good the other signals are', () => {
    // Only one shared zone, but everything else about the candidate is strong
    // (reference garment, positive feedback, fit/silhouette agreement) — a
    // single measured zone must still cap confidence below High/Medium-via-points.
    const g = makeGarment({
      cat: 'tops',
      m: { chest: 100 },
      fit: 'Regular',
      sil: 'Regular',
      ref: true,
      feels: [{ area: 'Chest', verdict: 'Good' }],
      observations: [{ id: 1, garmentId: 1, at: Date.now(), note: 'Fits great', comfort: [{ area: 'Chest', verdict: 'Good' }] }],
    });
    const r = buildResult(makeFc({ chest: '100', fit: 'Regular' }), [g], LABELS);
    expect(r).not.toBeNull();
    expect(r!.confidence).toBe('Low');
  });

  it('is High confidence for a well-covered, well-agreeing, multi-garment closet', () => {
    const shared = {
      cat: 'tops' as const,
      m: { chest: 100, shoulder: 45, length: 70, sleeve: 60, waist: 90 },
      fit: 'Regular',
      sil: 'Regular',
      ref: true,
      feels: [{ area: 'Chest', verdict: 'Good' as const }],
      observations: [{ id: 1, garmentId: 1, at: Date.now(), note: 'Fits great', comfort: [{ area: 'Chest', verdict: 'Good' as const }] }],
    };
    const closet = [makeGarment(shared), makeGarment(shared), makeGarment(shared), makeGarment(shared)];
    const r = buildResult(makeFc({ category: 'tops', chest: '100', shoulder: '45', length: '70', sleeve: '60', waist: '90', fit: 'Regular', silhouette: 'Regular' }), closet, LABELS);
    expect(r!.confidence).toBe('High');
  });

  it('never displays a diff for a zone the closest match does not actually have', () => {
    const g = makeGarment({ cat: 'tops', m: { chest: 100 } });
    const r = buildResult(makeFc({ chest: '102', shoulder: '50', length: '70' }), [g], LABELS);
    expect(r!.diffs).toHaveLength(1);
    expect(r!.diffs[0].label).toBe(LABELS.chest);
  });

  it('confidenceNote reports how many of the typed zones were actually compared, not typed', () => {
    const g = makeGarment({ cat: 'tops', m: { chest: 100 } });
    const r = buildResult(makeFc({ chest: '102', shoulder: '50' }), [g], LABELS);
    expect(r!.confidenceNote).toContain('1 of 5 measurements compared');
  });
});

describe('seedNewGarment()', () => {
  it('never lets an unset fit ("—") win the fit-mode vote', () => {
    const pool = [
      makeGarment({ cat: 'tops', fit: '—' }),
      makeGarment({ cat: 'tops', fit: '—' }),
      makeGarment({ cat: 'tops', fit: 'Slim' }),
    ];
    expect(seedNewGarment('tops', pool).fit).toBe('Slim');
  });

  it('returns an empty fit when every garment in the category has an unset fit', () => {
    const pool = [makeGarment({ cat: 'tops', fit: '—' }), makeGarment({ cat: 'tops', fit: '—' })];
    expect(seedNewGarment('tops', pool).fit).toBe('');
  });

  it('picks the most common size, including "—" (size is descriptive, not comparison evidence)', () => {
    const pool = [
      makeGarment({ cat: 'tops', size: 'M' }),
      makeGarment({ cat: 'tops', size: 'M' }),
      makeGarment({ cat: 'tops', size: 'L' }),
    ];
    expect(seedNewGarment('tops', pool).size).toBe('M');
  });

  it('is category-scoped — a differently-categorized closet contributes nothing', () => {
    const pool = [makeGarment({ cat: 'pants', fit: 'Slim' })];
    expect(seedNewGarment('tops', pool)).toEqual({ category: 'tops', size: '', fit: '', silhouette: '', stretch: 'Some stretch' });
  });
});

describe('outseam (pants-only)', () => {
  it('is a pants measurement and never a tops/jackets one', () => {
    expect(keysFor('pants').map(([k]) => k)).toContain('outseam');
    expect(keysFor('tops').map(([k]) => k)).not.toContain('outseam');
    expect(keysFor('jackets').map(([k]) => k)).not.toContain('outseam');
  });

  it('is diffed like any other zone when both sides have it', () => {
    const g = makeGarment({ cat: 'pants', m: { waist: 82, outseam: 104 } });
    const r = buildResult(makeFc({ category: 'pants', waist: '82', outseam: '108' }), [g], LABELS);
    const row = r!.diffs.find((d) => d.label === LABELS.outseam);
    expect(row).toBeTruthy();
    expect(r!.confidenceNote).toContain('2 of 8 measurements compared');
  });

  it('never participates when only one side has it', () => {
    const g = makeGarment({ cat: 'pants', m: { waist: 82 } });
    const r = buildResult(makeFc({ category: 'pants', waist: '82', outseam: '108' }), [g], LABELS);
    expect(r!.diffs.map((d) => d.label)).toEqual([LABELS.waist]);
  });
});
