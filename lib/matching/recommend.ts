/**
 * §1.6 — turn linked items into recommendations.
 *
 * Two kinds, deliberately separated:
 *   identity     same article, better channel. No clinical decision exists.
 *   substitution different article claimed equivalent. §2 risk gate applies.
 */
import { db, id, nowIso, tx } from "@/lib/db";
import { poolState, savingsPct, tiersFor, tierAtVolume } from "@/lib/pooling";
import {
  normaliseMdr, requiresClinicalReview, substitutionAutoConfirms, type MdrClass,
} from "./thresholds";

interface HospitalRow {
  id: string; hospital_id: string; canonical_product_id: string;
  extracted_name: string; annual_volume: number; extracted_pack_size: number;
  current_unit_price: number; current_supplier_name: string; currency: string;
  declared_mdr_class: string | null;
}

/** Hospital volumes are in order units; price and tiers are per base unit. */
export function baseUnits(annualVolume: number, packSize: number): number {
  return annualVolume * (packSize || 1);
}

export async function generateRecommendations(): Promise<{ identity: number; substitution: number }> {
  const conn = db();
  const counts = { identity: 0, substitution: 0 };

  const items = conn
    .prepare(`SELECT * FROM hospital_purchase_items
              WHERE status = 'linked' AND canonical_product_id IS NOT NULL`)
    .all() as unknown as HospitalRow[];

  const insert = conn.prepare(
    `INSERT INTO recommendations (id, type, hospital_id, hospital_item_id, canonical_product_id,
       recommended_canonical_product_id, supplier_id, demand_pool_id, baseline_unit_price,
       offered_unit_price, savings_amount, savings_pct, match_confidence, rationale,
       differing_attributes, requires_clinical_review, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertQ = conn.prepare(
    `INSERT INTO questions (id, recommendation_id, type, text, routed_to, status, origin, created_at)
     VALUES (?,?,?,?,?,?,?,?)`);
  // A recommendation the user has already acted on must not be recreated by a
  // later pipeline run, or dismissals and orders would silently come back.
  const already = conn.prepare(
    `SELECT 1 FROM recommendations WHERE hospital_item_id = ? AND recommended_canonical_product_id = ?
       AND supplier_id = ?`);

  for (const item of items) {
    const volume = baseUnits(item.annual_volume, item.extracted_pack_size);
    const cls = normaliseMdr(item.declared_mdr_class);

    // ---- identity: same canonical product, sourced direct ----------------
    const directOffers = conn
      .prepare(`SELECT DISTINCT pt.supplier_id, o.name AS supplier_name, o.channel
                FROM price_tiers pt JOIN organizations o ON o.id = pt.supplier_id
                WHERE pt.canonical_product_id = ?`)
      .all(item.canonical_product_id) as unknown as { supplier_id: string; supplier_name: string; channel: string }[];

    for (const offer of directOffers) {
      if (offer.channel !== "manufacturer") continue;
      const pool = poolState(item.canonical_product_id, offer.supplier_id, volume);
      const tiers = tiersFor(item.canonical_product_id, offer.supplier_id);
      const tier = pool.currentTier ?? tierAtVolume(tiers, volume);
      if (!tier) continue;
      const pct = savingsPct(item.current_unit_price, tier.unit_price);
      if (pct <= 0) continue;
      if (already.get(item.id, item.canonical_product_id, offer.supplier_id)) continue;

      const recId = id("rec");
      insert.run(recId, "identity", item.hospital_id, item.id, item.canonical_product_id,
        item.canonical_product_id, offer.supplier_id, pool.poolId, item.current_unit_price,
        tier.unit_price, round2((item.current_unit_price - tier.unit_price) * volume), pct,
        null,
        `Same article sourced direct from ${offer.supplier_name} instead of ${item.current_supplier_name || "the current supplier"}. No product change.`,
        "[]", 0, "new", nowIso(), nowIso());
      counts.identity++;
    }

    // ---- substitution: a different product the suggestion pipeline matched --
    // Equivalence comes from match_pairs — the line compared with the product
    // directly, after the rules, retrieval and the Jev gate cut the field —
    // rather than from comparing every product with every other one.
    const equivalents = conn
      .prepare(`SELECT m.canonical_product_id AS equivalent_product_id, m.confidence, m.rationale,
                       m.differing_attributes, cp.canonical_name, cp.mdr_risk_class, cp.manufacturer_id,
                       o.name AS manufacturer_name
                FROM match_pairs m
                JOIN canonical_products cp ON cp.id = m.canonical_product_id
                LEFT JOIN organizations o ON o.id = cp.manufacturer_id
                WHERE m.hospital_item_id = ? AND m.outcome = 'matched' AND m.relation = 'equivalent'
                  AND m.dismissed_at IS NULL AND m.canonical_product_id != ?`)
      .all(item.id, item.canonical_product_id) as unknown as {
        equivalent_product_id: string; confidence: number; rationale: string;
        differing_attributes: string | null; canonical_name: string; mdr_risk_class: MdrClass;
        manufacturer_id: string | null; manufacturer_name: string | null;
      }[];

    for (const eq of equivalents) {
      const offers = conn
        .prepare(`SELECT DISTINCT pt.supplier_id, o.name AS supplier_name, o.channel
                  FROM price_tiers pt JOIN organizations o ON o.id = pt.supplier_id
                  WHERE pt.canonical_product_id = ?`)
        .all(eq.equivalent_product_id) as unknown as { supplier_id: string; supplier_name: string; channel: string }[];

      for (const offer of offers) {
        if (offer.channel !== "manufacturer") continue;
        const pool = poolState(eq.equivalent_product_id, offer.supplier_id, volume);
        const tiers = tiersFor(eq.equivalent_product_id, offer.supplier_id);
        const tier = pool.currentTier ?? tierAtVolume(tiers, volume);
        if (!tier) continue;
        const pct = savingsPct(item.current_unit_price, tier.unit_price);
        if (pct <= 0) continue;
        if (already.get(item.id, eq.equivalent_product_id, offer.supplier_id)) continue;

        // §2: the risk class of the product being *substituted in* governs
        const effectiveClass = eq.mdr_risk_class ?? cls;
        const needsClinical = requiresClinicalReview("substitution", effectiveClass);
        const autoOk = substitutionAutoConfirms(effectiveClass, eq.confidence);

        const recId = id("rec");
        insert.run(recId, "substitution", item.hospital_id, item.id, item.canonical_product_id,
          eq.equivalent_product_id, offer.supplier_id, pool.poolId, item.current_unit_price,
          tier.unit_price, round2((item.current_unit_price - tier.unit_price) * volume), pct,
          eq.confidence, eq.rationale, eq.differing_attributes ?? "[]", needsClinical ? 1 : 0,
          "new", nowIso(), nowIso());
        counts.substitution++;

        // Below the risk-weighted bar, the recommendation ships with a
        // blocking question already attached — it cannot be ordered until
        // somebody answers it.
        if (!autoOk) {
          const diffs = safeList(eq.differing_attributes ?? "[]");
          insertQ.run(id("q"), recId, "blocking",
            `${effectiveClass === "III" ? "Class III device — clinical sign-off is mandatory regardless of model confidence. " : ""}` +
            `Confirm ${eq.canonical_name} is an acceptable substitute` +
            (diffs.length ? ` given: ${diffs.join(", ")}.` : "."),
            effectiveClass === "III" ? "sanovio_internal" : "supplier",
            "open", "ai_drafted", nowIso());
        }
      }
    }
  }
  return counts;
}

function safeList(json: string): string[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Recommendations are derived state: rebuild the ones nobody has acted on,
 * and leave the rest alone so user decisions survive.
 *
 * "Acted on" is broader than the status. A recommendation still 'new' can
 * have an order behind it (a rejected order hands it back as 'new') or a
 * question a person asked on it; deleting either would break the record the
 * foreign keys exist to protect, so those rows are kept too.
 */
export async function rebuildRecommendations(): Promise<{ identity: number; substitution: number }> {
  const conn = db();
  const untouched = `SELECT r.id FROM recommendations r
    WHERE r.status = 'new' AND r.origin = 'pipeline'
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.recommendation_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.recommendation_id = r.id AND q.origin != 'ai_drafted')
      AND NOT EXISTS (SELECT 1 FROM replacements rp WHERE rp.recommendation_id = r.id)`;
  tx(() => {
    conn.prepare(`DELETE FROM questions WHERE origin='ai_drafted' AND recommendation_id IN (${untouched})`).run();
    conn.prepare(`DELETE FROM recommendations WHERE id IN (${untouched})`).run();
  });
  return generateRecommendations();
}
