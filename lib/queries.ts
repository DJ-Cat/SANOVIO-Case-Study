/** Read models for the UI. Kept apart from the write path in lib/actions.ts. */
import { db } from "./db";
import { savingsBand } from "./pooling";
import { EXTRACTION_THRESHOLD, LINK_THRESHOLD, SUBSTITUTION_THRESHOLD, type MdrClass } from "./matching/thresholds";
import type { ReplacementCategory, Source, ReplacementAnalysis } from "./ai";

export { HOSPITAL_ID } from "./constants";
import { HOSPITAL_ID, STALE_RUN_MS } from "./constants";

export interface RecCard {
  id: string; type: "identity" | "substitution";
  itemName: string; itemBrand: string | null; currentSupplier: string;
  recommendedName: string; supplierName: string; supplierId: string;
  /** What the hospital buys today; null when the line never resolved to a product. */
  canonicalId: string | null; recommendedCanonicalId: string; hospitalItemId: string;
  baseline: number; offered: number; currency: string;
  savingsAmount: number; savingsPct: number; band: ReturnType<typeof savingsBand>;
  matchConfidence: number | null; rationale: string; differing: string[];
  requiresClinical: boolean; mdrClass: MdrClass;
  volume: number; status: string; dismissedReason: string | null;
  openBlocking: number; openNonBlocking: number;
}

const rowToCard = (r: any): RecCard => {
  const volume = r.annual_volume * (r.extracted_pack_size || 1);
  return {
    id: r.id, type: r.type,
    itemName: r.item_name, itemBrand: r.item_brand, currentSupplier: r.current_supplier_name || "current supplier",
    recommendedName: r.recommended_name, supplierName: r.supplier_name, supplierId: r.supplier_id,
    canonicalId: r.canonical_product_id, recommendedCanonicalId: r.recommended_canonical_product_id,
    hospitalItemId: r.hospital_item_id,
    baseline: r.baseline_unit_price, offered: r.offered_unit_price, currency: r.currency ?? "CHF",
    savingsAmount: r.savings_amount, savingsPct: r.savings_pct, band: savingsBand(r.savings_pct),
    matchConfidence: r.match_confidence, rationale: r.rationale ?? "",
    differing: safeList(r.differing_attributes),
    requiresClinical: !!r.requires_clinical_review, mdrClass: (r.mdr_risk_class ?? "IIa") as unknown as MdrClass,
    volume, status: r.status, dismissedReason: r.dismissed_reason,
    openBlocking: r.open_blocking ?? 0, openNonBlocking: r.open_non_blocking ?? 0,
  };
};

const REC_SELECT = `
  SELECT r.*, h.extracted_name AS item_name, h.extracted_brand AS item_brand,
         h.annual_volume, h.extracted_pack_size, h.current_supplier_name, h.currency,
         cp.canonical_name AS recommended_name, cp.mdr_risk_class,
         o.name AS supplier_name,
         (SELECT COUNT(*) FROM questions q WHERE q.recommendation_id = r.id
            AND q.type='blocking' AND q.status='open') AS open_blocking,
         (SELECT COUNT(*) FROM questions q WHERE q.recommendation_id = r.id
            AND q.type='non_blocking' AND q.status='open') AS open_non_blocking
  FROM recommendations r
  JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
  JOIN canonical_products cp ON cp.id = r.recommended_canonical_product_id
  JOIN organizations o ON o.id = r.supplier_id`;

export function activeRecommendations(): RecCard[] {
  return (db().prepare(`${REC_SELECT} WHERE r.hospital_id = ? AND r.status IN ('new','in_progress','blocked')
    ORDER BY CASE r.type WHEN 'identity' THEN 0 ELSE 1 END, r.savings_amount DESC`)
    .all(HOSPITAL_ID) as any[]).map(rowToCard);
}

export function suggestedRecommendations(): RecCard[] {
  return (db().prepare(`${REC_SELECT} WHERE r.hospital_id = ? AND r.status = 'dismissed'
    ORDER BY r.savings_amount DESC`).all(HOSPITAL_ID) as any[]).map(rowToCard);
}

export function recommendation(id: string): RecCard | null {
  const r = db().prepare(`${REC_SELECT} WHERE r.id = ?`).get(id) as any;
  return r ? rowToCard(r) : null;
}

export function questionsFor(recId: string) {
  return db().prepare(
    `SELECT q.*, u.name AS answered_by_name FROM questions q
     LEFT JOIN users u ON u.id = q.answered_by
     WHERE q.recommendation_id = ? ORDER BY q.type ASC, q.created_at ASC`).all(recId) as any[];
}

/** §3 review queue: low-confidence extractions and unconfirmed link proposals. */
export function hospitalReviewQueue() {
  const conn = db();
  const lowExtraction = conn.prepare(
    `SELECT h.*, 'extraction' AS reason FROM hospital_purchase_items h
     WHERE h.hospital_id = ? AND h.extraction_confidence < ? ORDER BY h.extraction_confidence ASC`)
    .all(HOSPITAL_ID, EXTRACTION_THRESHOLD) as any[];
  const proposals = conn.prepare(
    `SELECT h.*, l.id AS link_id, l.link_confidence, l.link_method, l.rationale AS link_rationale,
            l.canonical_product_id AS candidate_id,
            cp.canonical_name AS candidate_name, cp.mdr_risk_class, o.name AS candidate_maker,
            'link' AS reason
     FROM item_links l
     JOIN hospital_purchase_items h ON h.id = l.item_id AND l.item_type = 'hospital'
     JOIN canonical_products cp ON cp.id = l.canonical_product_id
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     WHERE l.status = 'proposed' AND h.hospital_id = ?
     ORDER BY l.link_confidence DESC`).all(HOSPITAL_ID) as any[];
  return { lowExtraction, proposals };
}

export function supplierReviewQueue(supplierId: string) {
  return db().prepare(
    `SELECT s.*, d.filename, d.note FROM supplier_catalog_items s
     LEFT JOIN source_documents d ON d.id = s.source_document_id
     WHERE s.supplier_id = ? AND s.status = 'unchecked'
     ORDER BY s.extraction_confidence ASC`).all(supplierId) as any[];
}


export function supplierCatalogue(supplierId: string, limit = 400) {
  return db().prepare(
    `SELECT s.*, cp.canonical_name,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id = s.canonical_product_id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id = s.canonical_product_id
              LIMIT 1) AS currency,
            EXISTS (SELECT 1 FROM product_images pi
                    WHERE pi.canonical_product_id = s.canonical_product_id) AS has_image
     FROM supplier_catalog_items s
     LEFT JOIN canonical_products cp ON cp.id = s.canonical_product_id
     WHERE s.supplier_id = ?
     -- Anything still awaiting review comes first: a bad extraction must never
     -- be buried. Everything below that bar is already accepted, so ordering it
     -- by a 94-vs-100 gradient buries nothing useful and hid every recovered
     -- photograph behind 85 rows that merely lacked a pack size. Accepted rows
     -- therefore lead with the ones whose figures came back, which is what a
     -- supplier opens this page to check.
     ORDER BY (s.status = 'unchecked') DESC, has_image DESC,
              s.extraction_confidence ASC, s.extracted_name ASC
     LIMIT ?`)
    .all(supplierId, limit) as any[];
}

