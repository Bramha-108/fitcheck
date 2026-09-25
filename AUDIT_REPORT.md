# FitCheck — Pre-Open-Source Product & Code Audit

**Date:** 2026-09-25
**Scope:** Full codebase inspection (architecture, fit engine, UX, privacy, offline behavior, repo/licensing readiness) ahead of publishing FitCheck's source on GitHub.
**Scope exclusions (by explicit decision, not oversight):**
- AI/OCR/computer-vision measurement extraction is **not** re-evaluated here. It's been rejected three times in prior design rounds (most recently the Add-from-Photo entry point was removed outright on 2026-09-11) and the user confirmed on 2026-09-25 that this decision stays settled.
- This remains a **personal-use app being open-sourced**, not a pivot to a venture/multi-tenant product. No backend, no accounts, no monetization is in scope. Everything below is scoped to "a stranger can clone this, build it, and trust it with their own data" — not "this needs to scale to many users."

Every claim below is sourced from reading the actual files in this repo (paths and line numbers given). Where I couldn't verify something directly, it's marked **Unverified**.

---

## 0. Status update (2026-09-26)

Implementation pass against this audit's P0 list, done and verified the same day. Everything below was confirmed either by `tsc --noEmit` (typecheck) or by running the app (`expo start --web`) and driving the actual flow in a browser — not just read back from the diff. Findings that are still open keep their original numbering below; nothing in §3–§11 has been deleted, only annotated.

**Fixed and verified:**
- **§3.7 (wrong LICENSE)** — `LICENSE` now reads `Copyright (c) 2026 Bramha-108` under MIT, replacing the Expo boilerplate.
- **§8 (no README)** — `README.md` added: what it is, screenshots, build/run instructions (including a local, non-EAS release-APK path), license.
- **§8 (repo hygiene)** — all ~54 loose root PNGs moved into `.qa-screenshots/` (gitignored), `.playwright-mcp/` and `*.apk` added to `.gitignore`, and `CHECKLIST.md`/`HANDOFF.md`/`QA_HANDOFF.md`/`PLAN.md`/`research.md`/`risks.md`/`spec.md` consolidated into `docs/` (`docs/spec.md`, `docs/design-history/`). Root is clean per `git status`.
- **§3.1 (onboarding identity fallback)** — `obSaveFit`'s `|| 'Unbranded'` / `|| 'First reference'` / `|| '—'` fallbacks are gone. `obSaveGarment` now validates brand/name/size (mirroring `validateNg`) before letting the form step advance, with inline "Required" errors, the shake animation, and the same "Don't know?"/"Don't know the brand?" honest-sentinel affordance `AddManualScreen.tsx` already used. **Verified live:** ran onboarding end-to-end in the browser — blank Continue press showed inline errors; tapping both "Don't know?" links and continuing saved a real closet entry reading "Unknown brand · Test Shirt — Unknown size," never a fabricated default.
- **§3.2 (orphaned photos)** — `deleteGarmentById` now calls `deleteGarmentPhoto(snapshot?.photo)` after the DB delete; `saveGarment`'s update branch calls it when `existing.photo !== updated.photo`. Not independently verified against the filesystem in this pass (would need a native/device run, not the web target) — logic-reviewed and typechecked only.
- **§3.3 / §6 (misleading empty state / overly strict `compare()` pool)** — `compare()` now pools on "shares at least one typed zone" (`keys.some(...)`) instead of requiring every typed zone, using each candidate's own `matchKeys` for its diffs/score/coverage. `buildResult` and `runCheck`'s `noResultReason` were updated to match, including a new, distinct `noOverlap` reason (`ResultScreen.tsx`: "Nothing shares these measurements yet") for the residual case where category garments exist but share none of the typed zones. **Verified live:** entering measurements where a garment shared only 1 of 2 typed zones now returns a real result ("Chest +2cm," confidence Low, "1 of 5 measurements compared") instead of the old false "enter at least one measurement" error; the true zero-overlap case correctly shows the new `noOverlap` copy instead of misattributing the cause.

**Fixed and verified, second pass (2026-09-26, later same day):**
- **§10 / §11 (test suite)** — Jest + `ts-jest` added (deliberately not the `jest-expo` preset — every tested module is pure TS with zero React Native/Expo imports, verified by grep, so the heavier RN-mocking preset isn't needed; a component-testing setup can be added separately if UI tests are ever written). 40 tests across three suites, all passing:
  - `src/engine/__tests__/compare.test.ts` — `compare()`'s pool-filtering (including a direct regression test for the §3.3 fix: a candidate sharing only some typed zones is included and scored on the overlap only), ranking order, `toneFor()`'s tolerance-band boundaries (exact boundary + just past it in both bands), `buildResult()`'s confidence scoring across a low-evidence/high-evidence matrix, `seedNewGarment()`'s fit-mode selection never seeding an unset `'—'`.
  - `src/utils/__tests__/units.test.ts` — cm↔in round-trip drift, rounding rules, `convertDraftUnits`'s "never fills an empty field" guarantee, non-numeric fields left untouched, and the "stored value → cm → target unit" conversion path the design guidelines describe.
  - `src/data/__tests__/hydrate.test.ts` — `isStrongReference`'s four-condition gate (via `hydrate()`'s `.ref` output, since the function itself isn't exported): incomplete measurements, no observations, holistic-only feedback, stale feedback, and the ~0.8 positivity threshold from both sides using the actual discrete `COMFORT_SCORE` values (exact 0.8 isn't reachable with real verdicts, so this brackets it: 0.8375 passes, 0.74 fails).
  - `tsconfig.jest.json` isolates the test compiler config (`module: commonjs`, jest/node ambient types) from the app's own `tsconfig.json` (which now excludes `**/__tests__/**` so app-build typechecking and test typechecking stay independent). `package.json` gained `test` and `typecheck` scripts.
