# Fitcheck — build status

Companion to [spec.md](spec.md) (what it should do), [risks.md](risks.md) (why it's scoped this way), and [CHECKLIST.md](CHECKLIST.md) (a line-by-line audit against a separately-supplied product checklist — more granular than this doc, includes exact file/line evidence for every gap). Last updated 2026-09-09.

---

## Implemented

**Project setup**
- Expo (React Native + TypeScript) scaffold, targeting a personal-use Android APK — no store listing, no backend.
- Fonts (Archivo, JetBrains Mono) via `@expo-google-fonts`, matching the design.
- TypeScript compiles clean; Metro bundles clean (452 modules, verified via web bundle) with a `metro.config.js` wasm-asset fix required by `expo-sqlite`'s web build.
- `eas.json` with a `personal` Android APK build profile (`npm run build:apk`).

**UI — full port of `FitCheck.dc.html`**
- All 9 screens: Home, Closet, Garment Detail, Add, Add Manually, Add from Photo, FitCheck, Result, Profile.
- Bottom tab bar, the "How does it fit today?" bottom sheet, toast notifications.
- Same color palette, type system, spacing as the design; safe-area insets replace the design's fixed iOS-frame offsets.
- Screen navigation is a state machine (`src/store.tsx`), matching the design's own model — no navigation library.

**Comparison engine (`src/engine/compare.ts`) — full pipeline, not just measurements.**
- Same-category matching, per-zone measurement deltas, tolerance-based verdict (good / close / off). No percentage scores anywhere — matches the locked spec.md decision.
- Ranking is a composite `matchScore`: measurement distance in tolerance-units (primary term) adjusted by fit-type match, a token-overlap silhouette similarity, and a comfort-feedback positivity score — measurement-primary, but fit/silhouette/feedback now genuinely influence which garment is picked as "closest" and how the similar-garments list orders, not just what gets displayed. Confidence is a points tally combining reference-garment count, pool size, fit/silhouette agreement, feedback consistency, and whether the closest match has a recent observation — not just a garment count. Verified against spec.md's own documented shirt example (Medium confidence) and this checklist's pants example (High confidence) using the real seed data.
- New "Silhouette: similar/close/different (X → Y)" and "Your preference: ..." lines render on the FitCheck result, matching spec.md Feature 2's output sketch, which wasn't previously implemented.

**Persistence (`src/db/index.ts`) — fully offline SQLite, wired end to end.**
- `expo-sqlite` async API (`openDatabaseAsync`, `execAsync`/`runAsync`/`getAllAsync`, `PRAGMA user_version` migration). Two tables: `garments` (current record) and `observations` (append-only fit log), plus a `settings` table for the units preference.
- On first launch only, the 11-garment demo dataset (`src/data/seed.ts`) is loaded into SQLite; after that the database is the sole source of truth — closing the app no longer loses anything.
- `src/data/hydrate.ts` derives a garment's `feels` (latest comfort tag per zone), `history` (timeline), and `visual` (latest preference note) from its `observations` log on every load — nothing is double-stored.
- Every mutation in `src/store.tsx` (`saveGarment`, `saveFit`, `deleteGarmentById`) writes to SQLite first, then reloads from it, so UI state can never drift from disk.

**Fit history is genuinely append-only (Feature 3/4).**
- `FitObservation` (`garment id`, timestamp, note, per-zone comfort tags, visual-preference text) is a real row-per-entry log, not a field that gets overwritten. "Update how it fits" inserts a new row; the garment's displayed feel/history is always a read over the full log.

**Editable history / edit flow (Feature 3).**
- Detail screen's "Edit" now calls `store.loadEditGarment(id)`, which pre-fills the Add Manually form (including measurements converted to the current display unit) and updates the existing record on save instead of creating a duplicate.

**Real photo reference (Feature 1, adapted).**
- `src/utils/photo.ts` launches the OS photo picker (`expo-image-picker`) and copies the chosen image once into the app's own document directory (`expo-file-system`'s `File`/`Directory`/`Paths` API) — see the note in that file for why this deviates slightly from spec.md's "identifier only, never copy" ideal (the picker's returned URI lives in a purgeable cache dir on Android, so it isn't durable on its own). Garment thumbnails across Home/Closet/Detail/Result now render the real photo when one exists, falling back to the gradient placeholder otherwise.

