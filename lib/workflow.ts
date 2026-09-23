/**
 * The §5 state machine and the §3 review actions, as plain functions.
 *
 * Deliberately free of any Next.js import: the workflow is domain logic, and
 * keeping it separate means it can be exercised directly (scripts/verify.ts)
 * rather than only through a rendered form.
 */
import { db, id, nowIso, tx, row, rows } from "./db";
import { ingestHospitalDemand, ingestSupplierCatalogue, tierLadder, promoteToCanonical } from "./ingest";
import { runMatching } from "./matching/pipeline";
import { rebuildRecommendations, baseUnits } from "./matching/recommend";
import { HOSPITAL_ID, BUYER, APPROVER, CLINICAL } from "./constants";
import { compareForReview, type ProductView } from "./ai";
import { postMessage } from "./messaging";

function logCorrection(
  itemType: string, itemId: string, field: string, oldV: string, newV: string, by: string | null,
) {
  db().prepare(
    `INSERT INTO correction_log (id,item_type,item_id,field_changed,old_value,new_value,corrected_by,corrected_at)
     VALUES (?,?,?,?,?,?,?,?)`).run(id("cl"), itemType, itemId, field, oldV, newV, by, nowIso());
}

// --- §3 review queue ----------------------------------------------------

/** Confirm a proposed item -> canonical link. This is the human in the loop. */
export async function confirmLink(linkId: string) {
  const conn = db();
  const link = conn.prepare(`SELECT * FROM item_links WHERE id = ?`).get(linkId) as any;
  if (!link) return;
  const table = link.item_type === "hospital" ? "hospital_purchase_items" : "supplier_catalog_items";
  tx(() => {
    conn.prepare(`UPDATE item_links SET status='confirmed', link_method='human' WHERE id=?`).run(linkId);
    conn.prepare(`UPDATE ${table} SET canonical_product_id=?, status='linked', corrected_by=?, corrected_at=? WHERE id=?`)
      .run(link.canonical_product_id, BUYER, nowIso(), link.item_id);
  });
  logCorrection(link.item_type, link.item_id, "canonical_product_id", "", link.canonical_product_id, BUYER);
  await regenerate();
}

export async function rejectLink(linkId: string) {
  db().prepare(`UPDATE item_links SET status='rejected' WHERE id=?`).run(linkId);
}

/** Confirm a low-confidence extraction as-is. */
export async function confirmExtraction(itemId: string, kind: "hospital" | "supplier") {
  const table = kind === "hospital" ? "hospital_purchase_items" : "supplier_catalog_items";
  const conn = db();
  const before = row<{ extraction_confidence: number }>(
    `SELECT extraction_confidence FROM ${table} WHERE id=?`, itemId);
  const by = kind === "hospital"
    ? userInOrg(HOSPITAL_ID, "hospital_buyer")
    : supplierUserFor(itemId);
  conn.prepare(`UPDATE ${table} SET status='active', extraction_confidence=100, corrected_by=?, corrected_at=? WHERE id=?`)
    .run(by, nowIso(), itemId);
  logCorrection(kind, itemId, "extraction_confidence", String(before?.extraction_confidence ?? ""), "100", by);
  if (kind === "supplier") promoteConfirmedSupplierItem(itemId);
  await regenerate();
}

/**
 * Who to record as having made a change.
 *
 * Resolved from the organisation that owns the row and the role entitled to
 * act on it, never from a literal user id: the id shape belongs to whatever
 * user table this is deployed against, and a constant that does not exist
 * there fails the foreign key at write time.
 *
 * Null when no such user exists. Every `corrected_by` / `answered_by` column
 * is nullable, and an unattributed change is honest where attributing it to
 * the wrong person is not.
 */
