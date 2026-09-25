import { Units } from '../types';

/** All storage is in cm (per spec.md's data shape) — these only affect display/entry. */
export function cmToDisplay(cm: number, units: Units): number {
  return units === 'in' ? cm / 2.54 : cm;
}

export function displayToCm(value: number, units: Units): number {
  return units === 'in' ? value * 2.54 : value;
}

export function formatMeasurement(cm: number, units: Units): string {
  const v = cmToDisplay(cm, units);
  const rounded = units === 'in' ? Math.round(v * 10) / 10 : Math.round(v);
  return `${rounded} ${units}`;
}

/** For placeholders/prefill text where a bare number (no unit suffix) is wanted. */
export function formatValue(cm: number, units: Units): string {
  const v = cmToDisplay(cm, units);
  return String(units === 'in' ? Math.round(v * 10) / 10 : Math.round(v));
}

/** A signed delta (e.g. "+2 cm" / "-0.8 in") — always explicit about direction. */
export function formatDelta(cm: number, units: Units): string {
  const v = cmToDisplay(cm, units);
  const rounded = units === 'in' ? Math.round(v * 10) / 10 : Math.round(v);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} ${units}`;
}

/**
 * Re-expresses an in-progress draft's raw numeric strings (entered in `from` units)
 * as the equivalent value in `to` units — so switching the unit toggle mid-entry
 * changes the number to match, rather than leaving the digits as-is under a new
 * label (which would silently misrepresent whatever was already typed). Only keys
 * in `keys` (default: every key present) are touched, non-numeric/empty values are
 * left untouched, and unrecognized keys (e.g. FitCheckDraft's `fit`/`silhouette`
 * text fields) are skipped automatically since `Number()` on them is NaN.
 */
export function convertDraftUnits<T extends Record<string, string>>(draft: T, from: Units, to: Units, keys?: string[]): T {
  if (from === to) return draft;
  const out: Record<string, string> = { ...draft };
  (keys ?? Object.keys(draft)).forEach((k) => {
    const raw = draft[k];
    if (raw === undefined || raw.trim() === '') return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    out[k] = formatValue(displayToCm(n, from), to);
  });
  return out as T;
}
