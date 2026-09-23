/**
 * Run the suggestion pipeline from the command line and print its funnel.
 *
 *   npm run suggest            # against db/sanovio.db, keys from .env
 *   SANOVIO_DB=db/x.db npm run suggest
 *
 * The app runs the same pipeline by itself after every upload; this is for
 * tuning, and for filling a database loaded some other way (demo:load).
 */
import { existsSync } from "node:fs";
import { rows } from "../lib/db.ts";
import { SUGGEST } from "../lib/matching/suggest.ts";

// Keys live in .env for the app; a script has to ask for them. Loaded before
// the pipeline module reads them.
if (existsSync(".env") && process.env.SUGGEST_NO_ENV !== "1") process.loadEnvFile(".env");

async function main() {
  const { runSuggestions } = await import("../lib/matching/suggest.ts");
  const started = Date.now();
  const s = await runSuggestions("cli");
  if (s.skipped) { console.log(`skipped: ${s.skipped}`); return; }

  const pct = (n: number) => s.pairsTotal ? `${((n / s.pairsTotal) * 100).toFixed(1)}%` : "—";
  console.log(`\nsuggestion run ${s.runId} — ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  ${s.lines} lines × ${s.products} products = ${s.pairsTotal} pairs`);
  console.log(`  after stage 1  rule-based blocking   ${String(s.afterStage1).padStart(6)}  ${pct(s.afterStage1)}`);
  console.log(`  after stage 2  top-${SUGGEST.topK} retrieval      ${String(s.afterStage2).padStart(6)}  ${pct(s.afterStage2)}`);
  console.log(`  after stage 3  Jev ≥ ${SUGGEST.jevThreshold}           ${String(s.afterStage3).padStart(6)}  ${pct(s.afterStage3)}`);
  console.log(`  matched        Claude                ${String(s.matched).padStart(6)}`);
  console.log(`  analysed       full analysis, top    ${String(s.analysed).padStart(6)}`);
  console.log(`  calls: jev ${s.jevCalls} ($${s.jevCost.toFixed(5)}) · claude ${s.claudeCalls} · analyses ${s.analysisCalls} · reused ${s.reused}`);

  const tops = rows<{ item: string; product: string; relation: string; confidence: number; jev: number | null; analysis: string | null }>(
    `SELECT h.extracted_name AS item, cp.canonical_name AS product, m.relation, m.confidence,
            m.jev_score AS jev, m.analysis_status AS analysis
     FROM match_pairs m JOIN hospital_purchase_items h ON h.id = m.hospital_item_id
     JOIN canonical_products cp ON cp.id = m.canonical_product_id
     WHERE m.is_top = 1 ORDER BY h.extracted_name`);
  console.log(`\n  best match per line:`);
  for (const t of tops) {
    console.log(`    ${t.item}\n      → ${t.product}  [${t.relation} ${t.confidence}` +
      `${t.jev != null ? ` · jev ${t.jev}` : ""}${t.analysis ? ` · analysis ${t.analysis}` : ""}]`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
