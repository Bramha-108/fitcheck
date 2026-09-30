import { BodyZoneKey, Category, StretchLevel, ZoneKey } from '../types';

export const TOP_MEASURES: [ZoneKey, string][] = [
  ['chest', 'Chest'], ['shoulder', 'Shoulder'], ['length', 'Length'], ['sleeve', 'Sleeve'], ['waist', 'Waist'],
];

export const PANT_MEASURES: [ZoneKey, string][] = [
  ['waist', 'Waist'], ['rise', 'Rise'], ['hip', 'Hip / seat'], ['thigh', 'Thigh'],
  ['knee', 'Knee'], ['inseam', 'Inseam'], ['outseam', 'Outseam'], ['legOpening', 'Leg opening'],
];

export function keysFor(cat: Category): [ZoneKey, string][] {
  return cat === 'pants' ? PANT_MEASURES : TOP_MEASURES;
}

/** Zones that are entered, stored, displayed and compared like any other, but
 * aren't part of what "measured completely" means for their category. Outseam is
 * largely inseam + rise, which are already in the set — so a pants garment with
 * every other zone logged is still fully measured without it, and adding it
 * didn't retroactively demote existing strong references (hydrate.ts's
 * isStrongReference). */
const SUPPLEMENTARY_ZONES: ReadonlySet<ZoneKey> = new Set<ZoneKey>(['outseam']);

/** keysFor(cat) minus SUPPLEMENTARY_ZONES — the set "measured completely" is judged against. */
export function coreKeysFor(cat: Category): [ZoneKey, string][] {
  return keysFor(cat).filter(([k]) => !SUPPLEMENTARY_ZONES.has(k));
}

/** Every zone key that appears in any category's measurement set — used where code
 * needs to recognize "is this a measurement field" without caring which category it
 * belongs to (e.g. converting in-progress draft values when the display unit changes). */
export const ALL_ZONE_KEYS: ZoneKey[] = Array.from(new Set([...TOP_MEASURES, ...PANT_MEASURES].map(([k]) => k)));

export const BODY_MEASURES: [BodyZoneKey, string][] = [
  ['chest', 'Chest'], ['shoulder', 'Shoulder'], ['waist', 'Waist'],
  ['hip', 'Hip'], ['thigh', 'Thigh'], ['inseam', 'Inseam'],
];

/** True when a free-text draft field (fit, silhouette) holds a real user-provided
 * value rather than the '—' placeholder saved for "not provided" (see store.tsx's
 * save paths) or an empty string — used anywhere fit/silhouette participates in
 * comparison scoring or preference stats, so an unset field is never treated as
 * if the user had actually chosen something (DESIGN_GUIDELINES.md's "never confuse
 * missing information with inferred information", applied to fit type). */
export function isSet(v: string): boolean {
  return !!v && v !== '—';
}

export const FITS: Record<Category, string[]> = {
  tops: ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Boxy', 'Cropped', 'Longline', 'Drop-shoulder'],
  pants: ['Skinny', 'Slim', 'Straight', 'Regular', 'Relaxed', 'Wide', 'Wide-leg', 'Baggy', 'Tapered', 'Bootcut', 'Cargo'],
  jackets: ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Boxy', 'Cropped', 'Long', 'Drop-shoulder'],
};

export const FEEL: Partial<Record<ZoneKey, [string, string]>> = {
  chest: ['More room through the chest', 'Snugger through the chest'],
  shoulder: ['Wider across the shoulders', 'Slightly slimmer shoulders'],
  length: ['Slightly longer overall', 'Slightly shorter overall'],
  sleeve: ['A little more sleeve', 'A little less sleeve'],
  waist: ['A touch looser at the waist', 'A touch tighter at the waist'],
  rise: ['Sits a little higher', 'Sits a little lower'],
  hip: ['More room through the seat', 'Closer through the seat'],
  thigh: ['More room in the thigh', 'Closer in the thigh'],
  knee: ['Straighter through the knee', 'Narrower through the knee'],
  inseam: ['Longer inseam — more stacking', 'Shorter inseam — less stacking'],
  outseam: ['Longer overall, waistband to hem', 'Shorter overall, waistband to hem'],
  legOpening: ['Wider leg opening', 'Narrower leg opening'],
};

export const TOLERANCE: Record<ZoneKey, number> = {
  chest: 4, shoulder: 2, length: 4, sleeve: 3,
  waist: 3, rise: 2, hip: 4, thigh: 3, knee: 3, inseam: 4, outseam: 4, legOpening: 4,
};

export const STRETCH_LEVELS: StretchLevel[] = ['Rigid', 'Some stretch', 'Very stretchy'];

