/**
 * Automatic suggestions: every hospital line against every supplier product,
 * cut down cheapest-first so the expensive comparison only sees pairs that
 * could plausibly be a replacement.
 *
 *   1  rule-based blocking   free       category, standard codes, unit family,
 *                                        dosage form, conflicting dimensions
 *   2  embedding retrieval   cheap      each line's top-K nearest survivors
 *   3  Jev gate              ~$0.00002  "same kind of product?" as a probability
 *   4  Claude adjudication   cents      identical / equivalent / not_equivalent
 *   +  full analysis         ~$1        the "Replace with this" analysis, for
 *                                        each line's best match only
 *
 * Comparing every pair is O(lines × products); each stage exists to make the
 * next one run on less. A syringe is never put in front of a model next to a
 * plaster.
 *
 * Every paid result is stored with the hash of the input it was computed
 * from — on the pair's row, and in the file cache (match-cache.ts) — so a
 * re-run after another upload pays only for pairs that are new or whose data
 * changed, and a re-run after `db:reset` pays for nothing it has seen before.
 *
 * Dropped pairs are recorded with their stage and reason while tuning
 * (`SUGGEST_LOG_DROPS=0` stops recording the free-stage drops), so false
 * negatives can be audited and thresholds retuned against them.
 */
import { db, id, nowIso, tx, rows, row, packVector, unpackVector, cosine } from "../db";
import {
  embedLabelled, gatePair, adjudicateLabelled, analyseReplacement, hasAnthropic, hasOpenRouter, JEV_MODEL,
  type Adjudication, type ProductView, type GateInput, type ReplacementAnalysis,
} from "../ai";
import { HOSPITAL_ID, STALE_RUN_MS } from "../constants";
import { EXTRACTION_THRESHOLD } from "./thresholds";
import { ensureCanonicalEmbeddings, parseSpecAttributes, searchText, embeddingTag } from "./pipeline";
import { eclassFor, UNCLASSIFIED, CATEGORY_LABEL } from "../ingest";
import { contextForPair, hashContext } from "../replacement";
import { cached, remember, flushCache, exportRun, inputHash, isFallback } from "./match-cache";
import { rebuildRecommendations } from "./recommend";

export const SUGGEST = {
  /** Stage 2: nearest supplier products kept per line. */
  topK: Number(process.env.SUGGEST_TOP_K ?? 10),
  /** Stage 3: Jev probability a pair needs to reach Claude. Tune on labelled pairs. */
  jevThreshold: Number(process.env.JEV_THRESHOLD ?? 0.65),
  /** Stage 4: below this confidence an "equivalent" is not worth suggesting. */
  minConfidence: Number(process.env.SUGGEST_MIN_CONFIDENCE ?? 60),
  /** Record pairs the free stages dropped. Only needed while tuning. */
  logDrops: process.env.SUGGEST_LOG_DROPS !== "0",
  /** Run the full web-searched analysis for each line's best match. */
  analyseTop: process.env.SUGGEST_ANALYSE !== "0",
  concurrency: { gate: 8, adjudicate: 4, analyse: 2 },
};

/** Changing a question invalidates every answer to it. Bump when a prompt changes. */
const GATE_VERSION = "jev-same-kind-v1";
const ADJUDICATION_VERSION = "adjudicate-v1";

// --- inputs ----------------------------------------------------------------

interface Line {
  id: string; name: string; brand: string | null; spec: string | null; sku: string | null;
  gtin: string | null; uom: string; packSize: number; mdr: string | null;
  canonicalId: string | null; attrs: Record<string, string | number>;
  codes: Codes; category: string; embedding: Float32Array | null; embeddingModel: string | null;
}
interface Product {
  id: string; name: string; manufacturer: string; manufacturerId: string | null;
  gtin: string | null; sku: string | null; uom: string; packSize: number; mdr: string;
  description: string | null; attrs: Record<string, string | number>;
  codes: Codes; category: string; embedding: Float32Array | null;
}
/** Standard classification codes, when a source states them. */
interface Codes { unspsc?: string; gmdn?: string; atc?: string; dosage_form?: string }

