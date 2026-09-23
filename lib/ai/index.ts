/**
 * The AI layer behind one interface (§8, §9).
 *
 * Live adapters run when the keys are present; deterministic adapters run
 * when they are not. Both satisfy the same contract, so the pipeline in
 * lib/matching/pipeline.ts never branches on which one is active and the
 * demo works with no credentials.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const hasVoyage = () => Boolean(process.env.VOYAGE_API_KEY);

/**
 * What actually answered, not what was configured.
 *
 * A key that is present but rejected is the dangerous case: the UI would
 * otherwise credit a model for output a deterministic fallback produced. Each
 * live path records whether it succeeded, and the label follows that.
 */
type LiveState = "unused" | "ok" | "rejected";
const live: { embed: LiveState; claude: LiveState } = { embed: "unused", claude: "unused" };
export function noteLive(kind: "embed" | "claude", ok: boolean) {
  live[kind] = ok ? "ok" : "rejected";
}

function label(kind: "embed" | "claude"): string {
  const configured = kind === "embed" ? hasVoyage() : hasAnthropic();
  const name = kind === "embed" ? "voyage-4" : "claude-opus-5";
  const stub = kind === "embed" ? "stub-embed" : "stub-adjudicate";
  if (!configured) return stub;
  if (live[kind] === "rejected") return `${stub} (${name} key rejected)`;
  return name;
}

export function adapterName(): string {
  return `${label("embed")} + ${label("claude")}`;
}

// --- Adjudication contract (§9) ----------------------------------------
export const AdjudicationSchema = z.object({
  relation: z.enum(["identical", "equivalent", "not_equivalent"]),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string(),
  differing_attributes: z.array(z.string()),
  needs_clarification: z.boolean(),
  question_text: z.string(),
  question_type: z.enum(["blocking", "non_blocking"]),
});
export type Adjudication = z.infer<typeof AdjudicationSchema>;

export interface ProductView {
  name: string;
  manufacturer: string;
  sku?: string | null;
  gtin?: string | null;
  uom: string;
  packSize: number;
  mdrClass: string;
  attributes: Record<string, unknown>;
}

// --- Embeddings ---------------------------------------------------------
const EMBED_DIM = 256;
const VOYAGE_EMBED_MODEL = process.env.VOYAGE_EMBED_MODEL ?? "voyage-4";
// Voyage's reranker model id is configurable because it moves faster than
// this repo does; override with VOYAGE_RERANK_MODEL if the default 404s.
const VOYAGE_RERANK_MODEL = process.env.VOYAGE_RERANK_MODEL ?? "rerank-2.5";

export async function embed(texts: string[]): Promise<number[][]> {
  return (await embedLabelled(texts, "document")).vectors;
}

/**
 * The same call, saying which model produced the vectors.
 *
 * A vector is only comparable with vectors from the same model: a Voyage
 * query against fallback-hashed products is noise, not a low score. Callers
 * store this label beside each vector and re-embed when it no longer matches
 * what would answer now — the case a catalogue loaded without a key is in.
 *
 * `query` and `document` are Voyage's two sides of retrieval; a search box
 * embeds its text as a query, a catalogue its rows as documents.
 */
