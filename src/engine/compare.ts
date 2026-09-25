import { Category, CompareOutput, Confidence, DiffRow, FitCheckDraft, FitCheckResult, Garment, ZoneKey } from '../types';
import { COMFORT_SCORE, FEEL, SHAPE_RATIOS, STRETCH_MULTIPLIER, TOLERANCE, ZONE_WEIGHT, isSet, keysFor } from '../data/constants';
import { preferredFitsFor } from './profile';

/**
 * Matching pipeline per spec.md Feature 2: measurements first, then fit type, then
 * silhouette, then accumulated preference — in that order of weight, not just
 * nearest-measurement. `matchScore` below is the composite used for ranking and
 * confidence; `score` (raw cm average) stays separate and is only ever shown to the
 * user as "avg X cm," never blended with the other factors.
 */

const RECENT_MS = 1000 * 60 * 60 * 24 * 30 * 6; // ~6 months

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Jaccard-style overlap between two free-text silhouette descriptions — a secondary
 * signal now (see shapeSimilarity below), since two garments can describe the same cut
 * in different words, or the same words for a different cut. */
function silhouetteSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  ta.forEach((t) => { if (tb.has(t)) overlap += 1; });
  return overlap / Math.max(ta.size, tb.size);
}

/** Ratio between two zones (e.g. shoulder/chest) — a size-independent read on shape:
 * how dropped/boxy a top is, how tapered a pant is. undefined if either zone is missing. */
function ratioSignature(cat: Category, val: (k: ZoneKey) => number | undefined): number[] {
  const pairs = SHAPE_RATIOS[cat] ?? [];
  return pairs.map(([a, b]) => {
    const va = val(a);
    const vb = val(b);
    return va !== undefined && vb !== undefined && vb !== 0 ? va / vb : NaN;
  });
}

/** 0..1 similarity between two ratio signatures — the average relative difference,
 * inverted and clamped, over whichever pairs both sides actually have. null if neither
 * side has any computable ratio (too few measurements entered to say anything). */
function ratioSimilarity(a: number[], b: number[]): number | null {
  let sum = 0;
  let n = 0;
  a.forEach((ra, i) => {
    const rb = b[i];
    if (Number.isNaN(ra) || Number.isNaN(rb)) return;
    const rel = Math.abs(ra - rb) / ((ra + rb) / 2);
    sum += Math.max(0, 1 - Math.min(1, rel));
    n += 1;
  });
  return n ? sum / n : null;
}

/**
 * Measurement-derived silhouette match (spec.md's "silhouette inferred from measurement
 * distribution", previously just a text-overlap guess — see CHECKLIST.md). Falls back to
 * the free-text overlap alone when too few measurements are entered to compute a ratio;
 * otherwise blends the two, weighted toward the numbers since they're what was actually
 * measured rather than described.
 */
function shapeSimilarity(fc: FitCheckDraft, fcSilhouette: string, g: Garment): number {
  const fcVal = (k: ZoneKey) => {
    const raw = fc[k];
    if (typeof raw !== 'string' || raw === '') return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  };
  const ratioSim = ratioSimilarity(ratioSignature(fc.category, fcVal), ratioSignature(g.cat, (k) => g.m[k]));
  const textSim = silhouetteSimilarity(fcSilhouette, g.sil);
  return ratioSim === null ? textSim : ratioSim * 0.7 + textSim * 0.3;
}

/** 0..1 — how positively this garment's own logged comfort feedback reads. Neutral (0.5) with no feedback yet. */
function positivityOf(g: Garment): number {
  if (!g.feels.length) return 0.5;
  return g.feels.reduce((a, f) => a + (COMFORT_SCORE[f.verdict] ?? 0.5), 0) / g.feels.length;
}

function hasRecentObservation(g: Garment): boolean {
  if (!g.observations.length) return false;
  const latest = g.observations[g.observations.length - 1].at;
  return Date.now() - latest <= RECENT_MS;
}

