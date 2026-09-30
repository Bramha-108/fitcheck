export type Category = 'tops' | 'pants' | 'jackets';

export type ZoneKey =
  | 'chest' | 'shoulder' | 'length' | 'sleeve'
  | 'waist' | 'rise' | 'hip' | 'thigh' | 'knee' | 'inseam' | 'outseam' | 'legOpening';

export type Measurements = Partial<Record<ZoneKey, number>>;

/** Genuine body dimensions — deliberately a smaller set than ZoneKey, which also
 * includes garment-design choices (hem length, sleeve length, rise, leg opening)
 * that aren't things a body "has." */
export type BodyZoneKey = 'chest' | 'shoulder' | 'waist' | 'hip' | 'thigh' | 'inseam';

export type BodyMeasurements = Partial<Record<BodyZoneKey, number>>;

export type FitVerdict = 'Too tight' | 'Tight' | 'Good' | 'Loose' | 'Too loose';

export type Units = 'cm' | 'in';

/** How much the fabric gives, widening or narrowing the effective measurement
 * tolerance when comparing (src/engine/compare.ts's STRETCH_MULTIPLIER). */
export type StretchLevel = 'Rigid' | 'Some stretch' | 'Very stretchy';

export interface FeelEntry {
  area: string;
  verdict: FitVerdict;
}

export interface HistoryEntry {
  when: string;
  note: string;
  // Derived from the observation's actual comfort verdicts (or, for the small set of
  // known holistic verdict strings, the note itself) — never guessed by string-sniffing
  // the note's free text, since a user's own phrasing can't be reliably classified.
  tone: 'good' | 'warn' | 'bad';
}

/**
 * One dated fit observation — spec.md Feature 3/4. Append-only: an update never
 * rewrites an earlier entry, it adds a new one, because the change over time is
 * itself the signal. Comfort and visual preference stay separate fields.
 */
export interface FitObservation {
  id: number;
  garmentId: number;
  at: number; // epoch ms
  note: string;
  comfort: FeelEntry[];
  visual?: string;
}

/**
 * A dated body-measurement log entry (CHECKLIST.md §15 / spec.md Round 3). Optional
 * and entirely separate from garment fit data — FitCheck's matching stays garment-
 * reference-based either way (see spec.md's "remembers what fits you, not what size
 * you are"); this is just a personal record the user can keep if they want one.
 * Append-only, same philosophy as FitObservation: a new entry, not an overwrite.
 */
export interface BodyMeasurement {
  id: number;
  at: number; // epoch ms
  m: BodyMeasurements; // always stored in cm
}

export interface Garment {
  id: number;
  brand: string;
  name: string;
  cat: Category;
  size: string;
  fit: string;
  sil: string; // silhouette description
  stretch: StretchLevel;
  tags: string[];
  ref: boolean; // "strong reference" garment
  cap: string; // photo placeholder caption
  bg: [string, string]; // placeholder tone gradient colors
  m: Measurements; // always stored in cm; converted only for display
  photo: string | null; // local file uri inside the app's document dir, or null
  createdAt: number;
  observations: FitObservation[]; // append-only, oldest first — the source of truth
  // Derived from observations at load time (see src/data/hydrate.ts):
  feels: FeelEntry[]; // latest comfort tag per zone
  visual: string; // latest visual-preference note
  history: HistoryEntry[]; // observation notes, oldest first
}

export interface NewGarmentDraft {
  id: number | null; // set when editing an existing garment
  brand: string;
  name: string;
  category: Category;
  size: string;
  fit: string;
  silhouette: string;
  stretch: StretchLevel;
  notes: string;
  tags: string[];
  photo: string | null;
  m: Record<string, string>;
  /** Holistic "how does this fit" read for a brand-new garment — 'Fits great' |
   * 'Fits okay' | "Doesn't fit" | '' (not answered). Optional and only asked once,
   * at creation, mirroring Onboarding's own verdict step; never asked again while
   * editing — updating fit afterward is FitSheet's job (see store.tsx's saveGarment
   * and DetailScreen's "Update how it fits"). Left '' means no fit feedback is
   * recorded, same as the pre-existing behavior when this field didn't exist. */
  verdict: string;
}

