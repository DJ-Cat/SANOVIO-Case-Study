-- SANOVIO platform schema. Mirrors §1 of SANOVIO Plattformstruktur.md.
-- SQLite for zero-config demo; column types chosen to port to Postgres cleanly
-- (TEXT ids -> uuid, TEXT timestamps -> timestamptz, embedding BLOB -> vector).

PRAGMA foreign_keys = ON;

-- §1.1 -----------------------------------------------------------------
CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('hospital','supplier','sanovio')),
  country       TEXT,
  city          TEXT,
  -- suppliers only: is this the original manufacturer or a distributor?
  channel       TEXT CHECK (channel IN ('manufacturer','distributor'))
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL CHECK (role IN
                    ('hospital_buyer','hospital_approver','hospital_clinical',
                     'supplier_user','sanovio_admin')),
  organization_id TEXT NOT NULL REFERENCES organizations(id)
);

-- §1.3 canonical product: the harmonisation layer ------------------------
CREATE TABLE canonical_products (
  id                TEXT PRIMARY KEY,
  canonical_name    TEXT NOT NULL,
  manufacturer_id   TEXT REFERENCES organizations(id),
  gtin              TEXT,
  udi_di            TEXT,
  eclass_code       TEXT,
  base_uom          TEXT NOT NULL,
  base_pack_size    INTEGER NOT NULL DEFAULT 1,
  mdr_risk_class    TEXT NOT NULL CHECK (mdr_risk_class IN ('I','IIa','IIb','III')),
  attributes        TEXT NOT NULL DEFAULT '{}',   -- JSON
  -- Written by the manufacturer on its own product page. A catalogue PDF's
  -- prose belongs to a family, not a SKU, so this starts empty and stays empty
  -- until somebody who knows the article types something.
  description       TEXT,
  embedding         BLOB,                          -- Float32Array; -> vector(1024)
  embedding_model   TEXT,                          -- model + text version that made it
  verified_by       TEXT REFERENCES users(id),
  verified_at       TEXT
);
CREATE INDEX idx_cp_gtin ON canonical_products(gtin);
CREATE INDEX idx_cp_eclass ON canonical_products(eclass_code);

-- §1.2 raw extracted items ----------------------------------------------
CREATE TABLE source_documents (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  filename        TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('hospital_demand','supplier_catalogue')),
  content_type    TEXT,
  byte_size       INTEGER NOT NULL DEFAULT 0,
  -- The uploaded file is kept verbatim: extraction is re-runnable, and an
  -- audit of a savings claim has to be able to reach the original document.
  file_bytes      BLOB,
  uploaded_by     TEXT REFERENCES users(id),
  uploaded_at     TEXT NOT NULL,
  row_count       INTEGER NOT NULL DEFAULT 0,
  note            TEXT
);

CREATE TABLE supplier_catalog_items (
  id                     TEXT PRIMARY KEY,
  supplier_id            TEXT NOT NULL REFERENCES organizations(id),
  source_document_id     TEXT REFERENCES source_documents(id),
  extracted_name         TEXT,
  extracted_sku          TEXT,
  extracted_price        REAL,
  extracted_spec         TEXT,
  extracted_gtin         TEXT,
  extracted_udi_di       TEXT,
  extracted_pack_size    INTEGER,
  extracted_uom          TEXT,
  currency               TEXT NOT NULL DEFAULT 'CHF',
  extraction_confidence  INTEGER NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('unchecked','active','linked')),
  canonical_product_id   TEXT REFERENCES canonical_products(id),
  corrected_by           TEXT REFERENCES users(id),
  corrected_at           TEXT,
  raw_extraction_payload TEXT,
  created_at             TEXT NOT NULL
);
CREATE INDEX idx_sci_status ON supplier_catalog_items(supplier_id, status);