function userInOrg(orgId: string | null | undefined, role: string): string | null {
  if (!orgId) return null;
  return row<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = ? AND role = ? LIMIT 1`, orgId, role)?.id ?? null;
}

/** The manufacturer's own user, from the catalogue row being acted on. */
function supplierUserFor(itemId: string): string | null {
  return row<{ id: string }>(
    `SELECT u.id FROM supplier_catalog_items s
     JOIN users u ON u.organization_id = s.supplier_id AND u.role = 'supplier_user'
     WHERE s.id = ? LIMIT 1`, itemId)?.id ?? null;
}

/**
 * A manufacturer confirming one of its own rows is the authority on that
 * article, so the row becomes a canonical product others can be matched
 * against. Without this the review queue is a dead end: rows would be cleared
 * and still never enter the index.
 */
function promoteConfirmedSupplierItem(itemId: string) {
  const item = row<{
    id: string; supplier_id: string; extracted_name: string; extracted_sku: string;
    extracted_spec: string | null; extracted_gtin: string | null; extracted_pack_size: number | null;
    extracted_uom: string | null; extracted_price: number | null; canonical_product_id: string | null;
    raw_extraction_payload: string | null;
  }>(`SELECT * FROM supplier_catalog_items WHERE id = ?`, itemId);
  if (!item || item.canonical_product_id) return;

  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(item.raw_extraction_payload ?? "{}"); } catch { /* keep empty */ }

  promoteToCanonical(item.supplier_id, [{
    itemId: item.id,
    row: {
      name: item.extracted_name, sku: item.extracted_sku, spec: item.extracted_spec ?? "",
      pack_size: item.extracted_pack_size ?? 1, uom: item.extracted_uom ?? "Stück",
      confidence: 100, missing: [], page: 0, raw: "",
      gtin: item.extracted_gtin ?? "",
      mdr_class: String(raw.mdr_class ?? ""),
      eclass: String(raw.eclass ?? ""),
      price: item.extracted_price ?? 0,
    },
  }]);
  seedPeerDemandForNewPools();
}

/** Correct a field on a low-confidence extraction, then re-run matching. */
export async function correctField(formData: FormData) {
  const itemId = String(formData.get("itemId"));
  const kind = String(formData.get("kind")) as unknown as "hospital" | "supplier";
  const field = String(formData.get("field"));
  const value = String(formData.get("value") ?? "").trim();
  const allowed = new Set([
    "extracted_name", "extracted_sku", "extracted_gtin", "extracted_spec",
    "extracted_pack_size", "current_unit_price", "annual_volume", "declared_mdr_class",
  ]);
  if (!allowed.has(field)) return;

  const table = kind === "hospital" ? "hospital_purchase_items" : "supplier_catalog_items";
  const conn = db();
  const before = conn.prepare(`SELECT ${field} AS v FROM ${table} WHERE id=?`).get(itemId) as any;
  const by = kind === "hospital"
    ? userInOrg(HOSPITAL_ID, "hospital_buyer")
    : supplierUserFor(itemId);
  conn.prepare(`UPDATE ${table} SET ${field}=?, status='active', extraction_confidence=100,
                corrected_by=?, corrected_at=? WHERE id=?`)
    .run(value, by, nowIso(), itemId);
  logCorrection(kind, itemId, field, String(before?.v ?? ""), value, by);
  await regenerate();
}

// --- §5 recommendation -> order ----------------------------------------

export async function dismiss(recId: string, reason: string | null) {
  db().prepare(`UPDATE recommendations SET status='dismissed', dismissed_reason=?, updated_at=? WHERE id=?`)
    .run(reason, nowIso(), recId);
}

export async function reconsider(recId: string) {
  db().prepare(`UPDATE recommendations SET status='new', dismissed_reason=NULL, updated_at=? WHERE id=?`)
    .run(nowIso(), recId);
}

export async function startReplace(recId: string) {
  const conn = db();
  const blocking = conn.prepare(
    `SELECT COUNT(*) AS n FROM questions WHERE recommendation_id=? AND type='blocking' AND status='open'`)
    .get(recId) as any;
  conn.prepare(`UPDATE recommendations SET status=?, updated_at=? WHERE id=?`)
    .run(blocking.n > 0 ? "blocked" : "in_progress", nowIso(), recId);
}

export async function askQuestion(formData: FormData) {
  const recId = String(formData.get("recId"));
  const text = String(formData.get("text") ?? "").trim();
  const type = String(formData.get("type")) === "blocking" ? "blocking" : "non_blocking";
  if (!text) return;
  const rec = row<{ supplier_id: string; hospital_id: string; recommended_canonical_product_id: string;
                    hospital_item_id: string }>(
    `SELECT supplier_id, hospital_id, recommended_canonical_product_id, hospital_item_id
     FROM recommendations WHERE id=?`, recId);
  if (!rec) return;
  const qId = id("q");
  db().prepare(
    `INSERT INTO questions (id,recommendation_id,hospital_id,hospital_item_id,canonical_product_id,
       supplier_id,type,text,asked_by,routed_to,status,origin,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(qId, recId, rec.hospital_id, rec.hospital_item_id, rec.recommended_canonical_product_id,
      rec.supplier_id, type, text, BUYER, "supplier", "open", "user", nowIso());
  // Asking the supplier is writing to them: the question goes straight into
  // this hospital's conversation with that manufacturer, as a card it can
  // answer there.
  sendProblemToSupplier(qId);
  await syncBlockedState(recId);
}

export async function answerQuestion(formData: FormData) {
  const qId = String(formData.get("qId"));
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const conn = db();
  const q = row<{ recommendation_id: string; routed_to: string }>(
    `SELECT recommendation_id, routed_to FROM questions WHERE id=?`, qId);
  if (!q) return;

  // Who answers is a property of where the question was routed, not something
  // the submitting form gets to choose.
  const by = q.routed_to === "sanovio_internal"
    ? userInOrg(
        row<{ id: string }>(`SELECT id FROM organizations WHERE type='sanovio' LIMIT 1`)?.id,
        "sanovio_admin")
    : row<{ id: string }>(
        `SELECT u.id FROM recommendations r
         JOIN users u ON u.organization_id = r.supplier_id AND u.role='supplier_user'
         WHERE r.id = ? LIMIT 1`, q.recommendation_id)?.id ?? null;

  conn.prepare(`UPDATE questions SET answer_text=?, answered_by=?, status='answered' WHERE id=?`)
    .run(text, by, qId);
  await syncBlockedState(q.recommendation_id);
}

/** Non-blocking questions can be skipped; blocking ones cannot. */
export async function skipQuestion(qId: string) {
  const conn = db();
  const q = conn.prepare(`SELECT * FROM questions WHERE id=?`).get(qId) as any;
  if (!q || q.type === "blocking") return;
  conn.prepare(`UPDATE questions SET status='skipped' WHERE id=?`).run(qId);
}

/** The red gate: an open blocking question puts the recommendation in `blocked`. */
async function syncBlockedState(recId: string) {
  const conn = db();
  const rec = conn.prepare(`SELECT status FROM recommendations WHERE id=?`).get(recId) as any;
  if (!rec || rec.status === "ordered" || rec.status === "dismissed") return;
  const open = conn.prepare(
    `SELECT COUNT(*) AS n FROM questions WHERE recommendation_id=? AND type='blocking' AND status='open'`)
    .get(recId) as any;
  const next = open.n > 0 ? "blocked" : rec.status === "blocked" ? "in_progress" : rec.status;
  conn.prepare(`UPDATE recommendations SET status=?, updated_at=? WHERE id=?`).run(next, nowIso(), recId);
}

export async function submitOrder(recId: string) {
  const conn = db();
  const rec = conn.prepare(
    `SELECT r.*, h.annual_volume, h.extracted_pack_size FROM recommendations r
     JOIN hospital_purchase_items h ON h.id = r.hospital_item_id WHERE r.id=?`).get(recId) as any;
  if (!rec) return;

  // Gate: cannot submit while a blocking question is open (§5).
  const open = conn.prepare(
    `SELECT COUNT(*) AS n FROM questions WHERE recommendation_id=? AND type='blocking' AND status='open'`)
    .get(recId) as any;
  if (open.n > 0) return;

  const volume = baseUnits(rec.annual_volume, rec.extracted_pack_size);
  const status = rec.requires_clinical_review ? "pending_clinical" : "pending_approval";
  tx(() => {
    conn.prepare(
      `INSERT INTO orders (id,recommendation_id,hospital_id,requested_by,demand_pool_id,volume,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id("ord"), recId, HOSPITAL_ID, BUYER, rec.demand_pool_id, volume, status, nowIso(), nowIso());
    conn.prepare(`UPDATE recommendations SET status='ordered', updated_at=? WHERE id=?`).run(nowIso(), recId);
  });
}

// --- §5 approval chain ---------------------------------------------------

export async function clinicalSignOff(orderId: string) {
  db().prepare(
    `UPDATE orders SET status='pending_approval', clinical_approver_id=?, clinical_approved_at=?, updated_at=?
     WHERE id=? AND status='pending_clinical'`).run(CLINICAL, nowIso(), nowIso(), orderId);
}

export async function approveOrder(orderId: string) {
  const conn = db();
  const order = conn.prepare(`SELECT * FROM orders WHERE id=? AND status='pending_approval'`).get(orderId) as any;
  if (!order) return;
  tx(() => {
    conn.prepare(`UPDATE orders SET status='pooled', approver_id=?, approved_at=?, updated_at=? WHERE id=?`)
      .run(APPROVER, nowIso(), nowIso(), orderId);
    // Approved volume joins the pool as a committed line — this is what moves
    // the pool toward the next price tier.
    if (order.demand_pool_id) {
      const existing = conn.prepare(
        `SELECT id FROM pooled_demand WHERE demand_pool_id=? AND hospital_id=?`)
        .get(order.demand_pool_id, order.hospital_id) as any;
      if (existing) {
        conn.prepare(`UPDATE pooled_demand SET annual_volume=?, commitment='committed', committed_at=? WHERE id=?`)
          .run(order.volume, nowIso(), existing.id);
      } else {
        conn.prepare(
          `INSERT INTO pooled_demand (id,demand_pool_id,hospital_id,annual_volume,commitment,committed_at)
           VALUES (?,?,?,?,?,?)`)
          .run(id("pd"), order.demand_pool_id, order.hospital_id, order.volume, "committed", nowIso());
      }
    }
  });
}

export async function rejectOrder(formData: FormData) {
  const orderId = String(formData.get("orderId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const conn = db();
  const order = conn.prepare(
    `SELECT o.recommendation_id, r.origin FROM orders o
     JOIN recommendations r ON r.id = o.recommendation_id WHERE o.id=?`).get(orderId) as any;
  tx(() => {
    conn.prepare(`UPDATE orders SET status='rejected', approver_id=?, rejected_reason=?, updated_at=? WHERE id=?`)
      .run(APPROVER, reason, nowIso(), orderId);
    if (order) {
      // A pipeline suggestion goes back on the feed. A buyer's own replacement
      // goes back to them, still chosen, ready to order again or withdraw.
      conn.prepare(`UPDATE recommendations SET status=?, updated_at=? WHERE id=?`)
        .run(order.origin === "replacement" ? "in_progress" : "new", nowIso(), order.recommendation_id);
      conn.prepare(`UPDATE replacements SET ordered_at=NULL WHERE recommendation_id=?`)
        .run(order.recommendation_id);
    }
  });
}

/** Pool locks and the order is placed with the manufacturer. */
export async function lockPoolAndFulfil(orderId: string) {
  const conn = db();
  const order = conn.prepare(`SELECT * FROM orders WHERE id=? AND status='pooled'`).get(orderId) as any;
  if (!order) return;
  tx(() => {
    if (order.demand_pool_id) {
      conn.prepare(`UPDATE demand_pools SET status='contracted' WHERE id=?`).run(order.demand_pool_id);
    }
    conn.prepare(`UPDATE orders SET status='sanovio_fulfillment', sanovio_fulfillment_ref=?, updated_at=? WHERE id=?`)
      .run(`SNV-${orderId.slice(-6).toUpperCase()}`, nowIso(), orderId);
  });
}

export async function markFulfilled(orderId: string) {
  db().prepare(`UPDATE orders SET status='fulfilled', updated_at=? WHERE id=? AND status='sanovio_fulfillment'`)
    .run(nowIso(), orderId);
}

// --- pipeline -----------------------------------------------------------

export async function rerunPipeline() { await regenerate(); }

async function regenerate() {
  await runMatching();
  // Substitutions come from the suggestion pipeline's matched pairs, which
  // runs after uploads on its own (lib/matching/suggest.ts) and rebuilds
  // these again when it lands. There is no product-to-product graph to build:
  // comparing every catalogue product with every other was the one stage
  // with no cheap filter in front of the model.
  await rebuildRecommendations();
}

// --- uploads -------------------------------------------------------------

export interface UploadOutcome {
  ok: boolean;
  message: string;
  detail?: string;
}

/**
 * Hospital demand upload. The file is stored verbatim, extracted, and the
 * pipeline is re-run so recommendations reflect the new articles immediately.
 */
export async function uploadHospitalDemand(formData: FormData): Promise<UploadOutcome> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const res = await ingestHospitalDemand(
      HOSPITAL_ID, BUYER, file.name, file.type || "application/octet-stream", bytes);
    await regenerate();
    return {
      ok: true,
      message: `${file.name}: ${res.rows} article rows read.`,
      detail: res.needsReview
        ? `${res.accepted} accepted, ${res.needsReview} held for review.`
        : `All ${res.accepted} rows cleared the extraction threshold.`,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Manufacturer catalogue upload. Accepted rows become canonical products. */
export async function uploadSupplierCatalogue(formData: FormData): Promise<UploadOutcome> {
  const file = formData.get("file");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  if (!supplierId) return { ok: false, message: "Choose which manufacturer this catalogue belongs to." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const userId = row<{ id: string }>(
    `SELECT id FROM users WHERE organization_id=? AND role='supplier_user' LIMIT 1`, supplierId)?.id ?? null;
  try {
    const res = await ingestSupplierCatalogue(
      supplierId, userId ?? "", file.name, file.type || "application/pdf", bytes);
    seedPeerDemandForNewPools();
    await regenerate();
    const images = res.images ? `, ${res.images} product image(s) recovered` : "";
    return {
      ok: true,
      message: `${file.name}: ${res.rows} SKUs read, ${res.newProducts} products created${images}.`,
      detail: res.note ?? `All ${res.accepted} rows cleared the extraction threshold.`,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Set a real base price for a product; regenerates its volume ladder. */
/**
 * Give every pool without peer volume a deterministic set of peer hospitals.
 * A buying group with one member is not a buying group; without this the
 * pooling mechanic has nothing to demonstrate.
 */
export function seedPeerDemandForNewPools() {
  const conn = db();
  const peers = rows<{ id: string }>(
    `SELECT id FROM organizations WHERE type='hospital' AND id != ?`, HOSPITAL_ID);
  if (!peers.length) return;

  const empty = rows<{ id: string; canonical_product_id: string; tier_step: number }>(
    `SELECT dp.id, dp.canonical_product_id,
            COALESCE((SELECT MIN(min_volume) FROM price_tiers t
                      WHERE t.canonical_product_id = dp.canonical_product_id
                        AND t.supplier_id = dp.supplier_id AND t.min_volume > 0), 250000) AS tier_step
     FROM demand_pools dp
     WHERE NOT EXISTS (SELECT 1 FROM pooled_demand pd WHERE pd.demand_pool_id = dp.id)`);

  const ins = conn.prepare(
    `INSERT INTO pooled_demand (id,demand_pool_id,hospital_id,annual_volume,commitment,committed_at)
     VALUES (?,?,?,?,?,?)`);
  tx(() => {
    for (const pool of empty) {
      const h = hashStr(pool.canonical_product_id);
      // Peer volume is sized against the product's own first volume break, so
      // a pool is plausibly near a tier rather than absurdly past or short of it.
      const step = pool.tier_step || 250_000;
      peers.forEach((peer, i) => {
        if ((h >> i) % 3 === 0) return;
        const vol = Math.max(1, Math.round(step * (0.16 + ((h >> (i * 3)) % 26) * 0.015)));
        const committed = (h >> i) % 2 === 0;
        ins.run(id("pd"), pool.id, peer.id, vol, committed ? "committed" : "indicative",
          committed ? nowIso() : null);
      });
    }
  });
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/**
 * Remove canonical products and everything derived from them.
 *
 * Runs inside a caller's transaction. Foreign keys are on, so the order below
 * is the order the graph allows: an order before the recommendation it hangs
 * off, pooled volume before its pool.
 *
 * The raw catalogue rows that produced a product survive, unlinked. They are a
 * manufacturer's own extraction record of its own document, and removing a
 * product from the harmonised index is not licence to rewrite that.
 */
function purgeCanonicalProducts(ids: string[]) {
  if (!ids.length) return;
  const conn = db();
  const marks = ids.map(() => "?").join(",");
  const recScope = `SELECT id FROM recommendations WHERE canonical_product_id IN (${marks})
                    OR recommended_canonical_product_id IN (${marks})`;
  const twice = [...ids, ...ids];
  const thrice = [...ids, ...ids, ...ids];
  const run = (sql: string, params: unknown[]) => conn.prepare(sql).run(...(params as never[]));

  run(`DELETE FROM orders WHERE recommendation_id IN (${recScope})`, twice);
  // A conversation that happened, happened. The message stays in the thread;
  // only its link to the question being removed goes.
  run(`UPDATE chat_messages SET question_id=NULL WHERE question_id IN
       (SELECT id FROM questions WHERE canonical_product_id IN (${marks})
        OR recommendation_id IN (${recScope}))`, thrice);
  run(`DELETE FROM questions WHERE canonical_product_id IN (${marks})
       OR recommendation_id IN (${recScope})`, thrice);
  // A replacement chosen for this product has nothing left to replace with.
  // Its points went with the questions above; any other question still
  // pointing at it is detached first so the foreign key allows the delete.
  run(`UPDATE questions SET replacement_id=NULL WHERE replacement_id IN
       (SELECT id FROM replacements WHERE canonical_product_id IN (${marks}))`, ids);
  run(`DELETE FROM replacements WHERE canonical_product_id IN (${marks})`, ids);
  run(`DELETE FROM match_pairs WHERE canonical_product_id IN (${marks})`, ids);
  // A replacement for a *different* product can hang off a recommendation
  // whose current product is the one going; it loses the link, not itself.
  run(`UPDATE replacements SET recommendation_id=NULL, ordered_at=NULL
       WHERE recommendation_id IN (${recScope})`, twice);
  run(`DELETE FROM recommendations WHERE canonical_product_id IN (${marks})
       OR recommended_canonical_product_id IN (${marks})`, twice);
  run(`DELETE FROM product_comparisons WHERE canonical_product_id IN (${marks})`, ids);
  run(`DELETE FROM pooled_demand WHERE demand_pool_id IN
       (SELECT id FROM demand_pools WHERE canonical_product_id IN (${marks}))`, ids);
  run(`DELETE FROM demand_pools WHERE canonical_product_id IN (${marks})`, ids);
  run(`DELETE FROM price_tiers WHERE canonical_product_id IN (${marks})`, ids);
  run(`DELETE FROM product_images WHERE canonical_product_id IN (${marks})`, ids);
  run(`DELETE FROM item_links WHERE canonical_product_id IN (${marks})`, ids);
  run(`UPDATE hospital_purchase_items SET canonical_product_id=NULL, status='active'
       WHERE canonical_product_id IN (${marks})`, ids);
  run(`UPDATE supplier_catalog_items SET canonical_product_id=NULL, status='active'
       WHERE canonical_product_id IN (${marks})`, ids);
  run(`DELETE FROM canonical_products WHERE id IN (${marks})`, ids);
}

/** Remove one harmonised product from the platform. */
export async function deleteCanonicalProduct(canonicalId: string) {
  if (!row<{ id: string }>(`SELECT id FROM canonical_products WHERE id=?`, canonicalId)) return;
  tx(() => purgeCanonicalProducts([canonicalId]));
  await regenerate();
}

// --- A manufacturer editing its own product ------------------------------

/** Only the manufacturer that owns a product may edit it. */
function ownedProduct(canonicalId: string, supplierId: string) {
  return row<{ id: string }>(
    `SELECT id FROM canonical_products WHERE id=? AND manufacturer_id=?`,
    canonicalId, supplierId);
}

/**
 * The manufacturer's own words about its article.
 *
 * A catalogue PDF's prose describes a family — eight sizes share one
 * paragraph — so this is never populated by extraction. It is the one field
 * on the page whose only possible source is a person who knows the product.
 */
export async function setProductDescription(
  supplierId: string, canonicalId: string, text: string,
): Promise<void> {
  if (!ownedProduct(canonicalId, supplierId)) return;
  const trimmed = text.trim();
  db().prepare(`UPDATE canonical_products SET description=? WHERE id=?`)
    .run(trimmed || null, canonicalId);
}

export interface TierInput { minVolume: number; unitPrice: number }

/**
 * The volume ladder, set by hand.
 *
 * A tier is a *floor*, not a bracket: it states the price from its quantity
 * upwards, and the next tier up is where it stops. Modelling it that way is
 * what makes a gap or an overlap unrepresentable — two brackets typed
 * independently can leave 250–499 priced by nothing, and there is no sensible
 * answer to give a hospital ordering 300.
 *
 * The lowest tier is pinned to zero for the same reason: every quantity a
 * hospital could order has to fall inside some tier, and a ladder starting at
 * 100 says nothing about an order of 50.
 */
export async function setPriceTiers(
  supplierId: string, canonicalId: string, input: TierInput[],
): Promise<void> {
  if (!ownedProduct(canonicalId, supplierId)) return;

  const tiers = input
    .filter((t) => Number.isFinite(t.minVolume) && Number.isFinite(t.unitPrice))
    .map((t) => ({ minVolume: Math.round(t.minVolume), unitPrice: t.unitPrice }))
    .sort((a, b) => a.minVolume - b.minVolume);

  if (!tiers.length) throw new Error("Add at least one tier, or delete the price entirely.");
  if (tiers.some((t) => t.unitPrice <= 0)) {
    throw new Error("Every tier needs a price greater than zero.");
  }
  if (tiers.some((t) => t.minVolume < 0)) {
    throw new Error("A tier cannot start below zero units.");
  }
  if (new Set(tiers.map((t) => t.minVolume)).size !== tiers.length) {
    throw new Error("Two tiers start at the same quantity — each one needs its own floor.");
  }
  tiers[0].minVolume = 0;

  // Whatever the tiers were quoted in stays; a manufacturer editing a ladder
  // is not changing currency, and inventing one here would be a price change
  // nobody made.
  const existing = row<{ currency: string }>(
    `SELECT currency FROM price_tiers WHERE canonical_product_id=? AND supplier_id=? LIMIT 1`,
    canonicalId, supplierId);
  const currency = existing?.currency ?? "CHF";

  const conn = db();
  tx(() => {
    conn.prepare(`DELETE FROM price_tiers WHERE canonical_product_id=? AND supplier_id=?`)
      .run(canonicalId, supplierId);
    for (const t of tiers) {
      conn.prepare(
        `INSERT INTO price_tiers (id,supplier_id,canonical_product_id,min_volume,unit_price,
           currency,origin,valid_from,valid_until) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id("pt"), supplierId, canonicalId, t.minVolume, t.unitPrice, currency,
          "supplier", new Date().toISOString().slice(0, 10), null);
    }
  });
  await regenerate();
}