interface PairState {
  itemId: string; productId: string;
  outcome: "dropped" | "matched" | "rejected";
  dropStage: number | null; reason: string | null;
  categoryItem: string; categoryProduct: string;
  similarity: number | null; rank: number | null;
  jevScore: number | null; jevAdapter: string | null; jevHash: string | null;
  relation: Adjudication["relation"] | null; confidence: number | null;
  rationale: string | null; differing: string[] | null;
  adjudicationAdapter: string | null; adjudicationHash: string | null;
  isTop: boolean;
  analysisStatus: "pending" | "running" | "done" | "failed" | null;
  analysisJson: string | null; analysisHash: string | null; analysisError: string | null;
  analysedAt: string | null; dismissedAt: string | null;
  /** Whether a row exists or must be written; free-stage drops may be skipped. */
  persisted: boolean; touched: boolean;
}

export interface SuggestionRunSummary {
  runId: string | null; skipped?: string;
  lines: number; products: number; pairsTotal: number;
  afterStage1: number; afterStage2: number; afterStage3: number;
  matched: number; analysed: number;
  jevCalls: number; claudeCalls: number; analysisCalls: number; reused: number; jevCost: number;
}

// --- entry point -------------------------------------------------------------

let active: Promise<SuggestionRunSummary> | null = null;
let again: string | null = null;

/**
 * Run the pipeline for the signed-in hospital.
 *
 * One run at a time per process: an upload landing while a run is in flight
 * queues exactly one more, which picks up whatever arrived in the meantime.
 * A run still marked running in the database from another process is left
 * alone until it goes stale.
 */
export function runSuggestions(trigger = "manual"): Promise<SuggestionRunSummary> {
  if (active) {
    again = trigger;
    return active;
  }
  active = (async () => {
    try {
      let summary = await runOnce(trigger);
      while (again) {
        const next = again; again = null;
        summary = await runOnce(`${next} (queued)`);
      }
      return summary;
    } finally {
      active = null;
    }
  })();
  return active;
}

