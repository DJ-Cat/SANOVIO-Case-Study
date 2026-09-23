/**
 * A hospital choosing a replacement for one of its own lines, and the analysis
 * of what could go wrong if it does.
 *
 * Framework-free for the same reason lib/workflow.ts is: scripts/verify.ts
 * drives it directly. The one thing it leaves to the caller is *when* the
 * analysis runs — the server action schedules it after the response, the
 * verify script awaits it — because a web-searching model call takes minutes
 * and the buyer should not be holding a spinner on a form submit meanwhile.
 */
import { db, id, nowIso, tx, row } from "./db";
import { HOSPITAL_ID, BUYER, CLINICAL, STALE_RUN_MS } from "./constants";
import { baseUnits } from "./matching/recommend";
import { savingsPct, tierAtVolume, tiersFor, poolState } from "./pooling";
import { normaliseMdr, requiresClinicalReview } from "./matching/thresholds";
import { createHash } from "node:crypto";
import {
  analyseReplacement, type PriceFacts, type ReplacementContext, type ReplacementAnalysis,
} from "./ai";

export interface SelectOutcome {
  id: string; analysing: boolean;
  /** The suggestion pipeline had already analysed this exact pair. */
  precomputed?: boolean;
}

/**
 * Record that `itemId` is to be replaced by `canonicalId`.
 *
 * One replacement per line: choosing another product switches the choice.
 * What the previous choice's analysis raised and nobody acted on goes with it;
 * anything the buyer already signed off, sent or had answered stays on the
 * (line, product) pair it was about, detached rather than deleted.
 */
export function selectReplacement(itemId: string, canonicalId: string): SelectOutcome {
  const line = row<{ id: string }>(
    `SELECT id FROM hospital_purchase_items WHERE id=? AND hospital_id=?`, itemId, HOSPITAL_ID);
  if (!line) throw new Error("That line is not in your article master.");
  if (!row<{ id: string }>(`SELECT id FROM canonical_products WHERE id=?`, canonicalId)) {
    throw new Error("That product no longer exists.");
  }

  const existing = row<{ id: string; canonical_product_id: string; analysis_status: string }>(
    `SELECT id, canonical_product_id, analysis_status FROM replacements WHERE hospital_item_id=?`, itemId);

  // Choosing the same product again is not a new decision. A run that failed
  // is re-queued, because asking again is the natural way to retry it.
  if (existing && existing.canonical_product_id === canonicalId) {
    if (existing.analysis_status === "failed") {
      db().prepare(`UPDATE replacements SET analysis_status='pending', error=NULL WHERE id=?`)
        .run(existing.id);
      return { id: existing.id, analysing: true };
    }
    return { id: existing.id, analysing: existing.analysis_status !== "done" };
  }

  if (existing && replacementOrderability(existing.id).order) {
    throw new Error("This item's current replacement has already been ordered. Reject that order " +
      "under Approvals before choosing another product.");
  }

  const repId = id("rep");
  tx(() => {
    if (existing) detach(existing.id);
    db().prepare(
      `INSERT INTO replacements (id,hospital_id,hospital_item_id,canonical_product_id,selected_by,
         selected_at,analysis_status) VALUES (?,?,?,?,?,?,'pending')`)
      .run(repId, HOSPITAL_ID, itemId, canonicalId, BUYER, nowIso());
    // Questions already raised about this exact pair — by the Open problems
    // comparison, say — are about this replacement now.
    db().prepare(
      `UPDATE questions SET replacement_id=? WHERE hospital_item_id=? AND canonical_product_id=?`)
      .run(repId, itemId, canonicalId);
    logDecision(itemId, existing?.canonical_product_id ?? "", canonicalId);
  });
  // A suggestion that was pre-calculated is not calculated a second time.
  const adopted = tx(() => adoptPrecomputed(repId, itemId, canonicalId));
  return { id: repId, analysing: !adopted, precomputed: adopted };
}

