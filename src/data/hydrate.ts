import { Category, FeelEntry, FitObservation, Garment, HistoryEntry } from '../types';
import { COMFORT_SCORE, coreKeysFor, keysFor } from './constants';
import { historyTone } from '../engine/compare';

/** How far back a comfort observation still counts as "recent" for reference status. */
const REF_RECENT_MS = 1000 * 60 * 60 * 24 * 30 * 12; // ~12 months

/** How positive the latest feedback needs to read, on average, to call a garment a
 * "strong reference." 0.8 sits between a single "Good" (1.0) and a single "Tight"/
 * "Loose" (0.35) — a garment logged as mostly-but-not-perfectly comfortable can still
 * qualify, one logged as noticeably tight/loose anywhere can't. */
const REF_THRESHOLD = 0.8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2026" — the label the timeline and history rows use. Fixed table, not Intl:
 * ICU short-month output (e.g. "Sept") varies between Hermes on Android and other
 * runtimes, which would make the same data render inconsistently across platforms. */
export function whenLabel(at: number): string {
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Latest comfort tag per zone, in the zone order for the category. Observations are
 * append-only, so "how it fits now" is a read over the log, not a stored field.
 */
export function feelsFrom(observations: FitObservation[], cat: Category): FeelEntry[] {
  const latest = new Map<string, FeelEntry>();
  [...observations]
    .sort((a, b) => a.at - b.at)
    .forEach((o) => o.comfort.forEach((c) => latest.set(c.area, c)));

  const order = keysFor(cat).map(([, label]) => label);
  const seen = new Set<string>();
  const ordered: FeelEntry[] = [];
  order.forEach((label) => {
    const hit = latest.get(label);
    if (hit) {
      ordered.push(hit);
      seen.add(label);
    }
  });
  latest.forEach((entry, area) => {
    if (!seen.has(area)) ordered.push(entry);
  });
  return ordered;
}

export function historyFrom(observations: FitObservation[]): HistoryEntry[] {
  return [...observations]
    .sort((a, b) => a.at - b.at)
    .map((o) => ({ when: whenLabel(o.at), note: o.note, tone: historyTone(o.note, o.comfort) }));
}

export function visualFrom(observations: FitObservation[], fallback: string): string {
  const withVisual = [...observations].sort((a, b) => a.at - b.at).filter((o) => !!o.visual);
  return withVisual.length ? (withVisual[withVisual.length - 1].visual as string) : fallback;
}

export type GarmentCore = Omit<Garment, 'feels' | 'history' | 'visual' | 'observations' | 'ref'> & {
  visual: string;
};

/**
 * "Strong reference" (spec.md §Feature 2 / CHECKLIST.md §26) — computed from the
 * observation log, not a flag anyone sets. A garment earns it by being: measured
 * completely for its category, recently rated, and consistently comfortable — not by
 * being manually marked. Deliberately conservative (all four conditions, not a
 * weighted score) since this flag gets used elsewhere as "trust this data a lot"
 * (confidence scoring, prefill defaults, the Profile/Home "references" lists).
 */
function isStrongReference(core: Pick<GarmentCore, 'cat' | 'm'>, observations: FitObservation[], feels: FeelEntry[]): boolean {
  const complete = coreKeysFor(core.cat).every(([k]) => core.m[k] !== undefined);
  if (!complete || !feels.length) return false;

  const withFeedback = observations.filter((o) => o.comfort.length > 0);
  if (!withFeedback.length) return false;
  const recent = withFeedback.some((o) => Date.now() - o.at <= REF_RECENT_MS);
  if (!recent) return false;

  // Latest-per-zone (feels), not every historical entry — an old bad rating that's
  // since been superseded by a later "Good" shouldn't keep a garment out forever.
  const avgScore = feels.reduce((a, f) => a + (COMFORT_SCORE[f.verdict] ?? 0.5), 0) / feels.length;
  return avgScore >= REF_THRESHOLD;
}

/** Rebuild the derived view fields from the observation log. */
export function hydrate(core: GarmentCore, observations: FitObservation[]): Garment {
  const obs = [...observations].sort((a, b) => a.at - b.at);
  const feels = feelsFrom(obs, core.cat);
  return {
    ...core,
    observations: obs,
    feels,
    history: historyFrom(obs),
    visual: visualFrom(obs, core.visual),
    ref: isStrongReference(core, obs, feels),
  };
}
