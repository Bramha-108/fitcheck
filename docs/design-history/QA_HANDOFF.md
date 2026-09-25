# FitCheck — QA & product-quality session handoff

Working log for a multi-session pass: full Chrome/CDP QA audit → fix the critical bugs
found → verify swipe navigation with trusted input → start a "does this become more
useful over time" product-quality round. Read this before continuing; it tells you
what's done, what's verified, and exactly where the next session should pick up.

## Environment

- Dev server: `npx expo start --web --port 8099`, tested against `http://localhost:8099`.
  Start it fresh next session — it was not left running.
- Browser automation: Playwright MCP tools (`mcp__playwright__*`), not `claude-in-chrome`
  (the extension wasn't connected when this session tried it). `browser_run_code_unsafe`
  was needed for anything beyond a plain click/type/evaluate — real mouse drags and, more
  importantly, **trusted CDP touch events** (`Input.dispatchTouchEvent` via
  `page.context().newCDPSession(page)`), since `react-native-gesture-handler`'s web pan
  recognizer does not respond to synthetic `dispatchEvent` gestures at all — only to
  genuine trusted input. See "Known tooling quirks" below before re-testing gestures.
- The closet has accumulated test data from this session (five garments: "Garment A (no
  fit)", "Garment B (Regular)", two "Untitled garment"s, "First reference", plus one
  fully-measured Tops "Untitled garment" with real comfort feedback). Fine to keep using
  as-is, or wipe and start clean — nothing in it is meaningful demo data.

## What's done and verified (do not re-litigate)

### Round 1 — full QA audit, then fixes
Ran the full Chrome/CDP QA script (onboarding, unit conversion, category switching,
closet empty-states, FitCheck compare, Result screen, swipe nav, viewport sweep,
console audit). Found three real bugs, all now fixed and verified:

1. **Fabricated "Regular" Fit Type on save when unselected.** `store.tsx`'s `saveGarment`
   and `obSaveFit` used `fit: ng.fit || 'Regular'` — an unselected Fit Type silently
   became a real (and weighted) comparison signal. Fixed to `|| '—'`, matching the
   existing `size`/`sil` convention. Also hardened `engine/compare.ts` (`fitMatch`,
   `preferred`, `sameFitPositive`/`preferenceNote`, `seedNewGarment`'s `mode('fit')`) and
   `engine/profile.ts`'s `preferredFitsFor` with a new `isSet()` helper
   (`src/data/constants.ts`) so an unset `'—'` fit can never be treated as real evidence
   downstream. Verified live: two Jackets garments, one with fit unset and one with
   `Regular`, ranked correctly in a real comparison — the unset one never got credit for
   a "same fit type" match despite identical measurement distance.

2. **Delete non-functional on web.** `Alert.alert` (used by Detail's "Remove from closet"
   and Profile's "Remove entry") is unimplemented on `react-native-web` — taps did
   nothing, silently. Replaced with a new shared `src/components/ConfirmDialog.tsx`
   (presentational, props-driven: `visible/title/message/cancelLabel/confirmLabel/
   destructive/onCancel/onConfirm`), mounted once in `App.tsx`'s `Shell`, driven by new
   store state (`confirmRequest`/`confirm()`/`cancelConfirm()`/`confirmAction()` in
   `store.tsx`). Both screens now call `store.confirm({...})`. Verified live including
   the delete-persistence regression test (create → reload → delete → confirm → reload →
   still gone) for both garments and body-measurement entries.

3. **Swipe navigation completely inert on web.** Root cause, confirmed by instrumenting
   the gesture callbacks directly: `TopLevelSwipeNavigator.tsx`'s outer `Pan` gesture
   would fire `onBegin` but never `onUpdate`/`onEnd`. Traced into
   `node_modules/react-native-gesture-handler/src/web/handlers/NativeViewGestureHandler.ts`
   — every top-level screen's own vertical `ScrollView` (imported from
   `react-native-gesture-handler` by design, see the comment at the top of each screen
   file) activates on **any** pointer movement past the touch-slop threshold on web, with
   no direction check, and wins gesture arbitration outright — starving the outer swipe
   Pan of further events even for a purely horizontal drag. (Native iOS/Android arbitrate
   this correctly on their own; the web port doesn't.) Fixed by giving each screen an
   optional `scrollRef` prop (`HomeScreen`/`ClosetScreen`/`FitCheckScreen`/
   `ProfileScreen`) forwarded to its outer `ScrollView`, and marking the Pan gesture
   `.simultaneousWithExternalGesture(homeScrollRef, closetScrollRef, fitcheckScrollRef,
   profileScrollRef)` in `TopLevelSwipeNavigator.tsx`. Verified with real trusted CDP
   touch drags in both directions across all four screens, both edge boundaries (no
   wraparound), and confirmed vertical scrolling still works and doesn't false-trigger a
   tab switch.

All three fixes: `tsc --noEmit` clean, zero console errors, tap-nav regression-checked.

### Round 2 — product-quality investigation, then fixes
User asked to move past polish into "does FitCheck actually get more useful as you live
with it" — five areas: fit memory quality, comparison quality, garment-detail experience,
onboarding efficiency, real-world edge cases, invisible craft. **Only fit memory quality
and comparison quality got a real pass this session; the rest are still open (see "Not
started yet" below).**

Found and fixed four things, all verified live and `tsc`-clean:

1. **(Major) `AddManualScreen.tsx` never asked "how does this fit."** Only
   `Onboarding.tsx`'s dedicated flow ever populated `Garment.feels` — every garment added
   the normal way (Add Manual, which is the *only* path after the one onboarding
   reference garment) got `comfort: []` forever, unless the user separately remembered to
   open Detail → "Update how it fits." Consequence, traced through the engine:
   `positivityOf()` defaults to neutral 0.5 with no feels; `isStrongReference()`
   (`hydrate.ts`) hard-requires `feels.length > 0`; `preferredFitsFor`/`isPositivelyRated`
   (`profile.ts`) likewise depend on it — so a growing closet silently stopped
   contributing to matching quality, "strong reference" status, and Profile's learned
   preferences. **Fixed** by adding an optional "How does it fit? · optional" step to
   `AddManualScreen.tsx` (hidden while editing — editing never re-asks; that's
   `FitSheet`'s job) using the same three-value holistic vocabulary as onboarding
   ('Fits great'/'Fits okay'/"Doesn't fit"). `store.tsx`'s `saveGarment` now builds
   per-zone `Good` comfort (only for 'Fits great', mirroring `obSaveFit`'s existing "don't
   fabricate a direction for ambiguous verdicts" rule) and inserts it into the bootstrap
   observation. **Verified live**, and the payoff was immediate and cascading: saving one
   fully-measured Tops garment with "Fits great" flipped Profile's "Strong reference
   garments" from 0→1, turned "Nothing to learn yet" into "Often prefers regular tops —
   from 2 positively rated tops, 1 marked as reference", and populated "Comfortable
   chest: 81–100 cm" (previously not shown at all). This is strong evidence the fix
   closes a real, systemic gap, not just a cosmetic one.
   - New field: `NewGarmentDraft.verdict: string` in `src/types/index.ts`. Reused the
     already-generic `store.setNg('verdict', v)` — no new store action needed.
   - `EMPTY_NG`, `draftFromGarment` (edit path sets `verdict: ''`), and
     `startGarmentFromResult` (the Result-screen "Save this as a garment" flow) all
     updated to satisfy the new required field.

2. **Detail's identity chip row was unlabeled.** `DetailScreen.tsx`'s `chips` array
   concatenated `[category, size, fit, sil, stretch, ...tags]` with zero labels — with fix
   #1 above (and the earlier `isSet()` fix) meaning size/fit/silhouette can legitimately
   be `'—'`, a chip row could read as three indistinguishable bare dashes. **Fixed**:
   size/fit/silhouette are now explicitly labeled (`Size —`, `Fit Regular`, `Silhouette
   Regular`); category/stretch/tags are left as-is since they already read fine
   unlabeled. Verified live.

3. **Minor copy contradiction in Result's "Why" section.** `engine/compare.ts`'s `why`
   array included "You've rated it (and similar garments) positively" even when the
   overall verdict was "Likely off for you" (tone `'bad'`) — technically answering "why
   this is the closest candidate" rather than "why it's a good match," but easy to
   misread as contradictory. **Fixed**: that reason (and the "fit type this closet
   clusters around" one) now only appears when `ok` is true (tone isn't `'bad'`).

4. **Latent ID-collision risk.** `garments.id` is a non-autoincrement SQLite `INTEGER
   PRIMARY KEY`, but was generated via plain `Date.now()` in two places in
   `store.tsx` (`saveGarment`, `obSaveFit`) — two garments created within the same
   millisecond would collide and throw on insert (plain `INSERT`, not `INSERT OR
   REPLACE`), silently dropping the save. Unlikely from normal single-tap usage, real
   under any future bulk-create/import feature. **Fixed**: added `generateId()` — a
   counter seeded once at module load with `Date.now()` and incremented per call,
   monotonic for the whole session, so two calls can never collide. Used in both
   `id = ...` spots. (Observation IDs were already safe — `observations` table uses
   `AUTOINCREMENT`, confirmed by reading `db/index.ts`.)

## Not started yet — pick up here

From the product-quality round's original five-area list, only fit-memory-quality and
comparison-quality got real attention (and only partially — see below). Still open:

- **Comparison quality, remainder**: "Are differences explained correctly for every
  category" (only Tops was spot-checked this session, via the no-close-match test —
  Pants/Jackets categories' diff/feel copy not separately verified). "What happens with
  only 1–2 measurements" was reasoned about from code (compare.ts filters `keys` to what
  the user actually entered, pool to garments having all of those — looks correct) but
  not live-tested end to end. Confidence-level justification was spot-checked once (Low,
  1 comparable garment, 0 strong references) — worth checking a High/Medium case too,
  now that the fit-memory fix makes strong references achievable.
- **Garment-detail experience, remainder**: "Is fit history easy to interpret" beyond the
  labeled-chips fix — e.g. what a timeline with several updates over months actually
  reads like once real history accumulates; whether `HISTORY_LIMIT = 6` and "Show all N"
  feel right in practice.
- **Onboarding efficiency**: not investigated this session at all beyond what the
  original Round-1 QA already covered (which was UI/flow correctness, not "is this the
  minimum-effort path").
- **Real-world edge cases**: duplicate garments (no dedupe/warning exists — is that
  fine, or worth a soft nudge?), edited-measurements-after-the-fact effects on existing
  comparisons/history, deleted-reference-garment effects on Profile stats, no-photo
  rendering (already looked fine incidentally), long brand/name values (ClosetScreen's
  `numberOfLines={2}` on the name was confirmed via design doc reference, not re-tested
  live this session), unusual measurement ranges (partially covered by the "no close
  match" Chest=200cm test), insufficient-comparison-data states (partially covered).
- **Premium/invisible craft**: keyboard behavior, focus states, loading states, image
  loading, error recovery, interrupted flows — none of this was touched this session.

## Known tooling quirks (not app bugs — don't misdiagnose these)

- Playwright's `browser_click`/`browser_type` frequently report a `TimeoutError`
  ("waiting for element to be visible, enabled and stable... performing click action")
  in this session even though **the click/type demonstrably succeeded** (confirmed via
  follow-up snapshots every time it happened). Seen throughout Round 2. Cause not fully
  diagnosed — possibly related to the touch-emulation CDP session set up during the
  swipe-gesture debugging leaking into later actions (it was explicitly disabled with
  `Emulation.setTouchEmulationEnabled({enabled:false})` partway through, but the timeouts
  persisted after that too). **When you see this, don't assume the app is broken — take
  a screenshot/snapshot immediately after to check the actual state before reacting.**
- After editing `.tsx` files, the browser can serve a **stale cached bundle** even though
  Metro itself has the correct code (verified once via `curl` directly against the
  bundle endpoint). Fix: `page.context().newCDPSession(page)` →
  `client.send('Network.clearBrowserCache')` → `page.reload()`. A plain
  `page.reload()`/query-string-busted navigate was not sufficient when this happened.
- `Input.dispatchTouchEvent`-based gesture testing needs
  `Emulation.setTouchEmulationEnabled({enabled: true, maxTouchPoints: 1})` sent once per
  session/context first, or the touch events won't register as real touch input.

## Files touched this session

`src/store.tsx`, `src/data/constants.ts`, `src/engine/compare.ts`, `src/engine/profile.ts`,
`src/types/index.ts`, `src/screens/DetailScreen.tsx`, `src/screens/ProfileScreen.tsx`,
`src/screens/AddManualScreen.tsx`, `src/components/TopLevelSwipeNavigator.tsx`,
`src/screens/HomeScreen.tsx`, `src/screens/ClosetScreen.tsx`, `src/screens/FitCheckScreen.tsx`,
`src/components/ConfirmDialog.tsx` (new), `App.tsx`.