/** Undo a choice. The line goes back to having no replacement. */
export function withdrawReplacement(replacementId: string): void {
  const rep = row<{ hospital_item_id: string; canonical_product_id: string }>(
    `SELECT hospital_item_id, canonical_product_id FROM replacements WHERE id=? AND hospital_id=?`,
    replacementId, HOSPITAL_ID);
  if (!rep) return;
  // An order in the approval chain is withdrawn by rejecting it there, not by
  // pulling the replacement out from under it.
  if (replacementOrderability(replacementId).order) {
    throw new Error("This replacement has been ordered. Reject the order under Approvals to withdraw it.");
  }
  tx(() => {
    detach(replacementId);
    logDecision(rep.hospital_item_id, rep.canonical_product_id, "");
  });
}

/** Remove a replacement row, keeping every decision a human made about it. */
function detach(replacementId: string) {
  const conn = db();
  conn.prepare(
    `DELETE FROM questions WHERE replacement_id=? AND status='open' AND sent_at IS NULL`)
    .run(replacementId);
  conn.prepare(`UPDATE questions SET replacement_id=NULL WHERE replacement_id=?`).run(replacementId);
  conn.prepare(`DELETE FROM replacements WHERE id=?`).run(replacementId);
}

function logDecision(itemId: string, from: string, to: string) {
  db().prepare(
    `INSERT INTO correction_log (id,item_type,item_id,field_changed,old_value,new_value,corrected_by,corrected_at)
     VALUES (?,?,?,?,?,?,?,?)`)
    .run(id("cl"), "hospital", itemId, "replacement_product_id", from, to, BUYER, nowIso());
}

/**
 * Queue a fresh analysis. Allowed once the last one finished, failed, or was
 * cut off; a run in flight is left to finish rather than raced.
 */
export function requestReanalysis(replacementId: string): boolean {
  // The analysis an order was placed on stays the one it was placed on.
  if (row(`SELECT 1 FROM replacements r JOIN orders o ON o.recommendation_id = r.recommendation_id
           WHERE r.id = ? AND o.status != 'rejected'`, replacementId)) return false;
  const stale = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const res = db().prepare(
    `UPDATE replacements SET analysis_status='pending', error=NULL
     WHERE id=? AND (analysis_status IN ('done','failed')
                     OR (analysis_status='running' AND analysis_started_at < ?))`)
    .run(replacementId, stale);
  return Number(res.changes) > 0;
}

/**
 * Run the analysis and turn its result into points on the worklist.
 *
 * Claims the row first, so two triggers for the same replacement cannot both
 * pay for a model call. A re-run replaces its own previous output but never a
 * point somebody acted on — signed off, sent, answered — because those are
 * decisions, not output.
 */
export async function runReplacementAnalysis(replacementId: string): Promise<void> {
  const conn = db();
  const claimed = conn.prepare(
    `UPDATE replacements SET analysis_status='running', analysis_started_at=?, error=NULL
     WHERE id=? AND analysis_status='pending'`).run(nowIso(), replacementId);
  if (Number(claimed.changes) === 0) return;

  try {
    const rep = row<{ hospital_item_id: string; canonical_product_id: string }>(
      `SELECT hospital_item_id, canonical_product_id FROM replacements WHERE id=?`, replacementId);
    if (!rep) throw new Error("The replacement was withdrawn.");
    const pair = contextForPair(rep.hospital_item_id, rep.canonical_product_id);
    const result = await analyseReplacement(pair.ctx);
    // The buyer may have withdrawn or switched while the model was working;
    // its answer is then about a choice that no longer exists.
    tx(() => {
      if (row(`SELECT 1 FROM replacements WHERE id=?`, replacementId)) {
        persistAnalysis(replacementId, pair, result);
      }
    });
  } catch (e) {
    conn.prepare(
      `UPDATE replacements SET analysis_status='failed', analysis_finished_at=?, error=? WHERE id=?`)
      .run(nowIso(), (e as Error).message, replacementId);
  }
}

/**
 * Write an analysis onto a replacement: its points onto the worklist, its
 * verdict onto the row. Runs inside the caller's transaction.
 *
 * Shared by a fresh run and by adopting one the suggestion pipeline already
 * paid for, so a pre-calculated match lands exactly as a live one would.
 */
