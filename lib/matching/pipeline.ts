/**
 * §8 — the layered matching pipeline.
 *
 *   identifier match  ->  embedding retrieval  ->  reranker  ->  Claude
 *
 * Each layer only sees what the one above could not resolve, so the
 * expensive layer runs on the smallest possible set. match_runs records
 * which layer resolved what, which is the number that tells you whether
 * the LLM spend is justified.
 */
import { db, id, nowIso, packVector, unpackVector, cosine, tx } from "@/lib/db";
import {
  embed, embedLabelled, currentEmbedModel, rerank, adjudicate, adapterName, normalise, type ProductView,
} from "@/lib/ai";
import { eclassFor, UNCLASSIFIED, CATEGORY_LABEL, CATEGORY_LABEL_DE } from "./category";
import {
  LINK_THRESHOLD, EXTRACTION_THRESHOLD,
  normaliseMdr, type MdrClass,
} from "./thresholds";

const TOP_K = 8;
/** Below this the reranker hands over to Claude rather than guessing. */
const RERANK_HANDOVER = 78;

interface CanonRow {
  id: string; canonical_name: string; gtin: string | null; udi_di: string | null;
  base_uom: string; base_pack_size: number; mdr_risk_class: MdrClass;
  attributes: string; embedding: Uint8Array | null; manufacturer_id: string | null;
  manufacturer_name: string | null;
}

export function searchText(r: {
  name?: string | null; spec?: string | null; brand?: string | null; sku?: string | null;
}): string {
  // Deliberately excludes the SKU. Article numbers are the identifier layer's
  // job; in semantic text they are just a long number that never matches and
  // drags the score down.
  return [r.brand, r.name, r.spec].filter(Boolean).join(" ");
}

/** Bump when the text a product or line is embedded from changes; every vector is then redone. */
const EMBED_TEXT_VERSION = "v2";

/**
 * The tag stored beside a vector: the model that actually produced it and the
 * text version it was produced from. A vector whose tag differs from what
 * would be produced now is re-embedded rather than compared — a catalogue
 * embedded by the keyless fallback and later searched with Voyage otherwise
 * compares hashed trigrams against a language model and calls it similarity.
 */
export const embeddingTag = (model = currentEmbedModel()) => `${model}:${EMBED_TEXT_VERSION}`;

/**
 * What a product is embedded from: maker, name, its category in German and
 * English, and the attributes that describe the article physically.
 * Identifiers are left out — a PZN or part number is the identifier layer's
 * job, and in semantic text it is a long number that matches nothing.
 */
export function productEmbeddingText(p: {
  canonical_name: string; manufacturer_name: string | null; attributes: string | null;
}): string {
  let attrs: Record<string, string | number> = {};
  try { attrs = JSON.parse(p.attributes ?? "{}"); } catch { /* none */ }
  const cat = eclassFor(p.canonical_name, attrs);
  const category = cat === UNCLASSIFIED ? "" : `(${CATEGORY_LABEL_DE[cat]} / ${CATEGORY_LABEL[cat]})`;
  const physical = Object.entries(attrs)
    .filter(([k]) => !/pzn|sku|gtin|ean|udi|code|article/i.test(k))
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
  return [p.manufacturer_name, p.canonical_name, category, physical].filter(Boolean).join(" ");
}

/** Embed every canonical product with no vector, or one made by another model or text version. */
export async function ensureCanonicalEmbeddings(): Promise<number> {
  const conn = db();
  const rows = conn
    .prepare(`SELECT cp.id, cp.canonical_name, cp.attributes, o.name AS manufacturer_name
              FROM canonical_products cp
              LEFT JOIN organizations o ON o.id = cp.manufacturer_id
              WHERE cp.embedding IS NULL OR cp.embedding_model IS NOT ?`)
    .all(embeddingTag()) as unknown as { id: string; canonical_name: string; attributes: string; manufacturer_name: string | null }[];
  if (!rows.length) return 0;

  const { vectors, model } = await embedLabelled(rows.map(productEmbeddingText), "document");
  const upd = conn.prepare(`UPDATE canonical_products SET embedding = ?, embedding_model = ? WHERE id = ?`);
  tx(() => { vectors.forEach((v, i) => upd.run(packVector(v), embeddingTag(model), rows[i].id)); });
  return rows.length;
}

