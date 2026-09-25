# Fitcheck — risk critique log

Companion to [research.md](research.md). This is a running adversarial-review thread, not a research file — see research.md for competitor/prior-art findings. Dated 2026-09-08.

## Round 1 — critique of the original pitch (manual wardrobe database)

**1. Garment data is the bottleneck, not the UX.** The pitch assumed garment-flat measurements are readily available on product pages. They're inconsistent — verified: many brands publish body-measurement size charts (who a size fits) rather than garment specs (finished flat dimensions), especially for basics like T-shirts/casual pants. Garment measurements are more reliably published for structured items (denim, tailoring, oversized knits) — still not universal. If the user has to manually measure every new garment, the core promised flow ("paste from product page") breaks for a large share of the catalog.

**2. The prior art is deep and old, and none of it broke through.** Virtusize (2013, ASOS partnership) does the exact silhouette-overlay comparison this idea describes. Even older: US patent **US20020188372A1**, "Method and system for computer aided garment selection," filed 2002 — the same basic concept (own-garment data guiding new purchases) is over two decades old. 20+ years of attempts not producing a dominant consumer product is a strong signal the blocker is structural (data availability, habit formation, distribution), not lack of imagination.

**3. Consumer willingness to pay for wardrobe-logging is already tested and weak.** Stylebook has survived since 2010 on a one-time $4.99 purchase — never found recurring revenue for wardrobe data. Acloset tried freemium-with-caps and users are actively unhappy about it. MeasureNote — the closest direct analog to this exact idea (log measurements + fit notes) — has ~2 App Store ratings. This isn't a hypothesis; it's an already-run experiment with a negative result.

**4. The value curve is structurally backwards.** The tool is least useful exactly when a new user needs it most (no logged history yet) and least *needed* exactly once it has enough data to be accurate (by then the user has learned their sizing across those brands through ordinary shopping experience anyway). Cold-start paradox: "I don't know how this fits, you haven't entered enough clothes" → six months of disciplined logging later → "I already know what I buy."

**5. False precision is worse than honest ambiguity.** A computed "91% match" implies certainty the underlying data (flat measurements, no fabric stretch/cut/drape/body-shape info) can't support. Getting burned once by a confident wrong prediction likely damages trust and retention more than the honest vagueness of a size-chart "M" ever did. (Agreed fix: replace percentage match with qualitative comparison + explicit confidence level — "Closest to your Uniqlo shirt, chest +2cm, shoulder −1cm, confidence: medium.")

## Round 2 — critique of the "automatic fit-memory layer" pivot

The reframe ("don't make wardrobe logging the product, make it a byproduct — auto-extract from URLs/screenshots/order confirmations, learn from behavioral signals") looks like it dissolves the cold-start problem. It relocates it somewhere bigger.

**1. "Automatic extraction" trades a cheap behavioral problem for an expensive infrastructure problem.** Reliable parsing of garment measurements from arbitrary retailer pages/screenshots means building and maintaining scrapers/vision-extractors across thousands of sites with different HTML, units, and table formats (some measurements exist only as images) — an ongoing engineering and maintenance cost, not a weekend feature. This is strictly harder to bootstrap-test than "will a person log 10 garments."

**2. The easiest-to-automate signal is the least useful one.** Order confirmations give you the *size label purchased* ("Uniqlo L"), not the garment's actual measurements — exactly the information this product exists to route around (label ≠ label across brands). Automating collection doesn't help if what's collected isn't the valuable data.

**3. "Learn from other users' size+brand data" reintroduces a bigger cold start: a network-effects one.** A single user's "Uniqlo L, fits well" is only informative at scale, compared against many other users' data or canonical garment records. That's not a smaller problem than manual logging — it's **True Fit's entire business** (91,000+ brands, 80M+ shoppers, ~20 years of data, real funding). Depending on this level of evidence means competing with that data moat from zero, which is a harder position than a lean single-player tool.

**4. "Connect your purchases" assumes an integration that doesn't exist.** Verified: retailer APIs found (Zalando Connected Retail, API2Cart, etc.) are seller/partner-side inventory and order-management integrations — not consumer-facing "import my own purchase history" access. There is no Plaid-for-shopping. The alternative (scrape a user's inbox for order confirmations) asks for invasive account access to solve a comparatively low-stakes problem (people grant Mint bank access because money is high-stakes; fit prediction for a shirt is a weaker motivational match).