function persistAnalysis(replacementId: string, pair: PairContext, result: ReplacementAnalysis) {
  const conn = db();
  const { itemId, canonicalId, supplierId, lineName, productName, ctx } = pair;
  conn.prepare(
    `DELETE FROM questions WHERE hospital_item_id=? AND canonical_product_id=?
       AND origin='ai_comparison' AND status='open' AND sent_at IS NULL
       AND (replacement_id=? OR replacement_id IS NULL)`)
    .run(itemId, canonicalId, replacementId);

  const seen = conn.prepare(
    `SELECT 1 FROM questions WHERE replacement_id=? AND category=? AND title=?`);
  const ins = conn.prepare(
    `INSERT INTO questions (id,recommendation_id,hospital_id,hospital_item_id,canonical_product_id,
       supplier_id,type,text,asked_by,routed_to,status,origin,created_at,
       replacement_id,category,title,detail,sources)
     VALUES (?,NULL,?,?,?,?,?,?,?,?,'open','ai_comparison',?,?,?,?,?,?)`);
  for (const p of result.points) {
    if (seen.get(replacementId, p.category, p.title)) continue;
    ins.run(id("q"), HOSPITAL_ID, itemId, canonicalId, supplierId,
      p.severity, supplierMessage(p.supplier_question, productName, lineName), BUYER,
      // `routed_to` keeps its meaning — who holds the answer. The hospital's
      // own judgement is the internal side of that line; the buyer can
      // still send any point on, which re-routes it.
      p.resolution === "ask_supplier" ? "supplier" : "sanovio_internal",
      nowIso(), replacementId, p.category, p.title, p.explanation, JSON.stringify(p.sources));
  }

  conn.prepare(
    `UPDATE replacements SET analysis_status='done', analysis_finished_at=?, verdict=?,
       confidence=?, summary=?, adapter=?, web_searches=?, sources=?, price_facts=?, error=NULL
     WHERE id=?`)
    .run(nowIso(), result.relation, result.confidence, result.summary, result.adapter,
      result.webSearches, JSON.stringify(result.sources), JSON.stringify(ctx.price), replacementId);
}

/**
 * Take over an analysis the suggestion pipeline already ran for this pair, if
 * it was run on exactly the data the pair has now. A price change or a
 * corrected attribute since then means the old answer is about a different
 * question, and a fresh run is the honest option.
 */
function adoptPrecomputed(replacementId: string, itemId: string, canonicalId: string): boolean {
  const pre = row<{ analysis_json: string; analysis_hash: string }>(
    `SELECT analysis_json, analysis_hash FROM match_pairs
     WHERE hospital_item_id=? AND canonical_product_id=? AND analysis_status='done'
       AND analysis_json IS NOT NULL`, itemId, canonicalId);
  if (!pre) return false;
  const pair = contextForPair(itemId, canonicalId);
  if (hashContext(pair.ctx) !== pre.analysis_hash) return false;
  let result: ReplacementAnalysis;
  try { result = JSON.parse(pre.analysis_json); } catch { return false; }
  db().prepare(`UPDATE replacements SET analysis_started_at=? WHERE id=?`).run(nowIso(), replacementId);
  persistAnalysis(replacementId, pair, result);
  return true;
}

/** Identity of an analysis input: same hash, same question, same answer. */
export function hashContext(ctx: ReplacementContext): string {
  return createHash("sha1").update(JSON.stringify(ctx)).digest("hex");
}

/**
 * The message a manufacturer receives. It lands in a thread that spans every
 * product this hospital has asked about, so it has to say which one.
 */
function supplierMessage(question: string, productName: string, lineName: string): string {
  const q = question.trim();
  const plain = (s: string) => s.toLowerCase().replace(/[®™]/g, "").replace(/\s+/g, " ");
  return plain(q).includes(plain(productName).slice(0, 12))
    ? q
    : `${productName} (to replace our ${lineName}): ${q}`;
}

/**
 * The hospital signs a point off: it has read it and accepts the switch
 * regardless. Kept as `cleared`, with who and when, like any cleared question.
 *
 * A safety point is recorded against the clinical approver rather than the
 * buyer — accepting a safety risk is the clinical gate of §5, not a budget
 * decision. An answered point can be signed off too; reading the manufacturer's
 * answer is usually what makes it signable.
 */