- **§11 (CI)** — `.github/workflows/ci.yml` added: runs `npm ci` → `npm run typecheck` → `npm test` on every PR and on push to `main`/`master`.

**Fixed and verified, third pass (2026-09-26, later still same day):**
- **§3.4 (DB write error handling)** — the manual failure-induction test this section itself called for was run first: temporarily forced `insertBodyMeasurement` to throw, ran the real app in a browser, and confirmed the actual failure mode (silent — no toast, no console error) plus a second, worse bug the manual test surfaced that code-reading alone hadn't caught: `ProfileScreen.tsx` was clearing the typed measurement from the field *regardless of whether the save actually succeeded*. Both are now fixed: every DB-write call site in `store.tsx` is wrapped in try/catch with a `showToast(...)` on failure, and `saveBodyMeasurement` now returns a success boolean so its caller only clears the draft when the write actually succeeded. Re-verified live after the fix (both the failure path and the normal success path) before reverting the temporary throw. Full detail in §3.4 below.

**Fixed and verified, fourth pass (2026-09-26, later still same day):**
- **§3.6 (zero accessibility API usage)** — every `Pressable`/`TextInput` in `src/` now carries `accessibilityRole`/`accessibilityLabel` (plus `accessibilityState` for selected/expanded/checked/disabled controls). Fixed centrally in `components/UI.tsx` first (`Chip`, `UnitToggle`, `PrimaryButton`/`SecondaryButton`, `BackRow`, `SectionLabel`/`ScreenHeader` as `header`, `MeasureCell`'s `TextInput`) since nearly every screen composes from these, then per-screen: `TabBar`'s tabs (`role="tab"` + `accessibilityState.selected`), Closet's search-clear and `×`/tile controls (previously bare glyphs with no label), composite rows across Home/Closet/Result grouped into one combined `accessibilityLabel` instead of fragmenting into separate unlabeled swipe stops, every fit-tone dot (`ToneDot` and its hand-rolled equivalents in Closet/Home/Result/Onboarding) hidden from the accessibility tree via `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` since they're always paired with text stating the same verdict, `Toast` now calls `AccessibilityInfo.announceForAccessibility` (previously the sole save/delete confirmation never reached a screen reader at all), and `FitSheet`/`ConfirmDialog` gained `accessibilityViewIsModal` plus a labeled dismiss backdrop. **Verified:** `tsc --noEmit` clean, `jest` 40/40 still passing, and an automated per-file scan (not a manual spot-check) confirmed no `Pressable`/`TextInput` in `src/` was missed. **Not done:** actual manual VoiceOver/TalkBack device testing — this is static code coverage, not confirmed screen-reader UX; `TopLevelSwipeNavigator`'s swipe gesture was left as-is since it already has a visible `TabBar` alternative.

**Still open** (unchanged from the original audit — see the referenced sections for detail): §3.5 (migration-failure recovery), export/import, and everything else in §11's remaining P1/P2/P3 rows (the integration/functional tests and edge-case tests in §10's P1 tier — e.g. Closet/Detail/FitCheck flows exercised end-to-end — are still unwritten; only the P0 unit-test tier is done). §12's checklist below reflects current status.

---

## 1. Executive summary

**FitCheck is in noticeably better shape than the average "personal project ready to open-source" — the core product is genuinely well-built.** The measurement-integrity discipline described in `DESIGN_GUIDELINES.md` (never fabricate a value, never let a missing measurement participate in a comparison, always show *why* not just a verdict) is faithfully implemented almost everywhere I checked: ghost placeholders instead of pre-filled values, category-switch clearing stale measurements, `validateNg` blocking incomplete saves with inline errors, `isSet()` guards keeping unset fit types out of scoring. The fit-comparison engine (`src/engine/compare.ts`) is a well-thought-out deterministic rules pipeline — weighted zone tolerances, fabric-stretch multipliers, measurement-ratio silhouette matching, a point-based confidence tier system — that never claims a numeric match percentage, exactly per the project's own standing decision. TypeScript strict mode is on, there are no `console.log` leftovers, and there is zero network/analytics/tracking code anywhere in `src/` (verified by grep, not assumed).

**The gap is entirely in "ready for other people," not "does the app work."** Three things blocked a credible GitHub release as of the original audit — **see §0 for a 2026-09-26 status update: items 1, 2, and the §3.1 bug in item 3 are now fixed and verified.** As originally written:

1. **No README, no LICENSE that actually names this project, no CI, no tests.** A stranger cloning this repo today has no entry point, no build instructions, and a `LICENSE` file that legally asserts Expo's own copyright rather than the project's. *(All four fixed — §0. Tests cover the P0 unit-test tier only; integration/functional tests remain unwritten.)*
2. **Repo hygiene** — the working tree has ~50 untracked QA screenshots, a `.playwright-mcp/` debug-log folder, a built `.apk`, and five overlapping planning docs sitting at the root alongside real source. None of this is sensitive, but shipping it as-is makes the project look unmaintained. *(Fixed — §0.)*
3. **A handful of concrete, verified bugs** worth fixing before or shortly after release — most notably that the onboarding save path (`src/store.tsx:757-760`) still fabricates `'Unbranded'`/`'First reference'` identity defaults, the exact anti-pattern `DESIGN_GUIDELINES.md`'s own "Known failure patterns" table says was fixed (it was fixed in `AddManualScreen`'s path, but not in Onboarding's separate one). *(Fixed and verified live — §0. §3.2's photo-leak and §3.3's empty-state bug, found elsewhere in this audit, are also now fixed.)*

None of this requires re-architecting anything. This is a punch list, not a rewrite.

---

## 2. Current feature inventory

