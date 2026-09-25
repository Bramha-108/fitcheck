# Fitcheck

**Tagline:** Your personal fit memory.

**One-line description:** A personal app that remembers how every garment you own actually fits you — measurements plus your own words for it — so that before buying something new, you can compare its measurements against what you already know fits, instead of guessing from a size label.

**Scope:** Personal project (per [research.md](research.md) final verdict — not a venture; built for yourself, not for a market).

**Product philosophy:** FitCheck doesn't try to tell you what size you are. It remembers what fits you. Every garment you own becomes a reference point — its measurements, silhouette, comfort, appearance, and your feedback become part of a personal fit history. When you consider something new, FitCheck doesn't pretend to know exactly how it will fit your body. It shows you what it's closest to, how it differs, and what you can reasonably expect. And because bodies and preferences change, FitCheck changes with you.

---

## Architecture (decided 2026-09-08): fully offline, local-only
No server, no account/login, no cloud database, no cloud AI, no analytics, no remote API, no retailer API. Everything — garments, measurements, fit types, fit feedback, fit history, photo references, and the matching engine itself — runs and stays on-device. This isn't just a privacy nicety, it's the right architecture for a single-user personal app: nothing here needs to sync across devices or survive the app being deleted and reinstalled elsewhere. Local SQLite for structured data, local photo references (per Feature 1), and a **deterministic, rules-based local fit engine** (not machine learning) — v1 doesn't need a trained model, a normalize → find-similar-in-category → compare-measurements → compare-fit-type → compare-user-feedback-history → generate-explanation pipeline gets most of the value with none of the complexity or training-data-cold-start problem.

---

## Core concept

Not "what size am I." Instead: "given how the clothes I already own fit me, how will this new one probably fit?"

Two building blocks:
1. **Your closet** — every garment you own, with its measurements and your own fit notes.
2. **FitCheck** — the comparison feature: paste in a new garment's measurements, get a prediction against your closet.

---

## Feature 1 — Add a garment (building your closet)