export function signOffPoint(questionId: string): void {
  const q = row<{ category: string | null }>(
    `SELECT category FROM questions WHERE id=? AND hospital_id=? AND status IN ('open','answered')`,
    questionId, HOSPITAL_ID);
  if (!q) return;
  db().prepare(`UPDATE questions SET status='cleared', cleared_at=?, cleared_by=? WHERE id=?`)
    .run(nowIso(), q.category === "safety" ? CLINICAL : BUYER, questionId);
}

// --- context -------------------------------------------------------------

export interface PairContext {
  ctx: ReplacementContext; itemId: string; canonicalId: string; supplierId: string | null;
  lineName: string; productName: string;
}

/** Everything the analysis is told about one line and one candidate product. */
export function contextForPair(itemId: string, canonicalId: string): PairContext {
  const rep = { hospital_item_id: itemId, canonical_product_id: canonicalId };

  const item = row<{
    id: string; extracted_name: string; extracted_brand: string | null; extracted_spec: string | null;
    extracted_sku: string | null; extracted_gtin: string | null; extracted_pack_size: number | null;
    extracted_uom: string | null; declared_mdr_class: string | null; annual_volume: number | null;
    current_unit_price: number | null; currency: string; current_supplier_name: string | null;
    extraction_confidence: number; canonical_product_id: string | null;
    matched_name: string | null; matched_attributes: string | null; source_file: string | null;
  }>(`SELECT h.*, cp.canonical_name AS matched_name, cp.attributes AS matched_attributes,
             d.filename AS source_file
      FROM hospital_purchase_items h
      LEFT JOIN canonical_products cp ON cp.id = h.canonical_product_id
      LEFT JOIN source_documents d ON d.id = h.source_document_id
      WHERE h.id=?`, rep.hospital_item_id);

  const cand = row<{
    id: string; canonical_name: string; gtin: string | null; base_uom: string; base_pack_size: number;
    mdr_risk_class: string; attributes: string; eclass_code: string | null; description: string | null;
    manufacturer_id: string | null; manufacturer_name: string | null;
    sku: string | null; extraction_confidence: number | null; source_file: string | null;
  }>(`SELECT cp.*, o.name AS manufacturer_name, s.extracted_sku AS sku,
             s.extraction_confidence, d.filename AS source_file
      FROM canonical_products cp
      LEFT JOIN organizations o ON o.id = cp.manufacturer_id
      LEFT JOIN supplier_catalog_items s
             ON s.id = (SELECT s2.id FROM supplier_catalog_items s2
                        WHERE s2.canonical_product_id = cp.id ORDER BY s2.created_at ASC LIMIT 1)
      LEFT JOIN source_documents d ON d.id = s.source_document_id
      WHERE cp.id=?`, rep.canonical_product_id);

  if (!item || !cand) throw new Error("The line or the product no longer exists.");

  const link = row<{ link_method: string; status: string }>(
    `SELECT link_method, status FROM item_links WHERE item_type='hospital' AND item_id=?
       AND status != 'rejected' ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END LIMIT 1`, item.id);

  const ctx: ReplacementContext = {
    current: {
      name: item.extracted_name, manufacturer: item.extracted_brand ?? "unknown",
      sku: item.extracted_sku, gtin: item.extracted_gtin,
      uom: item.extracted_uom ?? "Stück", packSize: item.extracted_pack_size || 1,
      mdrClass: item.declared_mdr_class ?? "IIa", attributes: json(item.matched_attributes),
      spec: item.extracted_spec, currentSupplier: item.current_supplier_name,
      sourceFile: item.source_file, extractionConfidence: item.extraction_confidence,
      matchedProduct: item.matched_name,
      linkMethod: link ? `${link.link_method} (${link.status})` : null,
    },
    candidate: {
      name: cand.canonical_name, manufacturer: cand.manufacturer_name ?? "unknown",
      sku: cand.sku, gtin: cand.gtin, uom: cand.base_uom, packSize: cand.base_pack_size || 1,
      mdrClass: cand.mdr_risk_class, attributes: json(cand.attributes),
      eclass: cand.eclass_code, description: cand.description,
      extractionConfidence: cand.extraction_confidence, sourceFile: cand.source_file,
    },
    price: priceFacts(item, cand),
  };

  return {
    ctx, itemId: item.id, canonicalId: cand.id, supplierId: cand.manufacturer_id,
    lineName: item.extracted_name, productName: cand.canonical_name,
  };
}