async function runOnce(trigger: string): Promise<SuggestionRunSummary> {
  const conn = db();
  const stale = new Date(Date.now() - STALE_RUN_MS).toISOString();
  conn.prepare(`UPDATE suggestion_runs SET status='failed', error='interrupted', finished_at=?
                WHERE status='running' AND started_at < ?`).run(nowIso(), stale);
  if (row(`SELECT 1 FROM suggestion_runs WHERE status='running' AND hospital_id=?`, HOSPITAL_ID)) {
    return { ...emptySummary(null), skipped: "another run is in progress" };
  }

  const runId = id("srun");
  conn.prepare(`INSERT INTO suggestion_runs (id,hospital_id,trigger,status,started_at)
                VALUES (?,?,?,'running',?)`).run(runId, HOSPITAL_ID, trigger, nowIso());
  const s = emptySummary(runId);
  const adapters = new Set<string>();

  try {
    await ensureCanonicalEmbeddings();
    const lines = loadLines();
    const products = loadProducts();
    s.lines = lines.length; s.products = products.length; s.pairsTotal = lines.length * products.length;
    const state = loadState();
    const pair = (l: Line, p: Product) => {
      const key = `${l.id}|${p.id}`;
      let st = state.get(key);
      if (!st) { st = blankState(l.id, p.id); state.set(key, st); }
      st.touched = true;
      st.categoryItem = l.category; st.categoryProduct = p.category;
      return st;
    };

    // ---- Stage 1: rule-based blocking ---------------------------------------
    const survivors = new Map<string, { product: Product; st: PairState; shortcut: boolean }[]>();
    for (const l of lines) {
      const keep: { product: Product; st: PairState; shortcut: boolean }[] = [];
      for (const p of products) {
        const st = pair(l, p);
        const shortcut = identityShortcut(l, p);
        if (shortcut) {
          Object.assign(st, {
            outcome: "matched", dropStage: null, reason: shortcut,
            relation: "identical", confidence: 100, rationale: shortcut, differing: [],
            adjudicationAdapter: "identifier", adjudicationHash: null,
          });
          keep.push({ product: p, st, shortcut: true });
          continue;
        }
        const blocked = block(l, p);
        if (blocked) drop(st, 1, blocked);
        else keep.push({ product: p, st, shortcut: false });
      }
      survivors.set(l.id, keep);
      s.afterStage1 += keep.length;
    }

    // ---- Stage 2: embedding retrieval --------------------------------------
    await ensureLineEmbeddings(lines);
    const gateQueue: { l: Line; p: Product; st: PairState }[] = [];
    for (const l of lines) {
      const ranked = (survivors.get(l.id) ?? [])
        .map((c) => ({ ...c, sim: l.embedding && c.product.embedding ? cosine(l.embedding, c.product.embedding) : 0 }))
        .sort((a, b) => b.sim - a.sim);
      let rank = 0;
      for (const c of ranked) {
        c.st.similarity = round(c.sim, 4);
        if (c.shortcut) { s.afterStage2++; continue; }
        rank++;
        c.st.rank = rank;
        if (rank > SUGGEST.topK) {
          drop(c.st, 2, `rank ${rank} beyond the top ${SUGGEST.topK} (similarity ${c.sim.toFixed(3)})`);
          continue;
        }
        s.afterStage2++;
        gateQueue.push({ l, p: c.product, st: c.st });
      }
    }

    // ---- Stage 3: Jev gate ---------------------------------------------------
    const claudeQueue: { l: Line; p: Product; st: PairState }[] = [];
    await pool(gateQueue, SUGGEST.concurrency.gate, async ({ l, p, st }) => {
      const input = gateInput(l, p);
      const hash = inputHash({ v: GATE_VERSION, model: JEV_MODEL, input });
      let score: number, adapter: string;
      if (st.jevHash === hash && st.jevScore != null && reusable(st.jevAdapter, hasOpenRouter())) {
        score = st.jevScore; adapter = st.jevAdapter!; s.reused++;
      } else {
        const hit = hasOpenRouter() ? cached("gate", hash) : null;
        if (hit) {
          score = hit.value.probability; adapter = `${hit.adapter} (cached)`; s.reused++;
        } else {
          const res = await gatePair(input);
          score = res.probability; adapter = res.adapter;
          if (!isFallback(adapter)) { s.jevCalls++; s.jevCost += res.cost; }
          remember("gate", hash, { probability: score }, adapter);
        }
      }
      adapters.add(`gate: ${adapter.replace(/ \(cached\)$/, "")}`);
      Object.assign(st, { jevScore: score, jevAdapter: adapter, jevHash: hash });
      if (score < SUGGEST.jevThreshold) {
        drop(st, 3, `Jev ${score.toFixed(2)} below ${SUGGEST.jevThreshold}`);
      } else {
        claudeQueue.push({ l, p, st });
      }
    });
    s.afterStage3 = claudeQueue.length + [...survivors.values()].flat().filter((c) => c.shortcut).length;

    // ---- Stage 4: Claude adjudication ----------------------------------------
    await pool(claudeQueue, SUGGEST.concurrency.adjudicate, async ({ l, p, st }) => {
      const a = lineView(l), b = productView(p);
      const hash = inputHash({ v: ADJUDICATION_VERSION, a, b });
      let verdict: Adjudication, adapter: string;
      if (st.adjudicationHash === hash && st.relation && reusable(st.adjudicationAdapter, hasAnthropic())) {
        verdict = {
          relation: st.relation, confidence: st.confidence ?? 0, rationale: st.rationale ?? "",
          differing_attributes: st.differing ?? [], needs_clarification: false,
          question_text: "", question_type: "non_blocking",
        };
        adapter = st.adjudicationAdapter!; s.reused++;
      } else {
        const hit = hasAnthropic() ? cached("adjudication", hash) : null;
        if (hit) {
          verdict = hit.value; adapter = `${hit.adapter} (cached)`; s.reused++;
        } else {
          ({ verdict, adapter } = await adjudicateLabelled(a, b));
          if (!isFallback(adapter)) s.claudeCalls++;
          remember("adjudication", hash, verdict, adapter);
        }
      }
      adapters.add(`compare: ${adapter.replace(/ \(cached\)$/, "")}`);
      Object.assign(st, {
        relation: verdict.relation, confidence: verdict.confidence, rationale: verdict.rationale,
        differing: verdict.differing_attributes, adjudicationAdapter: adapter, adjudicationHash: hash,
      });
      if (verdict.relation === "not_equivalent" || verdict.confidence < SUGGEST.minConfidence) {
        st.outcome = "rejected"; st.dropStage = 4;
        st.reason = verdict.relation === "not_equivalent"
          ? `not equivalent: ${verdict.rationale}`
          : `confidence ${verdict.confidence} below ${SUGGEST.minConfidence}`;
      } else {
        st.outcome = "matched"; st.dropStage = null; st.reason = null;
      }
    });

    // ---- the best match per line -----------------------------------------------
    const tops: PairState[] = [];
    for (const l of lines) {
      const matched = [...state.values()]
        .filter((st) => st.itemId === l.id && st.touched && st.outcome === "matched" && !st.dismissedAt)
        .sort(byStrength);
      for (const st of [...state.values()].filter((x) => x.itemId === l.id)) st.isTop = false;
      if (matched[0]) { matched[0].isTop = true; tops.push(matched[0]); }
    }
    s.matched = [...state.values()].filter((st) => st.touched && st.outcome === "matched").length;

    // Stages 1-4 are written before the slow part, so the cockpit shows the
    // suggestions while their full analyses are still being calculated.
    const chosen = new Set(rows<{ hospital_item_id: string }>(
      `SELECT hospital_item_id FROM replacements WHERE hospital_id=?`, HOSPITAL_ID)
      .map((r) => r.hospital_item_id));
    const toAnalyse: { st: PairState; hash: string }[] = [];
    for (const st of tops) {
      // A line the buyer already chose a replacement for needs no suggestion analysed.
      if (!SUGGEST.analyseTop || chosen.has(st.itemId)) continue;
      const hash = hashContext(contextForPair(st.itemId, st.productId).ctx);
      if (st.analysisHash === hash && st.analysisStatus === "done"
          && reusable(analysisAdapter(st), hasAnthropic())) { s.reused++; s.analysed++; continue; }
      st.analysisStatus = "pending"; st.analysisHash = hash;
      toAnalyse.push({ st, hash });
    }
    save(state, runId);
    progress(runId, s, adapters);

    // ---- the full analysis, for each line's best match -------------------------
    await pool(toAnalyse, SUGGEST.concurrency.analyse, async ({ st, hash }) => {
      setAnalysis(st, { analysisStatus: "running" });
      try {
        const hit = hasAnthropic() ? cached("analysis", hash) : null;
        let result: ReplacementAnalysis;
        if (hit) { result = hit.value; s.reused++; }
        else {
          result = await analyseReplacement(contextForPair(st.itemId, st.productId).ctx);
          if (!isFallback(result.adapter)) s.analysisCalls++;
          remember("analysis", hash, result, result.adapter);
        }
        adapters.add(`analysis: ${result.adapter}`);
        setAnalysis(st, {
          analysisStatus: "done", analysisJson: JSON.stringify(result), analysisError: null,
          analysedAt: nowIso(),
        });
        s.analysed++;
      } catch (e) {
        setAnalysis(st, { analysisStatus: "failed", analysisError: (e as Error).message });
      }
      progress(runId, s, adapters);
    });

    // Substitution recommendations are built from these matches.
    await rebuildRecommendations();
    finish(runId, s, adapters, null);
    flushCache();
    exportRun(report(runId, s, state, lines, products));
    return s;
  } catch (e) {
    finish(runId, s, adapters, (e as Error).message);
    flushCache();
    throw e;
  }
}