**Entry methods (pick whichever's fastest per item):**
- Manual: brand, garment name/category (shirt, jeans, jacket...), measurements per relevant zone for that category (chest, shoulder, waist, length, inseam, sleeve, rise — the zone list adapts to category, no point asking for "inseam" on a T-shirt).
- Paste-from-listing: copy the size-chart numbers straight off a product page (Amazon, brand site, etc.) into the matching fields. **v1 is manual copy-paste of the numbers you read off the page — not automatic photo/OCR extraction.** (See "Deliberately cut from v1" below for why.)

**Fit type / cut / silhouette (decided 2026-09-08 — first-class field, not just measurements):**
Measurements alone can't distinguish two pairs of pants with identical waist/inseam but totally different silhouettes (straight vs. wide-leg vs. oversized). Every garment gets a **Fit/Cut field**, category-specific:
- Pants: Skinny, Slim, Straight, Regular, Relaxed, Wide, Wide-leg, Baggy, Oversized, Tapered, Bootcut, Flared, Cargo/utility, Korean/loose silhouette, Custom.
- Tops: Slim, Regular, Relaxed, Oversized, Boxy, Cropped, Longline, Drop-shoulder, Korean/loose silhouette, Custom.
- Jackets: Slim, Regular, Relaxed, Oversized, Boxy, Cropped, Long, Drop-shoulder, Custom.

**Important constraint:** a label like "Korean fit" is a style descriptor, not a hardcoded numeric definition — don't build a lookup table mapping "Korean" to a fixed measurement offset. The actual silhouette should be inferred from that garment's own measurement distribution (e.g. high rise + wide thigh + straight-to-wide leg opening), with the fit-type label as context/search-ability, not as the source of truth for shape.

**Silhouette measurements (pants, extends the base zone list):** in addition to waist/inseam, track rise, hip, thigh, knee, and leg opening where relevant — this is what lets the matching engine (Feature 2) actually distinguish straight vs. wide vs. tapered from the numbers, rather than relying on the Fit/Cut label alone.

**Fit notes (the part that matters most) — two separate dimensions, decided 2026-09-08:**
- **Physical comfort**, per zone: a quick tag (too tight / tight / good / loose / too loose) plus optional free text ("slightly uncomfortable on shoulder," "longer than I'd like").
- **Visual/silhouette preference**, separate from comfort: how you feel about how it *looks* ("love the oversized silhouette," "looks too baggy," "leg opening too wide," "perfect stacking"). A garment can fit comfortably but you still dislike the silhouette, or vice versa — these are genuinely different signals and must not be merged into one field.
- Overall rating (e.g. 1–5 or a simple thumbs scale).
- These notes are not permanently fixed to the garment — see Feature 3 (editable history).

**Photo attachment — reference, not a copy:**
You want to glance at a photo and instantly recognize "black Uniqlo linen shirt" without the app duplicating that photo into its own storage. Concretely, on both major platforms this works as **pointing to the photo via the OS photo picker, not grabbing a raw file path**:
- **iOS:** use `PHPickerViewController` — it hands your app a persistent local identifier for the chosen photo. You store that identifier, not the image. Later, you resolve the identifier back through the Photos framework to fetch a thumbnail/full image on demand, with no copy ever made into your app's sandbox.
- **Android:** since scoped storage (Android 10+), the equivalent is the Photo Picker / Storage Access Framework, which hands you a `content://` URI. You request a *persistable* permission on that URI once, then resolve it on demand the same way.

So "extract the photo path and point to it" is exactly achievable — it's just an identifier/URI reference under the hood rather than a literal filesystem path, because modern mobile OSes don't expose raw paths into the photo library to apps anymore. Worth knowing going in so you don't design around raw paths and hit a wall.

---

## Feature 2 — FitCheck (predict fit for something new)

**Input:** measurements of a garment you're considering buying (same manual-entry flow as adding a garment, but nothing gets saved to your closet unless you actually buy it and choose to keep the record).

**Matching logic:** find the closest existing garment(s) in your closet **within the same category** (don't compare a t-shirt's chest measurement against a jacket — category/cut has to match first, or the comparison is meaningless). Matching considers, in order: measurements (per-zone deltas), fit type/silhouette (is the new garment's Fit/Cut label one you've rated well before?), and your accumulated preference across garments sharing that silhouette (see "Learning your silhouette preference" below).

**Output**, matching the format you sketched:

```
Closest to your Uniqlo shirt

Chest:    +2 cm
Shoulder: -1 cm
Length:   +3 cm

Silhouette: similar (Relaxed → Relaxed)
Likely: slightly slimmer through the shoulders.
Your preference: you've rated 3 similar relaxed-fit garments positively.
Confidence: Medium
```

- Deltas are per-zone, in the same units you've been entering.
- The "likely" line is a plain-language interpretation of the biggest deltas, phrased relative to a garment you already know the feel of — not an abstract percentage. (Explicitly avoiding the earlier "91% match" / "92% similar" framing — see risks.md for why false precision is worse than an honest range; reaffirmed against a later proposal, see "Round 3" below.)
- **Confidence** reflects how much and how recent your evidence is: more comparable garments in that category, more consistent fit notes across them, more recent data, and silhouette-label agreement all raise it; a single old data point, contradictory notes, or an unfamiliar silhouette lower it. Still always Low/Medium/High — never a number.

**Learning your silhouette preference (new, 2026-09-08):** across garments sharing a Fit/Cut label, aggregate your comfort + visual-preference feedback over time (e.g. "you tend to prefer straight → relaxed → wide silhouettes, but dislike extreme volume"). This is read-derived from the FitObservation log, not a separately maintained profile — same append-only data source as Feature 4's implicit drift, just sliced by fit type instead of by measurement zone.

---

## Feature 3 — Editable history (explicit drift)

Fit notes aren't locked in when you first log a garment. If you put on your Nike pants six months later and they feel looser on the waist now, you edit that entry.

Important design point: an edit shouldn't silently overwrite the original note — it should record **a new fit observation with today's date**, keeping the old one too. The garment's measurements haven't changed; you have. That's a genuine signal about your body, not just a correction — so the history of observations over time is itself useful data, not just the latest state.

---

## Feature 4 — Implicit drift (without editing anything)

This is the sharper version of the same idea: if you buy a *new* pair of jeans, same nominal 32" waist as ones you already own, and this time you log "slightly tighter" — Fitcheck shouldn't treat that as a one-off inconsistency. It should treat it as evidence your measurements have shifted, even though you never touched the old jeans' entry.

**How this works mechanically:** don't store one static "your size" — store a **timestamped log of fit observations** per body zone across all garments. When predicting fit or showing confidence, weight recent observations more heavily than old ones. If a new observation on a known measurement (32" waist) contradicts what older observations at that same measurement implied, that contradiction is itself a signal:
- It should quietly lower confidence in older entries at that measurement going forward.
- It's worth a lightweight nudge back to the user: "Your fit at 32in waist seems to have changed — want to review older jeans at that size?" — optional, not forced, since the recency-weighting already adapts predictions even if you ignore the nudge.

This means the "model" isn't a single fixed profile — it's closer to a rolling, recency-weighted read of your fit history that naturally drifts as new observations come in, with edits (Feature 3) and new-purchase feedback (Feature 4) being two different ways the same underlying log gets new data points.

---

## Data shape (sketch, not final schema)

- **Garment**: id, brand, category, **fit/cut label** (category-specific enum, see Feature 1), measurements (per zone, category-adaptive — pants include rise/hip/thigh/knee/leg-opening per the silhouette-measurement decision above), size label, photo reference (platform identifier/URI, per Feature 1), date added.
- **FitObservation**: garment id, date, per-zone **comfort** tag + free text, per-zone **or overall visual/silhouette-preference** note + free text (kept separate from comfort, per Feature 1), overall rating. Append-only — one garment can have many observations over its lifetime (initial entry, later edits, or "how did it actually fit after wearing it" follow-ups).
- **FitCheck query**: not persisted unless you decide to keep it — takes a set of new measurements + category + fit/cut label, returns nearest garment(s), deltas, silhouette comparison, plain-language read, and confidence, computed from the current state of the FitObservation log.

---

## Deliberately cut from v1 (and why)

- **No OCR/photo-based auto-extraction of size charts — reaffirmed a third time (2026-09-08).** Per the earlier venture critique (risks.md), this is the exact kind of "automatic" step that looks like it removes friction but actually opens a much bigger, fragile problem (parsing arbitrary product pages/screenshots reliably). A later proposal reframed this as **on-device/local OCR** instead of cloud OCR — rejected again, because the hard part was never privacy, it was reliably parsing arbitrary size-chart layouts/formats/units, and running the same parsing problem locally doesn't make it less fragile. For a personal project, manually typing 3-5 numbers off a page you're already looking at is a non-issue — not worth the engineering cost yet.
- **No cross-user data, no retailer integration, no crowd-sourced brand size data.** All of the identified startup-killing problems (network effects, scraping, third-party cooperation) came from trying to make this work for *everyone*. As a personal project it only ever needs to model one person's closet, which sidesteps every one of those constraints entirely.
- **No 3D body avatar or generated silhouette graphics in v1.** A visual "new garment vs. reference garment" shape comparison was proposed as a nice-to-have UI polish item — genuinely appealing later, but not core to the matching logic (which works fine as deltas + text) and meaningfully more UI/rendering work than the rest of v1. Revisit post-v1 if the text-based comparison feels insufficient in practice.

---

## Open questions before building
- What counts as "same category" for matching purposes — is a rigid category list enough (shirt/pants/jacket/dress...) or do cut/fit-style tags matter too (slim vs. relaxed) even within one category?
- Exact confidence-scoring formula — start simple (count of comparable garments × recency × consistency of their fit notes) and refine once you're actually using it.
- ~~Similar-garments list display~~ **Decided 2026-09-08: qualitative + confidence.** Ranked list of similar owned garments, each with per-zone deltas + a plain-language note, plus one overall Low/Medium/High confidence label for the whole prediction. No per-garment percentage score ("92% similar") — rejected as false precision the flat-measurement data can't support, consistent with risks.md Round 1 point 5.

## Platform & build target (decided 2026-09-08)
React Native via Expo. Ships as a personal-use Android APK (sideloaded/EAS build), not a store launch — no venture, no public release. This resolves the earlier open question about platform.

## Round 3 — expanded design pass (2026-09-08)
A much fuller design doc was proposed and reconciled against the decisions already locked in above. Confirmed/rejected:

- **No photo/screenshot OCR extraction in v1 — reaffirmed.** The expanded doc proposed OCR/vision extraction of measurements from screenshots and product pages as the primary entry method (its "Method A"). This directly contradicts the "Deliberately cut from v1" section above and the risks.md Round 2 critique (OCR/parsing across arbitrary sites is open-ended infrastructure work, not a weekend feature). Decision: manual copy-paste stays the only v1 entry method. Revisit only if manual entry proves too tedious in actual use.
- **Percentage similarity scores — rejected, decided 2026-09-08.** The expanded doc's "92% similar" ranked-list format conflicts with the already-agreed "no false precision" principle (risks.md Round 1 point 5). Confirmed: qualitative deltas + one overall confidence label, no per-garment percentage. See "Open questions" above.

**New ideas from Round 3 worth keeping (compatible with existing decisions, not yet fully speced):**
- **Split "garment fit" from "your fit state."** Instead of only storing "this shirt is tight on the shoulders" against the garment, also let repeated feedback update an inferred personal fit-preference range per zone (e.g. "you currently prefer ~45–47cm shoulder room"), computed from the wardrobe rather than manually entered. This is a natural extension of Feature 4 (implicit drift) already in this spec — same append-only observation log, just also surfaced as a rolling per-zone range summary, not a new independent data source.
- **Don't make the user quantify everything.** UI principle: fit notes should be selected from short human phrases ("Slightly tight on shoulder," "Comfortable chest") rather than numeric input (no "shoulder deviation: 3.4cm" fields). Structuring happens internally (mapping to the existing FitTag enum), not exposed to the user as a number to fill in. Already broadly consistent with Feature 1's per-zone tag + free text design — this just reinforces keeping numeric confidence/deviation values out of user-facing input.
- **Optional body measurements, treated as inferred rather than authoritative.** A user-entered "known body measurements" section is optional and never required for FitCheck to function — the real dataset is garment measurements + fit reactions. Body measurements, if entered, are supplementary context, not a dependency.
- **"Show me my references" / photo-forward matching.** When showing similar garments for a FitCheck comparison, lead with the photo reference (per Feature 1's photo-as-reference design) alongside the deltas — recognizing a garment visually ("oh, THAT shirt") is a faster memory cue than a garment name/ID.
- **Fit trend framing for implicit drift (Feature 4).** When a new garment at a previously-known measurement (e.g. 32" waist) gets contradictory feedback vs. older garments at that same measurement, phrase the nudge as a trend, not a false-precise number: "Your recent 32in waist garments are fitting tighter than older ones — your comfortable range may be shifting," not "waist increased 2.4cm." Consistent with the existing Feature 4 nudge design, just confirms the phrasing should stay qualitative.
- **Never delete fit history.** Editing a garment's fit note (Feature 3) must keep prior observations visible in a history view, not just internally retained — e.g. showing "2025: Perfect" and "2026: Slightly tight" both, not just the latest. Already implied by Feature 3's "append-only" design; this makes explicit that the UI must surface the full history, not just the current state.

## Round 4 — fit type/silhouette + offline architecture (2026-09-08)
Core addition, adopted: **fit isn't just measurements — fit = measurements + cut + silhouette + your preference.** Two identical waist/inseam pants can be a totally different garment (straight vs. wide-leg) and FitCheck needs to represent that. Fully specced into Feature 1 (Fit/Cut field + silhouette measurements + split comfort/visual-preference feedback), Feature 2 (matching now weighs silhouette and learned silhouette preference, not just measurement deltas), and the Data shape section above.

Also adopted: **fully offline, local-only architecture** (own top-level section above) — no server/account/cloud/analytics ever, deterministic local rules engine rather than ML for v1.

Reaffirmed again (third time): OCR/photo extraction — including a locally-run variant — stays cut from v1; see "Deliberately cut from v1."

New, deliberately deferred rather than rejected: a generated visual silhouette comparison (new garment vs. reference, shown as simple shape outlines) — appealing but pure UI polish, not needed for the matching logic to work; see "Deliberately cut from v1."
