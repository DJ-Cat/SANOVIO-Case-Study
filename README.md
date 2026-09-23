# SANOVIO — Procurement Platform MVP

A working implementation of [SANOVIO Plattformstruktur.md](SANOVIO%20Plattformstruktur.md) (structure v2):
hospital and supplier data in, harmonised product identity in the middle, pooled orders out.

## Try it — the demo in four steps

For anyone with the repo who wants to click through a filled platform:

1. Install **Node.js 24 or newer** (<https://nodejs.org>) — `node --version` should say v24 or higher.
2. Get the code and install:
   ```bash
   git clone https://github.com/DJ-Cat/SANOVIO-Case-Study.git
   cd SANOVIO-Case-Study
   npm install
   ```
3. Copy `.env.example` to `.env` and paste in whichever API keys you have. All of them are
   optional — without keys the demo still opens with every result in it; with them, new work
   (a fresh "Replace with this" analysis, meaning-based search, matching a new upload) runs live.
4. Start the demo and open **http://localhost:3001**:
   ```bash
   npm run demo
   ```

The demo is filled: a manufacturer catalogue (89 articles with photography), a hospital's article
master, the automatic suggestions, and a chosen replacement with its full AI analysis. Click
anything — place orders, sign points off, send questions, upload files. `npm run demo:reset` puts it
back exactly as it was. The clean edition that ships empty runs separately (`npm run dev`, :3000).

Uploading a new **PDF** catalogue additionally needs the Python extractor in `extract_lib/` set up
(see below); everything else — including spreadsheets — works without it.

## Development

```bash
npm install     # also seeds organisations and users
npm run dev     # http://localhost:3000 — the clean edition, empty
```

Node ≥ 24 (the data layer uses the built-in `node:sqlite`). No Docker, no cloud account, no API keys.

```bash
npm run verify      # upload the sample files, then drive the §5 state machine (144 assertions)
npm run db:reset    # back to an empty platform
npm run demo:load   # reload both sides — 89 articles with photography + 10 demand lines, no key
```

`verify` runs against its own database (`db/verify.db`, via `SANOVIO_DB`) and never writes the one
the app serves. Running it does not put fixture data in front of you the next time you start the
app — the platform starting empty is a property worth protecting from its own test harness.

### Two editions: clean and demo

| | Clean — what ships | Demo — for trying it out |
|---|---|---|
| Start | `npm run dev` → http://localhost:3000 | `npm run demo` → http://localhost:3001 |
| Database | `db/sanovio.db`, starts empty | `db/demo.db`, filled with sample data |
| Production | `npm run build && npm start` | `npm run build:demo && npm run start:demo` |
| Back to the start | `npm run db:reset` (empty) | `npm run demo:reset` (the snapshot again) |

The two run side by side and never share a file: whatever is clicked in the demo — orders
placed, points signed off, catalogues uploaded — stays in the demo. The demo edition says so on
every page with a *Demo data* badge.

The demo is restored from `db/demo-snapshot.db`, a frozen copy that is never served. It holds the
BD catalogue with its photography, the hospital's article master, the automatic suggestions and a
chosen replacement with its full AI analysis — work that cost real API calls, so it is kept
rather than rebuilt. To change what the demo starts from, set it up in the demo and run
`npm run demo:save`. On a fresh checkout without a snapshot (databases are gitignored),
`npm run demo` builds one from the frozen catalogue in `fixtures/` instead — no key, no cost, but
without the AI analyses.

---

## The platform starts empty

Nothing is preloaded. Organisations and users exist; every article in the system arrives through
an upload in one of the portals. That is the actual product flow, and it means the extraction and
confidence machinery is exercised rather than described.

**To get from empty to a populated demo** — five minutes, in this order:

1. **Supplier portal → Upload catalogue**: `Produktkatalog.pdf` — you are signed in as B. Braun
2. Visit `/supplier/as/org_bd` to sign in as BD, then **Upload catalogue**: `Produktkatalog 02.pdf`
3. **Hospital cockpit** — with no data uploaded, the cockpit *is* the upload screen:
   drop in `Entwicklungsherausforderungen v01.xlsx`

Add the files in [`samples/`](samples/) for the Class IIb/III path and for priced catalogues —
[`samples/README.md`](samples/README.md) says which file goes where and which are synthetic.

### Who you are

Each portal is one organisation's workspace, resolved server-side and never offered as a choice in
the UI — a manufacturer is the company itself, so listing the other manufacturers alongside it would
model something that cannot happen once real sign-in exists. The hospital portal is pinned to
`HOSPITAL_ID`, the supplier portal to `SUPPLIER_ID` (`lib/constants.ts`), and every query, badge,
file list and upload is scoped to it. Whose workspace you are in is shown in the top right corner of
both portals, opposite the hamburger.

Because the demo needs two manufacturers to show a cross-brand substitution, `/supplier/as/<orgId>`
sets the signed-in manufacturer. It is deliberately not linked from anywhere in the UI. Valid ids
are the manufacturer rows in `scripts/seed.ts` — `org_bbraun`, `org_bd`, `org_medtronic`,
`org_smithnephew`, and the rest.

---

## Three portals

| Portal | Who | What they do |
|---|---|---|
| `/hospital` | Buyer, approver, clinician | Search the catalogue, upload demand, open a product, clear its open problems, approve orders for fulfilment |
| `/supplier` | One manufacturer | Upload catalogue, edit its products — price, picture, description — set volume pricing, answer hospitals in Messages |
| `/admin` | SANOVIO ops | Matching pipeline observability, thresholds in force, uploaded documents |

They share one harmonised product catalogue and nothing else. **Neither portal shows pooled
demand.** Pooling still drives what a product costs — volume determines which price tier an order
lands in — but how many hospitals are in a pool, what they have committed, and how close a product
sits to its next break are not shown to a manufacturer or to a hospital. A manufacturer learning
the group's aggregate position is a negotiating asymmetry, and a hospital learning its peers'
volumes is somebody else's procurement strategy. Only `/admin` counts pools, and only as an
operations statistic. Each portal has its own left sidebar, collapsed and
reopened by the hamburger at the top left — at every breakpoint, not only on mobile: the rail slides
out and the content column widens to meet it. Opposite it, top right, the SANOVIO wordmark links
back to `/`, which is nothing but the portal chooser.

**The hospital cockpit has two states.** With nothing uploaded it leads with upload-and-extract,
because there is nothing else to show. Once data exists it becomes the recommendation feed: manual
product search at the top, suggested replacements as cards, then current orders. Search results
render as the same cards as the suggestions, so the system-suggested and user-initiated feeds read
as one thing.

**Documents owns the files and what they are still waiting on.** Upload sits at the top, the
uploaded files below it, and under those the rows a human still has to clear — the two confidence
gates in §2. Deleting a file there removes every article read out of it. **Catalogue** is the
hospital's own shelf: the products it buys and the ones proposed against them, each with a delete
that takes the product out of the platform.

The only branding is the SANOVIO wordmark in the top right corner; there is no logo image anywhere.
The background is an interactive point grid (`app/components/DotGrid.tsx`) that swells gently under
the cursor — a canvas rather than DOM nodes, since a viewport at this spacing is several thousand
dots. Drawn in two passes: the resting grid batched into one `fill()`, then only the dots inside the
cursor's radius shaded individually, so cost does not grow with viewport or density.

---

## What it does

SANOVIO is a **virtual procurement group**. Three mechanics stack, and each is a layer in the app:

1. **Harmonisation** — messy hospital article masters and supplier catalogues resolve to one
   `CanonicalProduct`. Without this, nothing else is possible.
2. **Pooling** — once two hospitals provably buy the same thing, their volume bundles into one
   negotiating position. Price is a function of the *pool*, not of one hospital's order. The
   mechanic is real and priced; it is simply not exposed in either portal (see above).
3. **Direct sourcing** — pooled volume is placed with the original manufacturer, removing the
   distributor margin. SANOVIO is principal, so orders carry a `sanovio_fulfillment_ref`, never a
   supplier reference.

The saving is mostly **channel**, not **substitution** — the same article bought better — which is
why the app separates those two cases everywhere.

| | Identity match | Substitution match |
|---|---|---|
| Claim | Same article, better channel | Different article, clinically equivalent |
| Clinical risk | **None** | Real |
| Gate | Budget approval only | Budget approval **+** clinical sign-off at MDR IIb/III |

---

## The pipeline (§8)

Cheapest layer first. Each layer only sees what the one above could not resolve.

```
exact identifier  →  embedding retrieval (top-K)  →  reranker  →  Claude adjudication
   GTIN/UDI/SKU           narrows the field         most cases      the ambiguous tail
```

`/admin/pipeline` shows which layer resolved what and how many LLM calls it cost. The ratio there
counts **hospital lines only** — a manufacturer confirming rows in its own catalogue is not the
matching engine working, and counting it would flatter the number.

### Three thresholds, not one (§2)

| Gate | Question | Bar |
|---|---|---|
| `extraction_confidence` | Did we read this row correctly? | 90 |
| `link_confidence` | Is this row the same article as this canonical product? | 95 |
| `substitution_confidence` | Are these *different* articles clinically interchangeable? | risk-weighted |

Substitution is weighted by MDR class — I: 90, IIa: 95, IIb: 98, **III: never auto-confirms**,
regardless of model confidence. Identity matches skip the substitution gate entirely.

---

## The data is real

| File | Upload as | What was recoverable |
|---|---|---|
| `Entwicklungsherausforderungen v01.xlsx` | Hospital demand | All 10 rows, incl. GTIN, MDR class, pack size, target price (CHF) |
| `Produktkatalog.pdf` | B. Braun catalogue | Not yet re-extracted with `extract_lib` |
| `Produktkatalog 02.pdf` | BD catalogue | **175 table rows → 89 articles, 47 product photographs**, 22 pages, ~3 min, $3.24 |

Spreadsheets are parsed in-process by `lib/ingest/` with no dependencies — a minimal ZIP reader for
`.xlsx`, an RFC4180 reader for `.csv`. **Catalogue PDFs go to `extract_lib`** (see below), which is
where the row counts above now come from.

**One finding worth calling out.** Hospital row 6 is `Kanüle Sterican 0,8 × 40 mm`, article
`4657689`. B. Braun's actual article number for *Sterican® 21Gx1½" (0,80 mm × 40 mm)* is `4657527B`.
The article numbers **do not match**; the descriptions do. Identifier matching fails and the
semantic layers carry it — that single row is the harmonisation problem in miniature, and
`npm run verify` asserts on it by name.

A row's confidence comes from what the run established, never from a model self-report. Every part
number is validated back against the page's text layer, the page re-run once with the failures fed
back, and rows that still cannot be anchored are dropped rather than guessed at — so a row that
exists at all has cleared the hardest check. What is left to score is whether its own page
validated cleanly (if not, every row on it is capped at 55 and goes to the supplier's review
queue), and how much of the row survived. On the current BD run no page fails, and the 89 articles
land at 96 and 100.

A row whose every column is an identifier — a part number, a pack size, a national article number —
is capped too, whatever its part number read like. It says what an article is *called* and nothing
about what it *is*, so it cannot be matched against a hospital line and belongs in front of a human
rather than in the catalogue.

### What is synthetic — and where it says so

- **Prices are never invented.** The PDF catalogues carry none, so uploading one creates products
  with *no price at all* — not an estimate. An unpriced product is listed and searchable,
  but produces no savings claim and cannot be ordered. The supplier portal's **Pricing** page
  counts them and is where a manufacturer sets what a product costs (see below). Every tier
  traces to `origin='catalogue'` (stated in the uploaded file) or `origin='supplier'` (typed by a
  human), and `npm run verify` asserts there is no third kind.
- **Peer-hospital volumes**, generated deterministically and sized against each product's own first
  volume break, so a pool sits plausibly near a tier instead of absurdly past it.
- **Everything in `samples/`** except the three case-study files, which are real.
- Hospital names are fictional.

---

## Catalogue PDFs: extract_lib

A catalogue PDF is a typeset document, not a data file. The part numbers live in a text layer, the
table geometry lives in the render, and the product photography lives in embedded bitmaps belonging
to rows no coordinate can tell you. `extract_lib/` reads all three together.

```
extract.assets   PyMuPDF only, no key, no cost
                 page renders, figure crops grouped by overlap, the placements
                 under each crop as addressable parts, assets/manifest.json
extract.run      Claude, one call per page
                 catalog.json — one record per TABLE ROW, figures assigned to SKUs
```

The platform shells out to it (`lib/ingest/extract-lib.ts`) rather than reimplementing it, so
**Python, pymupdf, anthropic and a working `ANTHROPIC_KEY` must exist wherever this is deployed**.
Point `EXTRACT_LIB_DIR` and `EXTRACT_LIB_PYTHON` at them if they are not in the default place.

Measured on `Produktkatalog 02.pdf`: **175 table rows in about three minutes for $3.24**, every
row carrying its table's real columns —
`{"gauge":"27G","od_mm":0.4,"length_mm":13,"wall":"regulär","colour":"grau"}`. The regex reader it
replaced found 82 rows, no dimensions beyond what fitted a pattern, and no images at all.

Those 175 rows are **89 articles**; see *One part number is one article* below.

Two properties worth keeping when you touch this:

- **A part number that does not occur in the page text is not a finding, it is a hallucination.**
  `run.py` validates every extracted identifier back against the text layer, re-runs the page once
  with the failures fed back, and drops rows it still cannot anchor. Rows from a page that never
  validated are held below the extraction threshold and sent to the supplier's review queue.
- **A partial run is not a failed run.** `run.py` exits non-zero if any page errored, but it has
  already written what the other pages produced. The bridge keeps those and reports the failed
  pages as a note, rather than discarding twenty good pages because two failed.

`npm run check:extract` compares the importer's TypeScript shapes against `extract/schema.py`, which
is the source of truth; `npm run verify` runs it too. The interfaces are hand-written against a
Python file outside this repo's typechecker, so drift would otherwise surface as a silently dropped
field on a catalogue somebody has already paid to extract.

### Working without re-running it

Extracting a catalogue costs minutes and money, which is a bad thing to depend on while building a
feature. `npm run demo:export` freezes an already-extracted catalogue into `fixtures/`, and
`npm run demo:load` puts it back:

```
extraction   180s   $2.16
demo:load      0.8s     $0     identical result
```

The capture is written in extract_lib's own shape — `catalog.json`, a figure manifest, the figure
PNGs, and the source PDF — and the loader hands it to `ingestSupplierCatalogue` as a pre-extracted
run. Only the Python stage is skipped; mapping, confidence scoring, promotion, figure storage and
the matching re-run are all the live code. A feature tested against a reload is tested against the
importer that runs on a real upload, and a round trip reproduces the original exactly: the same
attributes, the same 96/100 confidence split across 89 articles, the same 116 figure links.

Loading refuses if that manufacturer already has rows, so it cannot quietly double a catalogue.
Captures are gitignored — a real manufacturer's PDF and product photography is their copyright, not
this repo's to redistribute.

`demo:load` restores **both** halves. The frozen capture is the supplier side; after loading it
the loader uploads the first hospital demand file it finds — the real article master under
`assets/`, else `samples/hospital-hochrisiko-bedarf.csv` — through the same importer the cockpit
uses. A spreadsheet is parsed in-process, so that half costs nothing and needs no key. It is
skipped if the hospital already has lines, so reloading cannot double them.

This matters because `db:reset` clears both sides. Before, the only documented way back to a
populated hospital was to re-upload by hand, which left `demo:load` producing a platform with a
catalogue and no demand at all.

### One part number is one article

A catalogue states an article more than once. The product tables carry the dimensions, the pack
sizes and the photography; an appendix at the back — *Pharmazentralnummern*, three pages of it —
restates the same part numbers against the German national article number. extract_lib reads both,
correctly: they are both tables, and its rule is one record per table row.

They are not two products. Imported as two, half the catalogue arrived as twins carrying the
appendix's 26-character SAP short text and nothing else:

```
BD Eclipse™ Sicherheitsinjektionskanülen mit SmartSlip™-Technologie   ← the product table
BD ECLIPSE SICHER21G 1 1/2                                            ← the same article, page 20
```

The second has no dimensions, no pack size and no photograph, and it competed with the first in
search and in matching. **175 rows fold to 89 articles**, all 85 duplicates accounted for and none
of them new. The richest row wins the identity — most descriptive columns, then photography, then
the earlier page — and the others are merged into it, so the appendix contributes the one thing it
alone knows. Every article now carries its `pzn`, which is an exact identifier and therefore the
cheapest layer of the §8 pipeline, rather than a duplicate.

Folding happens in the importer, not in the extractor. Only the importer sees the whole document at
once, and it is deterministic: a row can be merged but never dropped. Teaching the extractor to
recognise an appendix would mean letting a page-at-a-time judgement call decide whether to emit
rows at all, and a misjudgement there loses data silently.

### A name has to identify the article

The catalogue prints a family name once, above the table, and identifies the row by the table
around it. Copied out literally all eight sizes of a needle arrive under one name — unusable in a
listing, in a search result and on a recommendation card alike.

So a family's rows are distinguished by what actually varies within that family, added in the order
a buyer would reach for it — size, then volume, then fitting, then length — and stopping as soon as
the names are unique. A family whose rows differ only in size gains only the size:

```
BD Eclipse™ Sicherheitsinjektionskanülen mit SmartSlip™-Technologie, 21 G 1 1/2"
```

Nothing is invented: every added value is a cell of that row's own table. Where varying columns
still leave two rows identical — one article listed twice under different order codes — only the
rows that actually collide pay for it with a part number in the name.

### Attributes come from the table, not from the prose

`promoteToCanonical` infers attributes from the product name first, then overwrites them with the
row's actual columns wherever extract_lib supplied them — a stated `Außendurchmesser (mm) 0,4` beats
one parsed out of a name. Across the BD catalogue that took the attribute count from 225 to 379 and
removed a class of false positives outright (`Länge (mm) 13` had been yielding `size: "L"`).

Wall thickness earned a place among the discriminating attributes as a result: two cannulas agreeing
on gauge, outer diameter and length but differing on `wall` are not the same needle, and the column
that says so only became readable once tables were read column-wise.

### Product images: the figure is the table's, the part is the article's

Figures come back attached to the SKUs they depict, with the model's own `confidence` in that call —
a photo may sit in the whitespace of one table while depicting a product from another. They are
stored as bytes in `product_images` (not on disk: a horizontally scaled deployment has no shared
volume) and served from `/api/product-images/[id]`.

**The grain of a figure is a table, and the grain a SKU needs is an article.** `assets.py` groups
overlapping image placements into one figure, which is right — a product shot is frequently several
bitmaps plus vector art and a drop shadow. But a catalogue lays a family out as a *cascade*, whose
bounding boxes overlap heavily while the articles themselves do not. Page 13 places eleven syringes
that way; the union made them one picture, and all eleven rows got it. Twenty-four figures were
doing duty for ninety articles.

So the union stays — whether several bitmaps are one tiled photo or several products is not
decidable from geometry — but the placements underneath it survive as addressable **parts**. Each
part crops to its own embedded bitmap, which in a cascade is the one clean picture of that article:
the page region around it still catches the neighbours it overlaps, and the bitmap does not.

Deciding which part is which row is the model's job, and it is given the one view that makes it
answerable — a **contact sheet** of the parts, numbered, drawn to a single common scale:

```
extract.run  ·  page render + annotated render + one contact sheet per multi-part figure
```

Boxing the parts on the figure itself does not work; in a cascade the boxes overlap so badly that
no label can be read against the right product. Side by side they are unambiguous, and holding the
scale common preserves the cue that separates a 1 ml syringe from a 50 ml one. The prompt also says
what the catalogue has been saying all along and nothing was reading: a `Farbcode` column against a
photo of coloured hubs names its rows outright.

Across the BD catalogue that took **24 distinct pictures to 47**, and `primary` assignments — *this
photo is this article* — from 7 to 25.

A row keeps both: the part that makes it specific, and the parent figure as a `shared` family shot.
They are ranked apart, confidence first and then specificity, so a confident family shot beats an
uncertain guess at the individual size. The hospital product page shows the real photograph where
one exists and falls back to the ECLASS category drawing where it does not — and says which it is
showing, including when the photograph is of the family rather than of that size. A figure the
model called `likely` or `uncertain` is labelled as such, because a guess displayed silently as
*this* product's picture is the one failure mode that matters here.

---

### Pricing is typed, not derived

**Pricing** lists every product against one price column and a **Set pricing** button. A flat
price and a volume ladder are the same thing at different lengths, so they share that column
rather than being split across a headline figure and the breaks that override it.

A row is entered as a *floor* — the quantity it starts at, and the unit price from there up — and
the range it covers is derived from the next row rather than typed:

```
From (units)    Unit price
0               0.42          →   0 – 4'999      CHF 0.4200
5'000           0.38          →   5'000 – 24'999 CHF 0.3800
25'000          0.31          →   25'000+        CHF 0.3100
```

Entering both ends of a bracket invites a gap — 250–499 priced by nothing — and there is no
sensible answer to give a hospital ordering 300. Floors cannot express one. The lowest tier is
pinned to zero for the same reason: every quantity somebody could order has to fall inside some
tier. Two tiers sharing a floor is refused; a price that *rises* with volume is allowed but
warned about, because it might be deliberate and the platform does not get to invent pricing
rules for a manufacturer.

The whole ladder is replaced in one submit rather than patched row by row — a half-saved ladder
is a price nobody quoted — and the dialog is portalled to the body, because `.card` carries
`backdrop-blur` and a backdrop-filter makes its element the containing block for anything
`fixed` inside it.

Two things this replaced. The page used to take one **base price** and derive a fixed four-step
ladder from it; that ladder is still what an uploaded catalogue price produces, but it is now a
starting point a manufacturer can edit rather than the only shape available. And both the pricing
table and the product page used to *recompute* the ladder from the first tier for display, which
told the truth only for as long as nobody could change it — they now read the stored tiers, which
are what hospitals are quoted.

## AI layer

One interface, two implementations (`lib/ai/index.ts`):

| | With keys | Without keys |
|---|---|---|
| Embeddings | Voyage 4, re-embedded when the model changes | token + trigram hashing |
| Reranking | Voyage reranker | weighted lexical score |
| Adjudication | `claude-opus-5`, structured outputs | attribute comparison |
| Substitution review | `claude-opus-5`, adaptive thinking | attribute + risk-class rules |
| Replacement analysis | `claude-opus-5`, web search + fetch | attribute, price and risk-class rules |
| Suggestion gate (stage 3) | Jev via OpenRouter | word overlap on product-type terms |

The adapter label reports **what actually answered**, not what is configured. A key that is present
but rejected shows as `stub-adjudicate (claude-opus-5 key rejected)` rather than silently crediting
the model for output the fallback produced — the same failure mode as an invented price.

```bash
cp .env.example .env    # add ANTHROPIC_API_KEY / VOYAGE_API_KEY to run live
```

The pipeline never branches on which is active, so the demo works either way and `/admin` shows
which adapter is running. Adjudication uses `client.messages.parse()` with `zodOutputFormat`, so the
response is schema-validated at the decoding level:

```ts
relation: "identical" | "equivalent" | "not_equivalent"
```

Three-valued on purpose. `identical` routes to an identity match with no clinical gate; `equivalent`
routes to substitution and meets the risk-weighted bar. Collapsing them to a boolean loses the most
important distinction in the model.

Structured outputs guarantee **syntax, not accuracy** — the model can still be confidently wrong,
which is what the human gates are for.

---

## Finding a replacement

The path a buyer actually walks, and the one the product page is built around:

1. **Find it** — in the suggestion feed, or by typing into the search bar. Both render the same tile.
2. **Open it** — every tile links to `/hospital/products/[id]`, carrying the article-master line it
   would replace. Image left, specification and direct price right.
3. **Open problems** — the tab runs a Claude comparison of your line against the candidate and
   returns a worklist: what differs, what is unstated on either side, and what MDR class demands
   regardless. It spins while it thinks, and is cached on the (line, product) pair so reopening the
   page is a read, not another call.
4. **Resolve each one** — **Cleared** asks you to confirm, then takes it off the worklist.
   **Send to supplier** puts it in this hospital's thread with that manufacturer, who answers it in
   `/supplier/messages`; the answer comes back on the question.

Two things the comparison will not do. It does not treat a missing attribute as agreement — an
attribute neither side states becomes a question, because silence is the case that looks safe and
is not. And at MDR IIb or III a cross-brand swap always raises a clinical sign-off and a conformity
question, even when every attribute the platform holds happens to match.

**Cleared keeps the row.** The question moves to `status='cleared'` with who cleared it and when,
rather than being deleted. It leaves the worklist and is never sent to the manufacturer — but a
clinical question that was waved away is exactly what an audit needs to be able to see.

## Messages

Both portals have a **Messages** tab laid out like Teams or Slack: conversations on the left, the
open one on the right, the composer pinned under it. There is one conversation per hospital and
manufacturer pair. A manufacturer sees only what this hospital wrote to it, and neither side sees
the other's conversations with anyone else. On a phone it is one pane at a time, the list or the
conversation with a back arrow, as in the mobile apps.

**A question is a message with a job.** Every question a hospital sends reaches the manufacturer
as a card in their conversation. It names the product and the hospital's line it would replace,
says whether it **blocks the order**, and shows where it stands: waiting, answered, or signed off.
The questions come from three places: a replacement analysis point, an Open problems question, or
one asked on a recommendation. **Answer** on the card makes the reply answer *that* question. Before,
a reply answered "the most recent question", which was the wrong one as soon as two were open.
Answering a blocking question on a recommendation lifts its block, the §5 red gate. The reply
shows the question it belongs to above it, and clicking that jumps back to the card. The header's
"open questions" pill jumps to the first one still waiting.

This replaced the supplier's separate **Questions** tab, which listed the same questions with none
of the conversation around them; `/supplier/questions` now redirects to Messages. A question a
hospital types on a recommendation goes straight into its conversation with that manufacturer. One
the matching engine *drafted* waits on the recommendation with a **Send to supplier** button, so a
manufacturer never receives a question nobody at the hospital decided to ask.

- **Unread** counts appear per conversation and on the sidebar tab. Opening a conversation reads
  it, and writing in it counts as reading it. Read state is one row per reader and conversation
  (`chat_reads`).
- **Live.** Each page polls a small fingerprint of its inbox every four seconds and re-renders when
  it changes, so a message from the other portal appears without a reload.
- **Sending** is optimistic: the message shows at once as "Sending…". If it fails, the error is
  shown and the text goes back into the composer. Enter sends and Shift + Enter adds a new line.
  The thread stays pinned to the newest message unless the reader has scrolled up, in which case an
  arriving message does not move them.
- **Who writes is the session's answer.** The supplier portal writes as its signed-in manufacturer
  and the hospital portal as its hospital. The client only names the other side. A manufacturer can
  only reply to a hospital that wrote to it, never start a conversation; a hospital can start one
  with any manufacturer that has products on the platform (the pencil above the list).

## Search

The cockpit's search box finds what a buyer meant, in the language they typed it in.
`lib/search.ts` runs three layers and merges them by score:

| Layer | Finds | Cost |
|---|---|---|
| Identifier | an exact GTIN, PZN, UDI-DI or article number, and nothing else | free |
| Words | every query word in the product name, maker or category (typos allowed), plus a glossary from English, French, Italian and Spanish into the German the catalogues use | free |
| Meaning | a Voyage query vector against every product's vector, then the Voyage reranker over the 40 nearest | two Voyage calls, ~0.5–3 s |

Measured on the BD catalogue: "seringue", "siringa luer lock" and "syringe 10 ml" all find the
syringes, and the 10 ml query finds only the 10 ml ones. "aiguille", "safety needle" and
"Sicherheitskanüle" find the needles, "Kanule" finds "Kanüle", and a PZN finds its one article.
"latex gloves", "surgical mask" and "hip implant" return **nothing**, because nobody has uploaded
gloves, masks or implants. A search that always answers is one whose answers mean nothing, so a
meaning-only hit needs reranker relevance of at least 45 (`SEARCH_MIN_RELEVANCE`) and has to be
within 70% of the best hit.

**A hit says how it was found.** A product found by meaning or through translation carries a
**close match** chip, so a near match is never read as the article the buyer named. The results
line says which terms the glossary added and what answered the meaning layer. Without a Voyage key
the words layer and glossary carry the other languages alone, and the line says so.

**Every vector records what made it.** The catalogue had been embedded without a key: `demo:load`
runs without `.env`, so its products held the keyless fallback's 256-dimension hashes. Nothing
re-embedded them once a key existed, so every Voyage comparison (search, and stage 2 of the
suggestion pipeline) was hashed letters against a language model. That produces a number that
looks like a similarity and is not one. Each vector now carries `embedding_model` (the model that
actually answered, plus the version of the text it was made from). Anything that no longer matches
what would answer now is re-embedded before it is compared: 89 products in about two seconds on
the first search after the fix. `cosine` refuses vectors of different lengths instead of comparing
their first 256 dimensions.

A product is embedded from its maker, its name, its category in German and English ("Kanüle /
needle") and its physical attributes. Identifiers are left out: a PZN is the identifier layer's
job, and in semantic text it is a long number that matches nothing.

## Automatic suggestions

The cockpit should already have suggestions when a hospital opens it. The platform gets there
without comparing every line of the article master against every product in every catalogue:
that is O(lines × products), and most of those pairs are a syringe next to a plaster.
`lib/matching/suggest.ts` runs the pairs through four stages, cheapest first. Each stage only sees
what the one before it kept.

```
890 pairs   10 lines × 89 products, measured on the real xlsx and the BD catalogue
 73         1  rule-based blocking     free        category, standard codes, unit, dimensions
 68         2  embedding retrieval     Voyage      top 10 nearest per line
  7         3  Jev gate                $0.0016     "same kind of product?" at ≥ 0.65
  2         4  Claude adjudication     7 calls     identical / equivalent / not_equivalent
  1         +  full analysis           1 call      the Replace-with-this analysis, top match only
```

Both matches were right. The more interesting one is `Kanüle Sterican 0,8 × 40 mm` →
*BD Microlance 21 G 1½"*, the cross-brand version of the article-number finding above. The drops
were right too: Claude rejected Luer-slip syringes against a Luer-Lock line and safety needles
against a standard one, and Jev gated out non-sterile oral syringes at 0.34.

- **Stage 1 blocks only on facts both sides state.** It compares standard codes (UNSPSC at class
  level, ATC at level 4, GMDN exactly), dosage form, unit family (count vs. volume vs. mass), and
  any dimension both sides carry that disagrees (gauge, volume, diameter, length). Category is
  derived *the same way on both sides* from the name, because a hospital's free text only compares
  with a catalogue name read the same way, not with a code a catalogue happened to state. A shared
  GTIN, or a line already harmonised to the product, is an identical match on the spot, with no
  model call. None of the uploaded files carry UNSPSC, GMDN or ATC yet; the rules apply once one
  does.
- **Stage 3 asks Jev about kind, never about numbers.** Jev (TypeSafe, via OpenRouter's
  `POST /api/alpha/decisions`) answers a typed yes/no question with a probability. It is told to
  ignore sizes, because a 2 ml and a 10 ml syringe *are* the same kind of product, and telling them
  apart is arithmetic, which stage 1 already did. The probability is what gets thresholded
  (`JEV_THRESHOLD`, default 0.65); the label is not used.
- **Stage 4 is the same adjudication the §8 pipeline uses**, on at most `SUGGEST_TOP_K` pairs
  per line that Jev let through. Each line's best match then gets the full web-searched analysis
  "Replace with this" runs. The card shows "analysing…" and then its blocking count. Choosing that
  product later **adopts the analysis instead of running it again**, provided the pair's data has
  not changed since.
- **Substitution recommendations come from here.** A matched "equivalent" pair with a price
  becomes an orderable substitution card; the risk-weighted gate of §2 applies as before. There is
  no longer a product-to-product equivalence graph: it compared every catalogue product with every
  other brand's in the same category, up to 600 Claude calls per upload, with no cheap stage in
  front, and inside the upload request. The same question is now asked once per hospital line,
  after the rules, retrieval and Jev have cut the field.
- **Unpriced matches are suggested, marked "no price yet".** The BD catalogue has no prices, and a
  match is worth knowing about before its manufacturer sets one. A pair that a priced, orderable
  recommendation already covers is not shown twice.

It runs by itself after every hospital or catalogue upload, scheduled with `after()` so the upload
returns at once. `/admin/pipeline` shows each run's funnel and a **Run suggestions now** button.
`npm run suggest` runs it from the terminal, reading keys from `.env`. That is how to fill a
database loaded with `demo:load`, which stays free and makes no model calls.

**Paying once.** Every Jev score, Claude verdict and analysis is stored with a hash of the exact
input it was computed from, so a re-run pays only for pairs that are new or whose data changed. A
second run on unchanged data made 0 calls and reused 76 results. The same results go to
`fixtures/matches/cache.json` (gitignored, like the other captures), which outlives `db:reset`: a
run after wiping every pair made 0 calls. Only live results are cached, so a deterministic fallback
can never later stand in for the model. `fixtures/matches/latest.json` is the last run written out
for a person to read: every pair that reached a paid stage, with its scores and verdict. That makes
it labelled data for retuning the thresholds.

**Auditing drops.** Every dropped or rejected pair keeps its stage and reason in `match_pairs`, and
`/admin/pipeline` lists them closest-call first, filterable by stage. Recording the free-stage drops
is for tuning only; `SUGGEST_LOG_DROPS=0` turns it off.

| Setting | Default | |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Jev; without it a word-overlap gate runs, labelled `stub-gate` |
| `JEV_MODEL` | `typesafe/jev-1.13` | |
| `JEV_THRESHOLD` | 0.65 | Tune on labelled pairs (`latest.json`) before trusting it |
| `SUGGEST_TOP_K` | 10 | Stage 2 neighbours kept per line |
| `SUGGEST_MIN_CONFIDENCE` | 60 | Below this an "equivalent" is not suggested |
| `SUGGEST_ANALYSE` | on | `0` skips the full analysis of best matches |
| `SUGGEST_LOG_DROPS` | on | `0` stops recording stage 1–2 drops |
| `SUGGEST_CACHE` | on | `off` neither reads nor writes the file cache (`npm run verify` sets this) |

Jev is new (September 2026) and its threshold is a reasoned default, like the others in §2. Pilot
it against labelled pairs before relying on it, and revisit it as the catalogues grow.

## Choosing a replacement

Browsing a product is not a decision; **Replace with this** is. The button sits top right on every
hospital product page, level with the title. It opens a dialog with one dropdown — which line of
your own catalogue this product replaces — and a **Confirm**.

1. **Confirm records the choice at once.** One replacement per line: choosing a different product
   for the same line switches it, and the dialog says so before you confirm.
2. **The match is calculated in the background.** The dialog tells you it has started and hands you
   back to the product page, which now compares against the line you chose and shows the analysis
   arriving. It takes a minute or two. The server action schedules it with `after()` so the request
   returns straight away, and the page polls a status action until the run lands.
3. **Catalogue lists it under the line it replaces**, with its state: calculating, *n* open points
   (blocking counted separately), or all signed off. The row opens the product page on its points.
4. **Each point is signed off or sent.** **Sign off** records that the hospital accepts the switch
   despite the point, with who and when. A safety point is recorded as the clinical approver's
   sign-off, not the buyer's (the §5 clinical gate). **Send to supplier** puts the point's question
   in this hospital's thread with the manufacturer, and their answer comes back on the point, which
   still needs signing off.

5. **Order it.** Once the analysis is done and every blocking point is signed off, **Order this
   replacement** sends it into the ordinary §5 chain: clinical sign-off first where a change of
   article at MDR IIb/III requires it, then budget approval, then the pool. Non-blocking points do
   not hold an order up, as non-blocking questions never did. It needs a price on both sides; an
   unpriced product says so on the button instead of ordering.

The order hangs off a recommendation like every other order, so approvals, pooling and fulfilment
needed no change. Those recommendations carry `origin='replacement'` and are never rebuilt away.
A recommendation's "what the hospital buys today" became nullable for this, because a buyer can
order a replacement for a line that never matched any catalogue. On an existing database the table
is rebuilt once (copied, not recreated), with every row and id carried over. It is priced at the
pool's current tier, as every order is; the analysis quoted the tier the hospital reaches alone,
which is never lower. An ordered replacement cannot be withdrawn or re-analysed under its order.
Rejecting the order under **Approvals** hands it back to the buyer, still chosen, to order again
or withdraw.

### The analysis (`analyseReplacement` in `lib/ai/index.ts`)

One Claude call (`claude-opus-5`, adaptive thinking, structured output) with **web search and web
fetch** enabled. It covers four areas and files every point under one of them:

| | Looks at |
|---|---|
| **Safety** | MDR class, sterility, latex/DEHP/PVC, needle-stick protection, CE marking, recalls and field safety notices |
| **Replaceability** | dimensions, connector, material, compatibility, pack size and order unit, availability, discontinuation |
| **Price** | the platform's own price comparison: dearer, unpriced, not on the same unit or currency, implausibly cheap |
| **Correctness** | whether the platform's record matches what the manufacturer publishes, and whether the hospital's line was read correctly |

Each point carries a short title, an explanation for the buyer, blocking or not, who can settle it
(the hospital, or the manufacturer), the question as it would reach the manufacturer, and its
sources. Three rules keep this in line with the rest of the platform:

- **Price is arithmetic, not model output.** `lib/replacement.ts` computes the comparison from the
  hospital's file and the manufacturer's stated tiers and hands it in as facts. The model is told
  not to recompute or search for a price. It prices at the tier the hospital's *own* volume reaches,
  never the pool's. That price holds whatever peers do, so the saving cannot be overstated, and the
  pool's position stays out of text a buyer reads.
- **A source has to have been retrieved.** A URL the model cites that did not appear in its own
  search or fetch results is dropped. It is the extractor's rule for part numbers, applied to links.
- **It says what answered.** The adapter label and the number of web searches are stored with the
  run. Without a key, a deterministic analysis runs over the attributes the platform holds, labelled
  `deterministic analysis (no web search)`.

Measured on a deliberately wrong pairing (a 10 ml Luer-Lock syringe against a BD Eclipse needle):
about 80 s, 6 searches, 10 points. The first point, blocking, was that the replacement is a needle
and not a syringe, citing BD's own product page.

A re-run replaces the analysis's own untouched output but never a point somebody signed off, sent
or had answered. Switching or withdrawing a replacement keeps those points too, detached from it.
Deleting the line or the product removes its replacement. A run cut off by a restart shows as
failed after 15 minutes and can be retried.

---

## Layout

```
app/
  page.tsx           portal chooser — the whole landing page
  hospital/          cockpit (search · suggestions · orders)
                     catalogue (products of interest, deletable) · documents (upload ·
                     files · the two confidence gates) · approvals
                     products/[id] (replace with this · overview · previous replacements ·
                     open problems, or the replacement analysis once one is chosen)
                     recommendation detail
  supplier/          catalogue · products/[id] (tiers · picture · description) · upload
                     volume pricing · messages (one conversation per hospital)
  admin/             overview · matching pipeline · uploaded documents
  components/        Sidebar (collapsible rail) · PortalShell · Brand · DotGrid
                     SavingsCard · ProductShot · OpenProblems · SearchBar
                     ReplaceWithThis · ReplacementReview · Messenger
                     UploadForm · icons · ui
  api/documents/     serves the stored original of any uploaded file
lib/
  ingest/            xlsx, csv and zip parsing; extract-lib.ts (the Python bridge),
                     catalog-import.ts (rows → articles: folding, naming, columns),
                     product-images.ts
  ai/                embeddings, reranking, adjudication (live + deterministic)
  messaging.ts       hospital ⇄ manufacturer conversations, question cards, read state
  search.ts          product search: identifier · words + glossary · meaning (Voyage + reranker)
  matching/          pipeline.ts (§8) · recommend.ts (§1.6) · thresholds.ts (§2) · category.ts
                     suggest.ts (automatic suggestions) · match-cache.ts (paid results on disk)
  pooling.ts         tiers, pool state, savings bands (§1.5, §4)
  workflow.ts        the §5 state machine and upload handlers, framework-free
  replacement.ts     choosing a replacement, its analysis and sign-off, framework-free
  actions.ts         thin server-action wrappers around workflow.ts
  queries.ts         read models
db/schema.sql        §1 as DDL — SQLite, shaped to port to Postgres + pgvector
scripts/
  seed.ts            organisations and users only
  suggest.ts         run the suggestion pipeline and print its funnel
  verify.ts          144 assertions, against its own db (SANOVIO_DB)
  check-extract-schema.ts  importer vs extract/schema.py
  export-fixture.ts  freeze an extracted catalogue
  load-fixture.ts    put it back, without Python or a key
fixtures/            frozen captures (gitignored)
samples/             files to upload; see samples/README.md
```

`lib/workflow.ts` has no Next.js import on purpose: the state machine is domain logic, so it can be
driven directly by `scripts/verify.ts` rather than only through a rendered form.

---

## Known limitations

- **Vector search is a linear scan.** Fine at this scale, wrong at catalogue scale — the schema is
  shaped so `embedding BLOB` becomes `vector(1024)` with an HNSW index on Postgres.
- **Coverage is bounded by what suppliers have uploaded.** The two real catalogues cover syringes
  and cannulas only, so the hospital's gloves, masks, wound sets and wipes stay unmatched. That is
  the correct behaviour, not a bug — but it means the demo looks thin until more catalogues exist.
- **A catalogue PDF cannot be ingested without a working `ANTHROPIC_KEY`.** `extract_lib`'s figure
  stage runs without one; the extraction stage does not, and the upload fails with that message
  rather than falling back to something that guesses. Spreadsheets are unaffected.
- **A PDF upload blocks for minutes.** The extractor runs synchronously inside the server action —
  22 pages is a few minutes and a couple of dollars. A production deployment wants this on a queue.
- **A near-tie between two candidates is resolved silently.** `Injekt® Luer Lock Solo 10 ml` and
  `Omnifix® Luer Lock Solo 10 ml` both score 87 against the hospital's line and only the top hit is
  taken. Real ambiguity should raise a question, the way blocking questions already do.
- **ECLASS codes are placeholders** unless a CSV states one. Production should carry real ECLASS and
  use it as the substitution-candidate gate — it is used that way, with invented codes.
- **No authentication.** Roles exist in the schema and drive the approval chain; each portal assumes
  whoever is looking holds the relevant role.
- **Thresholds are reasoned defaults, not measured.** They need an eval set of labelled pairs before
  the specific numbers mean anything.
- **Pool lock is manual.** No scheduler, no commitment enforcement — see the open items in the
  structure document.