/**
 * Dismiss a suggestion: it leaves the cockpit and its line's next-best match
 * takes over on the next pass. Never deleted — a dismissal is a label, and the
 * dismissed list is where it can be reconsidered.
 */
export function dismissSuggestion(itemId: string, canonicalId: string): void {
  db().prepare(`UPDATE match_pairs SET dismissed_at=?, is_top=0, updated_at=?
                WHERE hospital_item_id=? AND canonical_product_id=? AND hospital_id=?`)
    .run(nowIso(), nowIso(), itemId, canonicalId, HOSPITAL_ID);
}

export function reconsiderSuggestion(itemId: string, canonicalId: string): void {
  db().prepare(`UPDATE match_pairs SET dismissed_at=NULL, updated_at=?
                WHERE hospital_item_id=? AND canonical_product_id=? AND hospital_id=?`)
    .run(nowIso(), itemId, canonicalId, HOSPITAL_ID);
}

// --- stage 1 rules ---------------------------------------------------------

/** Free and authoritative: the same article under the same identifier. */
function identityShortcut(l: Line, p: Product): string | null {
  if (l.canonicalId === p.id) return "Already harmonised to this product.";
  if (l.gtin && p.gtin && digits(l.gtin) === digits(p.gtin)) return `GTIN ${p.gtin} is identical.`;
  return null;
}