export function compare(fc: FitCheckDraft, garments: Garment[]): CompareOutput | null {
  const keys = keysFor(fc.category)
    .map(([k]) => k)
    .filter((k) => fc[k] !== undefined && fc[k] !== '');
  // A candidate only needs to share at least one of the zones the user typed —
  // requiring the full typed set excluded every partially-measured garment
  // outright, which both under-used the closet early on (when few garments are
  // fully measured) and made the "no measurements" empty state fire for the
  // wrong reason: a user who'd entered 5 measurements, where every top they own
  // was missing just one of those 5, saw "Enter at least one measurement" even
  // though they already had (see DESIGN_GUIDELINES.md's Known failure patterns).
  // Each candidate's own `matchKeys` below (the subset it actually has) is what's
  // scored and displayed for it — thinner overlap is penalized by the existing
  // confidence/coverage scoring in buildResult, not excluded from the pool here.
  const pool = garments.filter((g) => g.cat === fc.category && keys.some((k) => g.m[k] !== undefined));
  if (!pool.length || !keys.length) return null;

  const fcFit = typeof fc.fit === 'string' ? fc.fit : '';
  const fcSilhouette = typeof fc.silhouette === 'string' ? fc.silhouette : '';

  // What this closet's positively-rated garments in this category cluster around —
  // computed once per compare(), not per candidate, since it's a property of the
  // closet/category, not of any one garment (feeds preferenceBonus below).
  const preferredFits = preferredFitsFor(fc.category, garments);

  const scored = pool
    .map((g) => {
      const matchKeys = keys.filter((k) => g.m[k] !== undefined);
      const weights = matchKeys.map((k) => ZONE_WEIGHT[k] ?? 1);
      const weightSum = weights.reduce((a, w) => a + w, 0);
      const diffs = matchKeys.map((k) => Number(fc[k]) - (g.m[k] as number));
      const score = diffs.reduce((a, d) => a + Math.abs(d), 0) / matchKeys.length;
      const stretchMult = STRETCH_MULTIPLIER[g.stretch] ?? 1;
      const tolUnits = matchKeys.map((k, i) => Math.abs(diffs[i]) / ((TOLERANCE[k] ?? 3) * stretchMult));
      // Weighted, not flat — a zone fabric/tailoring can't fake (shoulder, waist)
      // should dominate the ranking more than one that reads as more forgiving.
      const avgTol = tolUnits.reduce((a, t, i) => a + t * weights[i], 0) / weightSum;

      // isSet() guards both sides — an unset fit ('—' or '') is missing evidence,
      // never a value that can "match" or "mismatch" another fit type.
      const fitMatch = isSet(fcFit) && isSet(g.fit) && fcFit.toLowerCase() === g.fit.toLowerCase();
      const silhouetteMatch = shapeSimilarity(fc, fcSilhouette, g);
      const positivity = positivityOf(g);
      // Distinct from fitMatch (candidate vs. this one garment): does this garment's
      // fit type belong to what the closet as a whole tends to rate well in this
      // category, per computeLearnedPrefs on the Profile page.
      const preferred = isSet(g.fit) && preferredFits.includes(g.fit);

      // Measurement distance is primary; fit-type/silhouette/feedback/preference only
      // nudge the ranking (each adjustment is small relative to a typical avgTol gap)
      // — they break ties among close measurement matches, they don't override a bad one.
      const matchScore =
        avgTol +
        (fitMatch ? 0 : 0.4) +
        (1 - silhouetteMatch) * 0.3 +
        (0.5 - positivity) * 0.3 -
        (preferred ? 0.15 : 0);

      return { g, matchKeys, diffs, score, avgTol, fitMatch, silhouetteMatch, positivity, preferred, matchScore };
    })
    .sort((a, b) => a.matchScore - b.matchScore);

  return { keys, scored };
}

export function toneFor(absDiff: number, tol: number): 'good' | 'warn' | 'bad' {
  if (absDiff <= tol) return 'good';
  if (absDiff <= tol * 1.75) return 'warn';
  return 'bad';
}