/**
 * The price comparison, as arithmetic.
 *
 * Priced at the tier the hospital's *own* annual volume reaches, not the
 * pool's. That is the price this hospital is guaranteed whatever its peers
 * do, so it cannot overstate the saving — and it keeps the pool's position,
 * which neither portal shows, out of a text a model writes and a buyer reads.
 */
export function priceFacts(
  item: { annual_volume: number | null; extracted_pack_size: number | null; extracted_uom: string | null;
          current_unit_price: number | null; currency: string },
  cand: { id: string; manufacturer_id: string | null; base_uom: string },
): PriceFacts {
  const volume = baseUnits(item.annual_volume ?? 0, item.extracted_pack_size ?? 1);
  const tiers = cand.manufacturer_id ? tiersFor(cand.id, cand.manufacturer_id) : [];
  const tier = tiers.length ? tierAtVolume(tiers, volume) : null;
  const currentUnit = item.extracted_uom ?? "Stück";
  const candidateCurrency = tiers[0]?.currency ?? null;
  // Whether the two prices are per the same thing. With no offer there is
  // nothing to mismatch; that absence is reported as its own finding.
  const comparable = tier == null
    || (sameUnit(currentUnit, cand.base_uom) && candidateCurrency === item.currency);
  const both = comparable && tier != null && item.current_unit_price != null;

  return {
    currentCurrency: item.currency, candidateCurrency,
    currentUnitPrice: item.current_unit_price, currentUnit,
    offeredUnitPrice: tier?.unit_price ?? null, offeredUnit: cand.base_uom,
    offeredTierFrom: tier?.min_volume ?? null,
    priceOrigin: row<{ origin: string }>(
      `SELECT origin FROM price_tiers WHERE canonical_product_id=? LIMIT 1`, cand.id)?.origin ?? null,
    tiers: tiers.map((t) => ({ minVolume: t.min_volume, unitPrice: t.unit_price })),
    annualBaseUnits: volume,
    comparable,
    deltaPct: both ? savingsPct(item.current_unit_price!, tier!.unit_price) : null,
    annualDelta: both
      ? Math.round((item.current_unit_price! - tier!.unit_price) * volume * 100) / 100
      : null,
  };
}

const PIECE = new Set(["stück", "stk", "st", "piece", "pieces", "pcs", "pc", "ea", "each", "unit"]);
function sameUnit(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[.\s]/g, "");
  return n(a) === n(b) || (PIECE.has(n(a)) && PIECE.has(n(b)));
}

