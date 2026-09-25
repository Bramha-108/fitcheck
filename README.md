# FitCheck

FitCheck is a personal fit-memory app for clothes. You log the garments you
own — with the measurements that actually matter for that garment's category,
not a universal spec sheet — and how they fit. When you're considering a new
piece, FitCheck compares its measurements against what's already in your
closet and tells you the closest match, the exact differences, and what that
means in plain language. No sizing predictions, no match percentages, no
population averages — just your own data, honestly presented.

It's fully offline: everything lives in a local SQLite database on your
device. There's no account, no backend, and no network calls anywhere in the
app.

## Screenshots

<p align="center">
  <img src="docs/screenshots/add-garment.png" width="260" alt="Add Garment screen with category-specific measurement fields">
  <img src="docs/screenshots/fitcheck.png" width="260" alt="FitCheck entry screen for comparing a new garment">
  <img src="docs/screenshots/profile.png" width="260" alt="Profile screen showing learned fit preferences">
</p>

## Why FitCheck exists

Online size charts and "true to size" reviews assume your body matches some
reference customer. FitCheck doesn't try to predict your size from measurements
alone — it anchors every comparison to a garment you already own and know the
fit of, and shows you the differences from there. See
[`DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md) for the full design philosophy,
and [`docs/spec.md`](docs/spec.md) for the original product/architecture spec.

## Getting started

**Prerequisites:** Node.js 18+, npm, and either an Android/iOS device or
emulator (or a web browser, via Expo's web target).

```bash
npm install
npm start        # opens Expo dev tools — scan the QR code with Expo Go, or:
npm run android  # run on a connected Android device/emulator
npm run ios      # run on a connected iOS device/simulator (macOS only)
npm run web      # run in a browser
```

This project targets **Expo SDK 57** (see [`AGENTS.md`](AGENTS.md) — the SDK
has changed significantly across versions, so check the
[versioned Expo 57 docs](https://docs.expo.dev/versions/v57.0.0/) rather than
generic/latest Expo docs when making changes).

### Building a release APK locally

`npm run build:apk` uses EAS's cloud build service, which requires an Expo
account. To build a signed APK purely from source with no cloud dependency,
use the standard Expo/Gradle local build path:

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

Release signing (`plugins/withReleaseSigning.js`) looks for `keystore.properties`
and a keystore under `keystore/`; if neither is present it falls back to debug
signing with a warning, so a fresh clone builds without any extra setup.

## Project structure

- `src/engine/compare.ts` — the deterministic fit-comparison engine (no ML,
  no network — just weighted measurement-zone tolerances, fabric-stretch
  scaling, and a transparent confidence score)
- `src/store.tsx` — app state, persistence orchestration, and screen routing
- `src/db/` — local SQLite schema and queries
- `src/data/` — category/measurement-zone constants and derived data helpers
- `src/screens/` — one file per screen
- `src/components/` — shared UI primitives
- `src/utils/` — units conversion, motion constants, photo storage

## Status

FitCheck is a personal project being published for anyone who finds it
useful, not a maintained product with SLAs. See
[`docs/design-history/`](docs/design-history/) for the design/planning notes
this project was built from, and the open items being worked through before
and after this release.

## License

MIT — see [`LICENSE`](LICENSE).