export interface SupplierProduct {
  itemId: string; canonicalId: string | null;
  /** As the row reads in the uploaded catalogue. */
  extractedName: string; sku: string; spec: string | null;
  page: number | null;
  status: string; confidence: number;
  sourceDocumentId: string | null; sourceFilename: string | null;
  /** Null until the row has been confirmed into a canonical product. */
  name: string | null; description: string | null;
  uom: string | null; packSize: number | null; gtin: string | null;
  mdrClass: MdrClass | null; eclass: string | null;
  attributes: Record<string, string | number>;
  basePrice: number | null; priceOrigin: string | null; currency: string;
}

/**
 * One row of a manufacturer's own catalogue, as that manufacturer sees it.
 *
 * Keyed by the catalogue row rather than by the harmonised product, because
 * the row is the thing the manufacturer uploaded and recognises. A row still
 * in the review queue has no canonical product yet and therefore nothing to
 * price or photograph — it still gets a page, saying so.
 */
export function supplierProduct(itemId: string, supplierId: string): SupplierProduct | null {
  const r = rowsOf<any>(
    `SELECT s.id AS item_id, s.extracted_name, s.extracted_sku, s.extracted_spec,
            s.extraction_confidence, s.status, s.raw_extraction_payload,
            s.canonical_product_id AS canonical_id,
            d.id AS source_document_id, d.filename AS source_filename,
            cp.canonical_name, cp.description, cp.base_uom, cp.base_pack_size, cp.gtin,
            cp.mdr_risk_class, cp.eclass_code, cp.attributes,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT origin FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS price_origin,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency
     FROM supplier_catalog_items s
     LEFT JOIN canonical_products cp ON cp.id = s.canonical_product_id
     LEFT JOIN source_documents d ON d.id = s.source_document_id
     WHERE s.id = ? AND s.supplier_id = ?`, itemId, supplierId)[0];
  if (!r) return null;

  let page: number | null = null;
  try { page = JSON.parse(r.raw_extraction_payload ?? "{}")?.page ?? null; } catch { /* absent */ }
  let attributes: Record<string, string | number> = {};
  try { attributes = JSON.parse(r.attributes ?? "{}"); } catch { /* empty */ }

  return {
    itemId: r.item_id, canonicalId: r.canonical_id ?? null,
    extractedName: r.extracted_name, sku: r.extracted_sku, spec: r.extracted_spec ?? null,
    page, status: r.status, confidence: r.extraction_confidence,
    sourceDocumentId: r.source_document_id, sourceFilename: r.source_filename,
    name: r.canonical_name ?? null, description: r.description ?? null,
    uom: r.base_uom ?? null, packSize: r.base_pack_size ?? null, gtin: r.gtin ?? null,
    mdrClass: (r.mdr_risk_class ?? null) as MdrClass | null, eclass: r.eclass_code ?? null,
    attributes,
    basePrice: r.base_price ?? null, priceOrigin: r.price_origin ?? null,
    currency: r.currency ?? "CHF",
  };
}

export function ordersForApproval() {
  return db().prepare(
    `SELECT o.*, r.type, r.savings_amount, r.savings_pct, r.requires_clinical_review,
            h.extracted_name AS item_name, cp.canonical_name AS recommended_name,
            cp.mdr_risk_class, s.name AS supplier_name, u.name AS requested_by_name
     FROM orders o
     JOIN recommendations r ON r.id = o.recommendation_id
     JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
     JOIN canonical_products cp ON cp.id = r.recommended_canonical_product_id
     JOIN organizations s ON s.id = r.supplier_id
     JOIN users u ON u.id = o.requested_by
     WHERE o.hospital_id = ? ORDER BY o.created_at DESC`).all(HOSPITAL_ID) as any[];
}

export function matchRuns(limit = 12) {
  return db().prepare(`SELECT * FROM match_runs ORDER BY started_at DESC LIMIT ?`).all(limit) as any[];
}

export function linkMethodBreakdown() {
  return db().prepare(
    `SELECT link_method, status, COUNT(*) AS n FROM item_links GROUP BY link_method, status`)
    .all() as any[];
}

/**
 * Matching effectiveness, hospital side only. Supplier rows are excluded: a
 * manufacturer confirming its own catalogue is not the matching engine
 * working, and counting it would flatter the numbers.
 */
export function hospitalLinkBreakdown(): { link_method: string; status: string; n: number }[] {
  return db().prepare(
    `SELECT link_method, status, COUNT(*) AS n FROM item_links
     WHERE item_type='hospital' GROUP BY link_method, status`)
    .all() as unknown as { link_method: string; status: string; n: number }[];
}

export function thresholds() {
  return { EXTRACTION_THRESHOLD, LINK_THRESHOLD, SUBSTITUTION_THRESHOLD };
}

export function totals() {
  const conn = db();
  const t = conn.prepare(
    `SELECT COALESCE(SUM(savings_amount),0) AS s, COUNT(*) AS n FROM recommendations
     WHERE hospital_id = ? AND status IN ('new','in_progress','blocked')`).get(HOSPITAL_ID) as any;
  const spend = conn.prepare(
    `SELECT COALESCE(SUM(current_unit_price * annual_volume * COALESCE(extracted_pack_size,1)),0) AS s
     FROM hospital_purchase_items WHERE hospital_id = ?`).get(HOSPITAL_ID) as any;
  return { savings: t.s as number, count: t.n as number, spend: spend.s as number };
}

function safeList(json: string | null): string[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}

// --- portal chrome -------------------------------------------------------

const one = (sql: string, ...p: unknown[]) =>
  (db().prepare(sql).get(...(p as never[])) as unknown as { n: number } | undefined)?.n ?? 0;

export function portalSummary() {
  return {
    hospitalItems: one(`SELECT COUNT(*) AS n FROM hospital_purchase_items WHERE hospital_id=?`, HOSPITAL_ID),
    supplierItems: one(`SELECT COUNT(*) AS n FROM supplier_catalog_items`),
    canonicalProducts: one(`SELECT COUNT(*) AS n FROM canonical_products`),
    recommendations: one(
      `SELECT COUNT(*) AS n FROM recommendations WHERE hospital_id=? AND status IN ('new','in_progress','blocked')`,
      HOSPITAL_ID),
    hospitalReview: hospitalReviewCount(),
    openQuestions: one(`SELECT COUNT(*) AS n FROM questions WHERE status='open'`),
    pools: one(`SELECT COUNT(*) AS n FROM demand_pools`),
    links: one(`SELECT COUNT(*) AS n FROM item_links WHERE status='confirmed'`),
    runs: one(`SELECT COUNT(*) AS n FROM match_runs`),
  };
}