**5. The retailer-integration endgame is a head-on collision with an entrenched incumbent, not a growth path.** True Fit/Fit Analytics already hold the commercial relationships (ASOS, Lucy and Yak, etc.) built on two decades of aggregate outcome data. A pitch of "let our layer plug in too, based on one user's personal wardrobe" offers retailers nothing their existing vendor doesn't already do better in aggregate — and you need scale to win retailer partners, but need retailer partners to get scale. Circular, unresolved by the pivot.

**Net effect of the pivot:** it correctly identifies where the real value would be, but it also converts a cheaply-testable behavioral experiment into a capital-intensive infrastructure/data-network/retailer-BD problem. If the goal is a small testable digital product, the pivot moves further away, not closer.

## Final synthesis (agreed 2026-09-08)

Three different businesses are hiding inside the original idea:

| Version | Main problem | Verdict |
|---|---|---|
| Manual fit database | Users won't maintain it (bad value curve: least useful early, least needed late) | Weak |
| Automatic personal fit layer | Requires reliable garment data + integrations that don't exist yet | Worse for bootstrapping than the manual version |
| Retail/aggregate fit infrastructure | Needs enormous data + retailer distribution (True Fit's business) | Potentially huge, but a totally different, capital-intensive business — not a small digital product |

**Verdict: kill as a startup, not necessarily as a project.** As a personal/portfolio build (manually log 10–20 garments, demonstrate "your wardrobe becomes your fit reference") it's still a legitimate, interesting thing to ship. As a search for "a small digital product with a realistic path to being a small profitable business," move on — the blocking constraints (external data availability, scraping, retailer integration, network effects, trust, incumbent competition) are exactly the category of obstacle to avoid when hunting for a bootstrappable idea.

**Insight worth keeping, separate from the failed product shape:** people don't care about size labels, they care about whether a specific item will fit the way they want. That insight doesn't require "build a universal cross-brand fit database" — it can be applied to a much smaller, closed ecosystem where the data problem doesn't explode. Two narrower spinoffs identified (not yet researched — filed as backlog ideas #038 and #039 in [../idea-research/INDEX.md](../idea-research/INDEX.md)):
- **Single-brand/narrow-catalog fit intelligence** — help someone understand one brand's sizing/fit deeply, rather than every brand on the internet.
- **Closed-ecosystem fit tool for a high-fit-complexity niche** — e.g. vintage denim or secondhand/resale clothing, where buyers already think and communicate in exact measurements, care intensely about fit, and the catalog is naturally bounded rather than universal.

## Round 3 — expanded design doc reconciled (2026-09-08)
A fuller design doc (photo/screenshot OCR extraction as primary entry, percentage similarity scores like "92% similar") was proposed and checked against the decisions above. Both conflicts were resolved by reaffirming the original decisions here: **OCR extraction stays cut from v1** (Round 2 critique still applies — arbitrary-site parsing is infrastructure work, not a feature), and **percentage similarity scores stay rejected** (Round 1 point 5 still applies — false precision). Full reconciliation and the compatible new ideas kept from that doc (fit-state split, human-phrase fit notes, optional body measurements, photo-forward matching, fit-trend phrasing, never-delete history) are recorded in [spec.md](spec.md)'s "Round 3" section. Platform also decided: React Native/Expo, personal-use Android APK, no store launch.

## Round 4 — fit type/silhouette + offline architecture (2026-09-08)
Two substantial, adopted additions: (1) fit type/cut/silhouette becomes a first-class field alongside measurements (a garment's silhouette — straight/wide/oversized/etc. — isn't derivable from waist+inseam alone, and matching + preference-learning now weighs it); (2) the app is fully offline/local-only by design (no server, account, cloud DB, cloud AI, analytics, or any remote API) — consistent with, and a natural extension of, the "personal project, one person's closet" scope established in the Round 2/3 critiques above. Neither addition reopens any previously-killed risk (no network effects, no scraping, no retailer dependency introduced). One proposal from this round — locally-run OCR for measurement extraction — was rejected again for the same reason as the original cloud-OCR cut (Round 2 above): the fragile part was always parsing arbitrary layouts, not where the parsing runs. Full detail in [spec.md](spec.md)'s "Round 4" section.

## Reusable filter for future ideas
Rather than "can we make this idea work," ask: **what kills this idea, and does the killer constraint have a cheap workaround?** If the answer is no, discard rather than trying to elegantly rescue it. Apply this before "can this be a great product" — a great product built on an unsolved structural constraint (data availability, network effects needed on day one, dependence on uncooperative third parties) is not a small bootstrappable business, whatever its conceptual merit.