export async function embedLabelled(
  texts: string[], inputType: "document" | "query" = "document",
): Promise<{ vectors: number[][]; model: string }> {
  if (!texts.length) return { vectors: [], model: currentEmbedModel() };
  if (hasVoyage()) {
    try {
      const vectors: number[][] = [];
      // Voyage takes up to 1000 inputs per call; batching well under that
      // keeps a whole catalogue re-embed to a handful of requests.
      for (let i = 0; i < texts.length; i += 128) {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          },
          body: JSON.stringify({
            input: texts.slice(i, i + 128), model: VOYAGE_EMBED_MODEL, input_type: inputType,
          }),
        });
        if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text()}`);
        const json = (await res.json()) as { data: { embedding: number[] }[] };
        vectors.push(...json.data.map((d) => d.embedding));
      }
      noteLive("embed", true);
      return { vectors, model: VOYAGE_EMBED_MODEL };
    } catch (err) {
      noteLive("embed", false);
      console.warn("[ai] Voyage embeddings failed, using deterministic adapter:", err);
    }
  }
  return { vectors: texts.map(stubEmbed), model: STUB_EMBED_MODEL };
}

const STUB_EMBED_MODEL = "stub-embed";
/** Which model an embedding made right now would come from. */
export const currentEmbedModel = () => (hasVoyage() ? VOYAGE_EMBED_MODEL : STUB_EMBED_MODEL);

/**
 * Deterministic embedding: hash tokens and character trigrams into a fixed
 * vector. Not semantic, but it does capture the lexical overlap that drives
 * most medical-supply matching ("0,80 mm x 40 mm" vs "0,8 × 40 mm"), which is
 * enough to exercise the retrieval layer honestly.
 */
function stubEmbed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const norm = normalise(text);
  for (const tok of norm.split(" ").filter(Boolean)) {
    v[hash(tok) % EMBED_DIM] += 1;
    for (let i = 0; i + 3 <= tok.length; i++) {
      v[hash(tok.slice(i, i + 3)) % EMBED_DIM] += 0.35;
    }
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/** Shared text normalisation: German decimal commas, ×, units, punctuation. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[×x]\s*/g, " x ")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/®|™/g, " ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    // collapse numeric spellings so "0,80" and "0.8" are the same token
    .replace(/\d+\.\d+|\d+/g, (m) => String(parseFloat(m)))
    .replace(/\s+/g, " ")
    .trim();
}

// --- Reranking ----------------------------------------------------------
export interface RerankHit { index: number; score: number }

export async function rerank(query: string, docs: string[]): Promise<RerankHit[]> {
  if (!docs.length) return [];
  if (hasVoyage()) {
    try {
      const res = await fetch("https://api.voyageai.com/v1/rerank", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({ query, documents: docs, model: VOYAGE_RERANK_MODEL }),
      });
      if (!res.ok) throw new Error(`voyage rerank ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { data: { index: number; relevance_score: number }[] };
      return json.data
        .map((d) => ({ index: d.index, score: Math.round(d.relevance_score * 100) }))
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn("[ai] Voyage rerank failed, using deterministic adapter:", err);
    }
  }
  return docs
    .map((d, index) => ({ index, score: lexicalScore(query, d) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Deterministic reranker. Weighted so that agreeing *numbers* (gauge, mm,
 * ml, pack size) count far more than agreeing words — in this domain two
 * products with the same words and different dimensions are not the same
 * product, which a pure bag-of-words score gets wrong.
 */
function lexicalScore(a: string, b: string): number {
  const ta = new Set(normalise(a).split(" ").filter(Boolean));
  const tb = new Set(normalise(b).split(" ").filter(Boolean));
  const numsA = [...ta].filter((t) => /\d/.test(t));
  const numsB = new Set([...tb].filter((t) => /\d/.test(t)));
  const wordsA = [...ta].filter((t) => !/\d/.test(t));
  const wordsB = new Set([...tb].filter((t) => !/\d/.test(t)));

  const wordHit = wordsA.filter((t) => wordsB.has(t)).length;
  const wordScore = wordsA.length ? wordHit / wordsA.length : 0;

  const numHit = numsA.filter((t) => numsB.has(t)).length;
  const numScore = numsA.length ? numHit / numsA.length : 1;
  // A missing dimension is a real signal, but not a veto — scale the penalty
  // to how much disagreed rather than applying a flat cliff.
  const numMiss = numsA.length ? (numsA.length - numHit) / numsA.length : 0;
  const numPenalty = 1 - 0.35 * numMiss;

  return Math.round((0.45 * wordScore + 0.55 * numScore) * numPenalty * 100);
}

// --- Adjudication (§9) --------------------------------------------------
export async function adjudicate(a: ProductView, b: ProductView): Promise<Adjudication> {
  return (await adjudicateLabelled(a, b)).verdict;
}

/** The same call, saying which adapter actually answered it. */
export async function adjudicateLabelled(
  a: ProductView, b: ProductView,
): Promise<{ verdict: Adjudication; adapter: string }> {
  if (hasAnthropic()) {
    try {
      const out = await adjudicateLive(a, b);
      noteLive("claude", true);
      return { verdict: out, adapter: "claude-opus-5" };
    } catch (err) {
      noteLive("claude", false);
      console.warn("[ai] Claude adjudication failed, using deterministic adapter:", err);
      return { verdict: adjudicateStub(a, b), adapter: "stub-adjudicate (claude-opus-5 failed)" };
    }
  }
  return { verdict: adjudicateStub(a, b), adapter: "stub-adjudicate" };
}

const client = () => new Anthropic();

async function adjudicateLive(a: ProductView, b: ProductView): Promise<Adjudication> {
  const response = await client().messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system:
      "You adjudicate whether two medical-supply catalogue entries are the same article " +
      "or clinically interchangeable substitutes, for a hospital procurement platform in " +
      "the DACH market.\n\n" +
      "Definitions you must apply exactly:\n" +
      "- identical: the same manufacturer article. Same product line, same dimensions, " +
      "same sterility and packaging basis. A different distributor or a different internal " +
      "article number does NOT make it a different product.\n" +
      "- equivalent: different articles that a clinician would accept interchangeably for " +
      "the same indication. Dimensions, material and sterility must match; brand may differ.\n" +
      "- not_equivalent: anything else. Differing gauge, length, volume, sterility, " +
      "connector type (Luer vs Luer-Lock) or intended use means not_equivalent.\n\n" +
      "Be conservative. Confidence is your calibrated belief, not your enthusiasm. " +
      "If a dimension is missing or unreadable on either side, say so in " +
      "differing_attributes and lower your confidence accordingly — do not assume a match. " +
      "Raise a blocking question when a clinician would need to decide; a non-blocking " +
      "question for commercial or packaging detail that does not affect clinical use.",
    output_config: {
      format: zodOutputFormat(AdjudicationSchema),
      effort: "medium",
    },
    messages: [
      {
        role: "user",
        content:
          `Product A (what the hospital buys today):\n${JSON.stringify(a, null, 2)}\n\n` +
          `Product B (candidate):\n${JSON.stringify(b, null, 2)}`,
      },
    ],
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("structured output did not parse");
  return parsed;
}

/**
 * Deterministic adjudication: compare the normalised attributes the
 * canonical layer already holds. Mirrors the decision the model is asked
 * to make, so the pipeline behaves the same shape with or without keys.
 */
function adjudicateStub(a: ProductView, b: ProductView): Adjudication {
  const A = a.attributes as Record<string, string | number | undefined>;
  const B = b.attributes as Record<string, string | number | undefined>;

  // Attributes that actually distinguish one article from another in this
  // domain. Two cannulas agreeing on outer diameter and length are the same
  // needle; two agreeing only on "sterile: yes" are not the same anything.
  // `wall` joins these because two cannulas agreeing on gauge, outer diameter
  // and length but differing on wall thickness are not the same needle — the
  // thinner wall is a wider bore and a different flow rate. It only became
  // available once catalogue tables were read column-wise.
  const DISCRIMINATING = ["gauge", "od_mm", "length_mm", "size_mm", "volume_ml", "connector",
    "size", "width_cm", "length_m", "fixation", "wall"];
  const SUPPORTING = ["material", "sterile", "type", "fastening", "powder", "base", "application", "layers"];

  const conflicts: string[] = [];
  const unknowns: string[] = [];
  let discriminatingMatches = 0;

  for (const k of [...DISCRIMINATING, ...SUPPORTING]) {
    const av = A[k], bv = B[k];
    if (av === undefined || bv === undefined) {
      if (av !== bv) unknowns.push(k);
      continue;
    }
    if (String(av).toLowerCase() === String(bv).toLowerCase()) {
      if (DISCRIMINATING.includes(k)) discriminatingMatches++;
    } else {
      conflicts.push(k);
    }
  }
  if (a.uom !== b.uom) conflicts.push("base_uom");

  const sameMaker = a.manufacturer.toLowerCase().replace(/[^a-z]/g, "") ===
                    b.manufacturer.toLowerCase().replace(/[^a-z]/g, "");
  const gtinMatch = Boolean(a.gtin && b.gtin && a.gtin === b.gtin);

  let relation: Adjudication["relation"];
  let confidence: number;

  if (gtinMatch) {
    relation = "identical";
    confidence = 100;
  } else if (conflicts.length > 0) {
    relation = "not_equivalent";
    confidence = Math.max(40, 90 - conflicts.length * 15);
  } else if (discriminatingMatches === 0) {
    // Nothing contradicts, but nothing identifies either.
    relation = "not_equivalent";
    confidence = 50;
  } else if (sameMaker) {
    // Same manufacturer, agreeing dimensions, nothing in conflict: the
    // description and the catalogue row are the same article written twice.
    relation = "identical";
    confidence = Math.min(98, 88 + discriminatingMatches * 4 - unknowns.length);
  } else {
    relation = "equivalent";
    confidence = Math.min(96, 78 + discriminatingMatches * 5 - unknowns.length * 2);
  }

  const needsClarification = relation === "equivalent" || conflicts.length > 0;
  // A clinician, not a buyer, decides whether a dimensional difference matters.
  const clinical = conflicts.some((c) => DISCRIMINATING.includes(c)) || relation === "equivalent";
  const differing = [...conflicts, ...unknowns.map((u) => `${u}: unknown on one side`)];

  return {
    relation,
    confidence,
    rationale:
      relation === "identical"
        ? gtinMatch
          ? "GTIN matches — same article."
          : `Same manufacturer; ${discriminatingMatches} identifying attribute(s) agree and none conflict.`
        : relation === "equivalent"
          ? `Different manufacturer; ${discriminatingMatches} identifying attribute(s) agree and none conflict.`
          : conflicts.length
            ? `Conflicting attributes: ${conflicts.join(", ")}.`
            : "No identifying attribute could be compared on both sides.",
    differing_attributes: differing,
    needs_clarification: needsClarification,
    question_text: needsClarification
      ? conflicts.length
        ? `Can ${b.name} substitute for ${a.name} given the difference in ${conflicts.join(", ")}?`
        : `Confirm ${b.name} is clinically interchangeable with ${a.name}.`
      : "",
    question_type: needsClarification && clinical ? "blocking" : "non_blocking",
  };
}

// --- Substitution review ------------------------------------------------
/**
 * The questions a buyer must resolve before swapping one article for another.
 *
 * Deliberately not the same call as `adjudicate`. Adjudication asks "are these
 * the same thing?" and answers a machine; this asks "what would stop a
 * procurement officer signing this off?" and answers a person. The output is a
 * worklist, so an empty list is a real and useful answer.
 */
export const ComparisonSchema = z.object({
  relation: z.enum(["identical", "equivalent", "not_equivalent"]),
  confidence: z.number().int().min(0).max(100),
  summary: z.string(),
  questions: z.array(z.object({
    text: z.string(),
    type: z.enum(["blocking", "non_blocking"]),
    /** Who can actually answer it: the manufacturer, or SANOVIO's own team. */
    route: z.enum(["supplier", "sanovio_internal"]),
  })),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export async function compareForReview(
  current: ProductView, candidate: ProductView,
): Promise<Comparison & { adapter: string }> {
  if (hasAnthropic()) {
    try {
      const out = await compareLive(current, candidate);
      noteLive("claude", true);
      return { ...out, adapter: "claude-opus-5" };
    } catch (err) {
      noteLive("claude", false);
      console.warn("[ai] Claude comparison failed, using deterministic adapter:", err);
    }
  }
  return { ...compareStub(current, candidate), adapter: "deterministic comparison" };
}

async function compareLive(current: ProductView, candidate: ProductView): Promise<Comparison> {
  const response = await client().messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You review a proposed substitution for a hospital procurement platform in the DACH " +
      "market, under EU MDR 2017/745. A buyer is looking at replacing an article they " +
      "currently purchase with a different one.\n\n" +
      "Produce the open questions that must be resolved before the swap can be approved. " +
      "Rules:\n" +
      "- Ask only what actually matters. An empty list is correct when the two articles " +
      "agree on every clinically and commercially relevant attribute.\n" +
      "- One question per issue, phrased so the recipient can answer it directly. No " +
      "preamble, no restating the product names.\n" +
      "- 'blocking' means the order must not proceed until it is answered — anything a " +
      "clinician must decide, and anything at MDR class IIb or III where an attribute " +
      "differs or is unknown. 'non_blocking' is commercial or packaging detail.\n" +
      "- Route to 'supplier' when the manufacturer holds the answer (specification, " +
      "sterilisation, pack size, lead time, regulatory documents). Route to " +
      "'sanovio_internal' when it is a clinical or contractual judgement for the platform.\n" +
      "- An attribute that is missing on either side is a question, not an assumption.\n\n" +
      "The summary is one sentence a buyer reads first: what the swap is and the single " +
      "biggest reason to hesitate, or that nothing stands out.",
    output_config: { format: zodOutputFormat(ComparisonSchema), effort: "medium" },
    messages: [{
      role: "user",
      content:
        `Currently purchased:\n${JSON.stringify(current, null, 2)}\n\n` +
        `Proposed replacement:\n${JSON.stringify(candidate, null, 2)}`,
    }],
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("structured output did not parse");
  return parsed;
}

/**
 * Deterministic review. Built from the adjudication verdict so the two calls
 * cannot contradict each other, then turned into questions by asking what a
 * buyer would have to check: every differing attribute, every one that is
 * absent on one side only, and the risk class itself.
 */
function compareStub(current: ProductView, candidate: ProductView): Comparison {
  const verdict = adjudicateStub(current, candidate);
  const A = current.attributes as Record<string, unknown>;
  const B = candidate.attributes as Record<string, unknown>;
  const cls = candidate.mdrClass || current.mdrClass;
  const highRisk = cls === "IIb" || cls === "III";
  const questions: Comparison["questions"] = [];

  for (const key of verdict.differing_attributes.slice(0, 4)) {
    const bare = key.replace(/_/g, " ");
    questions.push({
      text: `The two articles differ on ${bare} (${fmt(A[key])} vs ${fmt(B[key])}). ` +
            `Confirm this difference is acceptable for the indications this article is used for.`,
      type: highRisk ? "blocking" : "non_blocking",
      route: "sanovio_internal",
    });
  }

  // An attribute one side simply does not carry is the more dangerous case:
  // nothing conflicts, so nothing looks wrong.
  const unknown = ["gauge", "od_mm", "length_mm", "size_mm", "volume_ml", "connector", "sterile", "material"]
    .filter((k) => (A[k] != null) !== (B[k] != null));
  for (const key of unknown.slice(0, 3)) {
    const missingSide = B[key] == null ? candidate.manufacturer : "your article master";
    questions.push({
      text: `${key.replace(/_/g, " ")} is not stated for ${missingSide}. ` +
            `Supply the value so the two articles can be compared on it.`,
      type: highRisk ? "blocking" : "non_blocking",
      route: "supplier",
    });
  }

  if (current.packSize !== candidate.packSize) {
    questions.push({
      text: `Pack size differs — ${current.packSize} vs ${candidate.packSize} per ${candidate.uom}. ` +
            `Confirm the order quantity and any minimum order quantity for the replacement.`,
      type: "non_blocking",
      route: "supplier",
    });
  }

  // Crossing brands at IIb or III is a regulatory event in its own right, even
  // when every attribute we hold happens to agree. Attributes we did not
  // extract are not attributes that do not exist, and silence here would read
  // as "nothing to check" on exactly the articles that need checking most.
  const crossBrand = verdict.relation !== "identical"
    && current.manufacturer !== candidate.manufacturer;
  if (crossBrand && highRisk) {
    questions.push({
      text: `Confirm ${candidate.name} is indicated for the same clinical use as ` +
            `${current.name}, and supply the CE certificate and declaration of conformity ` +
            `for the replacement.`,
      type: "blocking",
      route: "supplier",
    });
    questions.push({
      text: `Class ${cls} substitution across manufacturers: record clinical sign-off for ` +
            `this swap before it is ordered.`,
      type: "blocking",
      route: "sanovio_internal",
    });
  }

  const summary = verdict.relation === "identical"
    ? "Same article from the original manufacturer — a channel change, not a product change."
    : questions.length === 0
      ? "No differences found on any attribute the platform holds for both articles."
      : `${questions.length} open point${questions.length === 1 ? "" : "s"} before this swap ` +
        `can be approved${highRisk ? `, at MDR class ${cls}` : ""}.`;

  return { relation: verdict.relation, confidence: verdict.confidence, summary, questions };
}

const fmt = (v: unknown) => v == null || v === "" ? "not stated" : String(v);

// --- Replacement analysis -------------------------------------------------
/**
 * What could go wrong if the hospital switches from one article to another.
 *
 * The third call, and the heaviest. Adjudication asks "are these the same
 * thing?"; the review above asks "what would stop a buyer signing this off?"
 * from the attributes the platform holds. This one runs once the buyer has
 * actually chosen a replacement, and is allowed to go and look things up — the
 * manufacturer's published specification, recalls, discontinuation — because
 * the platform's own record of an article is only as good as the catalogue row
 * it came from.
 *
 * Price is the exception to "go and look". The comparison is arithmetic over
 * the hospital's own file and the manufacturer's stated tiers, done by the
 * caller and handed in as facts; a model estimating a price is the one output
 * this platform never accepts.
 */
export const REPLACEMENT_CATEGORIES = ["safety", "replaceability", "price", "correctness"] as const;
export type ReplacementCategory = (typeof REPLACEMENT_CATEGORIES)[number];

export const ReplacementAnalysisSchema = z.object({
  relation: z.enum(["identical", "equivalent", "not_equivalent"]),
  confidence: z.number().int().min(0).max(100),
  summary: z.string(),
  points: z.array(z.object({
    category: z.enum(REPLACEMENT_CATEGORIES),
    severity: z.enum(["blocking", "non_blocking"]),
    title: z.string(),
    explanation: z.string(),
    /** Who can settle it: the hospital itself, or the manufacturer. */
    resolution: z.enum(["hospital_sign_off", "ask_supplier"]),
    supplier_question: z.string(),
    source_urls: z.array(z.string()),
  })),
});
export type ReplacementAnalysisOutput = z.infer<typeof ReplacementAnalysisSchema>;

export interface Source { title: string; url: string }

/** A point as stored: the model's cited URLs resolved to pages the run actually retrieved. */
export interface ReplacementPoint extends Omit<ReplacementAnalysisOutput["points"][number], "source_urls"> {
  sources: Source[];
}

export interface ReplacementAnalysis {
  relation: ReplacementAnalysisOutput["relation"];
  confidence: number;
  summary: string;
  points: ReplacementPoint[];
  adapter: string;
  webSearches: number;
  /** Every page the run retrieved, whether or not a point cites it. */
  sources: Source[];
}

/** The price comparison, computed by the platform. Never by the model. */
export interface PriceFacts {
  currentCurrency: string;
  candidateCurrency: string | null;
  /** Per base unit of the hospital's own file. */
  currentUnitPrice: number | null;
  currentUnit: string;
  /** The tier the hospital's annual volume lands in, per the candidate's base unit. */
  offeredUnitPrice: number | null;
  offeredUnit: string;
  offeredTierFrom: number | null;
  priceOrigin: string | null;
  tiers: { minVolume: number; unitPrice: number }[];
  annualBaseUnits: number;
  /** False when the two prices are not per the same thing or not in the same currency. */
  comparable: boolean;
  /** Positive is a saving. Null when either price is missing or not comparable. */
  deltaPct: number | null;
  annualDelta: number | null;
}

export interface ReplacementContext {
  current: ProductView & {
    spec: string | null; currentSupplier: string | null; sourceFile: string | null;
    extractionConfidence: number;
    /** The harmonised product the line resolved to, if any, and how. */
    matchedProduct: string | null; linkMethod: string | null;
  };
  candidate: ProductView & {
    eclass: string | null; description: string | null; extractionConfidence: number | null;
    sourceFile: string | null;
  };
  price: PriceFacts;
}

export async function analyseReplacement(ctx: ReplacementContext): Promise<ReplacementAnalysis> {
  if (hasAnthropic()) {
    try {
      const out = await analyseLive(ctx);
      noteLive("claude", true);
      return out;
    } catch (err) {
      noteLive("claude", false);
      console.warn("[ai] Claude replacement analysis failed, using deterministic adapter:", err);
    }
  }
  return analyseStub(ctx);
}

const REPLACEMENT_SYSTEM =
  "You review a replacement a hospital buyer has chosen, for a hospital procurement platform " +
  "in the DACH market, under EU MDR 2017/745. The hospital buys article A today and has " +
  "selected article B to replace it. Find every issue that could arise from making this switch, " +
  "and compact them into a short list of points the hospital can either sign off itself or send " +
  "to the manufacturer for clarification.\n\n" +
  "Examine four areas:\n" +
  "- price: use price_facts exactly as given. They were computed by the platform from the " +
  "hospital's own file and the manufacturer's stated tiers; never recompute, estimate or search " +
  "for a price. Raise a point when B costs more, when no price is published, when the two prices " +
  "are not per the same unit or currency, when a saving is implausibly large (often a pack-versus-" +
  "piece error), or when the price relies on a volume tier.\n" +
  "- replaceability: will B do what A does — dimensions, gauge, length, volume, connector (Luer " +
  "versus Luer-Lock), material, compatibility with devices and systems A is used with, pack size " +
  "and order unit, availability, lead time, discontinuation.\n" +
  "- safety: MDR class, sterility and sterilisation method, latex, DEHP and PVC content, " +
  "needle-stick protection where the article is sharp, single use, CE marking, recalls and field " +
  "safety notices for B. At MDR IIb or III a cross-manufacturer switch always needs clinical " +
  "sign-off, even when every attribute agrees.\n" +
  "- correctness: can the data be trusted — does B as the platform holds it match what its " +
  "manufacturer publishes (article number, GTIN, dimensions), was A read correctly from the " +
  "hospital's file, are identifiers consistent with descriptions.\n\n" +
  "Use web search to settle what the platform data cannot: B's published specification and " +
  "instructions for use (and A's, where A is identifiable), recalls and field safety notices " +
  "(BfArM, Swissmedic, the manufacturer), discontinuation, and whether B's identifiers match its " +
  "description. Search only for what would change a point, and prefer manufacturer and regulator " +
  "sources. Never state something a source did not say. A question searching did not settle " +
  "remains a point.\n\n" +
  "Rules for points:\n" +
  "- One point per distinct issue; merge overlapping ones. An empty list is correct only when " +
  "nothing stands out at all, which is rare for a change of article.\n" +
  "- title: at most ten words, naming the issue.\n" +
  "- explanation: one to three sentences for the buyer — what the issue is, why it matters for " +
  "this switch, and what it rests on (platform data, or a named source).\n" +
  "- severity 'blocking' when the switch must not go ahead until it is resolved: anything a " +
  "clinician must decide, any safety doubt, any attribute that differs or is unknown at MDR IIb " +
  "or III, a missing price. 'non_blocking' for commercial or packaging detail.\n" +
  "- resolution 'ask_supplier' when the manufacturer holds the answer; 'hospital_sign_off' when " +
  "it is the hospital's own judgement (clinical acceptability, accepting a price difference).\n" +
  "- supplier_question: the point as a question to B's manufacturer — self-contained, naming the " +
  "product, direct. Always fill it; the buyer may send any point.\n" +
  "- source_urls: URLs you actually retrieved that support the point; empty when it rests on " +
  "platform data alone.\n" +
  "- Silence is not agreement: an attribute unstated on either side is a point, not a match.\n" +
  "- Write for a hospital buyer. Refer to the articles by name, never as 'A' or 'B', and never " +
  "mention the field names of the data you were given (price_facts, offeredUnitPrice and the " +
  "like) — say what they mean instead.\n\n" +
  "relation: 'identical' when B is the same manufacturer article as A and only the channel " +
  "changes; 'equivalent' when B is a different article a clinician would accept for the same " +
  "use; 'not_equivalent' otherwise. confidence is your calibrated belief in that relation.\n" +
  "summary: one sentence the buyer reads first — what the switch is, and the single biggest " +
  "reason to hesitate, or that nothing stands out.";

/** Server-tool turns resume on pause_turn; this caps how often. */
const MAX_CONTINUATIONS = 4;

async function analyseLive(ctx: ReplacementContext): Promise<ReplacementAnalysis> {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content:
      `Article A — what the hospital buys today:\n${JSON.stringify(ctx.current, null, 2)}\n\n` +
      `Article B — the replacement the hospital has chosen:\n${JSON.stringify(ctx.candidate, null, 2)}\n\n` +
      `price_facts (computed by the platform — authoritative):\n${JSON.stringify(ctx.price, null, 2)}`,
  }];

  const retrieved = new Map<string, Source>();
  let webSearches = 0;
  let final: Anthropic.Message | null = null;

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const msg = await client().messages.stream({
      model: "claude-opus-5",
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: REPLACEMENT_SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 6 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
      ],
      output_config: { format: zodOutputFormat(ReplacementAnalysisSchema), effort: "medium" },
      messages,
    }).finalMessage();

    webSearches += msg.usage.server_tool_use?.web_search_requests ?? 0;
    collectSources(msg.content, retrieved);

    if (msg.stop_reason === "refusal") throw new Error("the model declined this analysis");
    if (msg.stop_reason === "max_tokens") throw new Error("the analysis ran out of output tokens");
    // A long server-tool run pauses rather than finishing. Handing the turn
    // back is what resumes it; a "continue" message would start a new one.
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    final = msg;
    break;
  }
  if (!final) throw new Error("the analysis did not finish within its continuation budget");

  const text = [...final.content].reverse().find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("the analysis returned no result");
  const parsed = ReplacementAnalysisSchema.parse(JSON.parse(text.text));

  return {
    relation: parsed.relation,
    confidence: parsed.confidence,
    summary: parsed.summary,
    points: parsed.points.map(({ source_urls, ...p }) => ({
      ...p,
      // A URL the model cites that the run never retrieved is not a source,
      // it is a guess at one — the same rule the extractor applies to part
      // numbers that do not occur in the page text.
      sources: source_urls
        .map((u) => retrieved.get(urlKey(u)))
        .filter((s): s is Source => Boolean(s)),
    })),
    adapter: `claude-opus-5 + web search`,
    webSearches,
    sources: [...retrieved.values()],
  };
}

const urlKey = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

/** Every page a web search returned or a fetch read, keyed by URL. */
function collectSources(content: Anthropic.ContentBlock[], into: Map<string, Source>) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result") into.set(urlKey(r.url), { title: r.title || r.url, url: r.url });
      }
    } else if (block.type === "web_fetch_tool_result") {
      const c = block.content as { type?: string; url?: string; content?: { title?: string | null } };
      if (c?.type === "web_fetch_result" && c.url) {
        into.set(urlKey(c.url), { title: c.content?.title || c.url, url: c.url });
      }
    }
  }
}