**Fit-trend / preference learning (Feature 4, `src/engine/profile.ts`).**
- Fully computed from the observation log, not static mockup text: a recency-weighted trend detector (groups observations by category+size, compares older vs. recent average comfort score), "what we've learned" preference summaries (top fit types among positively-rated garments per category, plus dislike patterns mined from visual-preference text), and "comfortable ranges" per zone (min/max among garments logged as "Good" there). All Low/Medium/High-style qualitative language, no invented precision.

**Delete garment.** Detail screen has a "Remove from closet" action (confirmed via `Alert.alert`) that deletes the garment and its full observation log.

**Unit toggle (cm/in).** A units toggle lives on the Profile screen; `src/utils/units.ts` converts for display/entry everywhere (Detail, Add Manually, FitCheck, Result) while all storage stays in cm. Preference persists in SQLite.

**Clipboard paste on FitCheck.** Real `expo-clipboard` read, parsed against the category's zone labels via regex, filling whatever matches instead of a no-op stub.

**Numeric validation on measurement inputs.** `sanitizeNumeric` (in `src/store.tsx`) strips non-numeric characters and collapses multiple decimal points as the user types, on both Add Manually and FitCheck.

**Reference-garment detection — now dynamic, not a static flag.**
- `ref` is no longer stored anywhere; `isStrongReference()` (`src/data/hydrate.ts`) computes it fresh every time a garment is hydrated, from three checks against the observation log: complete measurements for its category, a comfort observation within ~12 months, and the *latest* per-zone comfort feedback averaging ≥0.8 on a 0–1 scale (Good=1, Tight/Loose=0.35). Every garment — seed or user-added — can earn or lose reference status as feedback accumulates or drifts, closing the gap where new garments could never become references.
- The SQLite `ref` column was dropped in a schema migration (`SCHEMA_VERSION` 1→2) since it would just be a stale cache of something now recomputed on every load.
- Verified against the real seed data: the computed set (5/11 garments) differs from the original hand-authored flags in exactly the way you'd want — a garment whose most recent feedback recently turned "Tight" drops out of reference status even though it used to qualify, while one with a clean all-"Good" record newly qualifies. Both of spec.md's/CHECKLIST.md's documented FitCheck confidence examples still land as documented with the new set.

**Home screen's "recent fit changes" — now genuinely derived, not hardcoded.**
- `src/engine/activity.ts` (new): `recentChangeCount()` counts observations carrying real comfort feedback (excluding the no-op "Added to closet" bootstrap entry) within a 90-day window, for the stat card. `recentChanges()` flattens every garment's feedback observations, sorts by timestamp descending, and takes one entry per garment, replacing the old `Math.min(3, garments.length)` stub and the hardcoded garment IDs 1/6/7.
- Verified against the real seed data: correctly surfaces whichever garments were actually touched most recently in true chronological order, with a clean empty-state message when nothing's logged yet.