function attrText(json: string): string {
  try {
    const o = JSON.parse(json) as unknown as Record<string, unknown>;
    return Object.entries(o).map(([k, v]) => `${k} ${v}`).join(" ");
  } catch { return ""; }
}

export interface LinkOutcome {
  canonicalProductId: string | null;
  confidence: number;
  method: "gtin_exact" | "udi_exact" | "sku_exact" | "reranked" | "llm_adjudicated" | "human";
  rationale: string;
  status: "proposed" | "confirmed";
}

/**
 * Resolve one raw item to a canonical product, cheapest layer first.
 * `stats` accumulates which layer did the work.
 */
export async function linkItem(
  item: {
    id: string; gtin?: string | null; udi_di?: string | null; sku?: string | null;
    name?: string | null; spec?: string | null; brand?: string | null;
    uom?: string | null; packSize?: number | null; mdr?: string | null;
  },
  stats: { byIdentifier: number; byReranker: number; byLlm: number; toReview: number; llmCalls: number },
): Promise<LinkOutcome> {
  const conn = db();

  // --- layer 1: exact identifier. Free, and authoritative when present.
  if (item.gtin) {
    const hit = conn.prepare(`SELECT id FROM canonical_products WHERE gtin = ?`).get(item.gtin) as unknown as { id: string } | undefined;
    if (hit) {
      stats.byIdentifier++;
      return { canonicalProductId: hit.id, confidence: 100, method: "gtin_exact", rationale: "GTIN matched exactly.", status: "confirmed" };
    }
  }
  if (item.udi_di) {
    const hit = conn.prepare(`SELECT id FROM canonical_products WHERE udi_di = ?`).get(item.udi_di) as unknown as { id: string } | undefined;
    if (hit) {
      stats.byIdentifier++;
      return { canonicalProductId: hit.id, confidence: 100, method: "udi_exact", rationale: "UDI-DI matched exactly.", status: "confirmed" };
    }
  }
  if (item.sku) {
    const hit = conn
      .prepare(`SELECT cp.id FROM canonical_products cp
                JOIN supplier_catalog_items s ON s.canonical_product_id = cp.id
                WHERE UPPER(s.extracted_sku) = UPPER(?) LIMIT 1`)
      .get(item.sku) as unknown as { id: string } | undefined;
    if (hit) {
      stats.byIdentifier++;
      return { canonicalProductId: hit.id, confidence: 99, method: "sku_exact", rationale: "Manufacturer article number matched a catalogue entry.", status: "confirmed" };
    }
  }

  // --- layer 2: embedding retrieval, top-K candidates only.
  const query = searchText(item);
  const [qv] = await embed([query]);
  const all = conn
    .prepare(`SELECT cp.*, o.name AS manufacturer_name FROM canonical_products cp
              LEFT JOIN organizations o ON o.id = cp.manufacturer_id
              WHERE cp.embedding IS NOT NULL`)
    .all() as unknown as CanonRow[];
  if (!all.length) { stats.toReview++; return miss("No canonical products indexed yet."); }

  const qvec = new Float32Array(qv);
  const candidates = all
    .map((c) => ({ c, sim: cosine(qvec, unpackVector(c.embedding)!) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, TOP_K);

  // --- layer 3: reranker over the narrowed set.
  const docs = candidates.map(({ c }) => productEmbeddingText(c));
  const ranked = await rerank(query, docs);
  if (!ranked.length) { stats.toReview++; return miss("No candidates survived retrieval."); }

  const best = ranked[0];
  const bestCandidate = candidates[best.index].c;

  if (best.score >= LINK_THRESHOLD) {
    stats.byReranker++;
    return {
      canonicalProductId: bestCandidate.id,
      confidence: best.score,
      method: "reranked",
      rationale: `Reranker scored ${best.score} against "${bestCandidate.canonical_name}".`,
      status: "confirmed",
    };
  }

  if (best.score < RERANK_HANDOVER) {
    stats.toReview++;
    return miss(`Best candidate "${bestCandidate.canonical_name}" scored only ${best.score}.`);
  }

  // --- layer 4: Claude adjudicates only what the reranker left ambiguous.
  stats.llmCalls++;
  const verdict = await adjudicate(toView(item), canonToView(bestCandidate));
  const cls = normaliseMdr(item.mdr ?? bestCandidate.mdr_risk_class);

  if (verdict.relation === "not_equivalent") {
    stats.toReview++;
    return miss(verdict.rationale);
  }

  if (verdict.relation === "identical" && verdict.confidence >= LINK_THRESHOLD) {
    stats.byLlm++;
    return {
      canonicalProductId: bestCandidate.id,
      confidence: verdict.confidence,
      method: "llm_adjudicated",
      rationale: verdict.rationale,
      status: "confirmed",
    };
  }

  // Below the bar, but we still know which product we think it is. Carrying
  // the candidate into the review queue is the difference between "confirm
  // this?" and "here is an unmatched row, good luck".
  stats.toReview++;
  const shortfall =
    verdict.relation === "identical"
      ? `${verdict.confidence} is below the ${LINK_THRESHOLD} link threshold`
      : `equivalence at ${verdict.confidence} does not clear the Class ${cls} bar`;
  return {
    canonicalProductId: bestCandidate.id,
    confidence: verdict.confidence,
    method: "llm_adjudicated",
    rationale: `${verdict.rationale} Held for review: ${shortfall}.`,
    status: "proposed",
  };
}

function miss(rationale: string): LinkOutcome {
  return { canonicalProductId: null, confidence: 0, method: "llm_adjudicated", rationale, status: "proposed" };
}

function toView(item: {
  name?: string | null; brand?: string | null; sku?: string | null; gtin?: string | null;
  spec?: string | null; uom?: string | null; packSize?: number | null; mdr?: string | null;
}): ProductView {
  return {
    name: item.name ?? "",
    manufacturer: item.brand ?? "unknown",
    sku: item.sku ?? null,
    gtin: item.gtin ?? null,
    uom: item.uom ?? "Stück",
    packSize: item.packSize ?? 1,
    mdrClass: item.mdr ?? "unknown",
    attributes: parseSpecAttributes(item.spec ?? item.name ?? ""),
  };
}

function canonToView(c: CanonRow): ProductView {
  let attrs: Record<string, unknown> = {};
  try { attrs = JSON.parse(c.attributes); } catch { /* keep empty */ }
  return {
    name: c.canonical_name,
    manufacturer: c.manufacturer_name ?? "unknown",
    sku: null,
    gtin: c.gtin,
    uom: c.base_uom,
    packSize: c.base_pack_size,
    mdrClass: c.mdr_risk_class,
    attributes: attrs,
  };
}

/**
 * Pull dimensional attributes out of a free-text article description.
 * This is the hospital-side problem in miniature: "Kanüle Sterican 0,8 × 40 mm"
 * carries the same facts as a structured catalogue row, just not in columns.
 */
export function parseSpecAttributes(text: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const t = normalise(text);

  const gauge = t.match(/\b(\d{2})\s*g\b/);
  if (gauge) out.gauge = `${gauge[1]}G`;

  const dims = t.match(/\b(\d+(?:\.\d+)?)\s*(?:mm)?\s*x\s*(\d+(?:\.\d+)?)\s*mm\b/);
  if (dims) { out.od_mm = parseFloat(dims[1]); out.length_mm = parseFloat(dims[2]); }

  const cm = t.match(/\b(\d+(?:\.\d+)?)\s*cm\s*x\s*(\d+(?:\.\d+)?)\s*m\b/);
  if (cm) { out.width_cm = parseFloat(cm[1]); out.length_m = parseFloat(cm[2]); }

  const ml = t.match(/\b(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) out.volume_ml = parseFloat(ml[1]);

  // A single dimension in mm identifies implants and tubing, where there is no
  // diameter-by-length pair to read.
  if (!dims) {
    const mm = t.match(/\b(\d+(?:\.\d+)?)\s*mm\b/);
    // A column header carries its own unit — "Kanülen-Außen-0 (mm)" reads as
    // the number 0 followed by mm — so a zero here is punctuation being parsed
    // as a measurement, not an article that is nought millimetres across.
    if (mm && parseFloat(mm[1]) > 0) out.size_mm = parseFloat(mm[1]);
  }

  if (/luer.?lock|luer.?lok/.test(t)) out.connector = "luer-lock";
  else if (/luer/.test(t)) out.connector = "luer";

  if (/steril/.test(t)) out.sterile = "yes";

  const material = /titan/.test(t) ? "titanium"
    : /nitril/.test(t) ? "nitrile"
    : /latex/.test(t) ? "latex"
    : /silikon|silicone/.test(t) ? "silicone"
    : /edelstahl|stainless/.test(t) ? "stainless-steel"
    : /polypropylen|polypropylene/.test(t) ? "polypropylene"
    : /pvc.?frei|pvc.?free/.test(t) ? "pvc-free"
    : "";
  if (material) out.material = material;

  if (/zementfrei|cementless/.test(t)) out.fixation = "cementless";
  else if (/zementiert|cemented/.test(t)) out.fixation = "cemented";

  // Anchored on "Gr." — a bare standalone letter matches far too much once the
  // spec text carries real column headers ("Länge (mm) 13" yielded size "L").
  const size = t.match(/\bgr(?:\.|ö(?:ss|ß)e)?\s*(xs|s|m|l|xl)\b/);
  if (size) out.size = size[1].toUpperCase();

  return out;
}

/** Run the pipeline across every active (unlinked) item on both sides. */
export async function runMatching(): Promise<{
  runId: string; itemsSeen: number; byIdentifier: number; byReranker: number;
  byLlm: number; toReview: number; llmCalls: number;
}> {
  const conn = db();
  await ensureCanonicalEmbeddings();

  const runId = id("run");
  const startedAt = nowIso();
  const stats = { byIdentifier: 0, byReranker: 0, byLlm: 0, toReview: 0, llmCalls: 0 };

  const hospitalItems = conn
    .prepare(`SELECT * FROM hospital_purchase_items
              WHERE status = 'active' AND canonical_product_id IS NULL
                AND extraction_confidence >= ?`)
    .all(EXTRACTION_THRESHOLD) as unknown as Record<string, any>[];
  const supplierItems = conn
    .prepare(`SELECT * FROM supplier_catalog_items
              WHERE status = 'active' AND canonical_product_id IS NULL
                AND extraction_confidence >= ?`)
    .all(EXTRACTION_THRESHOLD) as unknown as Record<string, any>[];

  const insLink = conn.prepare(
    `INSERT INTO item_links (id, item_type, item_id, canonical_product_id, link_confidence,
       link_method, status, rationale, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);

  for (const [kind, rows] of [["hospital", hospitalItems], ["supplier", supplierItems]] as const) {
    for (const r of rows) {
      const outcome = await linkItem(
        {
          id: r.id, gtin: r.extracted_gtin, udi_di: r.extracted_udi_di, sku: r.extracted_sku,
          name: r.extracted_name, spec: r.extracted_spec, brand: r.extracted_brand ?? null,
          uom: r.extracted_uom, packSize: r.extracted_pack_size, mdr: r.declared_mdr_class ?? null,
        },
        stats,
      );
      if (!outcome.canonicalProductId) continue;
      insLink.run(id("lnk"), kind, r.id, outcome.canonicalProductId, outcome.confidence,
        outcome.method, outcome.status, outcome.rationale, nowIso());
      if (outcome.status === "confirmed") {
        const table = kind === "hospital" ? "hospital_purchase_items" : "supplier_catalog_items";
        conn.prepare(`UPDATE ${table} SET canonical_product_id = ?, status = 'linked' WHERE id = ?`)
          .run(outcome.canonicalProductId, r.id);
      }
    }
  }

  const itemsSeen = hospitalItems.length + supplierItems.length;
  conn.prepare(
    `INSERT INTO match_runs (id, started_at, finished_at, items_seen, by_identifier,
       by_reranker, by_llm, to_review, llm_calls, adapter) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(runId, startedAt, nowIso(), itemsSeen, stats.byIdentifier, stats.byReranker,
      stats.byLlm, stats.toReview, stats.llmCalls, adapterName());

  return { runId, itemsSeen, ...stats };
}
