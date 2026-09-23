# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles share one platform, but the hospital buyer/procurement officer is the priority role when
design tradeoffs conflict:

- **Hospital buyer / procurement officer** (primary) — reviews the recommendation feed, opens a
  candidate product, works through its "open problems" worklist, sends questions to suppliers, and
  approves orders into a pool. Works in `/hospital`.
- **Hospital clinical approver** — signs off blocking substitution questions, especially at MDR risk
  class IIb/III, where a cross-brand swap always requires clinical sign-off regardless of attribute
  match. Also works in `/hospital`, narrower scope than the buyer.
- **Supplier / manufacturer user** — uploads their catalogue, confirms uncertain extractions, sets
  volume pricing, sees pooled demand aggregated across hospitals, and answers hospital questions.
  Works in `/supplier`, scoped to exactly one manufacturer org (no auth yet; org is resolved
  server-side and never offered as a UI choice, since a manufacturer seeing sibling manufacturers
  would model something that can't happen once real sign-in exists).
- **SANOVIO ops** (internal) — watches matching-pipeline observability and uploaded documents in
  `/admin`: which layer resolved what, how many LLM calls it cost, thresholds in force.

## Product Purpose

SANOVIO is a **virtual procurement group** (*virtuelle Einkaufsgemeinschaft*) for hospital medical
supply purchasing in the DACH region (Germany/Austria/Switzerland). It harmonises messy hospital
article masters and supplier/manufacturer catalogues into one canonical product identity, pools
provably-identical demand across hospitals into a single negotiating position, then sources directly
from the original manufacturer — removing the distributor margin. SANOVIO is principal in fulfilment
(orders carry a `sanovio_fulfillment_ref`, never a supplier reference).

Success is: an article a hospital already buys gets identified correctly across sources (channel
saving), and where a clinically-equivalent substitute exists it surfaces with the right clinical gate
attached (substitution saving) — without ever silently guessing at a part number, a price, or a
clinical equivalence.

## Positioning

SANOVIO is a real, existing venture (sanovio.de) and this repository is genuine early-stage product
work toward it, not a fictional exercise. It is positioned explicitly against incumbent GPOs/catalog
platforms in this market (e.g. GHX, Medical Columbus's `mc navigator`).

The mechanism a competitor can't casually copy: the saving is mostly **channel, not substitution** —
the same article, bought better through pooled volume and direct sourcing — and the product
architecture keeps that distinction everywhere (identity match vs. substitution match are different
claims with different clinical risk and different approval gates). Structured, three-valued
adjudication (`identical` / `equivalent` / `not_equivalent`) rather than a boolean match/no-match is
part of that mechanism, as is validating every AI-extracted identifier back against the source
document's own text layer before it is trusted as a finding.

## Operating Context

- Built on ECLASS product classification and EU MDR 2017/745 UDI identifiers and risk classes
  (I / IIa / IIb / III); substitution confidence bars are risk-weighted (I: 90, IIa: 95, IIb: 98,
  III: never auto-confirms regardless of model confidence).
- Ingested documents: hospital demand spreadsheets (`.xlsx`/`.csv`, parsed in-process) and supplier
  catalogue PDFs (typeset documents where part numbers live in a text layer, table geometry lives in
  the render, and product photography lives in embedded bitmaps belonging to rows no coordinate can
  identify alone — handled by the separate `extract_lib` Python pipeline, one Claude call per page,
  validated against the page's own text layer).
- A catalogue PDF upload is synchronous and takes minutes (22 pages ≈ 3 minutes, ~$2.16); a
  production deployment would move this to a queue.
- No authentication yet. Roles exist in the schema and drive the approval chain; each portal
  currently assumes whoever is looking holds the relevant role. Org identity is resolved server-side
  per portal, not chosen in the UI.
- AI has two implementations behind one interface everywhere it's used (embeddings, reranking,
  adjudication, substitution review): live (Voyage + Claude) when API keys are present and valid,
  deterministic fallback otherwise. The pipeline and UI never branch on which is active; `/admin`
  and the adapter label report which one actually answered, including a rejected-key case, so a
  fallback's output is never silently credited to the model.

## Capabilities and Constraints

- Matching pipeline is cheapest-layer-first: exact identifier (GTIN/UDI/SKU) → embedding retrieval
  (top-K) → reranker → Claude adjudication, the last reserved for the ambiguous tail only.
- Three separate confidence gates, not one: `extraction_confidence` (was the row read correctly?),
  `link_confidence` (is this the same article as this canonical product?), and
  `substitution_confidence` (are these different articles clinically interchangeable?), the last
  risk-weighted by MDR class as above.
- Prices are never invented — an uploaded catalogue with no price data produces listable, poolable,
  but unpriced products, not an estimate.
- Peer-hospital demand volumes shown for pooling are synthetic (deterministically generated,
  sized against real volume breaks) except for the three real case-study files.
- Vector search is a linear scan (fine at current scale; schema is shaped to become
  `vector(1024)` + HNSW on Postgres).
- Coverage is bounded by what suppliers have actually uploaded — unmatched categories (gloves,
  masks, wound care, wipes) are correct, expected behavior at this stage, not a bug.
- Confidence thresholds are reasoned defaults, not measured against a labelled eval set yet.
- Pool lock is manual; no scheduler or commitment enforcement yet.
- A near-tied match between two candidates currently resolves silently to the top hit rather than
  raising a question — a known gap, not intended behavior.
- ECLASS codes are placeholders unless a source file states one.

## Brand Commitments

- Name: **SANOVIO**. Real, existing brand (sanovio.de).
- Brand color already established in code: brand blue `#5659FB` and its grey scale, taken from
  sanovio.de (`app/globals.css`).
- Logo: `public/logo.png` (full logo) and `public/wordmark.png` (wordmark) are the real marks and
  should be adopted going forward — future visual work should incorporate the logo image rather than
  rendering a text-only wordmark, superseding the current in-app implementation which shows text
  only.
- Existing interactive dot-grid background (`app/components/DotGrid.tsx`) is explicitly modelled on
  sanovio.de and is a confirmed brand element, not an arbitrary design choice.

## Evidence on Hand

- **Real case-study files** (in `assets/` and referenced from `samples/README.md`):
  `Entwicklungsherausforderungen v01.xlsx` (hospital demand, all 10 rows recoverable including GTIN,
  MDR class, pack size, target price in CHF), `Produktkatalog.pdf` (B. Braun catalogue),
  `Produktkatalog 02.pdf` (BD catalogue — 175 SKUs, 87 product photographs, 22 pages, extraction
  measured at ~3 min / $2.16).
- A documented real finding: hospital demand row 6 (`Kanüle Sterican 0,8 × 40 mm`) carries article
  number `4657689`, while B. Braun's real article number for that product is `4657527B` — the
  numbers don't match though the descriptions do, which is the harmonisation problem this product
  exists to solve, in miniature.
- Everything in `samples/` other than the three case-study files above is synthetic, including all
  hospital names — stated explicitly so future work never treats it as real evidence.
- No pricing exists in either PDF catalogue; any price shown for those products was set by a human
  supplier user via Volume pricing, not extracted.
- Full architecture/behavior spec: [`SANOVIO Plattformstruktur.md`](SANOVIO%20Plattformstruktur.md)
  (structure v2) — this repository is a working implementation of it.

## Product Principles

1. **A finding must be traceable to the source, or it isn't a finding.** Identifiers are validated
   against the document's own text layer; unvalidated rows are held below threshold, never guessed.
2. **Channel and substitution are different claims and must never blur.** Same-article-better-channel
   carries no clinical risk; different-article-equivalent always carries a clinical gate at IIb/III
   regardless of how confident the model is.
3. **Silence is not agreement.** An attribute unstated on either side of a comparison is a question to
   raise, not a match to assume.
4. **The system must say what actually answered it.** Live AI vs. deterministic fallback, real photo
   vs. category placeholder, human-cleared vs. sent-to-supplier — the UI names which one occurred
   rather than presenting a uniform result.
5. **Nothing is preloaded or invented.** No fixture data ships to the real app database, no price is
   estimated, no peer volume claims to be real — synthetic and real evidence stay visibly separate.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond standard web accessibility
practice.