function hospitalReviewCount() {
  return one(
    `SELECT COUNT(*) AS n FROM hospital_purchase_items WHERE hospital_id=? AND extraction_confidence < ?`,
    HOSPITAL_ID, EXTRACTION_THRESHOLD)
    + one(
      `SELECT COUNT(*) AS n FROM item_links l
       JOIN hospital_purchase_items h ON h.id = l.item_id AND l.item_type='hospital'
       WHERE l.status='proposed' AND h.hospital_id=?`, HOSPITAL_ID);
}

export function hospitalNavCounts() {
  return {
    recommendations: one(
      `SELECT COUNT(*) AS n FROM recommendations WHERE hospital_id=? AND status IN ('new','in_progress','blocked')`,
      HOSPITAL_ID),
    review: hospitalReviewCount(),
    approvals: one(
      `SELECT COUNT(*) AS n FROM orders WHERE hospital_id=? AND status IN ('pending_clinical','pending_approval','pooled','sanovio_fulfillment')`,
      HOSPITAL_ID),
  };
}

export function supplierNavCounts(supplierId: string) {
  return {
    unchecked: one(
      `SELECT COUNT(*) AS n FROM supplier_catalog_items WHERE status='unchecked' AND supplier_id=?`,
      supplierId),
    unpriced: one(
      `SELECT COUNT(*) AS n FROM canonical_products cp
       WHERE cp.manufacturer_id=?
         AND NOT EXISTS (SELECT 1 FROM price_tiers t
                         WHERE t.canonical_product_id=cp.id AND t.supplier_id=?)`,
      supplierId, supplierId),
  };
}

export function documents() {
  return rowsOf<{
    id: string; filename: string; kind: string; byte_size: number; uploaded_at: string;
    row_count: number; note: string | null; org_name: string; content_type: string | null;
    organization_id: string;
  }>(`SELECT d.id, d.filename, d.kind, d.byte_size, d.uploaded_at, d.row_count, d.note,
             d.content_type, d.organization_id, o.name AS org_name
      FROM source_documents d JOIN organizations o ON o.id = d.organization_id
      ORDER BY d.uploaded_at DESC`);
}

export interface PriceTierRow {
  id: string; canonical_product_id: string; min_volume: number; unit_price: number;
  currency: string; origin: string;
}

/**
 * Every tier this manufacturer has, grouped by product.
 *
 * The pricing table used to re-derive a ladder from the base price with
 * `tierLadder`, which was right only while the ladder was always derived.
 * Once a manufacturer can type its own, a recomputed display is a different
 * ladder from the one hospitals are quoted.
 */
export function tiersBySupplier(supplierId: string): Map<string, PriceTierRow[]> {
  const rows = rowsOf<PriceTierRow>(
    `SELECT id, canonical_product_id, min_volume, unit_price, currency, origin
     FROM price_tiers WHERE supplier_id = ?
     ORDER BY canonical_product_id ASC, min_volume ASC`, supplierId);
  const out = new Map<string, PriceTierRow[]>();
  for (const r of rows) {
    // Copied into a plain literal: node:sqlite hands back null-prototype
    // objects, and React refuses to pass those to a client component. The
    // ladder is rendered by one, so a raw row never leaves this function.
    const tier: PriceTierRow = {
      id: r.id, canonical_product_id: r.canonical_product_id,
      min_volume: r.min_volume, unit_price: r.unit_price,
      currency: r.currency, origin: r.origin,
    };
    const list = out.get(tier.canonical_product_id);
    if (list) list.push(tier); else out.set(tier.canonical_product_id, [tier]);
  }
  return out;
}

export function pricingRows(supplierId: string) {
  return rowsOf<{
    canonical_id: string; canonical_name: string; mdr_risk_class: string; base_uom: string;
    origin: string; base_price: number; tiers: number; linked_items: number;
  }>(`SELECT cp.id AS canonical_id, cp.canonical_name, cp.mdr_risk_class, cp.base_uom,
             (SELECT origin FROM price_tiers t WHERE t.canonical_product_id=cp.id AND t.supplier_id=? LIMIT 1) AS origin,
             (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id AND t.supplier_id=? ORDER BY min_volume ASC LIMIT 1) AS base_price,
             (SELECT COUNT(*) FROM price_tiers t WHERE t.canonical_product_id=cp.id AND t.supplier_id=?) AS tiers,
             (SELECT COUNT(*) FROM supplier_catalog_items s WHERE s.canonical_product_id=cp.id) AS linked_items
      FROM canonical_products cp WHERE cp.manufacturer_id=?
      ORDER BY origin ASC, cp.canonical_name ASC`, supplierId, supplierId, supplierId, supplierId);
}


function rowsOf<T>(sql: string, ...p: unknown[]): T[] {
  return db().prepare(sql).all(...(p as never[])) as unknown as T[];
}

// --- hospital cockpit ----------------------------------------------------

/** Current orders table: name, id, quantity, supplier, price, status. */
export function currentOrders() {
  return rowsOf<{
    id: string; item_name: string; recommended_name: string; volume: number;
    supplier_name: string; unit_price: number; currency: string; status: string;
    type: string; mdr_risk_class: string; savings_pct: number;
  }>(`SELECT o.id, h.extracted_name AS item_name, cp.canonical_name AS recommended_name,
             o.volume, s.name AS supplier_name, r.offered_unit_price AS unit_price,
             h.currency, o.status, r.type, cp.mdr_risk_class, r.savings_pct
      FROM orders o
      JOIN recommendations r ON r.id = o.recommendation_id
      JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
      JOIN canonical_products cp ON cp.id = r.recommended_canonical_product_id
      JOIN organizations s ON s.id = r.supplier_id
      WHERE o.hospital_id = ? ORDER BY o.created_at DESC`, HOSPITAL_ID);
}

export interface ProductHit {
  canonicalId: string; name: string; manufacturer: string; mdrClass: MdrClass;
  uom: string; packSize: number; eclass: string | null; gtin: string | null;
  supplierId: string | null; basePrice: number | null; tierOrigin: string | null;
  ownedByHospital: boolean; currentPrice: number | null; savingsPct: number | null;
}

// Product search moved to lib/search.ts: it calls the embedding model and
// the reranker, which a synchronous read model cannot.

export function hospitalDocuments() {
  return documents().filter((d) => d.kind === "hospital_demand");
}

// --- Hospital catalogue --------------------------------------------------

export interface CatalogueEntry {
  /** The article-master line, when this row is one. */
  lineId: string | null;
  /** The harmonised product, when the line resolved to one. */
  canonicalId: string | null;
  name: string; manufacturer: string; mdrClass: MdrClass;
  uom: string; packSize: number; gtin: string | null;
  basePrice: number | null; currency: string;
  inArticleMaster: boolean; annualVolume: number | null; currentPrice: number | null;
  openRecommendations: number;
  sourceDocumentId: string | null; sourceFilename: string | null;
  imageId: string | null;
  spec: string | null;
  /** The product this line is to be replaced with, once the buyer chose one. */
  replacement: CatalogueReplacement | null;
}