CREATE TABLE hospital_purchase_items (
  id                     TEXT PRIMARY KEY,
  hospital_id            TEXT NOT NULL REFERENCES organizations(id),
  source_document_id     TEXT REFERENCES source_documents(id),
  internal_id            TEXT,
  extracted_name         TEXT,
  extracted_sku          TEXT,
  extracted_brand        TEXT,
  extracted_spec         TEXT,
  extracted_gtin         TEXT,
  extracted_ean          TEXT,
  extracted_pack_size    INTEGER,          -- Basismengeneinheiten pro BME
  extracted_order_uom    TEXT,             -- Bestellmengeneinheit
  extracted_uom          TEXT,             -- Basismengeneinheit
  declared_mdr_class     TEXT,
  annual_volume          INTEGER,          -- Jahresmenge, in order units
  current_unit_price     REAL,             -- Netto-Zielpreis, per base unit
  currency               TEXT NOT NULL DEFAULT 'CHF',
  current_supplier_name  TEXT,
  extraction_confidence  INTEGER NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('unchecked','active','linked')),
  canonical_product_id   TEXT REFERENCES canonical_products(id),
  corrected_by           TEXT REFERENCES users(id),
  corrected_at           TEXT,
  raw_extraction_payload TEXT,
  created_at             TEXT NOT NULL,
  -- The suggestion pipeline's Stage 2 vector for this line; see match_pairs.
  embedding              BLOB,
  embedding_model        TEXT
);
CREATE INDEX idx_hpi_status ON hospital_purchase_items(hospital_id, status);

