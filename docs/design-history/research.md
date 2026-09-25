# 037 — Personal cross-brand garment fit predictor

**Source:** User's own idea (not from the "35 product ideas" doc), shared 2026-09-08.

**Idea as described:** A digital product where you log measurements of clothes you already own (Nike pants, Uniqlo shirt, etc.) plus qualitative fit notes per garment ("loose on waist," "slightly tight on shoulder") — optionally alongside your body measurements. When considering a new purchase, you enter that new garment's measurements and the tool predicts fit by comparing it against your logged history, learning your personal fit preferences across brands over time.

**Date researched:** 2026-09-08

## Verdict
The core mechanic already exists and has been built more than once — but mostly as either (a) B2B-embedded retailer widgets or (b) very low-adoption standalone consumer apps. That gap between "proven mechanic" and "no good standalone consumer product" is the interesting part.

## Existing examples/competitors
- **Virtusize** (https://www.virtusize.com, TechCrunch coverage from 2013: https://techcrunch.com/2013/04/29/virtusize) — this is the closest prior art. Since ~2011–2013, its entire pitch is "compare a garment you already own to one you're considering," walking you through measuring waist/hip/rise etc. and overlaying silhouettes. Partnered with ASOS and other major retailers. Embedded on retailer product pages (B2B widget), not really a standalone personal app the shopper controls independently across arbitrary brands.
- **True Fit / Fit Analytics** (https://www.truefit.com) — the crowd-data version: uses purchase/keep/return signals across 91,000+ brands and 80M+ shoppers to recommend sizes, including for first-time shoppers with no history. Different mechanism (crowd-sourced outcomes, not your own garment measurements), also B2B-embedded, not a personal tool.
- **MeasureNote** (Google Play: https://play.google.com/store/apps/details?id=com.ontrails.measurenote, App Store: https://apps.apple.com/us/app/measurenote-clothes-size-app/id6475183661) — closest standalone consumer app: a personal notebook recording body measurements plus sizes of clothes that fit well, for reference on future purchases. Very low adoption signal (App Store shows only 2 ratings).
- **Tailored / "Capture"** (https://www.thetailoredco.com) — lets you measure clothes you own and compare dimensions to online listings before buying. Similar personal-comparison concept.
- **3DLOOK / YourFit, TrueToForm, Lyfsize, Fytted, SizeWise AI** — mostly body-scan-based (photo → body measurements → size recommendation across catalogued brand size charts), not garment-history-based. Different approach: predicts from your body shape against brand size charts, not from your own logged fit experiences.

## What's NOT covered by existing tools (real gap)
- **Qualitative, per-body-part fit feedback tied to measurements.** Every tool found either does a binary/silhouette comparison (Virtusize) or crowd keep/return signals (True Fit) or a flat "this fits" record (MeasureNote). None clearly let you log structured qualitative notes per garment per body zone (e.g., waist: loose, shoulder: slightly tight, sleeve: perfect) and use that structured feedback — not just raw dimensions — to weight predictions for a new garment.
- **User-owned, brand-agnostic history that isn't tied to any one retailer.** Virtusize and True Fit are both retailer-embedded (you encounter them shopping on a specific site); nothing found lets a person build one personal, portable fit profile they carry between any brand's checkout page.
- **Low competition in polish/adoption at the standalone-app layer.** MeasureNote and Tailored both do a version of this but show weak traction (few ratings, little visibility) — suggesting either weak execution/marketing, a real distribution problem (hard to build a habit of manually logging garment measurements), or genuinely thin demand. Worth treating as a warning sign, not just an opportunity signal.

## Gap hypothesis
The mechanic (compare new garment measurements to garments you already own) is proven and patented territory (Virtusize), so this is not a novel algorithm. The differentiated angle is: a standalone, brand-agnostic, personally-owned tool with structured qualitative fit feedback (not just raw measurements) that improves its predictions the more garments you log — closer to a personal fit diary with recommendation smarts than a retailer-embedded comparison widget. No direct competitor found doing exactly that combination well.

The biggest open question is **distribution/habit-formation**, not the algorithm: the existing standalone attempts (MeasureNote, Tailored) look under-adopted, and manually measuring and logging every garment you own is real friction. This needs validating before building.

## Next steps if pursuing
- Pre-sell or prototype-test before building: mock up the qualitative fit-logging flow (garment name/brand, key measurements, per-zone fit notes) and see if real users (start with yourself + a small group) will actually maintain it over weeks, not just try it once.
- Investigate whether the friction can be reduced — e.g. seeding common garments' measurements from brand size charts automatically (so the user only adds fit notes, not manual tape-measure work) rather than requiring manual measurement of every item.
- Check patent status around Virtusize's comparison method before building anything resembling its silhouette-overlay approach specifically; the qualitative-feedback angle described here appears distinct enough to not directly collide, but worth a closer look if this moves past prototype stage.

## Final verdict (2026-09-08, after adversarial review)
**Killed as a startup/venture. Still viable as a personal project.** Full critique thread in [risks.md](risks.md). Summary: the idea has a structurally backwards value curve (least useful before you've logged data, least needed after), the "make data collection automatic" fix trades that for a bigger, more capital-intensive problem (scraping infrastructure, retailer integrations that don't exist, network-effects-scale data competing directly with True Fit's ~20-year data moat), and consumer willingness to maintain/pay for wardrobe-logging tools is already tested and weak (Stylebook, Acloset, MeasureNote). The underlying insight — people care about actual fit, not size labels — is worth keeping, but pointed at a bounded, closed ecosystem instead of a universal cross-brand database. Two narrower spinoff ideas were filed as backlog for possible future research: #038 (single-brand/narrow-catalog fit tool) and #039 (closed-ecosystem fit tool, e.g. vintage denim or resale clothing) — see [../idea-research/backlog-002-036.md](../idea-research/backlog-002-036.md) and [../idea-research/INDEX.md](../idea-research/INDEX.md).