/** A simulated on-device "scan" result (Onboarding's photo/screenshot method) —
 * never written into a draft's real fields, only offered as ghost placeholder
 * text the user must actually type/confirm to keep (see DESIGN_GUIDELINES.md's
 * Measurement integrity: a pre-filled `value` silently becomes real submitted
 * data, a `placeholder` cannot). */
export interface DetectedGarmentInfo {
  brand: string;
  name: string;
  size: string;
  m: Record<string, string>;
}

/** Which required fields are missing from a save attempt — surfaced inline on
 * the Add/Edit Garment form so the user can see exactly what's blocking Save,
 * rather than the draft silently being padded with fallback values. */
export interface NgValidationErrors {
  brand?: boolean;
  name?: boolean;
  size?: boolean;
  measurements?: boolean;
}

/**
 * First-run wizard (src/components/Onboarding.tsx) — a guided, linear path to one
 * saved reference garment plus one comparison, distinct from the freeform Add/Edit
 * form. `verdict` is a holistic "how does this fit" read (not per-zone comfort),
 * kept separate from FitVerdict for that reason.
 */
export type OnboardingStep = 'welcome' | 'pick' | 'form' | 'how' | 'why' | 'payoff' | 'new' | 'aha' | 'outro';

export interface OnboardingDraft {
  cat: Category;
  brand: string;
  name: string;
  size: string;
  m: Record<string, string>;
  verdict: string;
  tags: string[];
  note: string;
}

export interface FitCheckDraft {
  category: Category;
  size: string;
  fit: string;
  silhouette: string;
  [key: string]: string | Category;
}

export interface ScoredGarment {
  g: Garment;
  // The subset of the compared zones this candidate actually has measured —
  // can be smaller than CompareOutput.keys once a candidate only needs to share
  // at least one typed zone, not all of them (see engine/compare.ts's compare()).
  matchKeys: ZoneKey[];
  diffs: number[]; // aligned index-for-index with matchKeys, not the full typed key set
  score: number; // raw average |delta| in cm — display only ("avg X cm"), never used for ranking
  avgTol: number; // average |delta| in tolerance-units — dimensionless, comparable across zones
  fitMatch: boolean; // exact fit-type label match (e.g. "Wide-leg" === "Wide-leg")
  silhouetteMatch: number; // 0..1 — blend of measurement-ratio shape match and free-text silhouette overlap
  positivity: number; // 0..1 — how positively this garment's own comfort feedback reads
  preferred: boolean; // this garment's fit type is one the closet's positively-rated garments in this category cluster around
  matchScore: number; // composite ranking score (lower = closer) — measurement-primary, adjusted by fit/silhouette/feedback/preference
}

export interface CompareOutput {
  keys: ZoneKey[];
  scored: ScoredGarment[];
}

export type Confidence = 'Low' | 'Medium' | 'High';

export interface DiffRow {
  label: string;
  cm: number; // raw delta, always in cm — converted for display only
  tone: 'good' | 'warn' | 'bad';
}

export interface FitCheckResult {
  verdict: string;
  verdictNote: string;
  tone: 'good' | 'warn' | 'bad';
  closest: Garment;
  diffs: DiffRow[];
  feel: string[];
  silhouetteNote: string;
  preferenceNote: string;
  similar: { garment: Garment; gap: number }[];
  why: string;
  confidence: Confidence;
  confidenceNote: string;
}

export interface TrendRead {
  headline: string;
  basis: string;
}

export interface LearnedPref {
  text: string;
  basis: string;
}

export interface ZoneRange {
  label: string;
  val: string;
}

export interface FitProfile {
  trend: TrendRead;
  prefs: LearnedPref[];
  ranges: ZoneRange[];
}
