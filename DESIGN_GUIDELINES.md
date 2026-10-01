# FitCheck — Design & UX Guidelines

Condensed from a UI review pass (2026-09-10). Read this before adding or reworking
any screen. It exists so design decisions stay consistent across sessions instead
of being re-derived (or drifted from) each time.

## North Star

> Every element should help the user remember a garment, understand its fit,
> compare it with another garment, or make a fit decision. If it doesn't,
> question why it exists.

> Don't design FitCheck to look impressive in a screenshot. The 1st garment,
> 10th garment, 100th comparison, missing measurement, unusual photo, and empty
> closet should all feel like the same coherent product.

FitCheck is a personal fit-memory tool, not a shopping marketplace or a metrics
dashboard. Borrow e-commerce/product-page UX *principles* (hierarchy, alignment,
spacing, progressive disclosure) — never its *patterns* (carts, badges, ratings,
urgency, match percentages).

## Measurement integrity

This is the single highest-priority rule in this document — everything else here
is about presentation; this one is about whether the data underneath it can be
trusted at all.

> **Never confuse missing information with inferred information.**
>
> FitCheck may calculate a comparison only from measurements the user actually
> provided or measurements obtained through a genuinely supported extraction
> method. Missing garment measurements must remain unknown. Never auto-fill,
> copy, estimate, or fabricate a measurement simply because another field was
> entered.

This is particularly important for FitCheck because the entire product promise
is based on trustworthy personal fit memory. A fabricated waist-to-other-
measurement relationship could make an otherwise accurate comparison misleading.
Concretely:

- If the user enters only a waist measurement, FitCheck stores only the waist
  measurement. Chest, hip, thigh, rise, inseam, etc. remain unknown — not
  inferred, not copied from a category default, not zero.
- An unknown measurement must never participate in a comparison calculation as
  if it were real (`engine/compare.ts`'s `compare()` already does this
  correctly: it only diffs zones present on *both* sides, never substitutes a
  default). Any future comparison logic must preserve that property.