/**
 * Why two articles cannot be a replacement for one another, from metadata
 * alone — or null when nothing rules it out. Every rule blocks only when
 * *both* sides state the fact: a missing code, category or dimension is not
 * evidence of a mismatch, and treating it as one is how true matches are lost.
 */
export function block(l: Pick<Line, "codes" | "category" | "uom" | "attrs">,
                      p: Pick<Product, "codes" | "category" | "uom" | "attrs">): string | null {
  // Standard codes first: when both sides carry one it settles the category.
  for (const [system, depth] of [["unspsc", 6], ["atc", 5], ["gmdn", 99]] as const) {
    const a = l.codes[system], b = p.codes[system];
    if (a && b && a.slice(0, depth) !== b.slice(0, depth)) {
      return `${system.toUpperCase()} ${a} vs ${b}`;
    }
  }
  if (l.codes.dosage_form && p.codes.dosage_form
      && norm(l.codes.dosage_form) !== norm(p.codes.dosage_form)) {
    return `dosage form ${l.codes.dosage_form} vs ${p.codes.dosage_form}`;
  }
  if (l.category !== UNCLASSIFIED && p.category !== UNCLASSIFIED && l.category !== p.category) {
    return `category ${CATEGORY_LABEL[l.category] ?? l.category} vs ${CATEGORY_LABEL[p.category] ?? p.category}`;
  }
  const fa = unitFamily(l.uom), fb = unitFamily(p.uom);
  if (fa && fb && fa !== fb) return `unit ${l.uom} (${fa}) vs ${p.uom} (${fb})`;
  // A dimension both sides state and disagree on makes it a different article
  // outright. This is the arithmetic Jev is not asked to do.
  for (const key of DIMENSIONS) {
    const a = l.attrs[key], b = p.attrs[key];
    if (a == null || b == null) continue;
    if (!sameValue(a, b)) return `${key.replace(/_/g, " ")} ${a} vs ${b}`;
  }
  return null;
}

const DIMENSIONS = ["gauge", "volume_ml", "od_mm", "length_mm", "size_mm", "width_cm", "length_m"];

function sameValue(a: string | number, b: string | number): boolean {
  const na = parseFloat(String(a)), nb = parseFloat(String(b));
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) <= 0.02 * Math.max(Math.abs(na), Math.abs(nb));
  }
  return norm(String(a)) === norm(String(b));
}

/** Units in the same family can be converted; across families they are different things. */
const UNIT_FAMILIES: [string, RegExp][] = [
  ["count", /^(stück|stk|st|piece|pieces|pcs|pc|ea|each|unit|tuch|rolle|roll|paar|pair|set|beutel|box|pack|packung|dose|karton)$/],
  ["volume", /^(ml|l|liter|litre|cl)$/],
  ["mass", /^(g|kg|mg)$/],
  ["length", /^(m|cm|mm|meter)$/],
];
function unitFamily(uom: string | null | undefined): string | null {
  const u = norm(uom ?? "");
  return UNIT_FAMILIES.find(([, re]) => re.test(u))?.[0] ?? null;
}

// --- loading ------------------------------------------------------------------

function loadLines(): Line[] {
  return rows<any>(
    `SELECT h.*, cp.attributes AS canonical_attributes
     FROM hospital_purchase_items h
     LEFT JOIN canonical_products cp ON cp.id = h.canonical_product_id
     WHERE h.hospital_id = ? AND h.extraction_confidence >= ?`, HOSPITAL_ID, EXTRACTION_THRESHOLD)
    .map((r) => {
      const raw = json(r.raw_extraction_payload);
      const attrs = {
        ...parseSpecAttributes(`${r.extracted_name ?? ""} ${r.extracted_spec ?? ""}`),
        ...(json(r.canonical_attributes) as Record<string, string | number>),
      };
      return {
        id: r.id, name: r.extracted_name ?? "", brand: r.extracted_brand, spec: r.extracted_spec,
        sku: r.extracted_sku, gtin: r.extracted_gtin, uom: r.extracted_uom ?? "Stück",
        packSize: r.extracted_pack_size || 1, mdr: r.declared_mdr_class,
        canonicalId: r.canonical_product_id, attrs, codes: codesFrom(raw, attrs),
        category: eclassFor(r.extracted_name ?? "", attrs),
        embedding: unpackVector(r.embedding), embeddingModel: r.embedding_model ?? null,
      };
    });
}