/** Remove a product's price entirely. It stays listed, and stays unquotable. */
export async function clearPriceTiers(supplierId: string, canonicalId: string): Promise<void> {
  if (!ownedProduct(canonicalId, supplierId)) return;
  db().prepare(`DELETE FROM price_tiers WHERE canonical_product_id=? AND supplier_id=?`)
    .run(canonicalId, supplierId);
  await regenerate();
}

/** Images above this are downsampled by the browser anyway. */
const MAX_IMAGE_BYTES = Number(process.env.PRODUCT_IMAGE_MAX_BYTES ?? 4_000_000);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * A photograph supplied by the manufacturer itself.
 *
 * Stored as `certain`, which no extracted figure ever is: every recovered
 * figure is the model's reading of which SKU a picture belongs to, and this is
 * the company that makes the article saying so. Ranking puts it first for the
 * same reason, so uploading one is how a manufacturer corrects a photograph
 * the extractor attached to the wrong size.
 */
export async function addProductImage(
  supplierId: string, canonicalId: string,
  filename: string, contentType: string, bytes: Buffer,
): Promise<void> {
  if (!ownedProduct(canonicalId, supplierId)) return;
  if (!bytes.byteLength) throw new Error("That file is empty.");
  if (!IMAGE_TYPES.has(contentType)) {
    throw new Error(`${filename} is not a PNG, JPEG, WebP or GIF image.`);
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `${filename} is ${(bytes.byteLength / 1e6).toFixed(1)} MB; the limit is ` +
      `${(MAX_IMAGE_BYTES / 1e6).toFixed(0)} MB.`);
  }
  // figure_id is unique per product and is what an extracted figure is keyed
  // by; an upload is not a figure, so it is namespaced rather than colliding.
  db().prepare(
    `INSERT INTO product_images (id,canonical_product_id,source_document_id,figure_id,
       page,role,region,caption,confidence,content_type,byte_size,image_bytes,created_at)
     VALUES (?,?,NULL,?,NULL,'primary',NULL,?,'certain',?,?,?,?)`)
    .run(id("img"), canonicalId, `upload:${Date.now().toString(36)}`,
      "Supplied by the manufacturer", contentType, bytes.byteLength,
      new Uint8Array(bytes), nowIso());
}