export function buildResult(fc: FitCheckDraft, garments: Garment[], labels: Record<string, string>): FitCheckResult | null {
  const cmp = compare(fc, garments);
  if (!cmp) return null;

  const top = cmp.scored[0];
  const stretchMult = STRETCH_MULTIPLIER[top.g.stretch] ?? 1;
  // top's own matchKeys (the zones it actually shares with what was typed), not
  // the full cmp.keys — a thinner-overlap match must only ever display the zones
  // it was really compared on, never claim a diff for one it doesn't have.
  const diffs: DiffRow[] = top.matchKeys.map((k, i) => {
    const v = top.diffs[i];
    const tol = (TOLERANCE[k] ?? 3) * stretchMult;
    return {
      label: labels[k] ?? k,
      cm: v,
      tone: toneFor(Math.abs(v), tol),
    };
  });

  const over = top.matchKeys.map((k, i) => Math.abs(top.diffs[i]) / ((TOLERANCE[k] ?? 3) * stretchMult));
  const worst = Math.max(...over);
  const good = worst <= 1;
  const ok = worst <= 1.75;

  const feel = top.matchKeys
    .map((k, i) => {
      const v = top.diffs[i];
      const pair = FEEL[k as ZoneKey];
      if (v === 0 || !pair) return null;
      return pair[v > 0 ? 0 : 1];
    })
    .filter((x): x is string => !!x)
    .slice(0, 4);

  const refs = cmp.scored.filter((s) => s.g.ref).length;

  // How much of this category's measurement set the comparison actually used —
  // top's own matchKeys, not the full set typed (they can differ now that a
  // candidate only needs to share at least one zone; see compare() above).
  // Matching on 1 of a pants garment's 7 zones is much weaker evidence than
  // matching on 1 of a top's 4, and either way a near-complete measurement set
  // says a lot more than a single axis, however tight that one match is.
  const totalZones = keysFor(fc.category).length;
  const coverage = top.matchKeys.length / totalZones;

  // Confidence points: evidence volume (refs, pool size — the original formula),
  // plus how well the closest match actually agrees on fit type, silhouette, and
  // reads consistently positive/recent — per spec.md's "more comparable garments,
  // more consistent notes, more recent data, silhouette agreement all raise it."
  let points = 0;
  if (refs >= 1) points += 1;
  if (refs >= 3) points += 1;
  if (cmp.scored.length >= 2) points += 1;
  if (cmp.scored.length >= 4) points += 1;
  if (top.fitMatch) points += 1;
  if (top.silhouetteMatch >= 0.5) points += 1;
  if (top.positivity >= 0.6) points += 1;
  else if (top.positivity <= 0.3) points -= 1;
  if (hasRecentObservation(top.g)) points += 1;
  if (top.preferred) points += 1;
  if (coverage >= 0.75) points += 1;
  else if (top.matchKeys.length === 1) points -= 2;
  else if (coverage < 0.5) points -= 1;
  points = Math.max(0, points);

  // A single measured zone is never enough evidence for "High" on its own,
  // no matter how many reference garments or how well fit type/silhouette
  // agree — those signals describe the closest garment, not how thoroughly
  // this candidate was actually measured.
  const confidence: Confidence =
    top.matchKeys.length === 1 ? (points >= 6 ? 'Medium' : 'Low') : points >= 7 ? 'High' : points >= 4 ? 'Medium' : 'Low';

  const tone: 'good' | 'warn' | 'bad' = good ? 'good' : ok ? 'warn' : 'bad';

  // Compares against the garment's *silhouette* (fc.silhouette vs top.g.sil), not
  // fit type — a "Silhouette:" line built from fit-type values was the bug (see
  // DESIGN_GUIDELINES.md's Known failure patterns). `sameLabel` guards against ever
  // rendering "different" over two identical-looking strings: when fc.silhouette
  // wasn't entered, the label falls back to the candidate's own value, which would
  // trivially read as "different (Regular → Regular)" if judged on the numeric
  // shape score alone — the displayed text must agree with the displayed verdict.
  const silLabel = (typeof fc.silhouette === 'string' && fc.silhouette.trim()) || top.g.sil;
  const sameLabel = silLabel.toLowerCase() === top.g.sil.toLowerCase();
  const silhouetteNote = sameLabel || top.silhouetteMatch >= 0.7
    ? `Silhouette: similar (${silLabel} → ${top.g.sil})`
    : top.silhouetteMatch >= 0.5
      ? `Silhouette: close (${silLabel} → ${top.g.sil})`
      : `Silhouette: different (${silLabel} → ${top.g.sil}) — expect a noticeably different shape even where measurements are close.`;

  // top.g.fit may be unset ('—') — never treat that as a real fit label to count
  // "same fit" against or to name in copy (see engine/compare.ts's isSet()).
  const topFitKnown = isSet(top.g.fit);
  const sameFitPositive = topFitKnown
    ? cmp.scored.filter((s) => s.g.fit === top.g.fit && s.positivity >= 0.6).length
    : 0;
  const preferenceNote = !topFitKnown
    ? "Your preference: this garment's fit type wasn't recorded, so there's nothing to compare preference against yet."
    : sameFitPositive > 0
      ? `Your preference: you've rated ${sameFitPositive} similar ${top.g.fit.toLowerCase()}-fit garment${sameFitPositive === 1 ? '' : 's'} positively.${top.preferred ? ` It's one of the fits you tend to like in this category overall.` : ''}`
      : `Your preference: no ${top.g.fit.toLowerCase()}-fit garments rated positively yet to compare against.`;

  // Preference-based reasons ("you've rated it positively") only get listed when
  // the measurement match itself is at least wearable (tone isn't 'bad') — stating
  // them under a "Likely off for you" verdict reads as contradicting it, even
  // though they technically answer "why this is the closest candidate" rather than
  // "why it's a good match." Keeping them out for a bad match avoids that mixed signal.
  const why = [
    `Closest by measurements to your ${top.g.brand} ${top.g.name}.`,
    top.fitMatch ? `Same ${top.g.fit.toLowerCase()} fit type.` : null,
    !top.fitMatch && top.silhouetteMatch >= 0.5 ? 'A similar silhouette.' : null,
    ok && top.positivity >= 0.6 ? "You've rated it (and similar garments) positively." : null,
    ok && top.preferred ? "It's a fit type this closet's positively-rated garments tend to cluster around." : null,
  ].filter((x): x is string => !!x).join(' ');

  return {
    verdict: good ? 'Likely a good match' : ok ? 'Close, with caveats' : 'Likely off for you',
    verdictNote: good
      ? 'Every measurement sits inside the tolerance you already wear happily.'
      : ok
        ? 'Wearable, but noticeably different from your closest reference.'
        : 'Several measurements sit well outside anything you own and like.',
    tone,
    closest: top.g,
    diffs,
    feel: feel.length ? feel : ['Effectively identical to your closest reference.'],
    silhouetteNote,
    preferenceNote,
    similar: cmp.scored.slice(0, 3).map((s) => ({ garment: s.g, gap: Math.round(s.score * 10) / 10 })),
    why,
    confidence,
    // "compared," not "entered" — top.matchKeys can be a subset of what was
    // actually typed when the closest garment doesn't share every typed zone,
    // and the note must describe what the comparison actually used, not imply
    // the user entered less than they did.
    confidenceNote: coverage < 1
      ? `${cmp.scored.length} comparable garments · ${refs} strong reference${refs === 1 ? '' : 's'} · ${top.matchKeys.length} of ${totalZones} measurements compared`
      : `${cmp.scored.length} comparable garments · ${refs} strong reference${refs === 1 ? '' : 's'}`,
  };
}