**Closet fit-type filter and search.**
- A second chip row appears whenever a specific category (Tops/Pants/Jackets) is selected, listing only the fit types actually present in that category — most-common-first, via the existing `orderFits()` helper — since fit-type vocabulary is category-specific ("Wide-leg" doesn't mean anything under Jackets). Selecting a different category resets the fit selection.
- A search box filters by brand, product name, fit type, size, and style tags, combining with whatever category/mode/fit filters are active. Empty-state copy distinguishes "nothing matches this search" from "nothing matches this filter."

**Freeform notes at fit-update time.**
- `FitSheet` gained two optional text boxes alongside the existing preset chips, per spec.md Feature 1's own wording ("a quick tag ... plus optional free text"): a comfort note that replaces the auto-generated summary ("Tight at the shoulder") when filled in, and a visual-preference field changed from chip-only-select to a genuinely free `TextInput` with the six preset phrases kept as tap-to-fill suggestions rather than the only option.
- Found but deliberately not folded in: `dotFor()` colors history/activity dots by pattern-matching note text, which already slightly mis-colored the auto-generated template and is even less reliable against arbitrary freeform text. Flagged in CHECKLIST.md rather than silently fixed, since threading the structured verdict through instead is a distinct piece of work from what was asked this round.

**Body-measurement recording.**
- A "Body measurements" section on the Profile screen (chest/shoulder/waist/hip/thigh/inseam — a deliberately smaller set than garment `ZoneKey`, since it excludes garment-design choices like hem/sleeve/rise/leg-opening that aren't things a body "has") lets the user log any subset, unit-aware, into a new append-only `body_measurements` table (SQLite schema v3) — same "new dated entry, never overwritten" philosophy as `FitObservation`. Shows latest values as input placeholders, plus a collapsible history list with per-entry delete for correcting mistakes.
- Deliberately **not** wired into the FitCheck comparison engine. spec.md's core, repeatedly-reaffirmed philosophy is "remembers what fits you, not what size you are" — garment-reference matching, explicitly not body-measurement-based prediction; feeding these into `compare()`'s ranking would reintroduce exactly the model spec.md steered away from. This is a scoping decision, documented as such in CHECKLIST.md §15, not a partial/incomplete implementation.

**Not built, deliberately** (matches locked scope decisions, not a gap):
- Real OCR/measurement extraction — the Add from Photo screen is still a UI-only simulated scan (fixed fake values, timed), exactly like the design mockup. Real extraction was cut from v1 three times over in spec.md/risks.md.

---

## Not implemented yet

**Smaller field gaps — now the biggest remaining set of gaps.** No "hem" measurement zone for
tops/jackets; jackets reuse the tops zone list rather than having their own; silhouette is a
free-typed field rather than inferred from the garment's own measurement distribution (spec.md's
stated intent); no standalone "just add a note" action outside a fit update; no trend headline
on Home itself (`computeTrend` only renders on Profile). See CHECKLIST.md §3/§7/§9/§12.

**`dotFor()` tone-heuristic accuracy.** Colors history/activity dots by pattern-matching note
text rather than reading the actual comfort verdict — already slightly mis-colors the
auto-generated template, more so now that freeform notes exist. Flagged, not yet fixed. See
CHECKLIST.md's "Net new gaps" item 9.

**Never tested on a real target.** Verified via `tsc --noEmit`, a successful web bundle export (`expo export --platform web`), a live `expo start --web` smoke check (server serves and bundles), and a standalone Node run of the pure-logic modules (`compare.ts`, `profile.ts`, `hydrate.ts`, `units.ts`) against the real seed dataset to sanity-check output shape and values. **Never run on an Android emulator or physical device** — the SQLite/image-picker/file-system native modules are unverified on-device; this is the first thing to do next.

**Packaging.** `eas.json` build profile now exists (`npm run build:apk` → `eas build --profile personal --platform android`), but no APK has actually been produced yet — that requires an EAS account/login this environment doesn't have.

**Polish not addressed:** custom app icon/splash (still Expo's defaults), accessibility labels, automated tests (e.g. for the comparison/profile engines).

---

## Suggested next steps, in order
1. Run it on an Android emulator or device (`npm run android`) — first real visual/interaction check, and the first real test of `expo-sqlite`, `expo-image-picker`, and `expo-file-system` outside a browser. This is now arguably higher priority than any remaining feature gap, since nothing in this app has touched a real device yet.
2. Run `npm run build:apk` (needs `eas login` first) to produce an actual sideloadable APK.
3. The smaller gaps in CHECKLIST.md (hem field, a trend headline on Home itself, standalone
   notes, the `dotFor()` tone-heuristic accuracy) as time allows — none of these block day-to-day use.
4. Custom app icon/splash, accessibility labels, and tests for the comparison/profile engines.