/** Remove one picture from a product. */
export async function deleteProductImage(supplierId: string, imageId: string): Promise<void> {
  const img = row<{ canonical_product_id: string }>(
    `SELECT canonical_product_id FROM product_images WHERE id=?`, imageId);
  if (!img || !ownedProduct(img.canonical_product_id, supplierId)) return;
  db().prepare(`DELETE FROM product_images WHERE id=?`).run(imageId);
}

/**
 * Clear everything hanging off a set of article-master lines, leaving the
 * lines themselves for the caller to delete or keep.
 *
 * Shared by "delete this file" and "delete this line" so the two can never
 * drift into cascading differently — an orphaned recommendation keeps a
 * savings claim alive against a line that no longer exists.
 */
function detachHospitalLines(itemIds: string[]): void {
  const conn = db();
  for (const itemId of itemIds) {
    const recScope = `SELECT id FROM recommendations WHERE hospital_item_id=?`;
    conn.prepare(`DELETE FROM orders WHERE recommendation_id IN (${recScope})`).run(itemId);
    // A question raised by comparing a product hangs off the line itself,
    // not off a recommendation, so both routes have to be cleared.
    const qScope = `SELECT id FROM questions WHERE hospital_item_id=?
                    OR recommendation_id IN (${recScope})`;
    conn.prepare(`UPDATE chat_messages SET question_id=NULL WHERE question_id IN (${qScope})`)
      .run(itemId, itemId);
    conn.prepare(`DELETE FROM questions WHERE hospital_item_id=?
                  OR recommendation_id IN (${recScope})`).run(itemId, itemId);
    conn.prepare(`DELETE FROM replacements WHERE hospital_item_id=?`).run(itemId);
    conn.prepare(`DELETE FROM match_pairs WHERE hospital_item_id=?`).run(itemId);
    conn.prepare(`DELETE FROM product_comparisons WHERE hospital_item_id=?`).run(itemId);
    conn.prepare(`DELETE FROM recommendations WHERE hospital_item_id=?`).run(itemId);
    conn.prepare(`DELETE FROM item_links WHERE item_type='hospital' AND item_id=?`).run(itemId);
  }
}