function loadProducts(): Product[] {
  return rows<any>(
    `SELECT cp.*, o.name AS manufacturer_name,
            (SELECT s.extracted_sku FROM supplier_catalog_items s
              WHERE s.canonical_product_id = cp.id ORDER BY s.created_at LIMIT 1) AS sku,
            (SELECT s.raw_extraction_payload FROM supplier_catalog_items s
              WHERE s.canonical_product_id = cp.id ORDER BY s.created_at LIMIT 1) AS raw
     FROM canonical_products cp
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id`)
    .map((r) => {
      const attrs = json(r.attributes) as Record<string, string | number>;
      return {
        id: r.id, name: r.canonical_name, manufacturer: r.manufacturer_name ?? "unknown",
        manufacturerId: r.manufacturer_id, gtin: r.gtin, sku: r.sku, uom: r.base_uom,
        packSize: r.base_pack_size || 1, mdr: r.mdr_risk_class, description: r.description,
        attrs, codes: codesFrom(json(r.raw), attrs),
        category: eclassFor(r.canonical_name, attrs),
        embedding: unpackVector(r.embedding),
      };
    });
}

/** UNSPSC, GMDN, ATC and dosage form, wherever a source put them. */
function codesFrom(...sources: Record<string, unknown>[]): Codes {
  const out: Codes = {};
  for (const src of sources) {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (v == null || v === "") continue;
      const key = k.toLowerCase().replace(/[^a-z]/g, "");
      if (key.includes("unspsc")) out.unspsc ??= String(v).replace(/\D/g, "");
      else if (key.includes("gmdn")) out.gmdn ??= String(v).trim();
      else if (key === "atc" || key.startsWith("atccode")) out.atc ??= String(v).trim().toUpperCase();
      else if (key.includes("dosageform") || key.includes("darreichung")) out.dosage_form ??= String(v).trim();
    }
  }
  return out;
}

/**
 * Hospital lines get a vector once, like canonical products do — and again
 * whenever the model that would embed them now is not the one that did.
 */
async function ensureLineEmbeddings(lines: Line[]) {
  const tag = embeddingTag();
  const missing = lines.filter((l) => !l.embedding || l.embeddingModel !== tag);
  if (!missing.length) return;
  const { vectors, model } = await embedLabelled(
    missing.map((l) => searchText({ name: l.name, spec: l.spec })), "document");
  const upd = db().prepare(`UPDATE hospital_purchase_items SET embedding=?, embedding_model=? WHERE id=?`);
  tx(() => vectors.forEach((v, i) => {
    upd.run(packVector(v), embeddingTag(model), missing[i].id);
    missing[i].embedding = new Float32Array(v);
    missing[i].embeddingModel = embeddingTag(model);
  }));
}

// --- views handed to the models -------------------------------------------------

function gateInput(l: Line, p: Product): GateInput {
  return {
    item: { name: l.name, brand: l.brand, spec: l.spec && l.spec !== l.name ? l.spec : null,
      unit: l.uom, mdrClass: l.mdr },
    product: { name: p.name, manufacturer: p.manufacturer, unit: p.uom, mdrClass: p.mdr,
      description: p.description },
  };
}
function lineView(l: Line): ProductView {
  return { name: l.name, manufacturer: l.brand ?? "unknown", sku: l.sku, gtin: l.gtin,
    uom: l.uom, packSize: l.packSize, mdrClass: l.mdr ?? "IIa", attributes: l.attrs };
}
function productView(p: Product): ProductView {
  return { name: p.name, manufacturer: p.manufacturer, sku: p.sku, gtin: p.gtin,
    uom: p.uom, packSize: p.packSize, mdrClass: p.mdr, attributes: p.attrs };
}

// --- state -------------------------------------------------------------------------

function loadState(): Map<string, PairState> {
  const out = new Map<string, PairState>();
  for (const r of rows<any>(`SELECT * FROM match_pairs WHERE hospital_id=?`, HOSPITAL_ID)) {
    out.set(`${r.hospital_item_id}|${r.canonical_product_id}`, {
      itemId: r.hospital_item_id, productId: r.canonical_product_id,
      outcome: r.outcome, dropStage: r.drop_stage, reason: r.reason,
      categoryItem: r.category_item, categoryProduct: r.category_product,
      similarity: r.similarity, rank: r.rank,
      jevScore: r.jev_score, jevAdapter: r.jev_adapter, jevHash: r.jev_hash,
      relation: r.relation, confidence: r.confidence, rationale: r.rationale,
      differing: json(r.differing_attributes) as unknown as string[] | null,
      adjudicationAdapter: r.adjudication_adapter, adjudicationHash: r.adjudication_hash,
      isTop: !!r.is_top, analysisStatus: r.analysis_status, analysisJson: r.analysis_json,
      analysisHash: r.analysis_hash, analysisError: r.analysis_error, analysedAt: r.analysed_at,
      dismissedAt: r.dismissed_at, persisted: true, touched: false,
    });
  }
  return out;
}