export interface CatalogueReplacement {
  id: string; canonicalId: string; name: string; manufacturer: string;
  basePrice: number | null; currency: string; imageId: string | null;
  status: AnalysisStatus; openPoints: number; blockingOpen: number;
  totalPoints: number; signedOff: number;
  /** The live order placed for it, if any. */
  orderStatus: string | null;
}

/**
 * This hospital's shelf: every line of its own article master, plus the
 * products the platform has proposed against them.
 *
 * Keyed off the uploaded lines rather than off harmonised products, which is
 * the correction that matters here. A line only becomes a canonical product
 * once something in a manufacturer's catalogue matches it, and coverage is
 * bounded by what manufacturers have uploaded — so listing products made the
 * page go blank for a hospital whose ten articles nobody sells yet. The rows
 * exist, they were read out of a real file, and a page that hides them is
 * telling the buyer their upload did nothing.
 */
export function hospitalCatalogue(): CatalogueEntry[] {
  // 1. The article master, whole. `canonical_product_id` may be null; that is
  //    a statement about coverage, not a reason to drop the row.
  const lines = rowsOf<any>(
    `SELECT h.id AS line_id, h.extracted_name, h.extracted_spec, h.extracted_gtin,
            h.extracted_uom, h.extracted_pack_size, h.annual_volume, h.current_unit_price,
            h.canonical_product_id AS canonical_id,
            cp.canonical_name, cp.mdr_risk_class, cp.base_uom, cp.base_pack_size, cp.gtin,
            o.name AS manufacturer,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency,
            (SELECT COUNT(*) FROM recommendations r
              WHERE r.hospital_id=h.hospital_id AND r.hospital_item_id=h.id
                AND r.status IN ('new','in_progress','blocked')) AS open_recs,
            d.id AS source_document_id, d.filename AS source_filename
     FROM hospital_purchase_items h
     LEFT JOIN canonical_products cp ON cp.id = h.canonical_product_id
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     LEFT JOIN source_documents d ON d.id = h.source_document_id
     WHERE h.hospital_id = ?
     ORDER BY h.created_at ASC`,
    HOSPITAL_ID);

  // 2. Products proposed against those lines that the hospital does not
  //    already buy — the other half of "of interest".
  const proposed = rowsOf<any>(
    `SELECT cp.id AS canonical_id, cp.canonical_name, cp.mdr_risk_class, cp.base_uom,
            cp.base_pack_size, cp.gtin, o.name AS manufacturer,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency,
            (SELECT COUNT(*) FROM recommendations r
              WHERE r.hospital_id=? AND r.recommended_canonical_product_id=cp.id
                AND r.status IN ('new','in_progress','blocked')) AS open_recs,
            d.id AS source_document_id, d.filename AS source_filename
     FROM canonical_products cp
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     LEFT JOIN supplier_catalog_items s
            ON s.id = (SELECT s2.id FROM supplier_catalog_items s2
                       WHERE s2.canonical_product_id = cp.id ORDER BY s2.created_at ASC LIMIT 1)
     LEFT JOIN source_documents d ON d.id = s.source_document_id
     WHERE EXISTS (SELECT 1 FROM recommendations r
                   WHERE r.hospital_id=? AND r.status != 'dismissed'
                     AND r.recommended_canonical_product_id=cp.id)
       AND NOT EXISTS (SELECT 1 FROM hospital_purchase_items h
                       WHERE h.canonical_product_id=cp.id AND h.hospital_id=?)
       -- A product already chosen as a line's replacement is listed under that
       -- line, not a second time as a loose proposal.
       AND NOT EXISTS (SELECT 1 FROM replacements rp
                       WHERE rp.canonical_product_id=cp.id AND rp.hospital_id=?)
     ORDER BY cp.canonical_name ASC`,
    HOSPITAL_ID, HOSPITAL_ID, HOSPITAL_ID, HOSPITAL_ID);

  // 3. The replacements the buyer chose, one per line at most.
  const chosen = rowsOf<any>(
    `SELECT r.id, r.hospital_item_id, r.canonical_product_id, r.analysis_status,
            r.analysis_started_at, cp.canonical_name, o.name AS manufacturer,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency,
            (SELECT COUNT(*) FROM questions q WHERE q.replacement_id=r.id) AS total,
            (SELECT COUNT(*) FROM questions q WHERE q.replacement_id=r.id
               AND q.status IN ('open','answered')) AS open_points,
            (SELECT COUNT(*) FROM questions q WHERE q.replacement_id=r.id
               AND q.status IN ('open','answered') AND q.type='blocking') AS blocking_open,
            (SELECT COUNT(*) FROM questions q WHERE q.replacement_id=r.id
               AND q.status='cleared') AS signed_off,
            (SELECT o.status FROM orders o WHERE o.recommendation_id = r.recommendation_id
               AND o.status != 'rejected' ORDER BY o.created_at DESC LIMIT 1) AS order_status
     FROM replacements r
     JOIN canonical_products cp ON cp.id = r.canonical_product_id
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     WHERE r.hospital_id = ?`, HOSPITAL_ID);

  const images = primaryImages([
    ...[...lines, ...proposed].map((r) => r.canonical_id),
    ...chosen.map((r) => r.canonical_product_id),
  ].filter(Boolean) as string[]);

  const replacementByLine = new Map<string, CatalogueReplacement>(chosen.map((r) => [
    r.hospital_item_id,
    {
      id: r.id, canonicalId: r.canonical_product_id, name: r.canonical_name,
      manufacturer: r.manufacturer ?? "—", basePrice: r.base_price ?? null,
      currency: r.currency ?? "CHF", imageId: images.get(r.canonical_product_id) ?? null,
      status: effectiveStatus(r.analysis_status, r.analysis_started_at),
      openPoints: r.open_points ?? 0, blockingOpen: r.blocking_open ?? 0,
      totalPoints: r.total ?? 0, signedOff: r.signed_off ?? 0,
      orderStatus: r.order_status ?? null,
    },
  ]));

  const own: CatalogueEntry[] = lines.map((r) => ({
    lineId: r.line_id,
    canonicalId: r.canonical_id ?? null,
    // The harmonised name once there is one, otherwise the line as the
    // hospital's own file spells it.
    name: r.canonical_name ?? r.extracted_name,
    manufacturer: r.manufacturer ?? "—",
    mdrClass: (r.mdr_risk_class ?? "IIa") as MdrClass,
    uom: r.base_uom ?? r.extracted_uom ?? "Stück",
    packSize: r.base_pack_size ?? r.extracted_pack_size ?? 1,
    gtin: r.gtin ?? r.extracted_gtin ?? null,
    basePrice: r.base_price ?? null, currency: r.currency ?? "CHF",
    inArticleMaster: true,
    annualVolume: r.annual_volume, currentPrice: r.current_unit_price,
    openRecommendations: r.open_recs ?? 0,
    sourceDocumentId: r.source_document_id, sourceFilename: r.source_filename,
    imageId: r.canonical_id ? images.get(r.canonical_id) ?? null : null,
    spec: r.extracted_spec ?? null,
    replacement: replacementByLine.get(r.line_id) ?? null,
  }));

  const others: CatalogueEntry[] = proposed.map((r) => ({
    lineId: null, canonicalId: r.canonical_id, name: r.canonical_name,
    manufacturer: r.manufacturer ?? "—", mdrClass: (r.mdr_risk_class ?? "IIa") as MdrClass,
    uom: r.base_uom, packSize: r.base_pack_size, gtin: r.gtin,
    basePrice: r.base_price, currency: r.currency ?? "CHF",
    inArticleMaster: false, annualVolume: null, currentPrice: null,
    openRecommendations: r.open_recs ?? 0,
    sourceDocumentId: r.source_document_id, sourceFilename: r.source_filename,
    imageId: images.get(r.canonical_id) ?? null,
    spec: null,
    replacement: null,
  }));

  return [...own, ...others];
}