/**
 * Remove one line of the article master.
 *
 * The uploaded document stays: a hospital striking an article it no longer
 * buys is not a statement that the file it came from was wrong, and the file
 * is what a savings claim is traced back to.
 */
export async function deleteHospitalLine(lineId: string) {
  const conn = db();
  if (!row<{ id: string }>(`SELECT id FROM hospital_purchase_items WHERE id=?`, lineId)) return;
  tx(() => {
    detachHospitalLines([lineId]);
    conn.prepare(`DELETE FROM hospital_purchase_items WHERE id=?`).run(lineId);
  });
  await regenerate();
}

/**
 * Remove an uploaded document and everything extracted from it.
 *
 * Deliberately cascading: leaving orphaned articles behind would keep a
 * savings claim alive whose source document no longer exists. A manufacturer's
 * catalogue takes its canonical products with it for the same reason — the
 * document is what made them, and nothing else vouches for them.
 */
export async function deleteDocument(docId: string) {
  const conn = db();
  const doc = row<{ kind: string }>(`SELECT kind FROM source_documents WHERE id=?`, docId);
  if (!doc) return;

  tx(() => {
    if (doc.kind === "hospital_demand") {
      detachHospitalLines(rows<{ id: string }>(
        `SELECT id FROM hospital_purchase_items WHERE source_document_id=?`, docId)
        .map((r) => r.id));
      conn.prepare(`DELETE FROM hospital_purchase_items WHERE source_document_id=?`).run(docId);
    } else {
      purgeCanonicalProducts(rows<{ canonical_product_id: string }>(
        `SELECT DISTINCT canonical_product_id FROM supplier_catalog_items
         WHERE source_document_id=? AND canonical_product_id IS NOT NULL`, docId)
        .map((p) => p.canonical_product_id));
      conn.prepare(
        `DELETE FROM item_links WHERE item_type='supplier' AND item_id IN
         (SELECT id FROM supplier_catalog_items WHERE source_document_id=?)`).run(docId);
      conn.prepare(`DELETE FROM product_images WHERE source_document_id=?`).run(docId);
      conn.prepare(`DELETE FROM supplier_catalog_items WHERE source_document_id=?`).run(docId);
    }
    conn.prepare(`DELETE FROM source_documents WHERE id=?`).run(docId);
  });
  await regenerate();
}