function blankState(itemId: string, productId: string): PairState {
  return {
    itemId, productId, outcome: "dropped", dropStage: null, reason: null,
    categoryItem: "", categoryProduct: "", similarity: null, rank: null,
    jevScore: null, jevAdapter: null, jevHash: null, relation: null, confidence: null,
    rationale: null, differing: null, adjudicationAdapter: null, adjudicationHash: null,
    isTop: false, analysisStatus: null, analysisJson: null, analysisHash: null,
    analysisError: null, analysedAt: null, dismissedAt: null, persisted: false, touched: false,
  };
}

function drop(st: PairState, stage: number, reason: string) {
  st.outcome = "dropped"; st.dropStage = stage; st.reason = reason; st.isTop = false;
}

/** Identical beats equivalent; then the model's confidence; then the cheap scores. */
function byStrength(a: PairState, b: PairState): number {
  const rel = (x: PairState) => (x.relation === "identical" ? 1 : 0);
  return rel(b) - rel(a)
    || (b.confidence ?? 0) - (a.confidence ?? 0)
    || (b.jevScore ?? 0) - (a.jevScore ?? 0)
    || (b.similarity ?? 0) - (a.similarity ?? 0);
}

/**
 * A stored result stands in for a new call when it came from the model — or
 * when it did not, but the model is not available now either. A fallback's
 * answer is never kept once the real thing can be asked.
 */
function reusable(adapter: string | null, liveAvailable: boolean): boolean {
  return Boolean(adapter) && (!isFallback(adapter) || !liveAvailable);
}

function analysisAdapter(st: PairState): string | null {
  try { return st.analysisJson ? (JSON.parse(st.analysisJson) as ReplacementAnalysis).adapter : null; }
  catch { return null; }
}

/** Write every pair this run touched. Free-stage drops only while logging. */
function save(state: Map<string, PairState>, runId: string) {
  const conn = db();
  const upsert = conn.prepare(
    `INSERT INTO match_pairs (id,hospital_id,hospital_item_id,canonical_product_id,run_id,outcome,
       drop_stage,reason,category_item,category_product,similarity,rank,jev_score,jev_adapter,jev_hash,
       relation,confidence,rationale,differing_attributes,adjudication_adapter,adjudication_hash,
       is_top,analysis_status,analysis_json,analysis_hash,analysis_error,analysed_at,dismissed_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(hospital_item_id, canonical_product_id) DO UPDATE SET
       run_id=excluded.run_id, outcome=excluded.outcome, drop_stage=excluded.drop_stage,
       reason=excluded.reason, category_item=excluded.category_item,
       category_product=excluded.category_product, similarity=excluded.similarity, rank=excluded.rank,
       jev_score=excluded.jev_score, jev_adapter=excluded.jev_adapter, jev_hash=excluded.jev_hash,
       relation=excluded.relation, confidence=excluded.confidence, rationale=excluded.rationale,
       differing_attributes=excluded.differing_attributes,
       adjudication_adapter=excluded.adjudication_adapter,
       adjudication_hash=excluded.adjudication_hash, is_top=excluded.is_top,
       analysis_status=excluded.analysis_status, analysis_json=excluded.analysis_json,
       analysis_hash=excluded.analysis_hash, analysis_error=excluded.analysis_error,
       analysed_at=excluded.analysed_at, updated_at=excluded.updated_at`);
  // A pair from an earlier run that this run no longer considered belongs to
  // a line or product that is gone; the cascades remove those rows.
  tx(() => {
    for (const st of state.values()) {
      if (!st.touched) {
        // Out of scope this run — a line that fell below the extraction bar,
        // say. It must not go on being suggested from an old result.
        if (st.persisted && st.outcome === "matched") {
          conn.prepare(`UPDATE match_pairs SET outcome='dropped', drop_stage=1, is_top=0,
                          reason='no longer in scope', updated_at=?
                        WHERE hospital_item_id=? AND canonical_product_id=?`)
            .run(nowIso(), st.itemId, st.productId);
        }
        continue;
      }
      const freeDrop = st.outcome === "dropped" && (st.dropStage ?? 0) <= 2;
      if (freeDrop && !SUGGEST.logDrops && !st.persisted) continue;
      upsert.run(id("mp"), HOSPITAL_ID, st.itemId, st.productId, runId, st.outcome, st.dropStage,
        st.reason, st.categoryItem, st.categoryProduct, st.similarity, st.rank, st.jevScore,
        st.jevAdapter, st.jevHash, st.relation, st.confidence, st.rationale,
        st.differing ? JSON.stringify(st.differing) : null, st.adjudicationAdapter,
        st.adjudicationHash, st.isTop ? 1 : 0, st.analysisStatus, st.analysisJson, st.analysisHash,
        st.analysisError, st.analysedAt, st.dismissedAt, nowIso());
      st.persisted = true;
    }
  });
}