/**
 * Deterministic analysis, for when there is no key. It cannot search, so it
 * says so, and it can only reason about what the platform holds — which is
 * exactly why "unknown" becomes a point rather than a pass.
 */
function analyseStub(ctx: ReplacementContext): ReplacementAnalysis {
  const { current: a, candidate: b, price } = ctx;
  const verdict = adjudicateStub(a, b);
  const points: ReplacementPoint[] = [];
  const cls = b.mdrClass || a.mdrClass;
  const highRisk = cls === "IIb" || cls === "III";
  const crossBrand = norm(a.manufacturer) !== norm(b.manufacturer);
  const add = (p: Omit<ReplacementPoint, "sources">) => points.push({ ...p, sources: [] });
  const ask = (q: string) => `Regarding ${b.name}: ${q}`;

  // price -----------------------------------------------------------------
  if (price.offeredUnitPrice == null) {
    add({
      category: "price", severity: "blocking", resolution: "ask_supplier",
      title: "No price published for the replacement",
      explanation: `${b.manufacturer} has not set a price for ${b.name}, so the switch cannot be costed ` +
        "or ordered. The platform does not estimate prices.",
      supplier_question: ask(`please quote a unit price for an annual volume of about ` +
        `${price.annualBaseUnits.toLocaleString("de-CH")} ${price.offeredUnit}.`),
    });
  } else if (!price.comparable) {
    add({
      category: "price", severity: "blocking", resolution: "ask_supplier",
      title: "Prices are not on the same basis",
      explanation: `Today's price is per ${price.currentUnit} in ${price.currentCurrency}; the replacement ` +
        `is quoted per ${price.offeredUnit} in ${price.candidateCurrency ?? "an unstated currency"}. ` +
        "The saving cannot be stated until both are on one basis.",
      supplier_question: ask(`how many ${price.currentUnit} does one ${price.offeredUnit} contain, and ` +
        `what is the price per ${price.currentUnit} in ${price.currentCurrency}?`),
    });
  } else if (price.currentUnitPrice == null) {
    add({
      category: "price", severity: "non_blocking", resolution: "hospital_sign_off",
      title: "Today's price is unknown",
      explanation: "Your article master states no current price for this line, so the saving from " +
        "switching cannot be computed.",
      supplier_question: ask("please confirm the quoted unit price and any minimum order quantity."),
    });
  } else if (price.deltaPct != null && price.deltaPct < 0) {
    add({
      category: "price", severity: "non_blocking", resolution: "hospital_sign_off",
      title: `Replacement costs ${Math.abs(price.deltaPct).toFixed(1)}% more`,
      explanation: `${price.candidateCurrency} ${price.offeredUnitPrice.toFixed(4)} per ${price.offeredUnit} ` +
        `against ${price.currentCurrency} ${price.currentUnitPrice.toFixed(4)} today — about ` +
        `${price.currentCurrency} ${Math.abs(price.annualDelta ?? 0).toLocaleString("de-CH", { maximumFractionDigits: 0 })} ` +
        "more per year at your volume.",
      supplier_question: ask("is there a volume price that brings the unit price below what we pay today?"),
    });
  } else if (price.deltaPct != null && price.deltaPct > 60) {
    add({
      category: "correctness", severity: "non_blocking", resolution: "ask_supplier",
      title: "Saving is unusually large",
      explanation: `A ${price.deltaPct.toFixed(0)}% saving usually means the two prices are for ` +
        "different pack bases. Confirm what one quoted unit contains before relying on it.",
      supplier_question: ask(`does the quoted price of ${price.candidateCurrency} ` +
        `${price.offeredUnitPrice.toFixed(4)} apply to a single ${price.offeredUnit}?`),
    });
  }
  if (price.tiers.length > 1 && price.offeredTierFrom != null && price.offeredTierFrom > 0) {
    add({
      category: "price", severity: "non_blocking", resolution: "ask_supplier",
      title: "Price depends on a volume tier",
      explanation: `The quoted price applies from ${price.offeredTierFrom.toLocaleString("de-CH")} units. ` +
        "Confirm it holds for your own order quantities.",
      supplier_question: ask("please confirm the unit price that applies to our annual volume on its own."),
    });
  }

  // replaceability ------------------------------------------------------------
  const A = a.attributes as Record<string, unknown>;
  const B = b.attributes as Record<string, unknown>;
  const conflicts = verdict.differing_attributes.filter((d) => !d.includes("unknown"));
  if (verdict.relation === "not_equivalent" && conflicts.some((c) => STRUCTURAL.has(c))) {
    add({
      category: "replaceability", severity: "blocking", resolution: "hospital_sign_off",
      title: "Not the same article on the attributes held",
      explanation: `The two articles disagree on ${conflicts.map(attrLabel).join(", ")}, which change what ` +
        "the article physically is. Treat this as a different product, not a like-for-like swap.",
      supplier_question: ask(`is this article intended to replace ${a.name}, and for which uses?`),
    });
  }
  for (const key of conflicts.slice(0, 4)) {
    const bare = attrLabel(key);
    add({
      category: "replaceability", severity: highRisk || STRUCTURAL.has(key) ? "blocking" : "non_blocking",
      resolution: "hospital_sign_off",
      title: `Differs on ${bare}`,
      explanation: `${fmt(A[key])} today against ${fmt(B[key])} for the replacement. Confirm the ` +
        "difference is acceptable for every use of this article.",
      supplier_question: ask(`please confirm the ${bare} and whether it can be used where ` +
        `${fmt(A[key])} is specified.`),
    });
  }
  const unknown = ["gauge", "od_mm", "length_mm", "size_mm", "volume_ml", "connector", "material"]
    .filter((k) => (A[k] != null) !== (B[k] != null));
  for (const key of unknown.slice(0, 3)) {
    const missing = B[key] == null ? b.manufacturer : "your article master";
    add({
      category: "replaceability", severity: highRisk ? "blocking" : "non_blocking",
      resolution: "ask_supplier",
      title: `${cap(attrLabel(key))} not stated`,
      explanation: `${cap(attrLabel(key))} is not stated for ${missing}, so the two articles ` +
        "cannot be compared on it. Unknown is not the same as matching.",
      supplier_question: ask(`please state the ${attrLabel(key)}.`),
    });
  }
  if (a.packSize !== b.packSize || a.uom !== b.uom) {
    add({
      category: "replaceability", severity: "non_blocking", resolution: "ask_supplier",
      title: "Pack size or order unit changes",
      explanation: `${a.packSize} per ${a.uom} today, ${b.packSize} per ${b.uom} for the replacement. ` +
        "Order quantities and storage need adjusting.",
      supplier_question: ask("please confirm the pack size, the order unit and any minimum order quantity."),
    });
  }

  // safety ----------------------------------------------------------------
  if (a.mdrClass !== b.mdrClass) {
    add({
      category: "safety", severity: "blocking", resolution: "hospital_sign_off",
      title: `MDR class changes from ${a.mdrClass} to ${b.mdrClass}`,
      explanation: "A different risk class means a different conformity route and possibly a " +
        "different intended use. A clinician should confirm the replacement is appropriate.",
      supplier_question: ask(`please confirm the MDR risk class and intended purpose, and supply the ` +
        "declaration of conformity."),
    });
  }
  if (crossBrand && highRisk && verdict.relation !== "identical") {
    add({
      category: "safety", severity: "blocking", resolution: "hospital_sign_off",
      title: `Class ${cls} change of manufacturer needs clinical sign-off`,
      explanation: `Switching manufacturer on a class ${cls} device is a clinical decision regardless of ` +
        "how well the attributes agree. Record clinical sign-off before ordering.",
      supplier_question: ask("please supply the CE certificate, declaration of conformity and instructions for use."),
    });
  }
  for (const key of ["sterile", "latex_free"]) {
    if (B[key] == null) {
      add({
        category: "safety", severity: highRisk ? "blocking" : "non_blocking", resolution: "ask_supplier",
        title: key === "sterile" ? "Sterility not stated" : "Latex content not stated",
        explanation: `The platform holds no ${key === "sterile" ? "sterility or sterilisation method" : "latex statement"} ` +
          `for ${b.name}. Confirm it before the article reaches a ward.`,
        supplier_question: ask(key === "sterile"
          ? "is the article supplied sterile, and by which sterilisation method?"
          : "is the article free of natural rubber latex, DEHP and PVC?"),
      });
    }
  }

  // correctness -----------------------------------------------------------
  if (a.gtin && b.gtin && a.gtin !== b.gtin && verdict.relation === "identical") {
    add({
      category: "correctness", severity: "blocking", resolution: "ask_supplier",
      title: "GTINs disagree for what looks like the same article",
      explanation: `Your file states GTIN ${a.gtin}; the catalogue states ${b.gtin}. One of them is ` +
        "wrong, or these are different articles.",
      supplier_question: ask(`which GTIN applies to this article: ${a.gtin} or ${b.gtin}?`),
    });
  }
  if (ctx.current.extractionConfidence < 100 && !ctx.current.matchedProduct) {
    add({
      category: "correctness", severity: "non_blocking", resolution: "hospital_sign_off",
      title: "Your line is known only from its description",
      explanation: "The line is not matched to any manufacturer's catalogue, so everything the " +
        "platform knows about it comes from your spreadsheet's text. Check the comparison against " +
        "the article you actually use.",
      supplier_question: ask("please confirm this article can replace the one described in our line."),
    });
  }
  if (ctx.candidate.extractionConfidence != null && ctx.candidate.extractionConfidence < 100) {
    add({
      category: "correctness", severity: "non_blocking", resolution: "ask_supplier",
      title: "Catalogue data was machine-read",
      explanation: `${b.name} was read from ${ctx.candidate.sourceFile ?? "an uploaded catalogue"} at ` +
        `${ctx.candidate.extractionConfidence}% confidence and not confirmed by the manufacturer.`,
      supplier_question: ask("please confirm the article number, dimensions and pack size as listed."),
    });
  }

  const blocking = points.filter((p) => p.severity === "blocking").length;
  const summary = verdict.relation === "identical" && points.length === 0
    ? "Same article from the original manufacturer — a channel change, and nothing stands out."
    : points.length === 0
      ? "Nothing stands out on any attribute the platform holds for both articles."
      : `${points.length} point${points.length === 1 ? "" : "s"} to settle before switching` +
        `${blocking ? `, ${blocking} of them blocking` : ""}` +
        `${highRisk ? ` — MDR class ${cls}` : ""}. No web search was run.`;

  return {
    relation: verdict.relation, confidence: verdict.confidence, summary, points,
    adapter: "deterministic analysis (no web search)", webSearches: 0, sources: [],
  };
}