- A comparison-entry draft (FitCheck's own form, Add/Edit Garment, onboarding)
  must start with **no** measurement values pre-filled — not even
  plausible-looking placeholder numbers typed into the field as if the user had
  entered them. A ghost `placeholder` string (grayed-out example text sourced
  from the user's own reference garment) is fine, since it can't be submitted
  without the user actually typing something; a pre-filled `value` is not,
  because it silently becomes real input the moment the user doesn't touch it.
- Switching a garment's category mid-entry must drop measurements typed under
  the old category's zone keys rather than carrying them forward under a
  category they no longer describe (a "tops" chest value has no meaning once
  the draft becomes "pants" — it must not survive into the saved record).
- The UI should make an incomplete measurement set legible as incomplete
  (dashes/"—" for unmeasured zones, not a fabricated number) rather than
  presenting a garment as if it were fully measured.
- **A saved garment's identity is required, not just its measurements.**
  Garment name, brand, category, and size are the minimum meaningful identity
  for a fit record — `store.tsx`'s `saveGarment` validates all four (plus at
  least one measurement) before writing anything, and rejects the save with
  inline field errors (`ngErrors`, rendered by `AddManualScreen.tsx`) rather
  than padding a blank field with a fallback string like the old `'Unbranded'`/
  `'Untitled garment'`/`'—'` did. The draft is left exactly as typed so the
  user only fills in what's missing — never re-asked to redo the whole form.
  Silhouette, fit type, tags, additional measurements, notes, and fit feedback
  stay genuinely optional. If the user doesn't know the brand or size, an
  explicit "Don't know the brand?"/"Don't know?" quick action sets the field to
  a real, honest sentinel value ("Unknown brand"/"Unknown size") — a value the
  user deliberately chose, not one the app silently assumed.

**Category-specific fit language follows the same principle.** Talk about the
dimensions that actually matter for the garment in hand, not a universal fit
questionnaire — a pair of pants has no chest or shoulders, and a top has no
waist or leg opening. `keysFor(category)` (`src/data/constants.ts`) is already
the source of truth for which measurement zones apply to a category; any new
fit-observation chip list (comfort tags, visual-preference tags, onboarding
tags) must be keyed by category the same way, not written as one flat list
that happens to read fine for tops and gets reused everywhere else.

**Adding a measurement zone means deciding whether it's core or
supplementary.** Every zone in `keysFor(category)` is entered, stored,
unit-converted, displayed and compared the same way. `coreKeysFor(category)`
is that set minus `SUPPLEMENTARY_ZONES` (`src/data/constants.ts`), and it's
what "measured completely" is judged against (`hydrate.ts`'s
`isStrongReference`). Outseam (pants, added 2026-10-01) is supplementary: it's
largely inseam + rise, and making it core would have instantly demoted every
fully measured pair of pants already saved. A new zone that mostly repeats
existing ones should be supplementary too. Making a zone core changes what
counts as a strong reference for garments that were saved before it existed.

### Unit switching

One global, persisted unit preference (`store.units`) drives every screen —
there is no per-screen unit state, and there never should be. Garment
measurements are always stored in cm; `units` only controls how a value is
entered and displayed.

- **One control, everywhere.** `UnitToggle` (`src/components/UI.tsx`) is the
  only cm/in control in the app — Onboarding, FitCheck, Add/Edit Garment, and
  Profile's body measurements all render the same component next to their
  "Measurements" label, calling the same `store.setUnits`. A screen that adds
  its own toggle, or shows the unit as plain uneditable text, has drifted from
  this pattern.
- **Switching units converts what's already typed, once.** `store`'s
  `applyUnits` (and `utils/units.ts`'s `convertDraftUnits`) re-expresses every
  in-progress draft's numeric strings in the new unit the moment the toggle is
  pressed — it does not wait for the next render to reinterpret the same
  digits under a new label. Every conversion goes stored/typed value → cm →
  target unit — never "take the currently displayed number and convert it
  again" — so repeated `cm → in → cm → in` switching cannot drift beyond a
  single rounding step. A screen that keeps its own local measurement draft
  (Profile's body-measurement entry is the one example) is responsible for
  converting that local draft when `units` changes too — see its `useEffect`
  keyed on `units` for the pattern.
- **Converting must never fill in what wasn't there.** `convertDraftUnits`
  only touches keys that already hold a non-empty numeric string; an empty
  field stays empty across a unit switch, never 0, never copied from a
  sibling field. This is the same rule as Measurement integrity above, applied
  to the unit toggle specifically.
- **`size` is a literal label, not a measurement — it does not convert.**
  `Garment.size`/`NewGarmentDraft.size` is a freeform string ("L", "32",
  "Wide-leg…") used identically across every category; it isn't a `ZoneKey`
  and doesn't live in `Measurements`. Unit-converting it would mean inventing
  a new interpretation of an existing field just to make the toggle apply
  everywhere, which is exactly what this document's core rule forbids. It's
  still governed by the "never show two competing unit values in one field"
  rule — which is why it must never be seeded with a fabricated dual-format
  string like `32" / 81cm` (see Known failure patterns) — but the fix there is
  to leave it alone, not to convert it.

## Screen checklist (test every new/changed screen against this)

1. **Design for the system, not one screenshot.** Check it against: empty closet,
   one garment, many garments, long garment names, missing measurements,
   dark/light garment photos, incomplete comparison data. A screen that only
   looks right in the happy-path state isn't finished.
2. **Hierarchy needs a purpose.** Every screen should make obvious: what am I
   looking at, what matters most, what can I do, what's secondary/tertiary. Not
   everything can be equally prominent.
3. **One grid everywhere.** Same horizontal margins, card alignment, spacing,
   button placement across Home/Closet/Detail/Add/FitCheck/Result/Profile.
4. **Color is semantic, not decorative.** neutral = info, good/warn/bad = fit
   tone, ink = accent/primary action. No rainbow indicators, no competing accent
   colors, no decorative gradients.
5. **Typography stays simple.** One primary family (Archivo) for text; the
   monospace family (JetBrains Mono) is reserved for numeric/measurement values
   only — that's a restrained, purposeful exception, not "a font per category."
   Build hierarchy with size/weight/line-height, not more fonts.
6. **Labels are short.** "Chest +2 cm", not "Chest measurement difference: +2cm".
7. **Never repeat what's already established.** If a label already says
   "Chest", the value doesn't need to restate it ("Chest: 54cm" → just "54 cm").
8. **Keep related info physically together.** Garment identity (photo/name/
   category/brand/fit), fit memory (how it fits/comfort/preference), comparison
   (matched garment/diff/expected result/confidence) are each one group, not
   scattered across the screen.
9. **Cards represent real relationships**, not "one card per field." Use cards
   for garment previews, fit memories, comparison results, history entries —
   not for every label/button/isolated stat.
10. **Spacing encodes relationships.** Small gap = belongs together, medium =
    related group, large = new section. Don't use whitespace as pure decoration.
11. **Dividers stay quiet.** Prefer whitespace or faint (6–10% opacity) borders
    over heavy lines.
12. **One obvious primary action per screen**, not aggressive (no all-caps
    shouting, no oversized buttons, no competing CTAs).
13. **Put the action next to what it acts on** (measurement entry next to
    Compare, edit control next to what's being edited).
14. **Sticky UI is selective.** Reserve it for long Detail/Result screens where
    losing the garment name mid-scroll actually costs context. If everything is
    sticky, nothing is. *(Not yet implemented anywhere — currently a
    deliberate no-op, not an oversight; revisit only for a specific long screen.)*
15. **Photos need contrast insurance.** Never place a bare-colored icon/dot/
    control directly on an unpredictable photo — give it a translucent light
    backing so it reads on both dark and light garments.
16. **Consistency beats individual beauty.** Same image container, corner
    radius, crop strategy, metadata placement across every garment card —
    a photo has to work inside the catalog, not just alone.
17. **Explain, never just score.** No match percentages, ever. Lead with
    "Closest to your X", then the measurement diffs, then what that means in
    plain language, then confidence (High/Medium/Low — never a %).
18. **Follow decision order:** which garment → what do I already own that's
    similar → how is it different → what does that mean → how confident →
    what should I do. Result screen order is: closest match → diffs → verdict/
    meaning → expected feel → similar wardrobe items → why → confidence → save
    action. Don't lead with metadata or bury the closest match. Motion must
    reinforce this order (see Motion language below), never obscure or delay it —
    a reveal animation stages *when* things appear, it never makes the user wait
    longer for the answer than the computation actually takes.
19. **Progressive disclosure for long lists.** Show a sensible default count,
    offer "Show all N" rather than dumping an ever-growing list (fit history,
    fit-type chips already do this — keep the pattern when new lists appear).
20. **Reduce repetitive input** with quick-pick presets (fit verdict chips,
    fit-type chips) plus a free-text fallback, not a fresh essay every time.
21. **Empty states are real states**, not placeholders. No fake garments, no
    fabricated history. State plainly what's empty and why adding one thing
    matters, with a clear single CTA.
22. **Never hide system state.** Saving/processing/incomplete/deleted must be
    visible (toast, disabled+relabeled button, explicit "no data yet" text).
    A form field that doesn't persist what's typed into it is a bug, not a
    minor detail — treat it as a correctness issue, not a copy issue.
23. **Motion clarifies, it doesn't decorate.** Animate to show where something
    came from/went/changed, not because it looks nice.
24. **Calm over impressive.** Restrained color, quiet dividers, no oversized
    buttons, no dashboard-style metric walls. When in doubt, remove an element
    rather than justify it.

## Mobile navigation & interaction rules

1. **Mobile-first, not desktop-shrunk.** When content doesn't fit, simplify the
   experience — don't shrink type/spacing to cram it in.
2. **One screen, one job.** Closet browses. Add Garment adds one garment. Fit
   Memory records how it fits. Compare shows a difference. Don't fold unrelated
   jobs (recommendations, stats, settings) into a screen that already has one.
3. **Minimal navigation.** 3–5 primary destinations, not more. Add Garment is a
   contextual action (a `+ Add` button), not a permanent tab — confirmed in
   `TabBar.tsx`, which only lists Home/Closet/FitCheck/Profile.
4. **The primary action is contextual**, not fixed. Closet's primary action is
   "+ Add garment"; Garment Detail's is "Compare"/"Update how it fits"; a
   focused editing screen's is "Save". Don't force one static action bar
   everywhere.
5. **Hide global navigation during a focused workflow.** A screen that is a
   single task (add/edit a garment, review a result) should not compete for
   attention with tab navigation. Implementation: `isFocusedWorkflow(screen)` in
   `src/store.tsx` — the shell (`App.tsx`) hides `<TabBar />` whenever it's true.
   Add a screen to `FOCUSED_WORKFLOW_SCREENS` there when it's a single-task flow,
   not by sprinkling screen-name checks through components.
6. **Bottom sheets for in-context micro-decisions.** Use one when the choice is
   small and belongs to a record already on screen (fit verdict, garment quick
   actions) — see `FitSheet.tsx` for the reference implementation: it keeps the
   garment visible underneath and labels its own dismiss affordance. A sheet
   has a max height, so its body must scroll, with the primary action pinned
   below the scroll area. Small phones, large system font sizes and an open
   keyboard all push a "short" form past that height. Chip groups inside a
   sheet wrap at natural width. Never force N chips into N equal columns,
   because a label like "Too loose" then breaks mid-word. Don't use a
   bottom sheet for something that's actually the start of a new multi-step flow
   (see the Add-source decision below) — that's a full screen, correctly.
7. **Don't navigate away from context unnecessarily.** If a decision can be
   made without leaving the screen the user is looking at, keep them on it
   (this is *why* rule 6 exists).
8. **One dominant scroll direction.** Vertical by default. Horizontal scroll is
   reserved for things that are genuinely a rail: related garments, comparison
   candidates, compact filter chips. Never a two-dimensional dashboard grid of
   unrelated data.
9. **No tiny multi-column measurement tables.** One column of label/value rows,
   or a two-column card grid (both already used across the app) — never six
   cramped columns.
10. **No card nesting.** One strong container, whitespace inside it. Never
    card → card → card.
11. **Touch targets ≥44×44, the actual tappable area — not just the visual
    element.** A 40px-tall row with 44px text inside it still fails; use
    `hitSlop` to close the gap the way `BackRow`/`searchClear` already do.
12. **Gestures enhance, they never replace visible UI.** Any swipe/long-press
    shortcut needs a visible on-screen way to do the same thing.
13. **Long press is an optional enhancement, not a requirement.** Don't add a
    hidden long-press menu just because a guideline mentions it — visible
    Edit/Delete buttons are *more* discoverable, not less good. Revisit only if
    the closet grid gets crowded enough that visible buttons start clashing.
14. **Distinguish empty-state causes explicitly, everywhere a result can be
    empty for more than one reason.** Never infer copy from a bare
    `length === 0` / `=== null` check — model the actual reason and render
    off that:
    - Closet search/filter (`ClosetScreen.tsx`'s `emptyReason`): `search` /
      `filter` / `combined` — so a search miss never reads as a filter miss,
      and the recovery action (Clear search vs. Clear filter vs. Clear
      filters) matches what's actually blocking the result.
    - FitCheck comparison (`store.tsx`'s `noResultReason`, rendered by
      `ResultScreen.tsx`'s `NoComparisonYet`): `noGarments` (closet is
      entirely empty) / `noCategoryGarments` (closet has garments, just none
      in this category) / `noMeasurements` (nothing entered to compare with).
      `result === null` must never reach the screen as a blank render — see
      the Known failure patterns entry for what that looked like.
15. **Onboard by doing the real task**, not a feature tour. `Onboarding.tsx`'s
    walk-through adds a real garment and runs a real comparison — keep that
    pattern for any future onboarding change.

## FitCheck-specific navigation decisions

Explicit calls made 2026-09-10 so these don't get re-litigated or "fixed" back
toward the generic guideline later:

- **Add-source picker (Photo/Manual/Screenshot) stays a full screen.** It's the
  start of a multi-step flow, not a small contextual choice — a bottom sheet
  would be mechanically "more compliant" with rule 6 but architecturally wrong
  for what this step actually is. `AddScreen.tsx` is correct as-is.
- **No long-press context menu, for now.** Deferred per rule 13. If the closet
  grid ever gets crowded enough that per-tile visible actions become clutter,
  the future shape is: long-press a tile → sheet with Edit / Compare / History
  / Delete. Not needed today.
- **No navigation-library retrofit for iOS edge-swipe-back.** The app's
  state-driven screen switching (`store.screen` in `store.tsx`) plus Android
  hardware-back plus every focused screen's own back control already gives
  predictable back navigation. Standing rule for any future implementation
  work: *"Back navigation must always be predictable and consistent. Support
  platform-native gestures where the chosen navigation architecture provides
  them naturally; do not introduce a navigation framework solely to implement
  a gesture."*
- **No global "History" tab.** Fit history belongs to a specific garment
  (Closet → garment → Fit History), not a generic cross-closet feed — the
  question a user actually has is "how has *this* shirt changed," not "show me
  every historical event." Home's "Recent fit changes" already gives a
  lightweight cross-garment overview without needing a fifth destination.
- **Top-level destinations are roots, not back-stack entries.** (Added
  2026-10-01.) `store.go()` clears `history` whenever it lands on
  home/closet/fitcheck/profile — whether from a tab tap, a swipe, or an
  in-screen link — and only pushes onto it for focused-workflow screens. So
  Back from any tab goes to Home, then exits (standard Android bottom-nav
  behavior), and Back inside a flow (Closet → Detail) still returns to where
  that flow started. Pushing every tab switch was a real bug: Closet → FitCheck
  → Profile → Closet… made Back replay each visited tab in turn. Covered by
  `navigation.test.tsx`.
- **Tab bar visibility is derived, not hardcoded per-screen.** `isFocusedWorkflow()`
  is the single source of truth for which screens hide the tab bar
  (`detail`, `add`, `addManual`, `result` today) — add new focused
  screens to that one set rather than checking screen names in components.
- **The Closet→Detail shared-element photo transition is a floating overlay on
  top of the existing screen swap, not a navigation-stack feature.** (Added
  2026-09-11.) `PhotoTransitionOverlay.tsx` (mounted once in `App.tsx`'s
  `Shell`, like `ConfirmDialog`/`Toast`) measures the tapped Closet tile's photo
  (`ClosetScreen.tsx`'s `GarmentTile`) and Detail's hero photo
  (`DetailScreen.tsx`'s `heroRef`) via `measureInWindow`, then animates a single
  floating `Image` between those two screen-space rects while `store.screen`
  swaps underneath exactly as it always has — `store.photoTransition` is just
  three more pieces of state (`beginPhotoTransition`/`reportPhotoTransitionTarget`/
  `clearPhotoTransition`), not a second source of navigation truth. Reuses the
  same reasoning as the edge-swipe-back decision above: the effect looks like
  something a navigation library would usually own, but doesn't require one
  here. Skips entirely under reduced motion or when the garment has no photo.
- **Horizontal swipe between the four top-level destinations is real, interactive
  navigation — not a second navigation stack.** `TopLevelSwipeNavigator.tsx`
  (`App.tsx`) owns the gesture and, on commit, calls the same `store.go()` a
  TabBar tap would — so `store.screen` stays the single source of truth and
  history/back behavior is identical either way. It only ever operates on
  `home ↔ closet ↔ fitcheck ↔ profile` (the exact complement of
  `FOCUSED_WORKFLOW_SCREENS`) and never wraps past either end. It uses
  `react-native-gesture-handler` (installed for this) plus core `Animated` —
  not Reanimated, not a navigation library — and the four top-level screens'
  `ScrollView` imports were switched from `react-native` to
  `react-native-gesture-handler` so their own vertical scroll and horizontal
  rails keep priority over the swipe gesture rather than fighting it.

## FitCheck-specific standing decisions

- **Home = next action, not a dashboard.** No raw counts ("12 garments · 8
  fits · 4 comparisons"), no per-category progress bars. Profile screen already
  owns "what we've learned" / "comfortable ranges" — don't duplicate that on
  Home. Home gets at most a single quiet text nudge toward one useful action.
- **Closet is visual-first.** Photo, name, compact fit indicator. Not a
  measurement dump per tile.
- **Detail screen is the source of truth** for one garment: identity →
  measurements → how it fits → visual preference → fit history → actions.
- **Comparison (Result screen) is the product's "magic moment"** — it gets the
  most UX attention of any screen. See decision-order item #18 above.
- **No fake precision.** Round display values (see `src/utils/units.ts`),
  confidence is a tier + a short bar, never a decimal percentage.
- **Confidence is secondary**, always shown after the conclusion, never as the
  headline.
- **Measurement entry is one continuous flow.** `MeasurementGrid` (`UI.tsx`)
  chains its fields: every field except the last shows the keyboard's Next
  key, which moves to the next field in `keysFor` order with the keyboard
  still open. The last field shows Done, which closes the keyboard. Build new
  measurement entry on `MeasurementGrid` rather than bare `TextInput`s, so
  this can't drift per screen. (Android only: the iOS number pad has no
  submit key.)

## Motion language

Central durations live in `src/utils/motion.ts` (`MOTION` constants) — pull from
there rather than hand-picking a number per screen, and check
`useReducedMotion()` before playing anything non-essential (every animation
below already does; new ones should too, skipping straight to the end state
when it's on).

| Interaction | Personality | Duration | Where |
|---|---|---|---|
| Save (garment joins closet) | Subtle, reassuring | `MOTION.save` (260ms) | `ClosetScreen.tsx`'s `GarmentTile` |
| Compare (result reveal) | Analytical, revealing | `MOTION.compareReveal` (420ms) | `ResultScreen.tsx`'s staged `reveal` |
| Fit memory update | Warm, reassuring | n/a — sheet close + existing copy | `FitSheet.tsx` |
| Delete (garment leaves Detail, then leaves the Closet grid) | Quick, deliberate | `MOTION.delete` (180ms) | `DetailScreen.tsx`'s `exitProgress`, `ClosetScreen.tsx`'s `GarmentTile` (`exiting`) |
| Bottom sheet present/dismiss | Physical, grounded | `MOTION.sheet` (260ms) | `FitSheet.tsx` |
| Top-level swipe (Home↔Closet↔FitCheck↔Profile) | Smooth, spatial, quiet | `MOTION.nav` (240ms) | `TopLevelSwipeNavigator.tsx` |
| Press feedback (any button or chip) | Tactile, immediate | `MOTION.press` (140ms) | `UI.tsx`'s `usePressScale` |
| Focused-workflow entrance (detail/add/addManual) | Quiet arrival | `MOTION.screenEnter` (240ms) | `App.tsx`'s `ScreenEnter` |
| Garment photo finishing load | Quiet, no pop-in | `MOTION.imageFade` (220ms) | `UI.tsx`'s `FadeImage` (used by `PhotoTile`) |
| Closet tile photo → Detail hero photo | Smooth, spatial, premium | `MOTION.heroTransition` (320ms) | `PhotoTransitionOverlay.tsx`, driven by `store.photoTransition` |
| New fit-history entry joining the timeline | Subtle, reassuring — accumulates, never overwrites | `MOTION.save` (260ms, reused) | `DetailScreen.tsx`'s `newEntryProgress` |
| Progressive disclosure expand/collapse (fit history "Show all N", fit-type "+ More", Profile body-measurement history) | Unhurried settle | `MOTION.expand` (220ms) | `UI.tsx`'s `Collapsible` |
| Measurement field focus | Quick, direct — same language as any other selection change | `MOTION.selection` (150ms, reused) | `UI.tsx`'s `MeasureCell` (inside `MeasurementGrid`) |
| Required-field validation error | Clear, restrained — one small shake, not a bounce | `MOTION.shake` (200ms) | `AddManualScreen.tsx`'s `Field`, via `utils/motion.ts`'s `useShake` |

Screen-enter transitions are entrance-only by design — no matching exit/outgoing-
screen animation. True overlapping enter/exit would require keeping both screens
mounted simultaneously (as `TopLevelSwipeNavigator` does during a drag); not
worth the structural complexity for an effect that's secondary to the entrance.
Don't "fix" this by adding exit motion without re-deciding that trade-off. Result
and the four top-level destinations are deliberately excluded from `ScreenEnter`
too — Result already has its own staged `compareReveal`, and the top-level
screens already have `TopLevelSwipeNavigator`'s transition; layering a second
generic fade+slide on either would be motion-on-motion.

Global rules:

- Motion must explain a state change or relationship. If you can't say what it
  communicates in one sentence, don't add it.
- Don't animate merely because animation is possible, and don't animate every
  element in a group — group related content into one staged reveal (see
  Result screen: 4 stages, not 8+).
- No generic "AI slop": no sparkles, gradients-as-feedback, glows, confetti,
  bouncing buttons, or scale-bounce on every card. Nothing implies FitCheck did
  something intelligent that it didn't actually do — no "✨ Analyzing…" for a
  synchronous, local computation.
- Never pad real work with a fixed delay to make a spinner/label feel earned.
  If the computation is done, show the result — the delay was removed from the
  comparison flow specifically for this reason (see failure patterns below).
- Prefer short, purposeful transitions over long ones. Nothing here should
  exceed ~450ms.
- The required-field validation shake (`MOTION.shake`) is the **one** deliberate
  exception to "no animation for errors," scoped narrowly: it fires once per
  rising edge on the single field that failed, never the whole screen, and
  never repeats while the same error is still showing. It's a horizontal
  settle-to-zero, not a spring/bounce, so it doesn't reopen the door to
  "bouncing buttons" — don't generalize it to other error/edge-case states
  without deciding that trade-off explicitly.

## Psychology & cognitive load

- **Smart defaults, never fabricated ones — and a smart default is still only
  a hint, never a value.** `seedNewGarment` (`src/engine/compare.ts`) computes
  what's typical from the user's own closet (most common size/fit, a matching
  reference's silhouette), but a brand-new garment draft (`EMPTY_NG`) never
  starts with these written into its real fields — `AddManualScreen.tsx` shows
  them only as ghost `placeholder` text (same mechanism as the measurement
  grid's `ref?.m[key]` placeholder), so nothing is submitted unless the user
  actually types or taps to accept it. This applies doubly to a *simulated*
  source — Onboarding's photo/screenshot method is a UI-only placeholder with
  no real extraction behind it, so its result (`obSuggested`) is placeholder
  text too, never a real `value`, regardless of how confident the copy sounds
  (the Add Garment flow's own equivalent on-device OCR demo was removed
  outright rather than kept as a simulation — see "FitCheck-specific premium
  decisions" below). Never invent a measurement, fit observation, or
  recommendation to fill a gap — an empty field stays empty.
- **Minimum information per step, progressive disclosure for the rest.** Don't
  surface every garment field at once (see mobile rule #9's two-column
  measurement grids, and Screen checklist #19's "Show all N" pattern) — ask
  for what's needed now, reveal depth on request.
- **Progress must be real.** Onboarding's progress bar (`Onboarding.tsx`)
  reflects actual steps completed, not a manufactured percentage or fake
  milestone designed to create momentum.
- **Let the product prove its value before asking for anything.** No account
  wall, no permission prompt, no gate between opening FitCheck and adding a
  garment, building fit memory, or running a comparison — the existing
  offline-first, no-account architecture already guarantees this; don't add
  friction ahead of value on top of it.
- **The fit memory itself is the reward.** No streaks, badges, points, or
  engagement mechanics. A closet that gets more useful as it grows *is* the
  engagement loop — don't manufacture a second one on top of it. This is the
  product's version of the endowment effect: the closet is something the user
  built garment by garment, not a database they filled out, and that's what
  makes it valuable to them — not a reward layered on top of the building.
- **Honesty over urgency.** Explain real consequences plainly ("This can't be
  undone" on delete is the model) — never invent scarcity, countdowns, or
  anxiety to push a decision. The test: does the copy state what happens
  ("Save this fit so FitCheck can use it for future comparisons"), or does it
  imply what the user stands to lose if they don't act? Only the former is
  allowed, even when the latter would convert better.
- **Anchor every comparison to a known garment**, never to isolated numbers.
  "Known garment → new garment → exact differences → expected fit" (this is
  Screen checklist #17/#18 restated from the psychology side: the user's own
  closet is the reference point, not an abstract measurement chart). The
  closest-match garment is also the reference point for everything that
  follows it on the same screen — the diffs, the verdict, and the confidence
  tier should all read as relative to *that* garment, not as standalone facts.
- **The user's own history outranks any generic default.** Once FitCheck has
  enough personal data, ground copy in it ("Similar to garments you marked as
  fitting great") rather than a population framing ("Most people choose…" /
  a generic "Recommended size: M"). FitCheck has exactly one dataset worth
  citing — the user's own closet — see the standalone decision below.
- **Reduce how many decisions are presented at once, without hiding any of
  them.** A primary choice (e.g. a fit verdict) should be a small, clearly
  distinct set of options with a free-text fallback (mobile rule #20's
  quick-pick pattern already does this) — not every possible field or every
  gradation of a scale shown with equal weight on one screen. Offer finer
  nuance only after the primary choice is made.

## FitCheck-specific psychology decisions

Explicit calls made 2026-09-10, alongside the navigation and premium
decisions above — don't re-litigate these back toward a generic
persuasion-pattern playbook later:

- **Loss-aversion and fear framing are rejected outright, not just
  discouraged.** Copy like "Don't lose your perfect fit," "You're about to
  lose your fit memory," or "Skip this and risk buying the wrong size" is
  off-limits even where it would plausibly increase some engagement metric —
  it conflicts with the calm, trustworthy personality the rest of this doc
  defines. This sharpens "Honesty over urgency" above into a hard boundary,
  not a style preference.
- **No population-based defaults once the user has personal history.** Never
  present a "most people" or "recommended size" default when FitCheck already
  has the user's own fit data to draw from instead — a generic average is a
  worse answer than the user's own closet, not a neutral fallback.
- **Progress indicators must reflect real completed actions, always.**
  Onboarding's progress bar is the existing example (see "Progress must be
  real" above); any future progress UI — a closet-completeness meter, a
  multi-step form — is held to the same rule: no manufactured percentages or
  milestones designed purely to make the number look better.
- **Psychology is used to reduce effort and clarify, never to persuade.**
  Smart defaults, anchoring, and real progress are in scope because they make
  FitCheck easier to use. Urgency, scarcity, fabricated confidence, and
  population-pressure framing are out of scope because they'd make FitCheck
  easier to comply with instead — that's a different (and rejected) goal.

## FitCheck-specific premium decisions

Explicit calls made 2026-09-10, alongside the navigation decisions above —
don't "improve" these back toward a generic guideline later:

- **Honest processing language, kept as-is.** "Comparing with your closet…"
  stays exactly that — never replaced with theatrical language ("✨
  Analyzing…") unless the underlying computation actually changes to justify it.
- **Camera/photo capture stays basic.** A crafted capture UI is a named future
  premium surface, not a V1 requirement — `AddManualScreen`'s plain
  library-picker flow is correct as-is.
- **The Add-from-Photo/screenshot OCR entry point was removed outright (2026-09-11),
  not just kept honest.** It was a UI-only simulation (fixed fake values on a timer,
  no real image ever read) — rather than leave that preview sitting in the app
  implying a capability that doesn't exist, Add Garment now offers Manual entry
  only. Don't re-add a "Photo or screenshot" option without real on-device
  extraction behind it. Onboarding's own smaller photo/screenshot demo is a
  separate decision, untouched by this one.
- **No illustrations until there's a reason for one.** Zero illustrations
  today is a legitimate state, not a gap — don't add one just because a
  guideline discusses illustration language.

## App updates

Decided 2026-10-01. FitCheck is sideloaded from GitHub Releases, so it can tell
the user a newer version exists. It never installs anything itself.

- **The only network access in the app, and only on the user's say-so.** A tap
  on Profile's "Check for updates", or the opt-in daily check ("Check
  automatically", off by default). `src/utils/updateCheck.ts` reads the version
  off github.com's "latest release" redirect (HEAD requests), and falls back to
  the REST API only if that fails. Nothing about the closet is sent. Don't add
  any other network use on the back of the INTERNET permission this needed.
- **Don't make the GitHub REST API the primary route.** Anonymous API calls
  are capped at 60/hour per public IP, and mobile carriers put many phones
  behind one shared IP. On mobile data the API alone was routinely refused
  (403), which showed up as "Couldn't reach GitHub" for users whose connection
  was fine. Verified on device with the API rate-limited: the web route still
  finds the release. Errors also distinguish "couldn't reach GitHub" (offline)
  from "GitHub answered but refused", so a refusal is never blamed on the
  user's connection.
- **A found update is a quiet line in Profile's App updates section, never a
  dot or badge.** No tab-bar dot, no Home nudge, no launch pop-up. The user
  sees it when they visit Profile. This follows "no badges", "honesty over
  urgency" and "calm over impressive" above. It was explicitly chosen over a
  Profile-tab dot.
- **Failure is shown only when the user asked.** A manual check that can't
  reach GitHub says so inline. An automatic one fails silently and keeps
  whatever was already known.
- **"Download" only ever opens an `https://github.com/` link.** The release
  response is untrusted input. Installing is left to Android's installer:
  no `REQUEST_INSTALL_PACKAGES`, no in-app APK download.

## Known failure patterns — don't reintroduce these

Found in the 2026-09-10 audit and fixed; listed here so future changes don't
casually walk back into them.

| Pattern | Where it showed up | Why it's wrong |
|---|---|---|
| Metric-wall on Home | 3-stat row + per-category progress bars above the fold | Violates "Home = next action, not a dashboard"; duplicates Profile |
| Label says one thing, saves another | "Notes" field actually populated `garment.visual` ("Visual preference"), shown under a differently-named card on Detail | Breaks #6/#7 — the UI must not lie about what a field does |
| Editable field that silently discards input | Edit-garment flow never read the notes field back into the saved record, and never prefilled it either | Violates #22 — a control that looks functional but no-ops is worse than no control |
| Unbounded wrap-grid text | Garment name with no line clamp in a 2-column grid | Long names desync row heights across the grid, breaking #3's alignment guarantee |
| Bare icon over photo | Fit-tone dot drawn directly on the garment photo with no backing | Fails #15's contrast requirement — a same-hue dot can vanish |
| Screen order didn't match decision order | Result screen led with the verdict banner before naming the closest match | Contradicts #18's explicit sequence (which garment → diff → meaning) |
| Unbounded history list | Fit history rendered in full with no cap | Fails #1's "many garments/many entries" system test and #19's progressive disclosure |
| Persistent tab bar during focused workflows | `<TabBar />` rendered unconditionally in `App.tsx`'s `Shell`, visible on Detail/Add/AddManual/AddPhoto/Result | Violates mobile rule #5 — a focused single-task screen shouldn't compete with global nav for space and attention |
| Tab bar touch target under 44px | `TabBar.tsx`'s `tab` style had `minHeight: 40` | Violates mobile rule #11 on the single most-tapped control in the app |
| Empty-state copy inferred from one count | Closet's zero-results state always said "Nothing matches this filter," even when a search term with no active filter caused it | Violates mobile rule #14 — the copy told the user the wrong thing happened |
| Blank Result screen | `ResultScreen.tsx` did `if (!r) return null;` — a new user with an empty closet tapping Home's "Run a FitCheck" landed on a literally empty screen | Fails mobile rule #14 / #22 — `compare()` returning `null` (empty closet, empty category, or zero measurements) has to render an intentional state, not nothing |
| Artificial pre-navigation delay | `runCheck` wrapped an already-fast, synchronous `buildResult()` in a bare `setTimeout(..., 650)` with no motion during the wait, then hard-cut to Result | Violates the Motion language rule against padding real work with a fixed delay — the "Comparing…" label should only last as long as real processing does |
| Toast-only feedback for save/delete | `saveGarment`/`saveFit`/`deleteGarmentById` all did mutate → instant screen swap → toast, with nothing communicating "this garment just joined/left the closet" | Violates the Motion language table's per-action personalities — toast is fine as a supplement, not the only confirmation for an important state change |
| Fabricated measurements pre-filled into a comparison draft | `store.tsx`'s `DEFAULT_FC`/`CAT_SEED` set every zone key for the FitCheck entry form to a plausible-looking literal number (e.g. `waist: '85'`) as real `value`, not placeholder text — a user who ran a comparison without touching the form compared against invented measurements | Violates Measurement integrity's core rule — missing input must never be treated as inferred input; a `placeholder` sourced from the user's own reference garment is the correct way to hint a typical value |
| Stale measurement surviving a category switch | `setNgCategory` re-seeded `fit`/`size`/`silhouette`/`stretch` on category change but left the previous category's `m` values untouched, so a "tops" chest value could be saved into a "pants" garment record purely because the draft object still had the key | Violates Measurement integrity — a measurement must describe the category it's saved under, never carry over from a category the user has since changed away from |
| One flat fit-tag/visual-tag list for every category | `OB_TAGS` mixed "Roomy chest"/"Comfortable shoulders" with pants-only "Perfect stacking"/"Prefer wider leg" in a single list shown regardless of `ob.cat`/`g.cat` | Violates Measurement integrity's category-specific fit language rule and Screen checklist #17 — a pants fitter should never see chest/shoulder language |
| Simulated OCR result written as a real form value | `store.tsx`'s `useOcr`/`obPickMethod` set `ng`/`ob`'s `brand`/`name`/`size`/`m` directly to a hardcoded `'Uniqlo'`/`'Linen Blend Shirt'`/`'L'`/measurement set — a user who tapped "Review and save" without editing anything saved a fictitious brand and size as if they'd typed it themselves | Violates Measurement integrity — a *simulated* extraction (no real OCR exists in v1) is not "an actual user-provided... data source"; fixed by moving the result to `ngSuggested`/`obSuggested`, shown only as `placeholder` text |
| New garment silently pre-filled from the user's own closet history | `seedNewGarment`'s mode-based size/fit and reference-based silhouette/stretch were spread directly into a brand-new `NewGarmentDraft` as real `value`s (`EMPTY_NG` merged with `seedNewGarment(...)`), so opening Add Garment could already show a real Size/Fit selection the user never made | Violates Measurement integrity — even a *legitimate* smart default becomes fabricated input the instant it's a `value` instead of a `placeholder`; fixed by keeping `seedNewGarment`'s result local to `AddManualScreen.tsx` as hint text only |
| Required identity fields silently defaulted instead of blocking save | `saveGarment` filled a blank brand/name/size with `'Unbranded'`/`'Untitled garment'`/`'—'` and saved anyway, so an incomplete garment (e.g. name typed, brand/size left blank) was indistinguishable from one the user actually finished | Violates "Do not save incomplete garments merely to let the user continue" — fixed by validating brand/name/size/≥1 measurement before writing anything, rejecting the save with inline errors (`ngErrors`) and leaving the draft intact otherwise |
| Fit-update sheet pre-selected as real values | `store.tsx`'s sheet state started as `sArea: 'Shoulder'`, `sVerdict: 'Good'`, `sLook: 'Love the relaxed silhouette'`, and later opens kept the previous entry's picks — tapping "Add to fit history" without choosing anything saved "Good at the shoulder" plus a visual note the user never picked | Violates Measurement integrity and "Smart defaults, never fabricated ones" — fixed by opening the sheet blank every time and keeping the button disabled (relabeled with what's missing) until an area and a comfort verdict are chosen; visual preference and notes stay optional. Covered by `detail.test.tsx` |
| Freshly picked photo stayed invisible until remount | `FadeImage` (`UI.tsx`) reset its opacity to 0 in a passive `useEffect`. `setValue(0)` also cancels a running fade, and a just-copied local photo can finish loading before that deferred effect runs, so the reset cancelled the fade-in and left Add/Edit Garment's preview blank until the screen remounted | Violates #22's "never hide system state": the photo was saved but looked missing. Fixed by resetting in a layout effect, only on a real `uri` change. Any "reset an Animated value when the source changes" logic must not run later than the event it's resetting for |
| Swipe flashed the previous screen, or left a blank one | `TopLevelSwipeNavigator.tsx` rendered the two-pane drag row and the settled view as the same unkeyed `Animated.View`, so React reused one native view across the swap, and the commit path reset the native-driven `translateX`/`baseX` to 0. Depending on timing, the reset either redrew the old pane for one frame (the flash users saw on device) or arrived after the view had detached from the drag animation, leaving it offset by a full screen width (a blank page that tab taps couldn't clear). Confirmed frame by frame with `adb screenrecord`: 6 of 12 swipes failed before the fix, 0 of 12 after | Violates the Motion language rule that motion clarifies and never misleads, and #22 (a blank screen hides state). Fixed by keying the two branches (`key="pair"`/`key="idle"`) so the settled view is always a fresh native view, and removing the reset entirely. Never `setValue` a native-driven value that a still-mounted view is reading, just to tidy up for a re-render that hasn't committed yet. Jest can't reproduce this (no native driver), so check swipe changes on a device or emulator |
| Assuming every garment has at least one history entry | `ClosetScreen.tsx`'s `GarmentTile` read `g.history[g.history.length - 1].tone` unguarded. The normal save path always writes an initial "Added to closet" observation, but a restored backup (`observations: []` is valid) or a save interrupted between `insertGarment` and `insertObservation` leaves a garment with none — and the whole Closet then crashed on every open | Fails #1's "incomplete data" system test and Measurement integrity's spirit — a garment with no fit history must render as having none (no tone dot, no note), never crash and never invent a green "good" state. Covered by `closet.test.tsx` and `backup.test.tsx` |

## Quick self-check before calling a screen done

- [ ] Looked at it empty, with one item, and with many items (long names included)?
- [ ] Is there exactly one obvious primary action?
- [ ] Does every label match what it actually saves/shows?
- [ ] Any icon/control sitting directly on a photo — does it have contrast backing?
- [ ] Any list that could grow unbounded — does it cap with a "show more"?
- [ ] Does the information order match how the user would ask the question, not
      how the data happens to be structured?
- [ ] Would this still feel calm with 100 garments in the closet?
- [ ] Is this a focused single-task screen? If so, is it in `FOCUSED_WORKFLOW_SCREENS`
      (`src/store.tsx`) so the tab bar hides for it?
- [ ] Is every new touch target actually ≥44×44 (measured tappable area, not
      just the visible element)?
- [ ] If a list/result can be empty for more than one reason, does the copy
      name the actual reason instead of a generic "no results"?
- [ ] Can this state ever be `null`/empty and still navigate to a screen that
      renders nothing? If so, give it a `NoComparisonYet`-style explicit state.
- [ ] Does any new animation pad real computation with a fixed delay, or does
      it only run as long as actual work/transition takes?
- [ ] Does a new important state change (save/update/delete) get more than a
      toast — some visual confirmation in the place it actually happened?
- [ ] Does new motion use a duration from `MOTION` in `src/utils/motion.ts`
      and respect `useReducedMotion()`, rather than a one-off hand-picked value?
- [ ] Does any measurement field ever start with a real `value` the user didn't
      type — as opposed to a ghost `placeholder`? Does switching category clear
      measurements that no longer apply rather than carrying them forward?
- [ ] If this screen shows fit-observation/comfort/visual chips, are they keyed
      by `keysFor(category)`/category rather than one flat list for every category?
- [ ] If this screen saves a garment, does it validate name/brand/category/size/
      ≥1 measurement before writing anything, reject with inline errors when one's
      missing, and leave the rest of the draft untouched — rather than padding a
      blank field with a fallback string and saving anyway?
- [ ] Does any suggested/detected/smart-default value (from the user's own
      closet or a simulated scan) ever start as a real `value` instead of a
      ghost `placeholder` the user must actively confirm?
