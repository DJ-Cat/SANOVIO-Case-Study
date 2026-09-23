/**
 * Product search that finds what the buyer meant, not only what they typed.
 *
 *   identifier   GTIN, PZN, article number — exact, first, free
 *   words        every word of the query in the product, allowing for typos
 *                and a glossary from English, French, Italian and Spanish into
 *                the German the catalogues are written in
 *   meaning      a Voyage query vector against the catalogue's product vectors,
 *                then the Voyage reranker over the nearest candidates, which
 *                is what makes "aiguille", "safety needle" and
 *                "Sicherheitskanüle" land on the same products
 *
 * The layers are merged by score, and each hit says which layer found it, so
 * a close match in meaning is shown as one rather than passed off as the
 * product the buyer named. A query with nothing close enough returns nothing:
 * a search that always answers is a search whose answers mean nothing.
 *
 * Without a Voyage key the meaning layer falls back to the lexical reranker,
 * so the words layer and its glossary carry the other languages alone. The
 * result says which of the two answered.
 */
import { rows, unpackVector, cosine } from "./db";
import { HOSPITAL_ID } from "./constants";
import { embedLabelled, rerank, normalise, hasVoyage } from "./ai";
import { ensureCanonicalEmbeddings, embeddingTag, productEmbeddingText } from "./matching/pipeline";
import { eclassFor, CATEGORY_LABEL, CATEGORY_LABEL_DE, UNCLASSIFIED } from "./matching/category";
import type { MdrClass } from "./matching/thresholds";

export type MatchKind = "identifier" | "text" | "meaning";

export interface SearchHit {
  canonicalId: string; name: string; manufacturer: string; mdrClass: MdrClass;
  uom: string; packSize: number; eclass: string | null; gtin: string | null;
  supplierId: string | null; basePrice: number | null; tierOrigin: string | null;
  /** What `basePrice` is quoted in. */
  currency: string;
  ownedByHospital: boolean; currentPrice: number | null; savingsPct: number | null;
  match: MatchKind; score: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** What answered the meaning layer: a model, or the lexical fallback. */
  semantic: string;
  /** Glossary terms the query was widened with, for the "searched for" line. */
  expanded: string[];
}

export const SEARCH = {
  /** Nearest products by vector handed to the reranker. */
  candidates: 40,
  /** Reranker relevance (0–100) a meaning-only hit needs. Calibrated on the BD catalogue. */
  minRelevance: Number(process.env.SEARCH_MIN_RELEVANCE ?? 45),
  /** …and how close to the best hit it must be, so a strong query does not trail noise. */
  relativeFloor: 0.7,
  limit: 24,
};

// --- glossary -------------------------------------------------------------
/** Umlauts and ß folded, so "Kanule" and "Kanuele" are words, not typos. */
const fold = (s: string) => s.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
  .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");

/**
 * Query words in other languages → the German stems the catalogues use.
 * Deliberately small: the medical-supply nouns a buyer searches by. The
 * embedding model handles the long tail; this keeps the common case working
 * without a key and makes it exact with one.
 */
const GLOSSARY: Record<string, string[]> = {};
const add = (words: string, de: string[]) => { for (const w of words.split(" ")) GLOSSARY[fold(w)] = de; };
add("needle needles cannula cannulas aiguille aiguilles canule canules ago aghi aguja agujas", ["kanüle", "kanule"]);
add("syringe syringes seringue seringues siringa siringhe jeringa jeringas", ["spritze"]);
add("glove gloves gant gants guanto guanti guante guantes", ["handschuh"]);
add("mask masks masque masques maschera maschere mascarilla mascarillas", ["maske"]);
add("cap caps bouchon bouchons capuchon tappo tappi tapón tapon stopper", ["kappe", "verschluss", "stopfen"]);
add("infusion perfusion perfuseur infusione infusión", ["infusion", "überleit", "uberleit"]);
add("dressing dressings pansement pansements medicazione apósito aposito bandage", ["verband", "wund"]);
add("plaster plasters sparadrap cerotto cerotti esparadrapo", ["pflaster"]);
add("disinfectant désinfectant desinfectant disinfettante desinfectante wipes lingettes salviette toallitas", ["desinfekt", "tücher", "tucher"]);
add("implant implants impianto impianti implante", ["implantat"]);
add("hip hanche anca cadera", ["hüft", "huft"]);
add("catheter cathéter catheter catetere catéter", ["katheter"]);
add("tube tubes tubing tuyau tubo tubi", ["schlauch"]);
add("ventilation ventilator respirateur ventilatore ventilación ventilacion", ["beatmung"]);
add("safety sécurité securite sicurezza seguridad", ["sicherheit"]);
add("insulin insuline insulina", ["insulin"]);
add("sterile stérile esteril estéril", ["steril"]);
add("cup gobelet bicchiere vaso container récipient recipient contenitore", ["becher", "gefäß", "gefass"]);
add("adult adulte adulto", ["erwachsene"]);
add("lock", ["lok", "lock"]);