export function dotFor(text: string): 'good' | 'warn' | 'bad' {
  const t = text.toLowerCase();
  if (t.indexOf('too') === 0) return 'bad';
  if (t.indexOf('slightly') === 0 || t === 'tight' || t === 'loose') return 'warn';
  return 'good';
}

/** The small set of holistic verdict strings a fit-history note can literally equal
 * (AddManualScreen/Onboarding's one-time "how does it fit" step) — checked as a whole
 * string, never a substring, so free text that happens to contain "fit" isn't misread. */
const HOLISTIC_NOTE_TONE: Record<string, 'good' | 'warn' | 'bad'> = {
  'Fits great': 'good',
  'Added to closet': 'good',
  'Fits okay': 'warn',
  "Doesn't fit": 'bad',
};

/**
 * Tone for one fit-history entry. Prefers the observation's actual per-zone comfort
 * verdicts (real structured data, via COMFORT_SCORE) over guessing from the note's free
 * text — the note is often a user's own phrasing ("Shoulder uncomfortable, waist was
 * perfect") that a keyword heuristic can't classify reliably. Only when comfort is empty
 * (a holistic-only observation) does this fall back to the note text, and even then only
 * to the fixed set of strings the app itself generates, never a substring guess.
 */
export function historyTone(note: string, comfort: { verdict: string }[]): 'good' | 'warn' | 'bad' {
  if (comfort.length) {
    const worst = Math.min(...comfort.map((c) => COMFORT_SCORE[c.verdict] ?? 0.5));
    return worst >= 1 ? 'good' : worst >= 0.35 ? 'warn' : 'bad';
  }
  return HOLISTIC_NOTE_TONE[note] ?? dotFor(note);
}

export function refFor(cat: Category, garments: Garment[]): Garment | undefined {
  const pool = garments.filter((g) => g.cat === cat);
  return pool.find((g) => g.ref) ?? pool[0];
}

export function orderFits(cat: Category, garments: Garment[], allFits: string[]): string[] {
  const use: Record<string, number> = {};
  garments.filter((g) => g.cat === cat).forEach((g) => {
    use[g.fit] = (use[g.fit] ?? 0) + 1;
  });
  return [...allFits].sort((a, b) => (use[b] ?? 0) - (use[a] ?? 0));
}

export function seedNewGarment(cat: Category, garments: Garment[]) {
  const pool = garments.filter((g) => g.cat === cat);
  const mode = (k: 'fit' | 'size') => {
    const counts: Record<string, number> = {};
    pool.forEach((g) => {
      // Never let unset fits ('—') outvote real ones and get seeded into a new
      // draft as if the user had picked them — size's own '—' default is left
      // alone here since it's just descriptive, not a comparison-engine input.
      if (k === 'fit' && !isSet(g[k])) return;
      counts[g[k]] = (counts[g[k]] ?? 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ?? '';
  };
  const fit = mode('fit');
  const matching = pool.filter((g) => g.fit === fit);
  const ref = matching.find((g) => g.ref) ?? matching[0] ?? pool.find((g) => g.ref) ?? pool[0];
  return { category: cat, size: mode('size'), fit, silhouette: ref ? ref.sil : '', stretch: ref ? ref.stretch : 'Some stretch' };
}