// --- Product page --------------------------------------------------------

export interface ProductDetail {
  canonicalId: string; name: string; manufacturer: string; manufacturerId: string | null;
  /** Written by the manufacturer on its own product page; never extracted. */
  description: string | null;
  mdrClass: MdrClass; gtin: string | null; eclass: string | null;
  uom: string; packSize: number; attributes: Record<string, string | number>;
  basePrice: number | null; priceOrigin: string | null; currency: string;
}

export function productDetail(canonicalId: string): ProductDetail | null {
  const r = rowsOf<any>(
    `SELECT cp.id, cp.canonical_name, cp.mdr_risk_class, cp.gtin, cp.eclass_code, cp.base_uom,
            cp.base_pack_size, cp.attributes, cp.description, cp.manufacturer_id,
            o.name AS manufacturer,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT origin FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS price_origin,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency
     FROM canonical_products cp
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     WHERE cp.id = ?`, canonicalId)[0];
  if (!r) return null;

  let attributes: Record<string, string | number> = {};
  try { attributes = JSON.parse(r.attributes ?? "{}"); } catch { /* empty */ }

  return {
    canonicalId: r.id, name: r.canonical_name, manufacturer: r.manufacturer ?? "—",
    manufacturerId: r.manufacturer_id, description: r.description ?? null,
    mdrClass: (r.mdr_risk_class ?? "IIa") as MdrClass,
    gtin: r.gtin, eclass: r.eclass_code, uom: r.base_uom, packSize: r.base_pack_size,
    attributes, basePrice: r.base_price, priceOrigin: r.price_origin,
    currency: r.currency ?? "CHF",
  };
}

export interface HospitalLine {
  id: string; name: string; brand: string | null; annualVolume: number;
  packSize: number; uom: string; currentPrice: number | null; currentSupplier: string | null;
  mdrClass: MdrClass; gtin: string | null; canonicalId: string | null;
}

/** The hospital's own line a product page is being compared against. */
export function hospitalLine(itemId: string): HospitalLine | null {
  const r = rowsOf<any>(
    `SELECT id, extracted_name, extracted_brand, annual_volume, extracted_pack_size,
            extracted_uom, current_unit_price, current_supplier_name, declared_mdr_class,
            extracted_gtin, canonical_product_id
     FROM hospital_purchase_items WHERE id = ? AND hospital_id = ?`, itemId, HOSPITAL_ID)[0];
  if (!r) return null;
  return {
    id: r.id, name: r.extracted_name, brand: r.extracted_brand,
    annualVolume: r.annual_volume, packSize: r.extracted_pack_size, uom: r.extracted_uom,
    currentPrice: r.current_unit_price, currentSupplier: r.current_supplier_name,
    mdrClass: (r.declared_mdr_class ?? "IIa") as MdrClass, gtin: r.extracted_gtin,
    canonicalId: r.canonical_product_id,
  };
}

/** Best guess at which of the hospital's own lines a product would replace. */
export function likelyReplacedLine(canonicalId: string): string | null {
  return rowsOf<{ id: string }>(
    `SELECT h.id FROM recommendations r JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
     WHERE r.recommended_canonical_product_id = ? AND r.hospital_id = ?
     ORDER BY r.savings_amount DESC LIMIT 1`, canonicalId, HOSPITAL_ID)[0]?.id
    ?? rowsOf<{ id: string }>(
    `SELECT h.id FROM hospital_purchase_items h
     JOIN canonical_products mine ON mine.id = h.canonical_product_id
     JOIN canonical_products other ON other.id = ?
     WHERE h.hospital_id = ? AND mine.eclass_code = other.eclass_code
     ORDER BY h.annual_volume DESC LIMIT 1`, canonicalId, HOSPITAL_ID)[0]?.id
    ?? null;
}

export interface PastReplacement {
  orderId: string; status: string; createdAt: string; volume: number;
  direction: "in" | "out"; type: "identity" | "substitution";
  fromName: string; toName: string; itemName: string;
  supplierName: string; savingsPct: number;
}

/**
 * Replacements this hospital has already put through for a product — as the
 * article that was swapped in, or the one that was swapped away from.
 *
 * Only placed orders count. A recommendation nobody acted on is a suggestion,
 * not a replacement, and listing it here would read as history that never
 * happened.
 */
export function previousReplacements(canonicalId: string): PastReplacement[] {
  return rowsOf<any>(
    `SELECT o.id, o.status, o.created_at, o.volume,
            r.type, r.savings_pct, r.canonical_product_id, r.recommended_canonical_product_id,
            h.extracted_name AS item_name, sup.name AS supplier_name,
            was.canonical_name AS from_name, now_cp.canonical_name AS to_name
     FROM orders o
     JOIN recommendations r ON r.id = o.recommendation_id
     JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
     JOIN organizations sup ON sup.id = r.supplier_id
     LEFT JOIN canonical_products was ON was.id = r.canonical_product_id
     JOIN canonical_products now_cp ON now_cp.id = r.recommended_canonical_product_id
     WHERE o.hospital_id = ? AND o.status != 'rejected'
       AND (r.recommended_canonical_product_id = ? OR r.canonical_product_id = ?)
     ORDER BY o.created_at DESC`, HOSPITAL_ID, canonicalId, canonicalId)
    .map((r) => ({
      orderId: r.id, status: r.status, createdAt: r.created_at, volume: r.volume,
      direction: r.recommended_canonical_product_id === canonicalId ? "in" as const : "out" as const,
      type: r.type, fromName: r.from_name ?? r.item_name, toName: r.to_name,
      itemName: r.item_name, supplierName: r.supplier_name, savingsPct: r.savings_pct,
    }));
}

/** Recommendation linking a hospital line to this product, if one exists. */
export function recommendationFor(itemId: string, canonicalId: string): string | null {
  return rowsOf<{ id: string }>(
    `SELECT id FROM recommendations WHERE hospital_item_id=? AND recommended_canonical_product_id=?
       AND status != 'dismissed' ORDER BY created_at DESC LIMIT 1`, itemId, canonicalId)[0]?.id ?? null;
}