const STOP = new Set(["mit", "und", "für", "fur", "der", "die", "das", "ein", "eine", "the", "for",
  "with", "and", "of", "de", "la", "le", "les", "du", "des", "pour", "avec", "et", "per", "con", "di",
  "il", "lo", "y", "el", "los", "las", "para", "gauge", "ohne", "without", "sans", "senza", "sin"]);

// --- entry point ------------------------------------------------------------

interface Row {
  id: string; name: string; manufacturer: string | null; mdr: string; uom: string; pack: number;
  eclass: string | null; gtin: string | null; udi: string | null; attributes: string;
  embedding: Uint8Array | null; embedding_model: string | null; skus: string | null;
  base_price: number | null; tier_origin: string | null; supplier_id: string | null;
  currency: string | null; current_price: number | null;
}

const cache = new Map<string, { at: number; result: SearchResult }>();
const CACHE_MS = 60_000;

export async function searchProducts(q: string, limit = SEARCH.limit): Promise<SearchResult> {
  const query = q.trim().slice(0, 200);
  if (!query) return { hits: [], semantic: "", expanded: [] };

  // A product whose vector is stale — made by another model, or before a
  // key existed — is re-embedded before it is compared. Cheap when nothing
  // changed: one indexed query.
  await ensureCanonicalEmbeddings();

  const version = rows<{ v: string }>(
    `SELECT COUNT(*) || ':' || COALESCE(MAX(id), '') AS v FROM canonical_products`)[0].v;
  const key = `${version}|${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const products = loadProducts();
  const scores = new Map<string, { score: number; match: MatchKind }>();
  const offer = (id: string, score: number, match: MatchKind) => {
    const prev = scores.get(id);
    const rank = { identifier: 3, text: 2, meaning: 1 };
    if (!prev || score > prev.score || (score === prev.score && rank[match] > rank[prev.match])) {
      scores.set(id, { score, match });
    }
  };

  // ---- identifiers ---------------------------------------------------------
  for (const token of query.split(/[\s,;]+/)) {
    const digits = token.replace(/\D/g, "");
    const raw = token.toLowerCase();
    if (raw.length < 4) continue;
    for (const p of products) {
      const ids = identifiersOf(p);
      if ((digits.length >= 6 && ids.digits.includes(digits.replace(/^0+/, "")))
          || ids.codes.includes(raw)) offer(p.id, 100, "identifier");
    }
  }

  // ---- words, with glossary and typos ---------------------------------------
  const concepts = conceptsOf(query);
  const expanded = [...new Set(concepts.flatMap((c) => c.shown))];
  const lexical: { p: Row; score: number }[] = [];
  if (concepts.length) {
    for (const p of products) {
      const text = searchableText(p);
      let literal = 0, any = 0;
      for (const c of concepts) {
        if (c.forms.some((f) => text.includes(f)) || c.fuzzy && fuzzyIn(c.forms[0], text)) {
          any++;
          if (text.includes(c.forms[0])) literal++;
        } else if (c.translated.some((t) => text.includes(t))) {
          any++;
        }
      }
      const share = any / concepts.length;
      if (share === 1) offer(p.id, literal === concepts.length ? 96 : 90, literal === concepts.length ? "text" : "meaning");
      if (share >= 0.5) lexical.push({ p, score: share });
    }
  }

  // A query that is nothing but identifiers asked for those articles. Meaning
  // has nothing to add to a PZN except near-misses that look like answers.
  const identifierOnly = query.split(/[\s,;]+/).every((t) => t.replace(/\D/g, "").length >= 6);
  if (identifierOnly) {
    return finish(key, products, scores, limit, "identifier lookup", expanded);
  }

  // ---- meaning ----------------------------------------------------------------
  const tag = embeddingTag();
  const indexed = products.filter((p) => p.embedding && p.embedding_model === tag);
  let semantic = "words and glossary only";
  if (indexed.length) {
    const { vectors, model } = await embedLabelled([query], "query");
    const qv = new Float32Array(vectors[0] ?? []);
    // Only a language model's neighbours are worth reranking. The keyless
    // fallback's vectors are hashed letters and its reranker scores any text
    // at 55 or more, so there a candidate has to share words with the query.
    const live = hasVoyage() && embeddingTag(model) === tag;
    semantic = live ? `${model} + reranker` : "words and glossary (no Voyage key)";
    const nearest = live
      ? indexed.map((p) => ({ p, sim: cosine(qv, unpackVector(p.embedding)!) }))
          .sort((a, b) => b.sim - a.sim).slice(0, SEARCH.candidates).map((x) => x.p)
      : [];
    // Word hits join the pool, so the reranker orders them against the
    // meaning hits on one scale instead of the two lists being stapled.
    const pool = [...new Map([...nearest, ...lexical.map((l) => l.p)].map((p) => [p.id, p])).values()];
    if (pool.length) {
      const ranked = await rerank(query, pool.map((p) => productEmbeddingText({
        canonical_name: p.name, manufacturer_name: p.manufacturer, attributes: p.attributes,
      })));
      const best = ranked[0]?.score ?? 0;
      for (const r of ranked) {
        if (r.score < SEARCH.minRelevance || r.score < best * SEARCH.relativeFloor) continue;
        offer(pool[r.index].id, Math.min(89, r.score), "meaning");
      }
    }
  }

  return finish(key, products, scores, limit, semantic, expanded);
}

function finish(
  key: string, products: Row[], scores: Map<string, { score: number; match: MatchKind }>,
  limit: number, semantic: string, expanded: string[],
): SearchResult {
  const byId = new Map(products.map((p) => [p.id, p]));
  const hits = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([id, s]) => toHit(byId.get(id)!, s.match, s.score));
  const result = { hits, semantic, expanded };
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return result;
}


// --- helpers ------------------------------------------------------------------

function loadProducts(): Row[] {
  return rows<Row>(
    `SELECT cp.id, cp.canonical_name AS name, o.name AS manufacturer, cp.mdr_risk_class AS mdr,
            cp.base_uom AS uom, cp.base_pack_size AS pack, cp.eclass_code AS eclass, cp.gtin,
            cp.udi_di AS udi, cp.attributes, cp.embedding, cp.embedding_model,
            (SELECT GROUP_CONCAT(s.extracted_sku, ' ') FROM supplier_catalog_items s
              WHERE s.canonical_product_id = cp.id) AS skus,
            (SELECT unit_price FROM price_tiers t WHERE t.canonical_product_id=cp.id
              ORDER BY min_volume ASC LIMIT 1) AS base_price,
            (SELECT origin FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS tier_origin,
            (SELECT currency FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS currency,
            (SELECT supplier_id FROM price_tiers t WHERE t.canonical_product_id=cp.id LIMIT 1) AS supplier_id,
            (SELECT h.current_unit_price FROM hospital_purchase_items h
              WHERE h.canonical_product_id=cp.id AND h.hospital_id=? LIMIT 1) AS current_price
     FROM canonical_products cp
     LEFT JOIN organizations o ON o.id = cp.manufacturer_id`, HOSPITAL_ID);
}

function identifiersOf(p: Row): { digits: string[]; codes: string[] } {
  let attrs: Record<string, unknown> = {};
  try { attrs = JSON.parse(p.attributes); } catch { /* none */ }
  const all = [p.gtin, p.udi, p.eclass, ...(p.skus ?? "").split(" "),
    ...Object.entries(attrs).filter(([k]) => /pzn|gtin|ean|sku|udi/i.test(k)).map(([, v]) => String(v))]
    .filter((x): x is string => Boolean(x));
  return {
    digits: all.map((x) => x.replace(/\D/g, "").replace(/^0+/, "")).filter((x) => x.length >= 6),
    codes: all.map((x) => x.toLowerCase()),
  };
}

/** Name, maker and category in both languages — what a word has to be found in. */
function searchableText(p: Row): string {
  let attrs: Record<string, string | number> = {};
  try { attrs = JSON.parse(p.attributes); } catch { /* none */ }
  const cat = eclassFor(p.name, attrs);
  const category = cat === UNCLASSIFIED ? "" : `${CATEGORY_LABEL_DE[cat]} ${CATEGORY_LABEL[cat]}`;
  return ` ${fold(normalise(`${p.manufacturer ?? ""} ${p.name} ${category}`))} `;
}

interface Concept { forms: string[]; translated: string[]; shown: string[]; fuzzy: boolean }

/**
 * One concept per meaningful query word: the word itself, a plural-stripped
 * form, and its German stems. A number is a concept too — "10 ml" has to find
 * 10 ml, not 20 — matched as a whole token so 1 does not match 10.
 */
function conceptsOf(query: string): Concept[] {
  return fold(normalise(query)).split(" ")
    .filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)))
    .map((t) => {
      // "21g" and "10ml" are typed as one token and printed as two ("21 G").
      const unit = t.match(/^(\d+(?:\.\d+)?)([a-z]+)$/);
      if (unit) return { forms: [` ${unit[1]} ${unit[2]} `, ` ${t} `], translated: [], shown: [], fuzzy: false };
      if (/^\d/.test(t)) return { forms: [` ${t} `], translated: [], shown: [], fuzzy: false };
      const stem = t.length > 4 ? t.replace(/(en|es|s|n|e)$/, "") : t;
      return {
        forms: [...new Set([t, stem])],
        translated: (GLOSSARY[t] ?? GLOSSARY[stem] ?? []).map(fold),
        // The first German stem, as the buyer would read it: "Kanüle", not "kanule".
        shown: (GLOSSARY[t] ?? GLOSSARY[stem] ?? []).slice(0, 1),
        fuzzy: t.length >= 5,
      };
    });
}

/**
 * A typo: some word in the text contains most of this word's letter triples.
 *
 * Containment rather than overlap, because German compounds are long — a
 * buyer typing "Beatmungschlauch" means the "Beatmungsschlauchsystem" that
 * contains nearly every triple of it, and an overlap score would call those
 * two different words on length alone.
 */
function fuzzyIn(word: string, text: string): boolean {
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 2) }, (_, i) => s.slice(i, i + 3)));
  const a = grams(word);
  if (a.size < 3) return false;
  return text.split(" ").some((w) => {
    if (w.length < word.length - 2) return false;
    const b = grams(w);
    let shared = 0;
    for (const g of a) if (b.has(g)) shared++;
    return shared / a.size >= 0.75;
  });
}

function toHit(p: Row, match: MatchKind, score: number): SearchHit {
  const savings = p.current_price && p.base_price
    ? Math.round(((p.current_price - p.base_price) / p.current_price) * 1000) / 10 : null;
  return {
    canonicalId: p.id, name: p.name, manufacturer: p.manufacturer ?? "—",
    mdrClass: (p.mdr ?? "IIa") as MdrClass, uom: p.uom, packSize: p.pack, eclass: p.eclass,
    gtin: p.gtin, supplierId: p.supplier_id, basePrice: p.base_price, tierOrigin: p.tier_origin, currency: p.currency ?? "CHF",
    ownedByHospital: p.current_price != null, currentPrice: p.current_price, savingsPct: savings,
    match, score: Math.round(score),
  };
}

/** For tests: forget cached results, e.g. after the catalogue changes in place. */
export function clearSearchCache() { cache.clear(); }