function setAnalysis(st: PairState, patch: Partial<PairState>) {
  Object.assign(st, patch);
  db().prepare(
    `UPDATE match_pairs SET analysis_status=?, analysis_json=?, analysis_hash=?, analysis_error=?,
       analysed_at=?, updated_at=? WHERE hospital_item_id=? AND canonical_product_id=?`)
    .run(st.analysisStatus, st.analysisJson, st.analysisHash, st.analysisError, st.analysedAt,
      nowIso(), st.itemId, st.productId);
}

// --- run bookkeeping -------------------------------------------------------------

function emptySummary(runId: string | null): SuggestionRunSummary {
  return { runId, lines: 0, products: 0, pairsTotal: 0, afterStage1: 0, afterStage2: 0,
    afterStage3: 0, matched: 0, analysed: 0, jevCalls: 0, claudeCalls: 0, analysisCalls: 0,
    reused: 0, jevCost: 0 };
}

function progress(runId: string, s: SuggestionRunSummary, adapters: Set<string>) {
  db().prepare(
    `UPDATE suggestion_runs SET lines=?, products=?, pairs_total=?, after_stage1=?, after_stage2=?,
       after_stage3=?, matched=?, analysed=?, jev_calls=?, claude_calls=?, analysis_calls=?,
       reused=?, jev_cost=?, adapters=? WHERE id=?`)
    .run(s.lines, s.products, s.pairsTotal, s.afterStage1, s.afterStage2, s.afterStage3,
      s.matched, s.analysed, s.jevCalls, s.claudeCalls, s.analysisCalls, s.reused,
      round(s.jevCost, 6), [...adapters].sort().join("; "), runId);
}

function finish(runId: string, s: SuggestionRunSummary, adapters: Set<string>, error: string | null) {
  progress(runId, s, adapters);
  db().prepare(`UPDATE suggestion_runs SET status=?, finished_at=?, error=? WHERE id=?`)
    .run(error ? "failed" : "done", nowIso(), error, runId);
}

/** latest.json: the run, and every pair that reached a paid stage, labelled. */
function report(runId: string, s: SuggestionRunSummary, state: Map<string, PairState>,
                lines: Line[], products: Product[]) {
  const lineName = new Map(lines.map((l) => [l.id, l.name]));
  const product = new Map(products.map((p) => [p.id, p]));
  return {
    run: runId, at: nowIso(), thresholds: SUGGEST, summary: s,
    pairs: [...state.values()]
      .filter((st) => st.touched && (st.outcome === "matched" || (st.dropStage ?? 0) >= 3))
      .map((st) => ({
        item: lineName.get(st.itemId), product: product.get(st.productId)?.name,
        manufacturer: product.get(st.productId)?.manufacturer,
        outcome: st.outcome, stage: st.dropStage, reason: st.reason,
        categories: [st.categoryItem, st.categoryProduct], similarity: st.similarity,
        jev: st.jevScore, relation: st.relation, confidence: st.confidence,
        rationale: st.rationale, top: st.isTop, analysis: st.analysisStatus,
      })),
  };
}

// --- helpers -----------------------------------------------------------------------

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
const norm = (s: string) => s.toLowerCase().replace(/[.\s]/g, "");
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
function json(s: string | null | undefined): Record<string, unknown> {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}