// Hospital <-> supplier conversations live in lib/messaging.ts.

// --- Product images ------------------------------------------------------

export interface ProductImage {
  id: string; figureId: string; page: number | null;
  role: string; region: string | null; caption: string | null;
  confidence: "certain" | "likely" | "uncertain";
}

/**
 * Figures for a product, best first.
 *
 * A photo the model was only guessing about still belongs to the product — it
 * is shown, but ranked below a certain one and labelled, so nobody mistakes a
 * guess for the article they are ordering.
 */
export function productImages(canonicalProductId: string): ProductImage[] {
  return rowsOf<any>(
    `SELECT id, figure_id, page, role, region, caption, confidence
     FROM product_images WHERE canonical_product_id = ?
     ORDER BY CASE confidence WHEN 'certain' THEN 0 WHEN 'likely' THEN 1 ELSE 2 END,
              CASE role WHEN 'primary' THEN 0 WHEN 'variant' THEN 1 WHEN 'shared' THEN 2
                        WHEN 'packaging' THEN 3 ELSE 4 END,
              figure_id ASC`, canonicalProductId)
    .map((r) => ({
      id: r.id, figureId: r.figure_id, page: r.page, role: r.role,
      region: r.region, caption: r.caption, confidence: r.confidence,
    }));
}

/** First image per product, for list views. One query, not one per row. */
export function primaryImages(canonicalIds: string[]): Map<string, string> {
  if (!canonicalIds.length) return new Map();
  const marks = canonicalIds.map(() => "?").join(",");
  const rows = rowsOf<{ canonical_product_id: string; id: string }>(
    `SELECT canonical_product_id, id FROM product_images pi
     WHERE canonical_product_id IN (${marks})
       AND id = (SELECT id FROM product_images x
                 WHERE x.canonical_product_id = pi.canonical_product_id
                 ORDER BY CASE x.confidence WHEN 'certain' THEN 0 WHEN 'likely' THEN 1 ELSE 2 END,
                          CASE x.role WHEN 'primary' THEN 0 WHEN 'variant' THEN 1 ELSE 2 END,
                          x.figure_id ASC LIMIT 1)`, ...canonicalIds);
  return new Map(rows.map((r) => [r.canonical_product_id, r.id]));
}

// --- Replacements --------------------------------------------------------

export type AnalysisStatus = "pending" | "running" | "done" | "failed";

/**
 * A run still marked running long after it started was cut off — the server
 * restarted mid-call. Shown as failed so the buyer can run it again, rather
 * than as a spinner that never stops.
 */
function effectiveStatus(status: string, startedAt: string | null): AnalysisStatus {
  if (status === "running" && startedAt
      && Date.now() - new Date(startedAt).getTime() > STALE_RUN_MS) return "failed";
  return status as AnalysisStatus;
}

export interface ReplacementOption {
  id: string; name: string; detail: string;
  /** What this line is already being replaced with, if anything. */
  currentReplacement: { canonicalId: string; name: string } | null;
  /** The line already resolves to this very product: the switch is channel only. */
  sameArticle: boolean;
}

/** Every line of the article master, as choices for "Replace with this". */
export function replacementOptions(canonicalId: string): ReplacementOption[] {
  return rowsOf<any>(
    `SELECT h.id, h.extracted_name, h.extracted_brand, h.current_supplier_name, h.annual_volume,
            h.extracted_uom, h.canonical_product_id,
            r.canonical_product_id AS rep_id, rp.canonical_name AS rep_name
     FROM hospital_purchase_items h
     LEFT JOIN replacements r ON r.hospital_item_id = h.id
     LEFT JOIN canonical_products rp ON rp.id = r.canonical_product_id
     WHERE h.hospital_id = ? ORDER BY h.extracted_name COLLATE NOCASE ASC`, HOSPITAL_ID)
    .map((r) => ({
      id: r.id, name: r.extracted_name,
      detail: [r.extracted_brand, r.current_supplier_name ? `via ${r.current_supplier_name}` : null,
        r.annual_volume ? `${r.annual_volume.toLocaleString("de-CH")} ${r.extracted_uom ?? ""}/yr`.trim() : null]
        .filter(Boolean).join(" · "),
      currentReplacement: r.rep_id ? { canonicalId: r.rep_id, name: r.rep_name } : null,
      sameArticle: r.canonical_product_id === canonicalId,
    }));
}

export interface ReplacementPointView {
  id: string; category: ReplacementCategory | null;
  severity: "blocking" | "non_blocking";
  /** Short name of the issue; older questions carry only `text`. */
  title: string | null; detail: string | null;
  /** What the manufacturer receives if the point is sent. */
  text: string;
  routedTo: "supplier" | "sanovio_internal";
  status: "open" | "answered" | "skipped" | "cleared";
  sentAt: string | null; answerText: string | null;
  clearedAt: string | null; clearedBy: string | null;
  sources: Source[];
}

export interface ReplacementView {
  id: string; itemId: string; canonicalId: string;
  lineName: string; productName: string; manufacturer: string;
  status: AnalysisStatus; error: string | null;
  summary: string | null; verdict: string | null; confidence: number | null;
  adapter: string | null; webSearches: number; sources: Source[];
  selectedAt: string; finishedAt: string | null;
  points: ReplacementPointView[];
  counts: { total: number; open: number; blockingOpen: number; signedOff: number };
}

const REPLACEMENT_SELECT = `
  SELECT r.*, h.extracted_name AS line_name, cp.canonical_name AS product_name,
         o.name AS manufacturer
  FROM replacements r
  JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
  JOIN canonical_products cp ON cp.id = r.canonical_product_id
  LEFT JOIN organizations o ON o.id = cp.manufacturer_id`;

/** The replacement chosen for this line, if it is this product. */
export function replacementFor(itemId: string, canonicalId: string): ReplacementView | null {
  const r = rowsOf<any>(`${REPLACEMENT_SELECT}
    WHERE r.hospital_item_id = ? AND r.canonical_product_id = ? AND r.hospital_id = ?`,
    itemId, canonicalId, HOSPITAL_ID)[0];
  return r ? toReplacementView(r) : null;
}