// --- Product review: comparison, open problems, supplier chat -------------

export interface OpenProblem {
  id: string; text: string; type: "blocking" | "non_blocking";
  routedTo: string; status: string; sentAt: string | null; answerText: string | null;
}
export interface ComparisonResult {
  summary: string; relation: string; confidence: number; adapter: string;
  problems: OpenProblem[];
}

/**
 * Compare a hospital line against a candidate product and record what a buyer
 * would still have to resolve.
 *
 * Cached on the (item, product) pair: opening the same product page twice is a
 * read the second time. Passing `force` re-runs it, which is what the buyer is
 * asking for when they press "run again".
 */
export async function reviewProduct(
  hospitalItemId: string, canonicalId: string, force = false,
): Promise<ComparisonResult> {
  const conn = db();

  const item = row<{
    id: string; extracted_name: string; extracted_brand: string | null;
    extracted_gtin: string | null; extracted_pack_size: number; extracted_uom: string;
    declared_mdr_class: string | null; attributes: string | null;
  }>(`SELECT h.id, h.extracted_name, h.extracted_brand, h.extracted_gtin, h.extracted_pack_size,
             h.extracted_uom, h.declared_mdr_class,
             (SELECT cp.attributes FROM canonical_products cp WHERE cp.id = h.canonical_product_id) AS attributes
      FROM hospital_purchase_items h WHERE h.id = ?`, hospitalItemId);

  const cand = row<{
    id: string; canonical_name: string; gtin: string | null; base_uom: string;
    base_pack_size: number; mdr_risk_class: string; attributes: string;
    manufacturer_id: string | null; manufacturer_name: string | null;
  }>(`SELECT cp.*, o.name AS manufacturer_name FROM canonical_products cp
      LEFT JOIN organizations o ON o.id = cp.manufacturer_id WHERE cp.id = ?`, canonicalId);

  if (!item || !cand) throw new Error("Unknown item or product.");

  const existing = row<{ id: string; summary: string; verdict: string; confidence: number; adapter: string }>(
    `SELECT id, summary, verdict, confidence, adapter FROM product_comparisons
     WHERE hospital_item_id=? AND canonical_product_id=?`, hospitalItemId, canonicalId);

  if (existing && !force) {
    return {
      summary: existing.summary, relation: existing.verdict,
      confidence: existing.confidence, adapter: existing.adapter,
      problems: openProblems(hospitalItemId, canonicalId),
    };
  }

  const verdict = await compareForReview(
    viewOf(item.extracted_name, item.extracted_brand, item.extracted_gtin, item.extracted_uom,
      item.extracted_pack_size, item.declared_mdr_class, item.attributes),
    viewOf(cand.canonical_name, cand.manufacturer_name, cand.gtin, cand.base_uom,
      cand.base_pack_size, cand.mdr_risk_class, cand.attributes));

  const supplierId = cand.manufacturer_id;
  tx(() => {
    if (existing) {
      // A re-run replaces its own previous questions, but never one the buyer
      // has already cleared or sent on — those are decisions, not output.
      conn.prepare(
        `DELETE FROM questions WHERE hospital_item_id=? AND canonical_product_id=?
           AND origin='ai_comparison' AND status='open' AND sent_at IS NULL
           AND replacement_id IS NULL`)
        .run(hospitalItemId, canonicalId);
      conn.prepare(
        `UPDATE product_comparisons SET verdict=?, confidence=?, summary=?, adapter=?, created_at=?
         WHERE id=?`)
        .run(verdict.relation, verdict.confidence, verdict.summary, verdict.adapter, nowIso(), existing.id);
    } else {
      conn.prepare(
        `INSERT INTO product_comparisons (id,hospital_id,hospital_item_id,canonical_product_id,
           verdict,confidence,summary,adapter,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id("cmp"), HOSPITAL_ID, hospitalItemId, canonicalId, verdict.relation,
          verdict.confidence, verdict.summary, verdict.adapter, nowIso());
    }

    const insQ = conn.prepare(
      `INSERT INTO questions (id,recommendation_id,hospital_id,hospital_item_id,
         canonical_product_id,supplier_id,type,text,asked_by,routed_to,status,origin,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    // A re-run raises the same question again. If the buyer already cleared it,
    // sent it, or had it answered, asking a second time would put resolved work
    // back on the worklist — so an identical question that already exists in
    // any state is left alone.
    const seen = conn.prepare(
      `SELECT 1 FROM questions WHERE hospital_item_id=? AND canonical_product_id=? AND text=?`);
    for (const q of verdict.questions) {
      if (seen.get(hospitalItemId, canonicalId, q.text)) continue;
      insQ.run(id("q"), null, HOSPITAL_ID, hospitalItemId, canonicalId, supplierId,
        q.type, q.text, BUYER, q.route, "open", "ai_comparison", nowIso());
    }
  });

  return {
    summary: verdict.summary, relation: verdict.relation,
    confidence: verdict.confidence, adapter: verdict.adapter,
    problems: openProblems(hospitalItemId, canonicalId),
  };
}

export function openProblems(hospitalItemId: string, canonicalId: string): OpenProblem[] {
  return rows<any>(
    `SELECT id, text, type, routed_to, status, sent_at, answer_text FROM questions
     WHERE hospital_item_id=? AND canonical_product_id=? AND status != 'cleared'
     ORDER BY CASE type WHEN 'blocking' THEN 0 ELSE 1 END, created_at ASC`,
    hospitalItemId, canonicalId)
    .map((r) => ({
      id: r.id, text: r.text, type: r.type, routedTo: r.routed_to,
      status: r.status, sentAt: r.sent_at, answerText: r.answer_text,
    }));
}

/**
 * The buyer decides a question does not apply. The row is kept with
 * `status='cleared'` rather than deleted — it disappears from the worklist,
 * but who waved away a clinical question, and when, stays answerable.
 */
export function clearProblem(qId: string) {
  db().prepare(
    `UPDATE questions SET status='cleared', cleared_at=?, cleared_by=? WHERE id=? AND status='open'`)
    .run(nowIso(), BUYER, qId);
}

/** Put the question into this hospital's thread with the manufacturer. */
export function sendProblemToSupplier(qId: string) {
  const conn = db();
  // A question drafted on a recommendation carries its manufacturer on the
  // recommendation rather than on itself.
  const q = row<{ id: string; text: string; supplier_id: string | null; hospital_id: string | null; sent_at: string | null }>(
    `SELECT q.id, q.text, COALESCE(q.supplier_id, r.supplier_id) AS supplier_id,
            COALESCE(q.hospital_id, r.hospital_id) AS hospital_id, q.sent_at
     FROM questions q LEFT JOIN recommendations r ON r.id = q.recommendation_id WHERE q.id=?`, qId);
  if (!q || q.sent_at || !q.supplier_id) return;

  tx(() => {
    conn.prepare(`UPDATE questions SET routed_to='supplier', sent_at=?, supplier_id=?, hospital_id=?
                  WHERE id=?`)
      .run(nowIso(), q.supplier_id, q.hospital_id ?? HOSPITAL_ID, qId);
    conn.prepare(
      `INSERT INTO chat_messages (id,hospital_id,supplier_id,question_id,author_org_id,
         author_user_id,body,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id("msg"), q.hospital_id ?? HOSPITAL_ID, q.supplier_id, qId,
        q.hospital_id ?? HOSPITAL_ID, BUYER, q.text, nowIso());
  });
}

/** A reply in the thread. Kept for form posts; the conversation logic lives in messaging.ts. */
export function postChatMessage(formData: FormData) {
  const supplierId = String(formData.get("supplierId") ?? "");
  const hospitalId = String(formData.get("hospitalId") ?? "") || HOSPITAL_ID;
  postMessage({
    side: String(formData.get("as") ?? "") === "supplier" ? "supplier" : "hospital",
    hospitalId, supplierId, body: String(formData.get("body") ?? ""),
    questionId: String(formData.get("questionId") ?? "") || null,
  });
}

function viewOf(
  name: string, manufacturer: string | null, gtin: string | null, uom: string,
  packSize: number, mdr: string | null, attributes: string | null,
): ProductView {
  let attrs: Record<string, unknown> = {};
  try { attrs = attributes ? JSON.parse(attributes) : {}; } catch { /* empty */ }
  return {
    name, manufacturer: manufacturer ?? "unknown", gtin, uom,
    packSize: packSize || 1, mdrClass: mdr ?? "IIa", attributes: attrs,
  };
}
