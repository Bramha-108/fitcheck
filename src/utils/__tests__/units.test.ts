import { cmToDisplay, convertDraftUnits, displayToCm, formatDelta, formatMeasurement, formatValue } from '../units';

describe('cmToDisplay() / displayToCm() round-trip', () => {
  it('cm → in → cm returns the original value (no drift beyond float precision)', () => {
    const original = 91.44; // 36in
    const roundTripped = displayToCm(cmToDisplay(original, 'in'), 'in');
    expect(roundTripped).toBeCloseTo(original, 9);
  });

  it('is a no-op in cm either direction', () => {
    expect(cmToDisplay(100, 'cm')).toBe(100);
    expect(displayToCm(100, 'cm')).toBe(100);
  });
});

describe('formatValue() / formatMeasurement() rounding', () => {
  it('rounds cm to the nearest whole number', () => {
    expect(formatValue(100.6, 'cm')).toBe('101');
    expect(formatMeasurement(100.4, 'cm')).toBe('100 cm');
  });

  it('rounds inches to one decimal place', () => {
    // 100cm ≈ 39.37in
    expect(formatValue(100, 'in')).toBe('39.4');
    expect(formatMeasurement(100, 'in')).toBe('39.4 in');
  });
});

describe('formatDelta()', () => {
  it('prefixes a positive delta with "+"', () => {
    expect(formatDelta(2, 'cm')).toBe('+2 cm');
  });

  it('leaves a negative delta with its own "-" sign, no double sign', () => {
    expect(formatDelta(-2, 'cm')).toBe('-2 cm');
  });

  it('has no sign for a zero delta', () => {
    expect(formatDelta(0, 'cm')).toBe('0 cm');
  });
});

describe('convertDraftUnits()', () => {
  it('never fills an empty field — it stays empty, never 0, never copied', () => {
    const draft = { chest: '', shoulder: '50' };
    const out = convertDraftUnits(draft, 'cm', 'in');
    expect(out.chest).toBe('');
    expect(out.shoulder).not.toBe('');
  });

  it('is a no-op object copy when from === to', () => {
    const draft = { chest: '100' };
    expect(convertDraftUnits(draft, 'cm', 'cm')).toEqual(draft);
  });

  it('leaves non-numeric fields untouched (e.g. fit/silhouette free text)', () => {
    const draft = { chest: '100', fit: 'Regular', silhouette: 'Boxy' };
    const out = convertDraftUnits(draft, 'cm', 'in');
    expect(out.fit).toBe('Regular');
    expect(out.silhouette).toBe('Boxy');
  });

  it('only touches the keys listed in `keys`, when given', () => {
    const draft = { chest: '100', shoulder: '50' };
    const out = convertDraftUnits(draft, 'cm', 'in', ['chest']);
    expect(out.chest).not.toBe('100');
    expect(out.shoulder).toBe('50');
  });

  it('converts stored/typed value → cm → target unit, never re-interpreting an already-displayed number', () => {
    // Simulates the toggle being pressed twice in a row (cm → in → cm) — the
    // digits must end up back where they started, not compounding a second
    // conversion on top of the first.
    const original = { chest: '100' };
    const toIn = convertDraftUnits(original, 'cm', 'in');
    const backToCm = convertDraftUnits(toIn, 'in', 'cm');
    expect(Number(backToCm.chest)).toBeCloseTo(100, 0);
  });
});