function toReplacementView(r: any): ReplacementView {
  const points = rowsOf<any>(
    `SELECT q.*, u.name AS cleared_by_name FROM questions q
     LEFT JOIN users u ON u.id = q.cleared_by
     WHERE q.replacement_id = ?
     ORDER BY CASE q.status WHEN 'cleared' THEN 1 ELSE 0 END,
              CASE q.type WHEN 'blocking' THEN 0 ELSE 1 END, q.created_at ASC`, r.id)
    .map((q): ReplacementPointView => ({
      id: q.id, category: q.category ?? null, severity: q.type,
      title: q.title ?? null, detail: q.detail ?? null, text: q.text,
      routedTo: q.routed_to, status: q.status, sentAt: q.sent_at, answerText: q.answer_text,
      clearedAt: q.cleared_at, clearedBy: q.cleared_by_name ?? null,
      sources: safeSources(q.sources),
    }));
  const live = points.filter((p) => p.status !== "cleared" && p.status !== "skipped");
  const status = effectiveStatus(r.analysis_status, r.analysis_started_at);
  return {
    id: r.id, itemId: r.hospital_item_id, canonicalId: r.canonical_product_id,
    lineName: r.line_name, productName: r.product_name, manufacturer: r.manufacturer ?? "—",
    status,
    error: status === "failed" && r.analysis_status === "running"
      ? "The analysis was interrupted before it finished." : r.error,
    summary: r.summary, verdict: r.verdict, confidence: r.confidence,
    adapter: r.adapter, webSearches: r.web_searches ?? 0, sources: safeSources(r.sources),
    selectedAt: r.selected_at, finishedAt: r.analysis_finished_at,
    points,
    counts: {
      total: points.length, open: live.length,
      blockingOpen: live.filter((p) => p.severity === "blocking").length,
      signedOff: points.filter((p) => p.status === "cleared").length,
    },
  };
}

/** The line this product was chosen to replace, when it was. */
export function replacementLineFor(canonicalId: string): string | null {
  return rowsOf<{ hospital_item_id: string }>(
    `SELECT hospital_item_id FROM replacements WHERE canonical_product_id = ? AND hospital_id = ?
     ORDER BY selected_at DESC LIMIT 1`, canonicalId, HOSPITAL_ID)[0]?.hospital_item_id ?? null;
}

/** Just the state, for a page polling while the analysis runs. */
export function replacementStatus(replacementId: string): AnalysisStatus | null {
  const r = rowsOf<{ analysis_status: string; analysis_started_at: string | null }>(
    `SELECT analysis_status, analysis_started_at FROM replacements WHERE id = ? AND hospital_id = ?`,
    replacementId, HOSPITAL_ID)[0];
  return r ? effectiveStatus(r.analysis_status, r.analysis_started_at) : null;
}

function safeSources(json: string | null): Source[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v)
      ? v.filter((s) => s && typeof s.url === "string").map((s) => ({ title: String(s.title ?? s.url), url: s.url }))
      : [];
  } catch { return []; }
}

// --- Automatic suggestions (lib/matching/suggest.ts) ----------------------

export interface SuggestionCardView {
  itemId: string; itemName: string; canonicalId: string; name: string;
  manufacturer: string; mdrClass: MdrClass; relation: "identical" | "equivalent";
  confidence: number; rationale: string;
  basePrice: number | null; currentPrice: number | null; currency: string; savingsPct: number | null;
  analysisStatus: AnalysisStatus | null; points: number; blocking: number;
  /** The buyer already chose a different product for this line. */
  chosenInstead: string | null;
  imageId: string | null;
}

/**
 * The best match per line, as the cockpit shows it.
 *
 * Priced or not: a match is worth knowing about before its manufacturer has
 * set a price, and the card says which it is. Left out: pairs the buyer
 * dismissed, and pairs a priced recommendation already covers — that card can
 * be ordered from, this one cannot yet.
 */
export function suggestionCards(): SuggestionCardView[] {
  const list = rowsOf<any>(
    `SELECT m.*, h.extracted_name AS item_name, h.current_unit_price, h.currency AS line_currency,
            cp.canonical_name, cp.mdr_risk_class, o.name AS manufacturer,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency,
            (SELECT rp.canonical_name FROM replacements r JOIN canonical_products rp ON rp.id = r.canonical_product_id
              WHERE r.hospital_item_id = m.hospital_item_id AND r.canonical_product_id != m.canonical_product_id) AS chosen_instead,
            EXISTS (SELECT 1 FROM replacements r WHERE r.hospital_item_id = m.hospital_item_id
                      AND r.canonical_product_id = m.canonical_product_id) AS already_chosen
     FROM match_pairs m
     JOIN hospital_purchase_items h ON h.id = m.hospital_item_id
     JOIN canonical_products cp ON cp.id = m.canonical_product_id
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     WHERE m.hospital_id = ? AND m.is_top = 1 AND m.outcome = 'matched' AND m.dismissed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM recommendations r WHERE r.hospital_item_id = m.hospital_item_id
                         AND r.recommended_canonical_product_id = m.canonical_product_id
                         AND r.status IN ('new','in_progress','blocked'))
     ORDER BY CASE m.relation WHEN 'identical' THEN 0 ELSE 1 END, m.confidence DESC`, HOSPITAL_ID);
  const images = primaryImages(list.map((r) => r.canonical_product_id));
  return list
    // Once the buyer chose this very product it lives in the catalogue, not here.
    .filter((r) => !r.already_chosen)
    .map((r) => {
      const analysis = parseAnalysis(r.analysis_json);
      const sameCurrency = !r.currency || r.currency === r.line_currency;
      const savings = r.current_unit_price && r.base_price && sameCurrency
        ? Math.round(((r.current_unit_price - r.base_price) / r.current_unit_price) * 1000) / 10 : null;
      return {
        itemId: r.hospital_item_id, itemName: r.item_name, canonicalId: r.canonical_product_id,
        name: r.canonical_name, manufacturer: r.manufacturer ?? "—",
        mdrClass: (r.mdr_risk_class ?? "IIa") as MdrClass, relation: r.relation,
        confidence: r.confidence ?? 0, rationale: r.rationale ?? "",
        basePrice: r.base_price ?? null, currentPrice: r.current_unit_price ?? null,
        currency: r.currency ?? r.line_currency ?? "CHF", savingsPct: savings,
        analysisStatus: r.analysis_status ?? null,
        points: analysis?.points.length ?? 0,
        blocking: analysis?.points.filter((p) => p.severity === "blocking").length ?? 0,
        chosenInstead: r.chosen_instead ?? null,
        imageId: images.get(r.canonical_product_id) ?? null,
      };
    });
}

/** Suggestions the buyer dismissed. Kept, and reconsiderable. */
export function dismissedSuggestions() {
  return rowsOf<{ itemId: string; canonicalId: string; itemName: string; name: string }>(
    `SELECT m.hospital_item_id AS itemId, m.canonical_product_id AS canonicalId,
            h.extracted_name AS itemName, cp.canonical_name AS name
     FROM match_pairs m
     JOIN hospital_purchase_items h ON h.id = m.hospital_item_id
     JOIN canonical_products cp ON cp.id = m.canonical_product_id
     WHERE m.hospital_id = ? AND m.dismissed_at IS NOT NULL AND m.outcome = 'matched'
     ORDER BY m.dismissed_at DESC`, HOSPITAL_ID)
    .map((r) => ({ itemId: r.itemId, canonicalId: r.canonicalId, itemName: r.itemName, name: r.name }));
}

export interface SuggestionView {
  itemId: string; canonicalId: string; lineName: string; productName: string; manufacturer: string;
  relation: string; confidence: number; rationale: string; isTop: boolean;
  jevScore: number | null; similarity: number | null;
  analysis: ReplacementView | null;
}

/**
 * A suggested pair seen from its product page, before anyone chose it. The
 * pre-calculated analysis is shaped like a replacement's so the same view
 * renders it — read-only, since nothing has been chosen to sign off yet.
 */