**Fully implemented and working, as read from source:**
- Garment CRUD (`store.tsx`'s `saveGarment`/`updateGarment`/`deleteGarmentById`), three categories (tops/pants/jackets), category-specific measurement zones (`data/constants.ts`'s `keysFor`)
- cm/in unit toggle with correct, non-compounding conversion (`utils/units.ts`'s `convertDraftUnits` — stored→cm→target, never re-interpreting an already-converted display value)
- Fabric stretch level (Rigid/Some stretch/Very stretchy) scaling comparison tolerance (`STRETCH_MULTIPLIER`)
- Fit type + free-text silhouette, with a measurement-ratio-derived shape signature (`shapeSimilarity` in `compare.ts`) blended with free-text overlap
- Append-only fit observations: per-zone comfort verdicts + visual-preference notes, never overwritten (`FitObservation`, `insertObservation`)
- Fit history timeline with progressive disclosure ("Show all N" — `DetailScreen.tsx`'s `HISTORY_LIMIT`)
- Optional, entirely separate body-measurement log (append-only, deletable per-entry for correcting mis-entries)
- FitCheck comparison: weighted per-zone tolerance, fit-type/silhouette/preference-adjusted ranking, plain-language "why," qualitative Low/Medium/High confidence (never a %)
- "Strong reference" status computed dynamically from the observation log (`hydrate.ts`'s `isStrongReference`), not a stored flag
- Profile page: trend detection (same size fitting tighter/looser over time), learned fit preferences per category, comfortable-measurement ranges — all explicitly grounded in observation counts, never inferred body data
- Closet search + category/fit-type filters with **three distinct, correctly-labeled empty-state reasons** (search/filter/combined — `ClosetScreen.tsx`'s `emptyReason`)
- Result screen's own honest empty state (`noGarments`/`noCategoryGarments`/`noMeasurements` — see §3 for a bug in how this reason is picked)
- Onboarding: a real linear wizard that adds one real garment and runs one real comparison (not a feature tour)
- Local photo attach: OS picker → copied into app document storage (not just a cache-dir reference)
- Delete confirmation dialogs, save/delete motion feedback beyond a toast, shared-element Closet→Detail photo transition, swipe navigation between the four top-level tabs, reduced-motion support checked in every animation I read

**Partial:**
- "Recently added" Closet filter silently caps at 6 items with no "show more" (`ClosetScreen.tsx:55`) — inconsistent with the progressive-disclosure pattern used everywhere else (fit history, fit-type chips). Low priority, but worth aligning.

**Deliberately simulated, correctly labeled (not reopened per user decision):**
- Onboarding's photo/screenshot "scan" (`store.tsx`'s `obPickMethod`) returns a hardcoded fake result, shown only as ghost placeholder text (`obSuggested`), never written as a real value. This is implemented exactly as documented and is out of scope for this audit.

**Missing entirely** (not bugs — just not built):
- Multi-photo per garment, garment condition/archived/donated state, purchase date/price, a "favorite" concept distinct from "reference," duplicate-garment detection, fuller fabric-composition data (only a 3-level stretch enum), export/import/backup. ~~any automated test, any CI~~ — **both added 2026-09-26, see §0**; integration/functional tests (§10's P1 tier) remain unwritten.

---

## 3. Critical bugs and technical risks

Ordered by how much they matter for a tool whose entire value proposition is *trustworthy, durable, honest personal data*.

### 3.1 Onboarding's save path fabricates identity defaults — contradicts the doc's own "fixed" claim
**Status: Fixed and verified live, 2026-09-26** — see §0.
**File:** `src/store.tsx:757-760` (`obSaveFit`)
```ts
brand: ob.brand.trim() || 'Unbranded',
name: ob.name.trim() || 'First reference',
size: ob.size.trim() || '—',
```
`DESIGN_GUIDELINES.md`'s "Known failure patterns" table lists *exactly* this pattern — padding a blank identity field with a fallback string (`'Unbranded'`/`'Untitled garment'`) instead of blocking the save — as fixed, via `validateNg`'s inline-error rejection (`ngErrors`, `AddManualScreen.tsx`). That fix only reached the `saveGarment` path (Add/Edit Garment). The separate Onboarding save path never got it: a first-time user who blows through the wizard without typing a brand/name saves a garment literally called **"First reference"** by **"Unbranded."** This is silently fabricated identity data, not a value the user chose (contrast with `AddManualScreen`'s honest "Don't know the brand?" → `'Unknown brand'` sentinel, which *is* a deliberate user action).
**Severity:** Medium — scoped to the onboarding entry point only, but it's a direct, verifiable contradiction between documented behavior and actual code, in the exact rule this project cares most about.
**Fix shape:** Either require brand/name in the Onboarding form before advancing past `'form'` step, or offer the same "Don't know?" → `'Unknown brand'`/`'Unknown size'` sentinel pattern `AddManualScreen` already uses, rather than a bare `||` fallback.

### 3.2 Garment photos are never deleted — unbounded local storage leak
**Status: Fixed, 2026-09-26 — typechecked and logic-reviewed, not filesystem-verified** (see §0; would need a native/device run to confirm on disk).
**Files:** `src/utils/photo.ts:35` defines `deleteGarmentPhoto()`; it is never called anywhere else in `src/` (verified by grep across the whole tree). `deleteGarmentById` (`store.tsx:685-694`) deletes the DB row only. `saveGarment`'s update path (`store.tsx:608-636`) overwrites `photo` with a new URI when a user replaces a garment's picture, without deleting the file the old URI pointed to.
**Impact:** Every garment delete and every photo replacement leaves an orphaned JPEG in the app's document directory (`utils/photo.ts`'s `photosDir()`). For a tool explicitly meant for long-term daily use, this grows without bound and has no user-visible way to reclaim it.
**Severity:** Medium — no data loss or security exposure, but a genuine, easily-fixed storage leak.
**Fix shape:** Call `deleteGarmentPhoto(existing.photo)` in `deleteGarmentById` after a successful DB delete, and in the update branch of `saveGarment` when `ng.photo !== existing.photo`.

### 3.3 A "no measurements" empty state can fire for the wrong reason
**Status: Fixed and verified live, 2026-09-26** — see §0. Fixed via the "better" option named below (loosened `compare()` matching), plus a new distinct `noOverlap` reason for the residual case that fix doesn't eliminate.
**Files:** `src/engine/compare.ts:93` vs `src/store.tsx:480-487`
`compare()`'s candidate pool requires a garment to have **every** zone key the user typed (`keys.every((k) => g.m[k] !== undefined)`) — a candidate missing even one of the typed zones is excluded entirely, not compared on the common subset. Separately, `runCheck`'s empty-state reasoning uses a *different*, looser pool (just category-matching garments) to decide which of `noGarments`/`noCategoryGarments`/`noMeasurements` to show. Concretely: a user enters 5 measurements for a top; every top they own is missing just one of those 5 zones; `compare()` correctly returns `null` (no candidate satisfies all 5), but `runCheck` reports `noMeasurements` — whose copy says *"Enter at least one measurement to compare"* — even though the user already entered five and the real blocker is closet data completeness, not their input. This is exactly the class of bug `DESIGN_GUIDELINES.md` rule 14 warns about ("never infer copy from a bare check... model the actual reason").
**Severity:** Low-Medium — an edge case, but a real, silently-misleading one, and one a new user (thin closet, few fully-measured garments) is likely to hit often.
**Fix shape:** Either add a fourth `noResultReason` ("garments exist but none share your entered zones") with honest copy, or — better, see §6 — change `compare()`'s matching to use each candidate's own common-zone subset instead of requiring the full typed set, which fixes both the algorithm limitation and this empty-state bug at once.

### 3.4 No error handling around any local database write
**Status: Fixed and verified live, 2026-09-26.** The manual test this section itself called for was run first (see below), then the fix.
**Files:** every exported function in `src/db/index.ts` (`insertGarment`, `updateGarment`, `deleteGarment`, `insertObservation`, `insertBodyMeasurement`, `migrate`) calls `db.runAsync`/`execAsync`/`withTransactionAsync` with no try/catch; none of their callers in `store.tsx` wrap them either. Verified by grep: `try`/`catch` appears in only 4 files in `src/`, and the only real handling is around `pickGarmentPhoto()` in `store.tsx:562-568`.
**Impact:** A failed write (disk full, corrupted DB, a WAL-mode conflict) rejects an unhandled promise — no toast, no retry, no "this didn't save" state. This directly contradicts `DESIGN_GUIDELINES.md`'s own rule: *"Never hide system state... A form field that doesn't persist what's typed into it is a bug, not a minor detail."*
**Severity:** Medium-High in principle for a tool whose whole point is durable data — confirmed in practice (see below), not just in principle.

**Manual test performed, 2026-09-26:** Rather than trying to induce a real disk-full/corruption condition (impractical in this environment, and the underlying failure mode is the same either way — a rejected promise), `insertBodyMeasurement` in `src/db/index.ts` was temporarily made to always throw, the app was run for real (`expo start --web`, driven in an actual browser, not just read from source), and a body-measurement save was attempted. **Confirmed failure mode:** the write rejected silently — no toast, no error, nothing in the console (the `catch`-less `await` just left the promise chain hanging) — exactly as predicted. Worse than predicted: `ProfileScreen.tsx`'s `handleSave` called `setBodyDraft({})` unconditionally right after calling `store.saveBodyMeasurement(...)`, with no check on whether it actually succeeded — so the user's typed measurement vanished from the field *even though it was never saved*, with no toast and no way to tell anything had gone wrong. This is a second, distinct bug from the "no try/catch" one (a caller-side bug, not a write-level one) and wouldn't have been caught by code reading alone — the manual test is what surfaced it. The throw was reverted immediately after confirming the failure mode; it was never a permanent code change.

**Fix implemented:**
- Every DB-write call site in `store.tsx` now wraps its write(s) in try/catch and calls `showToast(...)` on failure, mirroring the existing `pickNgPhoto` pattern (`store.tsx:581-588`) rather than inventing a new convention: `applyUnits`, `saveBodyMeasurement`, `deleteBodyMeasurementEntry`, `saveGarment` (both the update and insert branches, one try/catch around both since they're mutually exclusive), `deleteGarmentById` (also resets the optimistic `justDeletedGarment` snapshot on failure, so Closet doesn't render a ghost exit-animation tile for a delete that never happened), `obExplore`, `obSaveFit`, `obFinish`, `saveFit`.
- `saveBodyMeasurement`'s signature changed from `Promise<void>` to `Promise<boolean>` (true on success, false on failure/validation-reject), and `ProfileScreen.tsx`'s `handleSave` now only clears `bodyDraft` when it resolves `true` — fixing the caller-side bug the manual test found. This is the only caller in the codebase with this pattern (verified: `saveGarment`, `deleteGarmentById`, `saveFit` all clear their own local state *inside* their own try block, already correctly gated, so no other screen has the same bug).
- **Not automated as a regression test** — a real component/integration test for `ProfileScreen.tsx`'s behavior would need a `jest-expo`-style RN component-testing setup (JSDOM, RN Testing Library, mocked `expo-sqlite`), which the current lightweight `ts-jest` runner (chosen because every currently-tested module is pure TS, see §0) doesn't provide. Verified live instead, same reasoning as §3.1's onboarding fix. Worth adding if/when a component-testing setup is introduced.
- **Not done:** a "retry" button/action (the roadmap's fix shape mentioned "toast/retry") — the toast plus an intact, retryable draft was judged sufficient (the user can just press Save again), consistent with `DESIGN_GUIDELINES.md`'s "reduce effort" psychology stance rather than building bespoke retry machinery beyond what's needed.

### 3.5 No migration-failure recovery path
**File:** `src/db/index.ts:51-121` (`migrate`). Runs unconditionally on every launch with no guard around individual `ALTER TABLE`/`CREATE TABLE` statements. If a migration throws partway (app killed mid-migration in a prior session, a hand-edited or corrupted db file), there's no detection or recovery UI — `Shell`'s `!store.ready` branch (`App.tsx:83-89`) just renders a blank screen indefinitely, since `ready` only ever flips `true` after the `useEffect` in `store.tsx:279-292` resolves.
**Severity:** Low likelihood, high impact if hit. **Unverified** — would need an actual corrupted/mid-migration DB to confirm the real failure mode.

### 3.6 Zero accessibility API usage anywhere in the app
**Status: Fixed, 2026-09-26** — see §0.
Verified by grep across all of `src/` (before the fix): `accessibilityLabel`, `accessibilityRole`, `accessible=` — **0 matches**. Every interactive control (icon-only `×` search-clear, `←` back arrows, tone dots, chip/toggle selected-state) was a bare `Pressable`/`TextInput`/`View` with no screen-reader semantics. A TalkBack/VoiceOver user could not meaningfully use FitCheck at all.
**Severity:** Medium — doesn't block the sighted-user experience the app was clearly built and polished around, but worth being upfront about rather than silently shipping, especially for an open-source project where "accessible" is a reasonable community expectation.
**Fix implemented:** every `Pressable`/`TextInput` in `src/` now has `accessibilityRole`/`accessibilityLabel` (plus `accessibilityState` where a control has a selected/expanded/checked/disabled state), fixed centrally in the shared `components/UI.tsx` controls first, then per-screen — full detail in §0's fourth-pass entry. **Not done:** manual VoiceOver/TalkBack device testing (this fix is verified as complete static coverage — `tsc`/`jest`/an automated per-file scan — not as confirmed real screen-reader UX); worth a real device pass before or shortly after release.

### 3.7 `LICENSE` is the wrong license
**Status: Fixed, 2026-09-26** — see §0.
**File:** `LICENSE:3` — `Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)`. This is the unedited boilerplate left over from `create-expo-app`'s template; it asserts **Expo's own copyright** over this repository, not the actual author's. This is a correctness problem, not a formality — as-is, the file makes a legally confusing claim about who owns the code.
**Severity:** High for open-source readiness specifically (blocks a credible release), zero runtime impact.
**Fix shape:** Pick a license (MIT/Apache-2.0/GPL-3.0 are all reasonable for this kind of app — that choice is the user's, not mine) and replace the file with the real author/year and that license's actual text.

---

## 4. Feature recommendations

Kept short and honest per the project's own "reduce effort, don't add bloat" psychology stance — most of what a shopping/marketplace app would suggest here (wishlists, price tracking, social sharing) is explicitly out of character for FitCheck and isn't listed.

| Idea | Problem it solves | Fits core purpose? | Complexity | Privacy | Before release? |
|---|---|---|---|---|---|
| Export/import (JSON dump of garments+observations+body measurements) | No backup story today — uninstalling or losing the device loses the entire fit-memory closet | Yes — directly protects the thing the app exists to build | Low-Medium (local file write/read via `expo-file-system`, already a dependency) | None — stays fully local | **Yes, P1.** This is the single highest-value addition for a tool people are meant to trust with years of data |
| Partial-measurement matching in `compare()` (use each candidate's common-zone subset instead of requiring the full typed set) | Fixes §3.3's bug and makes comparisons usable earlier in closet-building, when few garments are fully measured | Yes — extends the existing confidence/coverage machinery rather than replacing it | Medium (touches core scoring logic — needs care, not a rewrite) | None | **P1** — algorithmic improvement, not a new feature surface |
| "Show more" for Closet's "Recently added" filter (currently hard-capped at 6) | Consistency with the progressive-disclosure pattern already used for fit history / fit-type chips | Yes | Trivial | None | P2 — small UX polish |
| Garment archive/donated state (soft-delete, not hard-delete) | "Remove from closet" today is destructive-forever; someone who donates a garment loses its fit history even though it might still be a useful reference point | Yes — fits "fit memory," not shopping | Low-Medium (one more column + a filter) | None | P2 — reasonable, not urgent |
| Dark mode | `app.json` currently forces `userInterfaceStyle: "light"`; `theme.ts` has exactly one hardcoded palette | Neutral — cosmetic, not core | Medium (a second color token set + wiring) | None | P3 — nice-to-have, not core to "remembering how clothes fit" |
| Duplicate-garment detection | Catches accidental double-entry of the same item | Marginal value; a personal closet is small enough that this is rarely a real problem | Medium | None | P3 — low value for the complexity |

**Explicitly not recommended:** anything from the original brief's "brand/retailer integration," "crowd-sourced data," or population-based size defaults — all directly conflict with the project's own locked decisions (fully offline, no scraping, no "most people choose" framing once personal history exists).

---

## 5. UX and design improvements

The UI layer is unusually disciplined for a solo project — `DESIGN_GUIDELINES.md`'s own checklist is, on the screens I read in full (Home, Closet, Detail, Add/Edit, FitCheck, Result), largely already satisfied: consistent 44px touch targets with `hitSlop` where needed (`ClosetScreen.tsx`'s search-clear, `DetailScreen.tsx`'s back button/remove link), `numberOfLines`-capped garment names with fixed-height rows so grid alignment can't desync, category-specific fit-tag vocabulary, a single shared `MOTION` constants file with `useReducedMotion()` checked in every animated component I read.

Concrete gaps found:

1. **No dark mode** (`app.json:9`, `theme.ts:1-29`) — a single fixed light palette, `userInterfaceStyle: "light"` forced. Reasonable as a deliberate initial scope choice, but worth calling out explicitly as a known gap rather than an accidental oversight, since it's the single most commonly-requested "polish" item for any new open-source Android app.
2. **`ClosetScreen.tsx:55`** — "Recently added" filter silently truncates to 6 with no way to see the rest of what "recently added" would otherwise mean, unlike every other capped list in the app.
3. ~~**Icon-only controls have no text fallback for assistive tech**~~ **Fixed 2026-09-26** (§3.6/§0) — the `×` clear button, `←` back arrows, and tone dots now carry `accessibilityLabel`/`accessibilityRole`, or are hidden from the accessibility tree where they're purely decorative alongside adjacent text.
4. **`AddManualScreen.tsx`/`FitCheckScreen.tsx`'s measurement fields set `keyboardType="numeric"`** (`UI.tsx:261`) — on Android this typically doesn't include a decimal separator on all keyboard layouts, which could make sub-integer-cm entry (or inch entry, which legitimately wants one decimal per `formatValue`) fiddly on some devices. **Unverified** — would need a real-device check across a couple of Android keyboard apps to confirm impact; flagging as a "worth spot-checking," not a confirmed bug.

---

## 6. Fit prediction engine review

`src/engine/compare.ts` is the strongest part of the codebase. It already does the things the original brief's "Fit prediction engine" section asks for: measurement-by-measurement comparison output (never a single number), qualitative confidence tiers built from a transparent point system (evidence volume, fit-type agreement, silhouette agreement, recency, preference clustering, measurement coverage), fabric-stretch-aware tolerance, a shape/silhouette signal derived from actual measurement ratios rather than a guess, and an explicit `why` explanation string assembled from the same signals that drove the ranking. It never claims scientific precision it can't support, and the project's standing decision against numeric match percentages is respected everywhere I checked.

The one real limitation, covered in §3.3/§4: `compare()`'s pool filter (`compare.ts:93`) requires a candidate to have **every** zone the user typed, not just the largest common subset. This is the one place the engine is stricter than it needs to be, and loosening it (matching on common zones, letting the existing `coverage`/confidence machinery penalize thinner overlap the same way it already penalizes a single-zone match) would both fix the misleading empty-state bug and make the tool useful earlier in a user's closet-building journey — which matters a lot for a tool whose value compounds with data over time.

No other engine changes are recommended. Anything approaching a learned/ML model would be a regression from "deterministic, auditable, explainable" — the project's own risks.md already reasoned through and correctly rejected this for a personal-scale tool.

---

## 7. Offline-first and privacy audit

**Verified, not assumed:**
- Zero network calls anywhere in `src/` — grepped for `fetch(`, `axios`, `XMLHttpRequest`, `http(s)://`, and known analytics/crash-reporting SDK names (Sentry, Firebase, Crashlytics, Amplitude, Mixpanel): no matches.
- All persistence is local SQLite (`expo-sqlite`, `src/db/index.ts`) with WAL mode; garment photos are copied into the app's own document directory (`utils/photo.ts`), not left as a picker cache reference that the OS could purge or that could point outside the app's sandbox.
- No `console.log`/`console.warn`/`console.error` statements anywhere in `src/` — nothing to accidentally leak into a debug log.
- No embedded API keys or secrets found in source (grepped for common key/secret patterns — none found).
- Release signing material (`keystore/release.jks`, `keystore.properties`) is correctly `.gitignore`d and untracked — confirmed via `git ls-files`, not just by reading `.gitignore`. `plugins/withReleaseSigning.js` also fails gracefully (falls back to debug signing with a warning) if that file is absent, so a fresh clone never crashes trying to find it.

**Gaps:**
- The local SQLite database is **not encrypted at rest** — standard for `expo-sqlite` without extra native modules, and a reasonable trade-off for a personal-use app (adding SQLCipher or similar is real native-module complexity for a threat model — "someone with physical access to an unlocked/rooted device" — that's arguably out of scope). Worth stating explicitly in a future privacy note rather than silently leaving it implicit, especially once the app has a public audience who'll ask.
- No backup/export path (§4) means the offline-first architecture, while private, currently has no recovery story if the device is lost — "fully local" and "fully backed up" are in tension until export exists.
- §3.5's remaining error-handling gap (migration-failure recovery) is also privacy-adjacent in the sense that a silently-failed write is silently-lost personal data, which matters more for a privacy-focused tool than a typical app. (§3.4's write-level gap is fixed as of 2026-09-26 — see §0.)

**No changes needed to the offline-first architecture itself** — it's correctly built as fully local-only, and nothing here should be added that changes that (no cloud sync, no telemetry-with-opt-out — just don't add telemetry at all, consistent with the project's own decisions).

---

## 8. Open-source readiness audit

### Repository
| Item | Status |
|---|---|
| README | ~~Missing entirely~~ **Fixed 2026-09-26** — `README.md` added (see §0) |
| LICENSE | ~~Present but wrong~~ **Fixed 2026-09-26** — see §3.7 |
| CONTRIBUTING.md / CODE_OF_CONDUCT.md | Missing |
| Issue/PR templates | Missing |
| CHANGELOG | Missing (there are several overlapping planning docs — `CHECKLIST.md`, `HANDOFF.md`, `QA_HANDOFF.md`, `PLAN.md` — none of which is a changelog) |
| CI | ~~Missing~~ **Fixed 2026-09-26** — `.github/workflows/ci.yml` added (typecheck + test on PR/push); the unrelated `modernize/java-upgrade` scaffold under `.github/` is untouched |
| Versioning | `package.json`/`app.json` both pin `"version": "1.0.0"`; no tags exist in git history (single `9f18a9b Initial commit`) |

### Licensing
- App license: see §3.7 — needs replacing with a real, project-owned license.
- Dependency licenses: all runtime dependencies are standard Expo/React Native ecosystem packages (`expo`, `expo-*`, `react`, `react-native`, `@expo-google-fonts/*`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-web`) — all permissively licensed (MIT/BSD-family) in the broader ecosystem. **Unverified in detail** — I did not run a license-scanning tool (e.g. `license-checker`) against the actual installed `node_modules` tree; worth doing once before first release rather than assuming.
- Fonts: Archivo and JetBrains Mono via `@expo-google-fonts/*` — both are SIL Open Font License fonts, which is release-compatible. **Unverified against the actual bundled font files' license headers**, but this is a very low-risk, well-trodden path (these packages exist specifically to make Google Fonts easy to bundle under their original OFL terms).

### Contributor experience
- Local setup: standard `expo`/RN workflow (`npm install`, `npm start`); no documented prerequisites, no README to point a new contributor at any of this.
- ~~No test command~~ — `npm test` (Jest) and `npm run typecheck` (`tsc --noEmit`) now exist and both run in CI on every PR (done 2026-09-26, see §0). No lint command is still configured — TypeScript's own `strict: true` is enforced in CI now, but nothing checks style/lint rules (no ESLint config exists); not treated as launch-blocking on its own.
- Build reproducibility: the *local* signed-APK path (`plugins/withReleaseSigning.js` + presumably `gradlew assembleRelease`) is real and gitignore-safe, but undocumented — no README, no npm script wraps it. The only documented-in-`package.json` build path (`build:apk`) requires an EAS account, which is a cloud dependency a contributor building purely from source shouldn't need.

### Recommended repo hygiene pass before first push (concrete, not generic advice)
**Status: Done, 2026-09-26** — see §0. All three bullets below were carried out as originally recommended (screenshots moved to a gitignored folder rather than deleted, so nothing was lost).
- ~~Root currently has ~50 untracked screenshot PNGs~~ Moved into `.qa-screenshots/` (gitignored), alongside `.playwright-mcp/` and `*.apk` also now gitignored.
- ~~`research.md`/`risks.md`... worth a deliberate decision~~ Both moved to `docs/design-history/`, kept (not trimmed or dropped).
- ~~`CHECKLIST.md`, `HANDOFF.md`, `QA_HANDOFF.md`, `PLAN.md`, `spec.md` overlap~~ Consolidated into `docs/` — `spec.md` → `docs/spec.md`, the rest → `docs/design-history/`.

---

## 9. GitHub / distribution readiness (with an F-Droid look-ahead)

The user's stated goal is source availability on GitHub, so that's the actual bar — the items below are what's needed for *that*, with F-Droid-specific requirements called out separately since a GitHub release is F-Droid's actual prerequisite anyway, should that be revisited later.

**Blockers for a basic GitHub release (technical):**
- None, actually — the app builds and runs; nothing here is a "the code doesn't work" blocker. This is entirely a documentation/hygiene gap (§8).

**Blockers for a *credible* GitHub release (quality bar, not technical):**
- README, correct LICENSE, and a repo hygiene pass (§8) — all P0.

**If F-Droid inclusion is revisited later** (checked against F-Droid's current, official inclusion policy and submission guide, fetched 2026-09-25 — see Sources):
- **Likely compliant already:** every runtime dependency in `package.json` is FLOSS (Expo/RN ecosystem, no Google Play Services, no Firebase, no proprietary ad/analytics SDK) — F-Droid explicitly forbids exactly those categories, and FitCheck has none of them.
- **Missing and required:** a real LICENSE (§3.7); `fastlane/metadata/android/en-US/short_description.txt` + `full_description.txt` + screenshots under `fastlane/metadata/android/en-US/images/`; git version tags per release (F-Droid's build metadata pins to a commit/tag, not a branch); a `metadata/<appid>.yml` build recipe lives in F-Droid's own `fdroiddata` repo, not this one, and is written at submission time, not now.
- **Worth confirming before submitting:** F-Droid requires the *entire* build toolchain be FLOSS — Expo's own build tooling is open source, but this hasn't been verified against F-Droid's specific "trusted prebuilt binary source" list (Maven Central, Google's Maven, official Android SDK) for every native module Expo pulls in. This is genuinely a "check when you get there" item, not something worth blocking a GitHub release over now.

Sources:
- [F-Droid Inclusion Policy](https://f-droid.org/docs/Inclusion_Policy/)
- [F-Droid Submitting to F-Droid: Quick Start Guide](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/)

---

## 10. Testing plan

**Status: P0 tier done, 2026-09-26 — see §0.** As originally written, there was no test infrastructure at all — no test runner in `package.json`, zero `*.test.*`/`*.spec.*` files anywhere in the repo. That's now Jest + `ts-jest`, 40 passing tests across the three P0 targets below, run in CI. The P1 integration/functional tier further down is still unwritten.

**P0 — before treating any future contribution as safe to merge blind:** *(all done 2026-09-26)*
- [x] Unit tests for `src/engine/compare.ts`: `compare()`'s pool-filtering behavior (including the §3.3 edge case), `toneFor()`'s tolerance-band boundaries, `buildResult()`'s confidence-point scoring across a matrix of evidence levels, `seedNewGarment()`'s mode-fit selection never seeding an unset `'—'` fit.
- [x] Unit tests for `src/utils/units.ts`: round-trip `cm → in → cm` doesn't drift, `convertDraftUnits` never fills an empty field.
- [x] Unit tests for `src/data/hydrate.ts`'s `isStrongReference()`: the four-condition gate (complete measurements, has feedback, recent, ≥0.8 avg score) at each boundary.
- [x] A regression test that specifically encodes §3.3, so it can't silently regress again. (§3.1's fix lives in `store.tsx`'s onboarding flow, which pulls in `expo-sqlite`/RN — out of scope for the current pure-logic Jest setup; it was instead verified live in-browser, see §0. Covering it with an automated test would need a `jest-expo`-style setup with SQLite/RN mocking, not added here to keep the test runner lightweight for what it actually tests today.)

**P1 — integration/functional, once a test runner exists:**
- Add garment (valid, and each individual missing-required-field case per `validateNg`) → appears in Closet.
- Edit garment → measurement/category-switch clears stale zone keys (`setNgCategory`'s guarded behavior).
- Delete garment → gone from Closet, its photo file is gone from disk (once §3.2 is fixed), its observations are gone (already covered by `deleteGarment`'s transaction in `db/index.ts:228-233`).
- Run a FitCheck comparison with 0 garments / 0 garments in category / 0 measurements entered / a full match — each hits the correct `noResultReason` or result.
- Unit toggle mid-entry on every draft type (FitCheck, Add/Edit, Onboarding, body measurements) converts without drift or data loss.

**Edge cases worth deliberately testing, not just unit-covered:**
- Empty closet, one garment, and a "many garments" closet (50+) — the last one specifically to sanity-check `ClosetScreen`'s plain `ScrollView`+`.map()` grid (no `FlatList`/virtualization anywhere in `src/` — fine at personal-closet scale, worth a real spot-check once someone has a genuinely large closet).
- Kill the app mid-save (§3.5's remaining territory — a mid-migration kill, not a mid-write one) and confirm what actually happens — still the highest-value remaining manual test in this area.
- ~~A device with no storage headroom left, to see whether a failed `db.runAsync` actually surfaces to the user or silently vanishes.~~ **Done 2026-09-26** (via a simulated throw rather than genuinely exhausting storage — see §3.4): it now does surface to the user, via a toast.

---

## 11. Prioritized implementation roadmap

| Item | User benefit | Complexity | Priority | Dependencies | Recommendation |
|---|---|---|---|---|---|
| ~~Replace `LICENSE` with the real project license~~ | Legal correctness for a public repo | Trivial | **P0 — Done 2026-09-26** | None | Do before first push |
| ~~Write a README~~ (what it is, screenshots, install/build steps, license) | The actual entry point for anyone finding the repo | Low | **P0 — Done 2026-09-26** | None | Do before first push |
| ~~Repo hygiene pass~~ (gitignore/remove screenshots, `.playwright-mcp/`, `.apk`; consolidate planning docs) | Project reads as maintained, not abandoned mid-session | Low | **P0 — Done 2026-09-26** | None | Do before first push |
| ~~Fix §3.1 (onboarding identity fallback)~~ | Closes the one place the app still fabricates data it claims never to | Low | **P0 — Done & verified live 2026-09-26** | None | Small, targeted fix |
| ~~Fix §3.2 (orphaned photo files)~~ | Stops an unbounded local storage leak | Low | **P0 — Done 2026-09-26 (not filesystem-verified)** | None | Call the already-written `deleteGarmentPhoto` in the two right places |
| ~~Add error surfacing around DB writes (§3.4)~~ | A failed save is never silent | Medium | **P1 — Done & verified live 2026-09-26** | Manual test first to confirm actual current failure mode | Wrap `store.tsx`'s DB-calling functions; show a toast/retry on failure |
| ~~Fix §3.3 (misleading empty-state reason)~~ / loosen `compare()`'s pool filter (§6) | Correct guidance when the closet has partial data; more useful earlier in closet-building | Medium | **P1 — Done & verified live 2026-09-26** | None | One well-scoped algorithm change, worth doing together |
| ~~Basic unit test suite for `engine/compare.ts`, `utils/units.ts`, `hydrate.ts`~~ | Makes the core algorithm safe for outside contributors to touch | Medium | **P1 — Done 2026-09-26** (40 tests, Jest + ts-jest) | Pick a test runner (Jest is the standard Expo/RN choice) | Highest-leverage testing investment |
| ~~Basic CI (typecheck + test on PR)~~ | Catches regressions before merge, standard contributor-trust signal | Low-Medium | **P1 — Done 2026-09-26** | Depends on tests existing | GitHub Actions, free for public repos |
| Export/import (JSON) | The offline-first architecture's missing backup story | Medium | **P1** | None | See §4 |
| ~~Accessibility pass (labels/roles on all interactive controls)~~ | TalkBack/VoiceOver users can use the app at all | Medium | **P1 — Done 2026-09-26** | None | Done for the whole app, not just icon-only controls (§3.6/§0). Manual VoiceOver/TalkBack device testing still worth doing |
| CONTRIBUTING.md, issue/PR templates | Sets contributor expectations for a project about to get outside eyes | Low | **P2** | README should exist first | Standard, low-effort |
| Closet "Recently added" show-more | Consistency with the rest of the app's progressive-disclosure pattern | Trivial | **P2** | None | Small polish |
| Garment archive/donate soft-delete | Keeps fit history for garments no longer owned | Low-Medium | **P2** | None | See §4 |
| Dark mode | Common open-source-Android-app expectation | Medium | **P3** | None | Not core to the product's purpose |
| F-Droid submission (fastlane metadata, tags, `fdroiddata` recipe) | Wider distribution beyond GitHub | Medium | **P3** | GitHub release with tags must exist first | Revisit once P0/P1 above are done — see §9 |
| Duplicate-garment detection | Marginal value at personal-closet scale | Medium | **P3** | None | Low priority per §4 |

---

## 12. Definition of Done (first public GitHub release)

- [x] `LICENSE` names the actual project/author, not Expo's template copyright (§3.7) — done 2026-09-26
- [x] `README.md` exists with: what the app is, a few screenshots, build/run instructions, license — done 2026-09-26
- [x] Root is clean of QA screenshots, `.playwright-mcp/`, and built binaries (either removed or gitignored) (§8) — done 2026-09-26
- [x] §3.1 (onboarding identity fallback) and §3.2 (orphaned photos) are fixed — done 2026-09-26 (§3.1 verified live in-browser; §3.2 typechecked/logic-reviewed only, not filesystem-verified)
- [x] At least a minimal unit test suite exists for `engine/compare.ts` and `utils/units.ts`, and a CI workflow runs it + `tsc --noEmit` on every PR — done 2026-09-26 (also covers `hydrate.ts`; 40 tests, `.github/workflows/ci.yml`)
- [x] A manual test pass has confirmed what actually happens on a failed DB write (§3.4) — done 2026-09-26, and fixed (see §0/§3.4). A killed-mid-save app (§3.5) is **still open** — untested and unfixed.
- [ ] `git tag` exists for the release version, matching `app.json`/`package.json`'s version field — **still open**

Everything else in §11's P1/P2/P3 rows is real, worthwhile follow-up work — but none of it should block getting the (already solid) core product in front of the first outside contributor.