-- §1.4 item -> canonical product ----------------------------------------
CREATE TABLE item_links (
  id                   TEXT PRIMARY KEY,
  item_type            TEXT NOT NULL CHECK (item_type IN ('hospital','supplier')),
  item_id              TEXT NOT NULL,
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  link_confidence      INTEGER NOT NULL,
  link_method          TEXT NOT NULL CHECK (link_method IN
                         ('gtin_exact','udi_exact','sku_exact','reranked',
                          'llm_adjudicated','human')),
  status               TEXT NOT NULL CHECK (status IN ('proposed','confirmed','rejected')),
  rationale            TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX idx_il_item ON item_links(item_type, item_id);

-- §1.5 the buying group --------------------------------------------------
CREATE TABLE price_tiers (
  id                   TEXT PRIMARY KEY,
  supplier_id          TEXT NOT NULL REFERENCES organizations(id),
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  min_volume           INTEGER NOT NULL,
  unit_price           REAL NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'CHF',
  -- Where the price came from: 'catalogue' was stated in the uploaded file,
  -- 'supplier' was entered by a human in the portal. The platform never
  -- invents a price, so a product with no stated price simply has no tiers.
  origin               TEXT NOT NULL DEFAULT 'supplier'
                         CHECK (origin IN ('catalogue','supplier')),
  valid_from           TEXT,
  valid_until          TEXT
);
CREATE INDEX idx_pt_lookup ON price_tiers(canonical_product_id, supplier_id, min_volume);

CREATE TABLE demand_pools (
  id                   TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  supplier_id          TEXT NOT NULL REFERENCES organizations(id),
  period               TEXT NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('forming','locked','contracted')),
  locks_at             TEXT,
  created_at           TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_dp_key ON demand_pools(canonical_product_id, supplier_id, period);

CREATE TABLE pooled_demand (
  id             TEXT PRIMARY KEY,
  demand_pool_id TEXT NOT NULL REFERENCES demand_pools(id),
  hospital_id    TEXT NOT NULL REFERENCES organizations(id),
  annual_volume  INTEGER NOT NULL,
  commitment     TEXT NOT NULL CHECK (commitment IN ('indicative','committed')),
  committed_at   TEXT
);
CREATE UNIQUE INDEX idx_pd_key ON pooled_demand(demand_pool_id, hospital_id);

-- §1.6 recommendations ---------------------------------------------------
CREATE TABLE recommendations (
  id                               TEXT PRIMARY KEY,
  type                             TEXT NOT NULL CHECK (type IN ('identity','substitution')),
  hospital_id                      TEXT NOT NULL REFERENCES organizations(id),
  hospital_item_id                 TEXT NOT NULL REFERENCES hospital_purchase_items(id),
  -- What the hospital buys today, as a harmonised product. Null when the line
  -- never resolved to one: a buyer can still choose and order a replacement
  -- for a line nobody's catalogue carries, and inventing a "current product"
  -- for it would be a claim nothing supports.
  canonical_product_id             TEXT REFERENCES canonical_products(id),
  recommended_canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  supplier_id                      TEXT NOT NULL REFERENCES organizations(id),
  demand_pool_id                   TEXT REFERENCES demand_pools(id),
  baseline_unit_price              REAL NOT NULL,
  offered_unit_price               REAL NOT NULL,
  savings_amount                   REAL NOT NULL,   -- annual, base units
  savings_pct                      REAL NOT NULL,
  match_confidence                 INTEGER,          -- substitution only
  rationale                        TEXT,
  differing_attributes             TEXT NOT NULL DEFAULT '[]',
  requires_clinical_review         INTEGER NOT NULL DEFAULT 0,
  status                           TEXT NOT NULL CHECK (status IN
                                     ('new','dismissed','in_progress','blocked','ordered')),
  dismissed_reason                 TEXT,
  -- 'pipeline': generated from matching and rebuilt on every run while nobody
  -- has acted on it. 'replacement': created when a buyer ordered the product
  -- they chose with "Replace with this" — a decision, never regenerated.
  origin                           TEXT NOT NULL DEFAULT 'pipeline'
                                     CHECK (origin IN ('pipeline','replacement')),
  created_at                       TEXT NOT NULL,
  updated_at                       TEXT NOT NULL
);
CREATE INDEX idx_rec_hospital ON recommendations(hospital_id, status);

-- §1.7 -------------------------------------------------------------------
-- Product photography recovered from a catalogue PDF by extract_lib.
--
-- The figure -> product association is the model's, not geometry's: one photo
-- often shows several SKUs, and a photo may sit in the whitespace of one table
-- while depicting a product from another. `confidence` is the model's own
-- honesty about that call, and 'uncertain' is shown to a human rather than
-- silently displayed as this product's picture.
CREATE TABLE product_images (
  id                   TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  source_document_id   TEXT REFERENCES source_documents(id),
  figure_id            TEXT NOT NULL,        -- e.g. 'p10_fig1', from the manifest
  page                 INTEGER,
  role                 TEXT NOT NULL CHECK (role IN
                         ('primary','variant','shared','detail','packaging')),
  region               TEXT,                 -- 'leftmost of three', when shared
  caption              TEXT,
  confidence           TEXT NOT NULL CHECK (confidence IN ('certain','likely','uncertain')),
  content_type         TEXT NOT NULL,
  byte_size            INTEGER NOT NULL,
  image_bytes          BLOB NOT NULL,
  created_at           TEXT NOT NULL,
  UNIQUE (canonical_product_id, figure_id)
);
CREATE INDEX idx_product_image_product ON product_images(canonical_product_id);

CREATE TABLE questions (
  id                TEXT PRIMARY KEY,
  -- A question raised inside the order workflow belongs to a recommendation.
  -- One raised by comparing a product a hospital is merely *looking at* has no
  -- recommendation yet, so this is nullable and the pair below carries it.
  recommendation_id TEXT REFERENCES recommendations(id),
  hospital_id       TEXT REFERENCES organizations(id),
  hospital_item_id  TEXT REFERENCES hospital_purchase_items(id),
  canonical_product_id TEXT REFERENCES canonical_products(id),
  supplier_id       TEXT REFERENCES organizations(id),
  type              TEXT NOT NULL CHECK (type IN ('blocking','non_blocking')),
  text              TEXT NOT NULL,
  asked_by          TEXT REFERENCES users(id),
  routed_to         TEXT NOT NULL CHECK (routed_to IN ('supplier','sanovio_internal')),
  answer_text       TEXT,
  answered_by       TEXT REFERENCES users(id),
  -- 'cleared' is the buyer deciding the question does not apply. The row is
  -- kept rather than deleted: a clinical question that was waved away is
  -- exactly the thing an audit needs to be able to see.
  status            TEXT NOT NULL CHECK (status IN ('open','answered','skipped','cleared')),
  origin            TEXT NOT NULL DEFAULT 'user'
                      CHECK (origin IN ('user','ai_drafted','ai_comparison')),
  sent_at           TEXT,
  cleared_at        TEXT,
  cleared_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL,
  -- Set on the points a replacement analysis raised (see `replacements`).
  -- Such a point carries a short title and a hospital-facing explanation;
  -- `text` stays what is sent to the manufacturer if the buyer asks them.
  replacement_id    TEXT REFERENCES replacements(id),
  category          TEXT,                 -- price | replaceability | safety | correctness
  title             TEXT,
  detail            TEXT,
  sources           TEXT                  -- JSON [{title,url}], each one actually retrieved
);

-- A product the hospital has chosen to replace one of its own lines with.
--
-- One per line: choosing a different product for the same line switches the
-- choice rather than stacking a second one. The analysis behind it runs in the
-- background after the choice is made, so its state is a column rather than
-- something the request that made the choice waits on.
CREATE TABLE replacements (
  id                   TEXT PRIMARY KEY,
  hospital_id          TEXT NOT NULL REFERENCES organizations(id),
  hospital_item_id     TEXT NOT NULL REFERENCES hospital_purchase_items(id),
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  selected_by          TEXT REFERENCES users(id),
  selected_at          TEXT NOT NULL,
  analysis_status      TEXT NOT NULL
                         CHECK (analysis_status IN ('pending','running','done','failed')),
  analysis_started_at  TEXT,
  analysis_finished_at TEXT,
  verdict              TEXT CHECK (verdict IN ('identical','equivalent','not_equivalent')),
  confidence           INTEGER,
  summary              TEXT,
  -- What actually answered, and how many web searches it ran. A deterministic
  -- run searches nothing and says so.
  adapter              TEXT,
  web_searches         INTEGER NOT NULL DEFAULT 0,
  sources              TEXT NOT NULL DEFAULT '[]',
  -- The price comparison is arithmetic, done here, not by the model: JSON of
  -- the figures the analysis was handed.
  price_facts          TEXT,
  error                TEXT,
  -- Set once the buyer orders it: the recommendation the order hangs off.
  recommendation_id    TEXT REFERENCES recommendations(id),
  ordered_at           TEXT,
  UNIQUE (hospital_item_id)
);
CREATE INDEX idx_replacement_product ON replacements(canonical_product_id);

-- One LLM comparison of a hospital line against a candidate product. Stored so
-- opening the same product twice does not pay for the call twice, and so the
-- questions it raised have somewhere to hang.
CREATE TABLE product_comparisons (
  id                   TEXT PRIMARY KEY,
  hospital_id          TEXT NOT NULL REFERENCES organizations(id),
  hospital_item_id     TEXT NOT NULL REFERENCES hospital_purchase_items(id),
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  verdict              TEXT NOT NULL
                         CHECK (verdict IN ('identical','equivalent','not_equivalent')),
  confidence           INTEGER NOT NULL,
  summary              TEXT NOT NULL,
  adapter              TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  UNIQUE (hospital_item_id, canonical_product_id)
);
CREATE INDEX idx_comparison_pair ON product_comparisons(hospital_item_id, canonical_product_id);

-- The hospital <-> supplier thread. One conversation per hospital/supplier
-- pair: a manufacturer sees what this hospital asked and nothing from any
-- other hospital.
CREATE TABLE chat_messages (
  id           TEXT PRIMARY KEY,
  hospital_id  TEXT NOT NULL REFERENCES organizations(id),
  supplier_id  TEXT NOT NULL REFERENCES organizations(id),
  question_id  TEXT REFERENCES questions(id),
  author_org_id  TEXT NOT NULL REFERENCES organizations(id),
  author_user_id TEXT REFERENCES users(id),
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_chat_thread ON chat_messages(hospital_id, supplier_id, created_at);

CREATE INDEX idx_q_rec ON questions(recommendation_id, status);

-- How far each side has read each conversation. One row per (reader org,
-- conversation); a message from the other side after last_read_at is unread.
CREATE TABLE chat_reads (
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  hospital_id  TEXT NOT NULL REFERENCES organizations(id),
  supplier_id  TEXT NOT NULL REFERENCES organizations(id),
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (org_id, hospital_id, supplier_id)
);

-- §1.8 -------------------------------------------------------------------
CREATE TABLE orders (
  id                     TEXT PRIMARY KEY,
  recommendation_id      TEXT NOT NULL REFERENCES recommendations(id),
  hospital_id            TEXT NOT NULL REFERENCES organizations(id),
  requested_by           TEXT NOT NULL REFERENCES users(id),
  demand_pool_id         TEXT REFERENCES demand_pools(id),
  volume                 INTEGER NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN
                           ('pending_clinical','pending_approval','approved','rejected',
                            'pooled','sanovio_fulfillment','fulfilled')),
  approver_id            TEXT REFERENCES users(id),
  approved_at            TEXT,
  clinical_approver_id   TEXT REFERENCES users(id),
  clinical_approved_at   TEXT,
  rejected_reason        TEXT,
  sanovio_fulfillment_ref TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_ord_hospital ON orders(hospital_id, status);

-- §1.9 -------------------------------------------------------------------
CREATE TABLE correction_log (
  id            TEXT PRIMARY KEY,
  item_type     TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  corrected_by  TEXT REFERENCES users(id),
  corrected_at  TEXT NOT NULL
);

-- observability for the matching pipeline (§8): which layer resolved what
CREATE TABLE match_runs (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  items_seen    INTEGER NOT NULL DEFAULT 0,
  by_identifier INTEGER NOT NULL DEFAULT 0,
  by_reranker   INTEGER NOT NULL DEFAULT 0,
  by_llm        INTEGER NOT NULL DEFAULT 0,
  to_review     INTEGER NOT NULL DEFAULT 0,
  llm_calls     INTEGER NOT NULL DEFAULT 0,
  adapter       TEXT NOT NULL
);

-- The suggestion pipeline: every hospital line against every supplier product,
-- cut down cheapest-first (lib/matching/suggest.ts).
--
--   1 rule-based blocking   free       category, standard codes, unit, dimensions
--   2 embedding retrieval   cheap      top-K nearest per line
--   3 Jev gate              ~$0.00002  "same kind of product?" as a probability
--   4 Claude adjudication   cents      identical / equivalent / not_equivalent
--   + full analysis         ~$1        the "Replace with this" analysis, top match only
--
-- One row per pair that reached a stage worth recording. The paid results
-- (Jev, Claude, analysis) carry the hash of the input they were computed from,
-- so a re-run pays again only for a pair whose data changed.
CREATE TABLE match_pairs (
  id                   TEXT PRIMARY KEY,
  hospital_id          TEXT NOT NULL REFERENCES organizations(id),
  hospital_item_id     TEXT NOT NULL REFERENCES hospital_purchase_items(id),
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  run_id               TEXT,
  -- Where the pair stands after the latest run.
  outcome              TEXT NOT NULL CHECK (outcome IN ('dropped','matched','rejected')),
  drop_stage           INTEGER,            -- 1-4 when dropped or rejected
  reason               TEXT,
  category_item        TEXT,
  category_product     TEXT,
  similarity           REAL,               -- stage 2 cosine
  rank                 INTEGER,            -- stage 2 position among the line's survivors
  jev_score            REAL,               -- stage 3 probability
  jev_adapter          TEXT,
  jev_hash             TEXT,
  relation             TEXT CHECK (relation IN ('identical','equivalent','not_equivalent')),
  confidence           INTEGER,
  rationale            TEXT,
  differing_attributes TEXT,
  adjudication_adapter TEXT,
  adjudication_hash    TEXT,
  -- The best match per line is analysed in full, as "Replace with this" would.
  is_top               INTEGER NOT NULL DEFAULT 0,
  analysis_status      TEXT CHECK (analysis_status IN ('pending','running','done','failed')),
  analysis_json        TEXT,
  analysis_hash        TEXT,
  analysis_error       TEXT,
  analysed_at          TEXT,
  dismissed_at         TEXT,
  updated_at           TEXT NOT NULL,
  UNIQUE (hospital_item_id, canonical_product_id)
);
CREATE INDEX idx_match_pairs_outcome ON match_pairs(hospital_id, outcome, is_top);

-- One pass of the suggestion pipeline and what each stage let through.
CREATE TABLE suggestion_runs (
  id              TEXT PRIMARY KEY,
  hospital_id     TEXT NOT NULL REFERENCES organizations(id),
  trigger         TEXT,
  status          TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  lines           INTEGER NOT NULL DEFAULT 0,
  products        INTEGER NOT NULL DEFAULT 0,
  pairs_total     INTEGER NOT NULL DEFAULT 0,
  after_stage1    INTEGER NOT NULL DEFAULT 0,
  after_stage2    INTEGER NOT NULL DEFAULT 0,
  after_stage3    INTEGER NOT NULL DEFAULT 0,
  matched         INTEGER NOT NULL DEFAULT 0,
  analysed        INTEGER NOT NULL DEFAULT 0,
  jev_calls       INTEGER NOT NULL DEFAULT 0,
  claude_calls    INTEGER NOT NULL DEFAULT 0,
  analysis_calls  INTEGER NOT NULL DEFAULT 0,
  reused          INTEGER NOT NULL DEFAULT 0,  -- paid results reused from the db or the file cache
  jev_cost        REAL NOT NULL DEFAULT 0,
  adapters        TEXT,
  error           TEXT
);