/** Scales TOLERANCE per zone — a stretchy garment can drift further from the logged
 * measurement and still feel the same; a rigid one can't. 'Some stretch' (1x) is the
 * neutral default, matching pre-stretch-tracking behavior for existing data. */
export const STRETCH_MULTIPLIER: Record<StretchLevel, number> = {
  Rigid: 0.75, 'Some stretch': 1, 'Very stretchy': 1.4,
};

/** How much each zone should count toward the measurement-match ranking (compare.ts's
 * avgTol). Zones a tailor/fabric can't fake — shoulder width, waist — matter more to
 * "is this really the same fit" than zones that read as more forgiving, like length or
 * sleeve. 1 is neutral; missing keys default to 1 wherever this is read. */
export const ZONE_WEIGHT: Partial<Record<ZoneKey, number>> = {
  shoulder: 1.5, chest: 1, length: 0.75, sleeve: 0.75,
  waist: 1.5, rise: 1, hip: 1, thigh: 1, knee: 0.75, inseam: 1, outseam: 0.75, legOpening: 0.75,
};

/** Zone pairs whose ratio stands in for "shape" — e.g. shoulder/chest reads as how
 * dropped/boxy a top is, waist/hip as how tapered a pant is — independent of overall
 * size. Used by compare.ts's measurement-derived silhouette match, replacing a guess
 * at silhouette from free text with something read off the numbers actually logged. */
export const SHAPE_RATIOS: Partial<Record<Category, [ZoneKey, ZoneKey][]>> = {
  tops: [['shoulder', 'chest'], ['chest', 'length']],
  jackets: [['shoulder', 'chest'], ['chest', 'length']],
  pants: [['waist', 'hip'], ['thigh', 'legOpening']],
};

/** 0..1 read of a single comfort verdict — shared by the comparison engine (candidate
 * positivity) and reference-garment detection (§26), so "how positive is this feedback"
 * means the same thing in both places. */
export const COMFORT_SCORE: Record<string, number> = {
  'Too tight': 0, Tight: 0.35, Good: 1, Loose: 0.35, 'Too loose': 0,
};

export const STYLE_TAGS = ['Korean', 'Streetwear', 'Minimal', 'Formal', 'Workwear', 'Vintage'];

/** Silhouette descriptors — shared across categories since "how boxy/slim does this
 * read" isn't a category-specific concept. Onboarding's tag picker
 * (src/components/Onboarding.tsx) shows these alongside category-specific fit tags
 * (OB_FIT_TAGS) in one list; the store splits them back apart when saving (these
 * become fit/sil, the rest become style tags). */
export const OB_SILHOUETTE_TAGS = ['Relaxed', 'Regular', 'Slim', 'Oversized', 'Boxy'];

/** Category-specific fit-quality tags for onboarding's "what makes the fit work"
 * step — talk about the dimensions that actually matter for that garment (pants
 * don't have a chest or shoulders) rather than reusing one universal questionnaire. */
export const OB_FIT_TAGS: Record<Category, string[]> = {
  tops: ['Roomy chest', 'Comfortable shoulders', 'Perfect length'],
  jackets: ['Roomy chest', 'Comfortable shoulders', 'Perfect length'],
  pants: ['Comfortable waist', 'Room through seat', 'Comfortable thighs', 'Preferred leg opening', 'Preferred length'],
};

export function obTagsFor(cat: Category): string[] {
  return [...OB_FIT_TAGS[cat], ...OB_SILHOUETTE_TAGS];
}

export const FIT_VERDICTS = ['Too tight', 'Tight', 'Good', 'Loose', 'Too loose'] as const;

/** Visual-preference chips, category-specific for the same reason as OB_FIT_TAGS —
 * "Perfect stacking" / "Prefer wider leg" mean nothing for a top, and a top's
 * silhouette language doesn't map onto how pants sit. */
export const VISUAL_LOOKS: Record<Category, string[]> = {
  tops: ['Looks too baggy', 'Love the relaxed silhouette', 'Too long', 'Prefer cropped'],
  jackets: ['Looks too baggy', 'Love the relaxed silhouette', 'Too long', 'Prefer cropped'],
  pants: ['Love the relaxed silhouette', 'Perfect stacking', 'Prefer wider leg', 'Prefer cropped', 'Too long'],
};

export const CLOSET_FILTERS = ['All', 'Tops', 'Pants', 'Jackets', 'Best fitting', 'Recently added'];

export const CATEGORY_LABELS: [Category, string][] = [
  ['tops', 'Tops'], ['pants', 'Pants'], ['jackets', 'Jackets'],
];

export function tone(a: string, b: string): [string, string] {
  return [a, b];
}