/** A difference in one of these changes what the article physically is. */
const STRUCTURAL = new Set(["gauge", "od_mm", "length_mm", "size_mm", "volume_ml", "connector", "wall"]);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** `od_mm` reads as "outer diameter (mm)", not "od mm". */
const LABEL: Record<string, string> = {
  od_mm: "outer diameter (mm)", length_mm: "length (mm)", size_mm: "size (mm)",
  volume_ml: "volume (ml)", width_cm: "width (cm)", length_m: "length (m)", base_uom: "unit",
};
const attrLabel = (k: string) => LABEL[k] ?? k.replace(/_/g, " ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Stage 3 gate: Jev -----------------------------------------------------
/**
 * A cheap yes/no before an expensive comparison: "is this the same kind of
 * product?", answered as a probability.
 *
 * Jev (TypeSafe, via OpenRouter's Decisions API) returns a typed decision with
 * a probability instead of generated text, at roughly $0.00002 a pair. It is
 * asked about *kind*, never about numbers: a 2 ml and a 10 ml syringe are the
 * same kind of product, and telling them apart is arithmetic, which Stage 1
 * already did and Claude does again. The probability is the score the caller
 * thresholds, not the label.
 */
export const hasOpenRouter = () => Boolean(process.env.OPENROUTER_API_KEY);
export const JEV_MODEL = process.env.JEV_MODEL ?? "typesafe/jev-1.13";

export interface GateInput {
  item: { name: string; brand: string | null; spec: string | null; unit: string; mdrClass: string | null };
  product: { name: string; manufacturer: string; unit: string; mdrClass: string; description: string | null };
}
export interface GateResult { probability: number; adapter: string; cost: number }

const GATE_QUESTION = {
  type: "noul",
  instructions:
    "A hospital buys the catalogue item. Is the supplier product the same kind of medical " +
    "product, such that it could plausibly replace the item for the same use? Judge the product " +
    "type and function only. Ignore brand, and ignore exact sizes, dimensions, volumes and pack " +
    "quantities — those are checked separately.",
  criteria: {
    true: "Same product type and function (for example both are hypodermic needles, or both are " +
      "sterile disposable syringes), whatever the brand or size.",
    false: "A different type of product (for example a syringe and a needle, a glove and a mask, " +
      "an implant and a tube set), or an accessory rather than the item itself.",
  },
} as const;

export async function gatePair(input: GateInput): Promise<GateResult> {
  if (hasOpenRouter()) {
    try {
      return await gateLive(input);
    } catch (err) {
      console.warn("[ai] Jev gate failed, using deterministic gate:", err);
      return { ...gateStub(input), adapter: `stub-gate (${JEV_MODEL} failed)` };
    }
  }
  return gateStub(input);
}

async function gateLive(input: GateInput): Promise<GateResult> {
  const body = JSON.stringify({
    model: JEV_MODEL,
    state: { catalogue_item: input.item, supplier_product: input.product },
    questions: { same_kind: GATE_QUESTION },
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    // Rate limits and server errors are worth one more try; anything else is
    // a request the gate will never accept.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`jev ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      model?: string;
      answers?: { same_kind?: { type: string; noul?: number } };
      usage?: { cost?: number };
    };
    const p = json.answers?.same_kind?.noul;
    if (typeof p !== "number" || !Number.isFinite(p)) throw new Error("jev returned no probability");
    return { probability: p, adapter: json.model ?? JEV_MODEL, cost: json.usage?.cost ?? 0 };
  }
}

/**
 * Without a key: word overlap on the parts of the names that describe what
 * the article *is* — numbers and brands stripped, since those are exactly
 * what the gate is told to ignore. Crude, and labelled as such.
 */
function gateStub(input: GateInput): GateResult {
  const words = (s: string) => new Set(normalise(s).split(" ")
    .filter((t) => t.length > 2 && !/\d/.test(t) && !GATE_NOISE.has(t)));
  const a = words(`${input.item.name} ${input.item.spec ?? ""}`);
  const b = words(`${input.product.name} ${input.product.description ?? ""}`);
  const brand = words(`${input.item.brand ?? ""} ${input.product.manufacturer}`);
  const shared = [...a].filter((t) => b.has(t) && !brand.has(t)).length;
  const base = Math.min(a.size, b.size) || 1;
  // Compound German nouns: "Einmalspritze" should meet "Spritze".
  const partial = [...a].some((x) => [...b].some((y) =>
    x !== y && Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))));
  const p = Math.min(0.97, 0.15 + 0.7 * (shared / base) + (partial ? 0.55 : 0));
  return { probability: Math.round(p * 100) / 100, adapter: "stub-gate", cost: 0 };
}
const GATE_NOISE = new Set(["mit", "und", "für", "fur", "the", "and", "with", "steril", "sterile",
  "technologie", "system"]);