function json(s: string | null): Record<string, unknown> {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

// --- Ordering a chosen replacement ------------------------------------------

export interface Orderability {
  canOrder: boolean;
  /** Why not, in the order a buyer would fix them. Empty when it can be ordered. */
  reasons: string[];
  type: "identity" | "substitution";
  requiresClinical: boolean;
  supplierName: string | null;
  currency: string;
  /** Annual volume in base units, as the order will carry it. */
  volume: number;
  unitPrice: number | null; baseline: number | null;
  savingsPct: number | null; annualSavings: number | null;
  /** The live order, if one was placed and not rejected. */
  order: { id: string; status: string } | null;
}

/**
 * Whether a chosen replacement can go to approval, and at what price.
 *
 * The gates are the §5 ones, read off the replacement instead of a
 * recommendation: the analysis has to have finished, no blocking point may be
 * left unsigned — a manufacturer's answer still needs the hospital's
 * sign-off — and there has to be a price on both sides, because an order is a
 * price somebody quoted. Non-blocking points do not hold an order up, as
 * non-blocking questions never did.
 *
 * Priced at the pool's current tier, as every other order is: pooled volume
 * is what sets the price. The analysis quoted the tier the hospital reaches
 * alone, which is never lower, so the order can only come in at or under it.
 */
export function replacementOrderability(replacementId: string): Orderability {
  const r = row<{
    hospital_item_id: string; canonical_product_id: string; analysis_status: string;
    analysis_started_at: string | null; recommendation_id: string | null;
    annual_volume: number | null; extracted_pack_size: number | null; extracted_uom: string | null;
    current_unit_price: number | null; line_currency: string; line_canonical: string | null;
    base_uom: string; mdr_risk_class: string; manufacturer_id: string | null; manufacturer_name: string | null;
  }>(`SELECT r.hospital_item_id, r.canonical_product_id, r.analysis_status, r.analysis_started_at,
             r.recommendation_id, h.annual_volume, h.extracted_pack_size, h.extracted_uom,
             h.current_unit_price, h.currency AS line_currency, h.canonical_product_id AS line_canonical,
             cp.base_uom, cp.mdr_risk_class, cp.manufacturer_id, o.name AS manufacturer_name
      FROM replacements r
      JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
      JOIN canonical_products cp ON cp.id = r.canonical_product_id
      LEFT JOIN organizations o ON o.id = cp.manufacturer_id
      WHERE r.id = ? AND r.hospital_id = ?`, replacementId, HOSPITAL_ID);
  if (!r) throw new Error("That replacement no longer exists.");

  const type = r.line_canonical === r.canonical_product_id ? "identity" : "substitution";
  const requiresClinical = requiresClinicalReview(type, normaliseMdr(r.mdr_risk_class));
  const volume = baseUnits(r.annual_volume ?? 0, r.extracted_pack_size ?? 1);
  const reasons: string[] = [];

  const order = r.recommendation_id
    ? row<{ id: string; status: string }>(
        `SELECT id, status FROM orders WHERE recommendation_id = ? AND status != 'rejected'
         ORDER BY created_at DESC LIMIT 1`, r.recommendation_id) ?? null
    : null;
  if (order) reasons.push("It has already been ordered.");

  const stale = r.analysis_status === "running" && r.analysis_started_at
    && Date.now() - new Date(r.analysis_started_at).getTime() > STALE_RUN_MS;
  if (r.analysis_status === "failed" || stale) reasons.push("The match analysis failed — run it again first.");
  else if (r.analysis_status !== "done") reasons.push("The match is still being calculated.");

  const blocking = row<{ n: number }>(
    `SELECT COUNT(*) AS n FROM questions WHERE replacement_id = ? AND type = 'blocking'
       AND status IN ('open','answered')`, replacementId)!.n;
  if (blocking) {
    reasons.push(`${blocking} blocking point${blocking === 1 ? "" : "s"} still need${blocking === 1 ? "s" : ""} signing off.`);
  }

  const tiers = r.manufacturer_id ? tiersFor(r.canonical_product_id, r.manufacturer_id) : [];
  const tier = tiers.length && r.manufacturer_id
    ? poolState(r.canonical_product_id, r.manufacturer_id, volume).currentTier ?? tierAtVolume(tiers, volume)
    : null;
  const currency = tier?.currency ?? r.line_currency ?? "CHF";
  if (!tier) reasons.push(`${r.manufacturer_name ?? "The manufacturer"} has not published a price yet.`);
  if (r.current_unit_price == null) reasons.push("Today's price for this item is unknown, so the order has no baseline.");
  if (tier && r.current_unit_price != null
      && (!sameUnit(r.extracted_uom ?? "Stück", r.base_uom) || currency !== r.line_currency)) {
    reasons.push(`Today's price is per ${r.extracted_uom ?? "Stück"} in ${r.line_currency}, the offer per ${r.base_uom} in ${currency} — settle the basis first.`);
  }
  if (volume <= 0) reasons.push("The item has no annual volume to order.");

  const baseline = r.current_unit_price;
  const unitPrice = tier?.unit_price ?? null;
  const priced = baseline != null && unitPrice != null;
  return {
    canOrder: reasons.length === 0, reasons, type, requiresClinical,
    supplierName: r.manufacturer_name, currency, volume, unitPrice, baseline,
    savingsPct: priced ? savingsPct(baseline!, unitPrice!) : null,
    annualSavings: priced ? Math.round((baseline! - unitPrice!) * volume * 100) / 100 : null,
    order,
  };
}

/**
 * Send a chosen replacement to approval.
 *
 * Creates the order through the existing §5 chain rather than beside it: a
 * recommendation carries the price, the pool and the clinical flag, and the
 * approvals page, pooling and fulfilment all read orders through one. If the
 * pipeline had already put up a recommendation for this exact pair, that one
 * is the order's — two cards for one purchase would each look open.
 */
export function orderReplacement(replacementId: string): { orderId: string; status: string } {
  const check = replacementOrderability(replacementId);
  if (!check.canOrder) throw new Error(check.reasons[0]);

  const rep = row<{ hospital_item_id: string; canonical_product_id: string; recommendation_id: string | null;
                    summary: string | null; confidence: number | null; line_canonical: string | null;
                    manufacturer_id: string }>(
    `SELECT r.hospital_item_id, r.canonical_product_id, r.recommendation_id, r.summary, r.confidence,
            h.canonical_product_id AS line_canonical, cp.manufacturer_id
     FROM replacements r JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
     JOIN canonical_products cp ON cp.id = r.canonical_product_id WHERE r.id = ?`, replacementId)!;
  const supplierId = rep.manufacturer_id;
  const pool = poolState(rep.canonical_product_id, supplierId, check.volume);
  const status = check.requiresClinical ? "pending_clinical" : "pending_approval";
  const conn = db();

  return tx(() => {
    const existing = rep.recommendation_id ?? row<{ id: string }>(
      `SELECT id FROM recommendations WHERE hospital_item_id = ? AND recommended_canonical_product_id = ?
         AND supplier_id = ? AND status IN ('new','in_progress','blocked') LIMIT 1`,
      rep.hospital_item_id, rep.canonical_product_id, supplierId)?.id ?? null;
    const fields = [
      check.baseline, check.unitPrice, check.annualSavings ?? 0, check.savingsPct ?? 0,
      check.type === "substitution" ? rep.confidence : null,
      rep.summary ?? "Chosen by the buyer with Replace with this.",
      check.requiresClinical ? 1 : 0, pool.poolId, nowIso(),
    ];
    let recId: string;
    if (existing) {
      recId = existing;
      conn.prepare(
        `UPDATE recommendations SET baseline_unit_price=?, offered_unit_price=?, savings_amount=?,
           savings_pct=?, match_confidence=?, rationale=?, requires_clinical_review=?,
           demand_pool_id=?, updated_at=?, status='ordered' WHERE id=?`).run(...(fields as never[]), recId);
    } else {
      recId = id("rec");
      conn.prepare(
        `INSERT INTO recommendations (id, type, hospital_id, hospital_item_id, canonical_product_id,
           recommended_canonical_product_id, supplier_id, demand_pool_id, baseline_unit_price,
           offered_unit_price, savings_amount, savings_pct, match_confidence, rationale,
           differing_attributes, requires_clinical_review, status, origin, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'[]',?,'ordered','replacement',?,?)`)
        .run(recId, check.type, HOSPITAL_ID, rep.hospital_item_id, rep.line_canonical,
          rep.canonical_product_id, supplierId, pool.poolId, check.baseline, check.unitPrice,
          check.annualSavings ?? 0, check.savingsPct ?? 0,
          check.type === "substitution" ? rep.confidence : null,
          rep.summary ?? "Chosen by the buyer with Replace with this.",
          check.requiresClinical ? 1 : 0, nowIso(), nowIso());
    }
    const orderId = id("ord");
    conn.prepare(
      `INSERT INTO orders (id,recommendation_id,hospital_id,requested_by,demand_pool_id,volume,status,
         created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(orderId, recId, HOSPITAL_ID, BUYER, pool.poolId, check.volume, status, nowIso(), nowIso());
    conn.prepare(`UPDATE replacements SET recommendation_id=?, ordered_at=? WHERE id=?`)
      .run(recId, nowIso(), replacementId);
    return { orderId, status };
  });
}
