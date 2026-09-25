import { BodyMeasurement, BodyMeasurements, BodyZoneKey, Category, FitProfile, Garment, LearnedPref, TrendRead, Units, ZoneKey, ZoneRange } from '../types';
import { CATEGORY_LABELS, isSet, keysFor } from '../data/constants';
import { formatValue } from '../utils/units';

/**
 * Feature 4 (spec.md) — "implicit drift": everything here is read-derived from the
 * append-only FitObservation log, never a separately maintained profile. No number
 * is presented as more precise than the data supports (risks.md's "no false
 * precision" decision) — ranges and trends come straight from logged observations,
 * not an inferred body measurement.
 */

const VERDICT_SCORE: Record<string, number> = {
  'Too tight': -2, Tight: -1, Good: 0, Loose: 1, 'Too loose': 2,
};

function isPositivelyRated(g: Garment): boolean {
  if (!g.feels.length) return g.ref;
  const goodShare = g.feels.filter((f) => f.verdict === 'Good').length / g.feels.length;
  return goodShare >= 0.5;
}

function topEntries(counts: Record<string, number>, n: number): string[] {
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, n);
}

export function computeTrend(garments: Garment[]): TrendRead {
  interface Point { at: number; label: string; catLabel: string; score: number }
  const points: Point[] = [];
  garments.forEach((g) => {
    const catLabel = CATEGORY_LABELS.find(([c]) => c === g.cat)?.[1] ?? g.cat;
    g.observations.forEach((o) => {
      if (!o.comfort.length) return;
      const score = o.comfort.reduce((a, c) => a + (VERDICT_SCORE[c.verdict] ?? 0), 0) / o.comfort.length;
      points.push({ at: o.at, label: g.size, catLabel, score });
    });
  });

  const groups = new Map<string, Point[]>();
  points.forEach((p) => {
    const key = `${p.catLabel}::${p.label}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  });

  let best: { key: string; delta: number; catLabel: string; label: string; recentAvg: number } | null = null;
  groups.forEach((list, key) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => a.at - b.at);
    const mid = Math.floor(sorted.length / 2) || 1;
    const older = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    if (!older.length || !recent.length) return;
    const olderAvg = older.reduce((a, p) => a + p.score, 0) / older.length;
    const recentAvg = recent.reduce((a, p) => a + p.score, 0) / recent.length;
    const delta = Math.abs(recentAvg - olderAvg);
    if (delta >= 0.5 && (!best || delta > best.delta)) {
      best = { key, delta, catLabel: sorted[0].catLabel, label: sorted[0].label, recentAvg };
    }
  });

  if (!best) {
    return {
      headline: garments.length
        ? "Not enough repeated sizes yet to spot a trend — log a fit update on a garment you've rated before to start one."
        : 'Add a few garments and fit updates to start seeing trends here.',
      basis: 'A trend needs the same size logged more than once, at different times.',
    };
  }

  const b = best as { key: string; delta: number; catLabel: string; label: string; recentAvg: number };
  const direction = b.recentAvg < 0 ? 'tighter' : 'looser';
  return {
    headline: `Your recent ${b.label} ${b.catLabel.toLowerCase()} have been fitting ${direction} than older ${b.label} ${b.catLabel.toLowerCase()}.`,
    basis: `Based on ${groups.get(b.key)!.length} logged observations at that size. No body measurement has been assumed.`,
  };
}

/**
 * The fit types this category's positively-rated garments cluster around — the same
 * signal the Profile page's "Often prefers..." card shows (spec.md Feature 4), but
 * exposed for the comparison engine too (compare.ts) so ranking benefits from what's
 * been learned across the whole closet, not just the one candidate garment's own
 * feedback. Needs at least 2 positively-rated garments before it'll assert a pattern.
 */
export function preferredFitsFor(cat: Category, garments: Garment[], n = 2): string[] {
  // Garments with no recorded fit type carry no fit-type evidence — counting them
  // would let '—' cluster into a fake "preferred fit" (and surface as copy like
  // "Often prefers — tops"). See DESIGN_GUIDELINES.md's Measurement integrity.
  const positive = garments.filter((g) => g.cat === cat).filter(isPositivelyRated).filter((g) => isSet(g.fit));
  if (positive.length < 2) return [];
  const fitCounts: Record<string, number> = {};
  positive.forEach((g) => { fitCounts[g.fit] = (fitCounts[g.fit] ?? 0) + 1; });
  return topEntries(fitCounts, n);
}

export function computeLearnedPrefs(garments: Garment[]): LearnedPref[] {
  const prefs: LearnedPref[] = [];

  CATEGORY_LABELS.forEach(([cat, label]) => {
    const top = preferredFitsFor(cat, garments);
    if (!top.length) return;
    const positive = garments.filter((g) => g.cat === cat).filter(isPositivelyRated);
    const refCount = positive.filter((g) => g.ref).length;
    prefs.push({
      text: `Often prefers ${top.join(' and ').toLowerCase()} ${label.toLowerCase()}`,
      basis: refCount
        ? `from ${positive.length} positively rated ${label.toLowerCase()}, ${refCount} marked as reference${refCount === 1 ? '' : 's'}`
        : `from ${positive.length} positively rated ${label.toLowerCase()}`,
    });
  });

  const negWords = ['too baggy', 'too narrow', 'too tight', 'too long', 'too short', 'too loose', 'too wide'];
  const negatives: Record<string, number> = {};
  garments.forEach((g) => {
    const v = g.visual.toLowerCase();
    negWords.forEach((w) => { if (v.includes(w)) negatives[w] = (negatives[w] ?? 0) + 1; });
  });
  const worst = topEntries(negatives, 1)[0];
  if (worst) {
    prefs.push({
      text: `Tends to dislike garments that run "${worst}"`,
      basis: `from ${negatives[worst]} visual-preference note${negatives[worst] === 1 ? '' : 's'}`,
    });
  }

  return prefs;
}

export function computeRanges(garments: Garment[], units: Units): ZoneRange[] {
  const zoneLabel = new Map<string, string>();
  (['tops', 'pants', 'jackets'] as Category[]).forEach((cat) => keysFor(cat).forEach(([k, l]) => zoneLabel.set(k, l)));

  const byZone = new Map<string, number[]>();
  garments.forEach((g) => {
    g.feels.forEach((f) => {
      if (f.verdict !== 'Good') return;
      const key = Object.keys(g.m).find((k) => zoneLabel.get(k) === f.area) as ZoneKey | undefined;
      const val = key ? g.m[key] : undefined;
      if (val === undefined) return;
      const list = byZone.get(f.area) ?? [];
      list.push(val);
      byZone.set(f.area, list);
    });
  });

  const ranges: ZoneRange[] = [];
  byZone.forEach((vals, area) => {
    if (vals.length < 2) return;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    ranges.push({
      label: `Comfortable ${area.toLowerCase()}`,
      val: min === max ? `${formatValue(min, units)} ${units}` : `${formatValue(min, units)} – ${formatValue(max, units)} ${units}`,
    });
  });

  ranges.push({ label: 'Strong reference garments', val: String(garments.filter((g) => g.ref).length) });
  return ranges.slice(0, 6);
}

export function computeFitProfile(garments: Garment[], units: Units): FitProfile {
  return {
    trend: computeTrend(garments),
    prefs: computeLearnedPrefs(garments),
    ranges: computeRanges(garments, units),
  };
}

/** Latest value per body zone across the log — same "read the current state off the
 * append-only log" pattern as feelsFrom() for garments (src/data/hydrate.ts). */
export function latestBodyMeasurements(entries: BodyMeasurement[]): BodyMeasurements {
  const latest: BodyMeasurements = {};
  [...entries]
    .sort((a, b) => a.at - b.at)
    .forEach((e) => {
      (Object.keys(e.m) as BodyZoneKey[]).forEach((k) => {
        const v = e.m[k];
        if (v !== undefined) latest[k] = v;
      });
    });
  return latest;
}
