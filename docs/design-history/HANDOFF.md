# Fitcheck — implementation handoff

Working log for the "implement PLAN.md, fully offline" task. [PLAN.md](PLAN.md) is now the
up-to-date, authoritative status doc — read that first. This file just records how the
session got there and what was verified, in case the next session wants the detail.

**Status: all items from PLAN.md's "Not implemented yet" list are now implemented**,
except device testing and actually producing an APK (both need hardware/an EAS login this
environment doesn't have — see PLAN.md's "Suggested next steps").

## What changed, file by file

- `src/types/index.ts` — added `FitObservation` (append-only log entry), `photo`,
  `createdAt`, `observations` on `Garment`; `Units`; `FitProfile`/`TrendRead`/`LearnedPref`/
  `ZoneRange` for the Profile screen; `DiffRow.cm` (raw delta, replacing pre-formatted text
  so the UI can convert units).
- `src/data/hydrate.ts` (new) — derives `feels`/`history`/`visual` from an observation log.
  Uses a fixed month-name table, not `toLocaleDateString`, because ICU short-month output
  ("Sept" vs "Sep") differs between Node and Hermes-on-Android — verified this actually
  differs before fixing it.
- `src/data/seed.ts` — rewritten around per-garment observation logs (was flat `feels`/
  `history` arrays) so the demo data exercises the same append-only shape as real usage.
- `src/db/index.ts` (new) — SQLite schema + migration (`PRAGMA user_version`), seed-once,
  CRUD for garments and observations, units setting.
- `src/utils/units.ts`, `src/utils/photo.ts` (new) — cm/in conversion; OS photo picker +
  copy-into-document-directory (see the comment in `photo.ts` for why this isn't a bare
  identifier reference, contra spec.md's literal wording).
- `src/engine/profile.ts` (new) — trend detection, learned preferences, comfortable ranges,
  all read-derived from observations, no invented precision.
- `src/store.tsx` — rewritten: async SQLite init behind a `ready` flag, all mutations go
  through the db then reload, edit-vs-create in `saveGarment`, `loadEditGarment`,
  `deleteGarmentById`, `pickNgPhoto`, `toggleUnits`, `pasteFcFromClipboard`,
  `sanitizeNumeric`, `startGarmentFromResult` (Result → "Save this as a garment" now
  actually carries the FitCheck draft over instead of dropping it).
- `App.tsx` — loading gate on `store.ready`.
- Screens touched: `DetailScreen` (edit/delete wiring, real photo, unit-aware measurements),
  `AddManualScreen` (photo picker UI, unit-aware labels/placeholders, edit-mode copy),
  `FitCheckScreen` (clipboard paste button, unit-aware labels, sanitized input),
  `ResultScreen` (unit-aware deltas via `formatDelta`, real photo, wired save-as-garment),
  `ProfileScreen` (rewritten around `store.profile`, added units toggle),
  `HomeScreen`/`ClosetScreen` (real photo thumbnails via `PhotoTile`'s new `uri` prop).
- `src/components/UI.tsx` — `PhotoTile` accepts an optional `uri` and renders a real
  `Image` instead of the gradient placeholder when a photo exists.
- `src/components/FitSheet.tsx` + `store.openSheet` — bug fix found along the way: the
  bottom sheet's hardcoded pants area list (`'Seat'`, missing `'Knee'`) didn't match
  `constants.ts`'s zone labels (`'Hip / seat'`), so comfort feedback logged there couldn't
  be matched back to a measurement zone — which would have silently starved
  `computeRanges` in the new profile engine. Now sourced from `keysFor()` directly, and
  `openSheet` resets the selected area if it's not valid for the garment's category.
- `metro.config.js` (new) — `expo-sqlite`'s web build imports a `.wasm` file; Metro doesn't
  bundle wasm as an asset by default, so web export failed without this. Android is the
  real target, but this made the app buildable on web too, which is what let the
  verification below happen at all.
- `app.json` — added the `expo-image-picker` config plugin (permission strings).
- `eas.json` (new), `package.json` — `personal` Android-APK build profile, `build:apk` script.

## Verification actually performed this session

- `npx tsc --noEmit` — clean throughout, checked after every batch of edits.
- `npx expo export --platform web` — 452 modules, no errors, twice (before and after the
  FitSheet fix).
- `npx expo start --web` run live, confirmed the dev server actually serves (`curl` 200 on
  the root, real `index.html`), then shut down (killed the process on the listening port —
  `taskkill`/`kill` — and confirmed the port stopped responding). No interactive click-through
  was possible in this environment (no browser-automation tool available), so this is a
  build/serve check, not a UI walkthrough.
- Compiled the pure-logic modules (`compare.ts`, `profile.ts`, `hydrate.ts`, `seed.ts`,
  `units.ts`, `constants.ts`) standalone with `tsc` into a scratch directory and ran them
  under plain Node against the real 11-garment seed data (bypassing anything that needs
  React Native). Confirmed: `computeFitProfile` produces sane trend/prefs/ranges in both cm
  and in; `buildResult` still returns "Likely a good match" / Medium confidence / no
  percentages for the default FitCheck draft; unit conversion round-trips correctly. This
  caught the "Sept" vs "Sep" date-formatting inconsistency before it shipped.
- Did **not** run on an Android emulator/device — this remains genuinely untested, per
  PLAN.md. `expo-sqlite`, `expo-image-picker`, and `expo-file-system` are exercised in the
  web build (where `expo-sqlite` falls back to a wasm-based SQLite), which is not the same
  code path as their native Android modules.

## Constraints respected throughout (see PLAN.md/spec.md for the source of these)

- Fully offline — no network calls were added anywhere; every new dependency
  (`expo-file-system`, `expo-clipboard`, `expo-image-picker`) is local-only.
- No percentage match scores.
- Fit history append-only — enforced structurally now (SQLite `observations` table has no
  UPDATE path in the app, only INSERT).
- Comfort and visual preference kept as separate fields throughout the new observation log.
- Add-from-Photo OCR simulation left untouched — still fake, still not "fixed" into real
  extraction, per the three-times-reaffirmed decision in spec.md.