export function suggestionFor(itemId: string, canonicalId: string): SuggestionView | null {
  const r = rowsOf<any>(
    `SELECT m.*, h.extracted_name AS line_name, cp.canonical_name AS product_name, o.name AS manufacturer
     FROM match_pairs m
     JOIN hospital_purchase_items h ON h.id = m.hospital_item_id
     JOIN canonical_products cp ON cp.id = m.canonical_product_id
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id
     WHERE m.hospital_item_id = ? AND m.canonical_product_id = ? AND m.hospital_id = ?
       AND m.outcome = 'matched'`, itemId, canonicalId, HOSPITAL_ID)[0];
  if (!r) return null;
  const a = parseAnalysis(r.analysis_json);
  const status = (r.analysis_status ?? null) as AnalysisStatus | null;
  const analysis: ReplacementView | null = status ? {
    id: r.id, itemId, canonicalId, lineName: r.line_name, productName: r.product_name,
    manufacturer: r.manufacturer ?? "—", status, error: r.analysis_error ?? null,
    summary: a?.summary ?? null, verdict: a?.relation ?? null, confidence: a?.confidence ?? null,
    adapter: a?.adapter ?? null, webSearches: a?.webSearches ?? 0, sources: a?.sources ?? [],
    selectedAt: r.updated_at, finishedAt: r.analysed_at ?? null,
    points: (a?.points ?? []).map((p, n) => ({
      id: `${r.id}:${n}`, category: p.category, severity: p.severity, title: p.title,
      detail: p.explanation, text: p.supplier_question,
      routedTo: p.resolution === "ask_supplier" ? "supplier" as const : "sanovio_internal" as const,
      status: "open" as const, sentAt: null, answerText: null, clearedAt: null, clearedBy: null,
      sources: p.sources,
    })),
    counts: {
      total: a?.points.length ?? 0, open: a?.points.length ?? 0,
      blockingOpen: a?.points.filter((p) => p.severity === "blocking").length ?? 0, signedOff: 0,
    },
  } : null;
  return {
    itemId, canonicalId, lineName: r.line_name, productName: r.product_name,
    manufacturer: r.manufacturer ?? "—", relation: r.relation, confidence: r.confidence ?? 0,
    rationale: r.rationale ?? "", isTop: !!r.is_top, jevScore: r.jev_score, similarity: r.similarity,
    analysis,
  };
}

/** The line a product is the top suggestion for, when no line was named. */
export function suggestedLineFor(canonicalId: string): string | null {
  return rowsOf<{ hospital_item_id: string }>(
    `SELECT hospital_item_id FROM match_pairs WHERE canonical_product_id=? AND hospital_id=?
       AND outcome='matched' AND dismissed_at IS NULL
     ORDER BY is_top DESC, confidence DESC LIMIT 1`, canonicalId, HOSPITAL_ID)[0]?.hospital_item_id ?? null;
}

function parseAnalysis(json: string | null): ReplacementAnalysis | null {
  try { return json ? JSON.parse(json) as ReplacementAnalysis : null; } catch { return null; }
}

export interface SuggestionRun {
  id: string; trigger: string | null; status: "running" | "done" | "failed";
  startedAt: string; finishedAt: string | null;
  lines: number; products: number; pairsTotal: number;
  afterStage1: number; afterStage2: number; afterStage3: number; matched: number; analysed: number;
  jevCalls: number; claudeCalls: number; analysisCalls: number; reused: number; jevCost: number;
  adapters: string | null; error: string | null;
}

export function suggestionRuns(limit = 8): SuggestionRun[] {
  return rowsOf<any>(
    `SELECT * FROM suggestion_runs WHERE hospital_id = ? ORDER BY started_at DESC LIMIT ?`,
    HOSPITAL_ID, limit)
    .map((r) => ({
      id: r.id, trigger: r.trigger,
      // Stale runs are shown as the failure they became.
      status: r.status === "running" && Date.now() - new Date(r.started_at).getTime() > STALE_RUN_MS
        ? "failed" : r.status,
      startedAt: r.started_at, finishedAt: r.finished_at, lines: r.lines, products: r.products,
      pairsTotal: r.pairs_total, afterStage1: r.after_stage1, afterStage2: r.after_stage2,
      afterStage3: r.after_stage3, matched: r.matched, analysed: r.analysed,
      jevCalls: r.jev_calls, claudeCalls: r.claude_calls, analysisCalls: r.analysis_calls,
      reused: r.reused, jevCost: r.jev_cost, adapters: r.adapters, error: r.error,
    }));
}

/** Whether the cockpit should say suggestions are still arriving. */
export function suggestionsPending(): boolean {
  const run = suggestionRuns(1)[0];
  if (run?.status === "running") return true;
  return rowsOf<{ n: number }>(
    `SELECT COUNT(*) AS n FROM match_pairs WHERE hospital_id=? AND is_top=1
       AND analysis_status IN ('pending','running') AND updated_at > ?`,
    HOSPITAL_ID, new Date(Date.now() - STALE_RUN_MS).toISOString())[0].n > 0;
}

export interface PairLogRow {
  itemName: string; productName: string; outcome: string; stage: number | null; reason: string | null;
  similarity: number | null; jevScore: number | null; relation: string | null; confidence: number | null;
}

/** Dropped and rejected pairs, for auditing false negatives while tuning. */
export function pairLog(stage: number | null, limit = 150): PairLogRow[] {
  return rowsOf<any>(
    `SELECT h.extracted_name AS item_name, cp.canonical_name AS product_name, m.outcome,
            m.drop_stage, m.reason, m.similarity, m.jev_score, m.relation, m.confidence
     FROM match_pairs m
     JOIN hospital_purchase_items h ON h.id = m.hospital_item_id
     JOIN canonical_products cp ON cp.id = m.canonical_product_id
     WHERE m.hospital_id = ? AND m.outcome != 'matched' ${stage ? "AND m.drop_stage = ?" : ""}
     -- The drops worth a second look first: the closest calls at each stage.
     ORDER BY m.drop_stage DESC, COALESCE(m.jev_score, m.similarity, 0) DESC
     LIMIT ?`, ...(stage ? [HOSPITAL_ID, stage, limit] : [HOSPITAL_ID, limit]))
    .map((r) => ({
      itemName: r.item_name, productName: r.product_name, outcome: r.outcome, stage: r.drop_stage,
      reason: r.reason, similarity: r.similarity, jevScore: r.jev_score, relation: r.relation,
      confidence: r.confidence,
    }));
}

export function pairLogCounts(): { stage: number; n: number }[] {
  return rowsOf<{ stage: number; n: number }>(
    `SELECT drop_stage AS stage, COUNT(*) AS n FROM match_pairs
     WHERE hospital_id = ? AND outcome != 'matched' GROUP BY drop_stage ORDER BY drop_stage`, HOSPITAL_ID)
    .map((r) => ({ stage: r.stage, n: r.n }));
}
