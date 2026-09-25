# FitCheck — Complete Implementation Checklist (audited)

Source checklist as given, checked against the actual codebase on 2026-09-09. `[x]` = verified
done, `[ ]` with a **Gap:** note = not done or only partially done. Unannotated `[ ]` matches the
original checklist's own "should not exist" items (section 31) and is expected to stay unchecked.
See [PLAN.md](PLAN.md) for the prose status doc and prioritized next steps; this file is the
line-by-line record the audit was checked against.

---

## 1. Core Product Concept
- [x] App is called FitCheck
- [x] Core concept is personal clothing-fit memory
- [x] Fully offline
- [x] No account required
- [x] No cloud/backend required
- [x] No retailer integration required
- [x] No universal scraping required
- [x] No social/marketplace features
- [x] App does not primarily tell users "you are size M/L/32"
- [x] Existing garments act as personal reference points
- [x] Fit is treated as: measurements + cut/silhouette + preference + comfort + time

## 2. Navigation
- [x] Home
- [x] Closet
- [x] FitCheck
- [x] Profile

## 3. Home Screen
- [x] Add Garment
- [x] FitCheck (prominent CTA)
- [x] Recently added garments
- [x] Best-fitting/reference garments
- [x] Recent fit changes — **Fixed:** `src/engine/activity.ts` (new) derives both the stat count
  and the list from the real observation log. `recentChangeCount()` counts observations that
  carry actual comfort feedback (excluding the no-op "Added to closet" bootstrap entry every
  garment gets on creation) logged within a 90-day window. `recentChanges()` flattens every
  garment's feedback observations, sorts by timestamp descending, and takes one entry per
  garment (so repeatedly updating the same item doesn't crowd out everything else) — replacing
  the old `Math.min(3, garments.length)` stub and the hardcoded garment IDs 1/6/7. Verified
  against the real seed data: correctly surfaces whichever garments were actually touched most
  recently, in true chronological order, with a clean empty-state message when nothing's
  logged yet.
- [x] Basic wardrobe summary
- [ ] Current fit trends — **Gap, still open:** no trend headline surfaces on Home at all;
  `computeTrend` (`src/engine/profile.ts`) is only rendered on the Profile screen.
- [x] Communicates FitCheck learns from the user's clothes, not a generic catalogue app

## 4. Closet
- [x] Visual garment grid, photo-first cards
- [x] Brand / product name / size / fit type displayed
- [x] Tops / Pants / Jackets filters
- [x] Best fitting filter
- [x] Recently added filter
- [x] Fit type filter — **Fixed:** a second chip row appears whenever a specific category
  (Tops/Pants/Jackets) is active, listing only the fit types actually present in that category
  (via `orderFits()`, most-common-first — fit-type vocabulary is category-specific, e.g.
  "Wide-leg" only makes sense for pants, so the row is hidden under All/Best fitting/Recently
  added rather than trying to union everything). Selecting a category resets any active fit
  selection, since the vocabulary changes underneath it.
- [x] Search — **Fixed (not on the original checklist item list for this section, but grouped
  under §28's "Search/filter" offline requirement):** a text input searches brand, product name,
  fit type, size, and style tags, combining with the active category/fit filters. Empty-state
  copy adapts to explain a no-match search vs. a no-match filter.
- [x] Open garment
- [x] Edit garment
- [x] Delete garment
- [x] Update fit feedback
- [x] Preserve previous fit history when edited (append-only observation log, never overwritten)

## 5. Add Garment

### A. Photo / Screenshot
- **Removed (2026-09-11).** The Add-from-Photo entry point (`AddScreen.tsx`'s "Photo or
  screenshot" option, `AddPhotoScreen.tsx`, and `store.tsx`'s `ocr`/`ngSuggested` state) was a
  UI-only simulation with fixed fake values on a timer — no real image was ever read. spec.md
  rejected real OCR/vision extraction three separate times as scope creep for a personal project,
  and the simulated preview of that feature has now been removed too rather than kept around as a
  placeholder. Add Garment now offers Manual entry only. Onboarding's own photo/screenshot method
  (a separate, smaller simulated demo in the first-run wizard) is unaffected.

### B. Manual Entry
- [x] Brand
- [x] Product name
- [x] Category
- [x] Size
- [x] Measurements
- [x] Fit type
- [x] Style (style tags)
- [x] Notes — **Caveat:** stored into the garment's `visual` (visual-preference) field, not a
  distinct freeform notes field — see §6.

### C. Garment Photo
- [x] User can attach garment photo (`expo-image-picker`)
- [x] Photo is primarily for visual memory
- [x] Photo does not need to identify the garment automatically
- [x] Photo remains local
- [x] Store persistent local reference (copied into app document directory, `src/utils/photo.ts`)
- [x] Display thumbnail
- [x] Original remains on user's device
- [x] No automatic cloud upload
- [x] No duplicate remote copy

## 6. Garment Data Model

### General
- [x] ID
- [x] Brand
- [x] Product name
- [x] Category
- [x] Size
- [x] Photo reference
- [x] Fit type
- [x] Style tags
- [ ] Notes — **Gap:** no field distinct from visual preference; Add Manually's Notes box writes
  into `visual`, so a note like "bought on sale, runs small this season" (not a visual/silhouette
  opinion) has nowhere separate to live.
- [x] Date added (`createdAt`)

### Measurements
- [x] Measurement values
- [x] Measurement units (cm/in toggle, `src/utils/units.ts`)
- [x] Normalized internal representation (always stored in cm)

### Fit
- [x] Overall fit
- [x] Area-specific feedback
- [x] Physical comfort
- [x] Visual preference
- [x] Fit history

## 7. Category-Specific Measurements

### Shirts / Tops
- [x] Chest
- [x] Shoulder
- [x] Length
- [x] Sleeve
- [ ] Hem — **Gap:** not in `TOP_MEASURES` (`src/data/constants.ts`).

### Pants
- [x] Waist
- [x] Rise
- [x] Hip / seat
- [x] Thigh
- [x] Knee
- [x] Inseam
- [x] Leg opening

### Jackets
- [x] Chest
- [x] Shoulder
- [x] Sleeve
- [x] Length
- [ ] Hem — **Gap:** jackets reuse `TOP_MEASURES` verbatim (`keysFor()` only branches on
  pants vs. everything else); no jacket-specific zone list, so no hem field here either.

## 8. Fit Types
- [x] Pants: Skinny, Slim, Straight, Regular, Relaxed, Wide, Wide-leg, Baggy, Oversized, Tapered,
  Bootcut, Cargo/Utility, Custom (via free chip entry) — **Note:** "Flared" isn't in `FITS.pants`
  (`src/data/constants.ts`) though the checklist lists it separately from Bootcut.
- [x] Tops: Slim, Regular, Relaxed, Oversized, Boxy, Cropped, Longline, Drop-shoulder, Custom
- [x] Jackets: Slim, Regular, Relaxed, Oversized, Boxy, Cropped, Long, Drop-shoulder, Custom

## 9. Style vs Fit vs Silhouette
- [x] Fit is a separate field (`fit`)
- [x] Style is a separate field (`tags`, e.g. "Korean," "Streetwear")
- [x] Silhouette is a separate field (`sil`)
- [x] "Korean" etc. usable as a style label, not a hardcoded fit type
- [ ] Silhouette inferred from the garment's own measurement distribution — **Gap:** `sil` is a
  free-typed text field (Add Manually's "Silhouette" input); nothing computes it from
  rise/thigh/leg-opening the way spec.md's Feature 1 describes.

## 10. Fit Feedback
- [x] Overall physical fit: Too tight / Tight / Good / Loose / Too loose (`FIT_VERDICTS`)
- [x] Tops areas: Chest, Shoulder, Sleeve, Length
- [x] Pants areas: Waist, Rise, Thigh, Inseam, Leg opening — **Note:** "Seat" isn't a distinct
  area from "Hip / seat" in the fit sheet; it now uses the same zone labels as the measurement
  list (`keysFor()`), which was itself a bug fix this session (previously the fit sheet's
  hardcoded area list didn't match the measurement labels at all).
- [x] Natural-language notes at update time — **Fixed:** `FitSheet` now has two optional text
  boxes alongside the preset chips, per spec.md Feature 1's own wording ("a quick tag ... plus
  optional free text"). A comfort note ("e.g. Shoulder uncomfortable, waist was perfect when I
  bought it…") replaces the auto-generated summary ("Tight at the shoulder") when filled in,
  rather than sitting alongside it — the template is just the sensible default when the user
  doesn't want to type. Visual preference changed from chip-only-select to a genuinely free
  `TextInput` with the six `VISUAL_LOOKS` phrases still shown as tap-to-fill suggestions, not
  the only option. Garment-level Notes (§6) is still a separate, still-conflated gap.

## 11. Physical Fit vs Visual Preference
- [x] Physical fit feedback exists
- [x] Visual preference exists
- [x] Stored separately (`FitObservation.comfort[]` vs. `FitObservation.visual`)
- [x] FitCheck considers both when enough data exists — **Caveat:** "considers" here means the
  Profile engine's learned-preference computation reads both; the FitCheck comparison engine
  itself does not factor either into ranking — see §17.

## 12. Garment Detail Screen
- [x] Large garment image
- [x] Brand, product, category, size, fit type, style, silhouette
- [x] Measurements
- [x] Fit feedback
- [x] Visual preference
- [x] Fit history
- [x] Edit
- [x] Update current fit
- [ ] Add note (standalone, outside a fit update) — **Gap, still open:** §10's freeform text
  boxes are inside the "How does it fit today?" sheet, which always requires picking an area and
  a comfort verdict too — there's still no lightweight "just leave a note" action independent of
  logging a full comfort update.
- [x] View history

## 13. Historical Fit
- [x] Every fit update has a timestamp
- [x] Previous observations remain accessible
- [x] Current fit is derived from recent observations
- [x] Historical fit remains visible
- [x] Never overwritten (SQLite `observations` table is insert-only in this app)

## 14. Body / Fit Change Detection
- [x] Compare new observations with historical observations
- [x] Detect repeated directional changes
- [x] Weight recent observations more heavily
- [x] Preserve historical observations
- [x] Surface a fit trend
- [x] Avoid claiming exact body change without explicit measurement (`computeTrend` only ever
  talks about garment size/comfort, never a body number)

## 15. Explicit Body Measurements
- [x] User can record body measurements — **Fixed:** a "Body measurements" section on the
  Profile screen (chest/shoulder/waist/hip/thigh/inseam — `BODY_MEASURES` in
  `src/data/constants.ts`) lets the user log any subset of them; each save is a new dated
  `body_measurements` row (new SQLite table, schema v3), append-only like `FitObservation` —
  never overwritten, with a history list and per-entry delete for correcting mistakes.
- [ ] Used to calibrate the fit model — **Deliberately not wired in, flagging the scoping call
  rather than silently doing only half this item.** spec.md's core, repeatedly-reaffirmed
  philosophy is "remembers what fits you, not what size you are" — garment-based reference
  matching, explicitly not body-measurement-based prediction. Feeding body measurements into
  `compare()`'s ranking would reintroduce exactly the model spec.md steered away from. Body
  measurements are recorded and displayed (latest values + history) for the user's own
  reference, but the FitCheck comparison engine never reads them.
- [x] Not required for the app to work — enforced structurally: `saveBodyMeasurement` only
  inserts a row if at least one field was filled in, and nothing else in the app reads this
  table, so its presence or absence changes nothing else.
- [x] Garment-based fit history works independently

## 16. FitCheck Input
- [x] Category, size, measurements, fit type, style/silhouette, optional notes
- [x] User doesn't need to already own the garment

## 17. FitCheck Comparison Engine
- [x] Normalize measurements
- [x] Find relevant existing garments (same category)
- [x] Compare measurement differences
- [x] Compare fit type — **Fixed:** `compare()` in `src/engine/compare.ts` now computes a
  composite `matchScore` per candidate: measurement distance (in tolerance-units, so it's
  comparable across zones/categories) as the primary term, plus a penalty when the fit-type
  label doesn't match. Ranking, "closest match," and the similar-garments list all sort by
  `matchScore`, not raw measurement distance.
- [x] Compare silhouette — **Fixed:** a token-overlap similarity between the two free-text
  silhouette descriptions (`silhouetteSimilarity()`) feeds into `matchScore` the same way, and
  is surfaced directly as a "Silhouette: similar/close/different (X → Y)" line on the result.
  Noted as a lightweight text-overlap proxy, not the deeper "silhouette computed from the
  garment's own measurement distribution" — that remains a separate, larger gap (§9).
- [x] Consider user feedback — **Fixed:** `positivityOf()` scores each candidate's own comfort
  feedback (0..1); it nudges `matchScore` (well-liked garments rank slightly closer, poorly-
  liked ones slightly further, bounded so it can't override a real measurement mismatch) and
  feeds a `preferenceNote` line and the confidence formula.
- [x] Consider fit history — **Fixed:** `hasRecentObservation()` checks whether the closest
  match has a comfort observation within ~6 months and factors that into confidence, per
  spec.md's "more recent data... raise it."
- [x] Generate explanation — now genuinely data-driven (`why` only claims "same fit type" or
  "rated positively" when those are actually true for the top match), not fixed boilerplate.

## 18. Measurement Normalization
- [x] Normalize units, support cm, support inches, convert consistently internally
- [x] Preserve user's preferred display units (persisted in SQLite `settings`)

## 19. Finding Similar Garments
- [x] Same category
- [x] Relevant measurements
- [x] Similar fit type — **Fixed**, see §17.
- [x] Similar silhouette — **Fixed**, see §17.
- [x] Similar user preference — **Fixed**, see §17.
- [x] Recent/relevant fit history — **Fixed**, see §17.

## 20. FitCheck Result — format
- [x] Ranked list of similar garments
- [x] Per-zone measurement differences
- [x] Plain-language explanation
- [x] One overall confidence level
- [x] No percentage similarity anywhere (verified — no "%", no decimal match scores in
  `src/engine/compare.ts` or any screen)

## 21–22. FitCheck Result Examples (tops / pants)
- [x] Output format matches the examples (verdict banner, closest match, per-zone diff table,
  expected-feel bullets, similar-garments list, "why" paragraph, confidence). **Fixed:** a
  "Silhouette: similar/close/different (X → Y)" line and a "Your preference: ..." line now
  render on the result screen, matching spec.md's Feature 2 output sketch
  ("Silhouette: similar (Relaxed → Relaxed)" / "Your preference: you've rated 3 similar
  relaxed-fit garments positively.") that wasn't previously implemented at all.

## 23. Confidence System
- [x] Low / Medium / High only
- [x] Higher confidence when measurements are complete, similar silhouettes exist, user has
  given fit feedback, similar garments have consistent feedback — **Fixed:** confidence is now
  a points tally in `buildResult()` (`src/engine/compare.ts`) combining reference-garment count,
  pool size, whether the closest match's fit type and silhouette agree, whether its feedback is
  consistently positive (or a penalty if consistently negative), and whether it has a recent
  observation. Verified against both this checklist's pants example (High) and spec.md's own
  shirt example (Medium) using the real seed data — both land exactly as documented.
- [x] Lower confidence with few reference garments (this part of the formula is implemented)

## 24. No False Precision
- [x] No "92% similar" / "91% fit" / "87.4% chance" anywhere in the app
- [x] Deltas expressed as plain cm/in numbers with direction, not invented scores

## 25. Fit Profile
- [x] Represents preferences, not size
- [x] "Often prefers..." style summaries, computed (`computeLearnedPrefs`)
- [x] Comfortable waist/chest/shoulder/inseam-style ranges, computed from actual wardrobe data
  (`computeRanges`), not hardcoded

## 26. Reference Garments
- [x] Identify garments with strong fit feedback — **Fixed:** `ref` is no longer a stored field.
  `isStrongReference()` (`src/data/hydrate.ts`) computes it fresh every time a garment is
  hydrated from the observation log, for every garment — seed or user-added alike. `GarmentCore`
  no longer even has a `ref` slot (moved to the derived-fields list alongside `feels`/`history`/
  `visual`), and the SQLite `ref` column was dropped in a schema migration (v1→v2) since storing
  it would just be a stale cache of something recomputed on every load anyway.
- [x] Consider recent feedback — **Fixed:** requires at least one comfort observation within
  ~12 months (`REF_RECENT_MS`); an old rating with nothing since doesn't qualify.
- [x] Consider completeness of measurements — **Fixed:** requires every zone for the garment's
  category to have a value (`keysFor(cat).every(...)`).
- [x] Consider consistency — **Fixed:** requires the *latest* comfort verdict per zone (i.e.
  `feels`, not a flat all-time average) to score ≥0.8 on a 0–1 scale where "Good" = 1 and
  "Tight"/"Loose" = 0.35 — a garment with one so-so rating buried in an otherwise-strong recent
  record still qualifies; one that's currently reading tight/loose anywhere doesn't.
- [x] Use them heavily in future comparisons — unchanged code path (`refFor`, confidence
  scoring, Home's "Strong references" list, Profile's ranges/prefs), now backed by a real signal.

Verified against the real seed data (standalone Node run): the computed set is 5 of 11
garments — not the same 5 the original hand-authored `ref: true` flags picked, and that's the
point. `Uniqlo Linen Blend Shirt` (originally hand-marked a reference) drops out because its
*most recent* shoulder observation reads "Tight" (avg 0.783, just under the 0.8 bar) — exactly
the kind of drift-awareness §14 is supposed to produce. `H&M Relaxed Chino` (originally not
marked) newly qualifies on a clean 100%-"Good" record. Both of CHECKLIST's/spec.md's documented
FitCheck examples (Medium-confidence shirt, High-confidence wide-leg pants) still produce their
documented confidence levels with the new reference set.

## 27. Simple Silhouette Visualization
- [ ] Not built — explicitly optional/desirable in the source checklist, not required.

## 28. Fully Offline Architecture
- [x] Every listed capability (add/edit/view/photos/measurements/OCR-simulation/comparison/
  history/trends/profile) works with no network call anywhere in the codebase.
- [x] Search/filter — **Fixed:** Closet's search box and fit-type filter (§4) are pure
  client-side array filtering over already-loaded state, same as the category filters — no
  network involvement to even check.
- [x] No cloud DB, no account, no backend, no remote/retailer API, no online AI, no analytics

## 29. OCR Architecture
- [ ] Local OCR / measurement extraction / unit detection — **Gap, deliberate per spec.md** (see
  §5A note — this checklist item directly conflicts with a decision spec.md reaffirmed three
  times).
- [x] User confirmation step exists (on the simulated data)
- [x] Manual correction exists (edit any field after "Review and save")
- [x] Local storage (true, but moot without real extraction)

## 30. Fit Engine — V1
- [x] Deterministic, no ML
- [x] Normalize measurements, compare relevant measurements, calculate differences
- [x] Compare fit categories / silhouette attributes in the ranking — **Fixed**, see §17.
- [x] Use user feedback / history in the ranking — **Fixed**, see §17.
- [x] Rank references (composite `matchScore`: measurement-primary, adjusted by fit/silhouette/feedback/recency)
- [x] Generate plain-language explanation
- [x] Calculate confidence (the richer formula in §23)

## 31. What V1 Should NOT Build — confirmed absent
- [x] No 3D body scanning
- [x] No camera-based body measurement
- [x] No AI body avatar
- [x] No universal retailer integration
- [x] No browser extension
- [x] No universal web scraping
- [x] No social network
- [x] No marketplace
- [x] No community wardrobe database
- [x] No retailer purchase-history API
- [x] No automatic universal garment measurement extraction
- [x] No "91% match" / fake fit accuracy anywhere
- [x] No cloud dependency

## 32–34. Sample Data & Demo Scenarios
- [x] Uniqlo / Zara / H&M / Korean-style pieces, wide-leg pants, relaxed shirts, straight pants,
  oversized pieces — 11 garments across all three categories
- [x] Shirt closest-match demo scenario runs end to end and produces the expected shape of result
  (verified via a standalone run of `buildResult` against the real seed data this session)
- [x] 32" pants tightening-trend demo scenario runs end to end (`computeTrend` verified against
  the real seed data, produces "Your recent 32" pants have been fitting tighter..." as intended)

## 35–36. UI/UX Direction & Screens
- [x] Modern, minimal, neutral palette, strong type, large imagery, rounded cards — matches the
  ported design (`FitCheck.dc.html`)
- [x] All required screens exist: Home, Closet grid, Garment detail, Add (3 methods), FitCheck
  input, FitCheck result (tops/pants — same component, category-adaptive), fit history (part of
  Detail), Profile, fit feedback sheet

## 37. Final Product Philosophy Check
- [x] "What is this closest to?" framing throughout, never "what size am I"

---

## 🔴 Critical Implementation Checklist — audited

- [x] Fully offline
- [x] Add garment
- [x] Garment photos/local references
- [x] Manual measurements
- [ ] OCR input — **Gap, deliberate** (§5A/§29)
- [x] Category-specific measurements (minus hem — §7)
- [x] Fit types
- [x] Style/silhouette separation
- [x] Physical + visual fit feedback
- [x] Editable garments
- [x] Historical fit records
- [x] Fit changes over time
- [x] FitCheck new-garment input
- [x] Compare against owned garments
- [x] Measurement deltas
- [x] Plain-language prediction
- [x] Ranked similar garments
- [x] Low/Medium/High confidence
- [x] No percentage similarity
- [x] Recent observations weighted more heavily — **Fixed:** true for the Profile trend engine
  (unchanged) and now also inside the FitCheck comparison engine's confidence formula (§17/§23).
- [x] Profile learns preferences
- [x] Home / Closet / FitCheck / Profile
- [x] No cloud/backend dependency
- [x] No 3D/body scanning
- [x] No fake "AI accuracy"
- [x] No universal retailer integration

---

## Net new gaps found by this audit (not previously tracked in PLAN.md)

Ranked by how much they undercut the core "closest match + why" promise:

1. ~~FitCheck ranking is measurement-only.~~ **Fixed 2026-09-09.** `compare()`/`buildResult()`
   in `src/engine/compare.ts` now compute a composite `matchScore` (measurement distance in
   tolerance-units as the primary term, adjusted by fit-type match, silhouette text-overlap
   similarity, and comfort-feedback positivity) and a confidence formula that also factors in
   fit/silhouette agreement, feedback consistency, and recency. Verified against both spec.md's
   documented shirt example (Medium confidence) and this checklist's pants example (High
   confidence) using the real seed data through a standalone Node run — both land exactly as
   documented. New "Silhouette: ..." and "Your preference: ..." lines render on the result
   screen, closing the §21/22 output-format caveat as a side effect. See §17/§19/§23/§30.
2. ~~No reference-garment detection.~~ **Fixed 2026-09-09.** `ref` is no longer stored; it's
   computed on every load in `src/data/hydrate.ts` from completeness, recency (~12mo), and
   consistency of the *latest* comfort feedback per zone (≥0.8 on a 0–1 scale). Every garment,
   not just the seed set, can now earn or lose reference status as feedback accumulates or
   drifts. See §26.
3. ~~Home's "recent fit changes" is hardcoded/stubbed.~~ **Fixed 2026-09-09.**
   `src/engine/activity.ts` (new) derives both the stat and the list from real observation
   timestamps — see §3.
4. ~~No fit-type filter or search in Closet.~~ **Fixed 2026-09-09.** A second chip row of
   category-relevant fit types (only those actually present, most-common-first) appears
   alongside the existing category/mode filters, and a search box filters by brand, name, fit
   type, size, and style tags — all combining together. See §4/§28.
5. ~~No freeform note at fit-update time.~~ **Fixed 2026-09-09.** `FitSheet` gained two optional
   text boxes: a comfort note that replaces the templated summary when filled in (spec.md
   Feature 1's "quick tag plus optional free text"), and a visual-preference field changed from
   chip-only-select to a genuinely free `TextInput` with the preset phrases kept as tap-to-fill
   suggestions rather than the only option. See §10/§12 (§12's narrower "standalone note outside
   an update" gap is still open).
6. ~~No body-measurement recording.~~ **Fixed 2026-09-09.** A Profile-screen section logs
   chest/shoulder/waist/hip/thigh/inseam into a new append-only `body_measurements` table
   (schema v3), with a history list and per-entry delete. Deliberately **not** wired into the
   FitCheck comparison engine — see §15 for why that's a scoping decision, not an oversight.
7. Smaller field gaps: no hem measurement (§7), silhouette is typed not computed (§9), Notes
   conflated with visual-preference field (§6). Also: no trend headline on Home itself (§3,
   distinct from the fixed items above — `computeTrend` still only renders on Profile), and no
   standalone "just add a note" action outside a fit update (§12).
8. Real OCR (§5A, §29) is a **known, deliberate** non-gap — flagging the conflict with spec.md
   rather than resolving it either way.
9. **Newly observed, not yet fixed:** `dotFor()` (`src/engine/compare.ts`) colors history/recent-
   activity dots by pattern-matching the note text ("starts with too" → bad, "starts with
   slightly" or exactly "tight"/"loose" → warn, else good) rather than reading the actual
   `FeelEntry` verdict. This already slightly mis-colors the auto-generated template ("Tight at
   the shoulder" doesn't match any pattern, so it defaults to "good") — a pre-existing
   limitation, not something this session introduced — but freeform notes (just fixed above)
   make it easier to hit, since arbitrary user text is even less likely to match the patterns
   than the template was. Worth fixing by threading the structured verdict through instead of
   re-deriving tone from text, but that's a distinct fix from what was asked for this round, so
   it's flagged here rather than folded in silently.

Item 7 (smaller field gaps — hem measurement, computed silhouette, standalone notes, Home trend
headline) is now the top remaining set of items with real user-facing impact; item 9 (the
`dotFor()` tone heuristic) is the top remaining accuracy issue.
