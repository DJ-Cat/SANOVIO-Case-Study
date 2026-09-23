import { Page, Table, Stat, DataSheet, Empty, SubmitButton } from "@/app/components/ui";
import {
  matchRuns, linkMethodBreakdown, hospitalLinkBreakdown, thresholds,
  suggestionRuns, pairLog, pairLogCounts, type SuggestionRun,
} from "@/lib/queries";
import { rerunPipeline, runSuggestionsAction } from "@/lib/actions";
import { SUGGEST } from "@/lib/matching/suggest";
import { SuggestionsPoller } from "@/app/components/ReplacementReview";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  gtin_exact: "GTIN exact", udi_exact: "UDI-DI exact", sku_exact: "Article no. exact",
  reranked: "Reranker", llm_adjudicated: "Claude adjudication", human: "Human",
};

const STAGE_LABEL: Record<number, string> = {
  1: "1 · rules", 2: "2 · retrieval", 3: "3 · Jev", 4: "4 · Claude",
};

export default async function Pipeline(
  { searchParams }: { searchParams: Promise<{ stage?: string }> },
) {
  const { stage } = await searchParams;
  const stageFilter = stage && /^[1-4]$/.test(stage) ? Number(stage) : null;
  const suggestRuns = suggestionRuns();
  const lastSuggest = suggestRuns[0];
  const log = pairLog(stageFilter);
  const logCounts = pairLogCounts();
  const runs = matchRuns();
  const methods = linkMethodBreakdown();
  const { EXTRACTION_THRESHOLD, LINK_THRESHOLD, SUBSTITUTION_THRESHOLD } = thresholds();
  const last = runs[0];

  // Hospital-side only: a manufacturer confirming its own catalogue is not the
  // matching engine doing work.
  const hospital = hospitalLinkBreakdown().filter((m) => m.status === "confirmed");
  const totalConfirmed = hospital.reduce((s, m) => s + m.n, 0);
  const free = hospital.filter((m) => /_exact$/.test(m.link_method)).reduce((s, m) => s + m.n, 0);

  return (
    <Page title="Matching pipeline"
      lead="Cheapest layer first: exact identifier, then embedding retrieval, then a reranker, and only then Claude. The point of the layering is the last column — how few items ever reach the expensive layer."
      action={
        <form action={rerunPipeline}>
          <SubmitButton>Re-run pipeline</SubmitButton>
        </form>
      }>

      <DataSheet>
        <Stat label="Hospital lines matched" value={String(totalConfirmed)} sub="supplier self-declaration excluded" />
        <Stat label="Resolved by identifier" value={totalConfirmed ? `${Math.round((free / totalConfirmed) * 100)}%` : "—"}
          sub="zero marginal cost" />
        <Stat label="LLM calls, last run" value={last ? String(last.llm_calls) : "—"}
          sub={last ? `of ${last.items_seen} items seen` : ""} />
        <Stat label="Adapter" value={last ? (last.adapter.includes("claude") ? "live" : "stub") : "—"}
          sub={last?.adapter ?? ""} />
      </DataSheet>

      <section className="space-y-3">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">Thresholds in force (§2)</h2>
        <Table head={["Gate", "Question it answers", "Bar"]}>
          <tr><td className="px-3 py-2 code text-xs">extraction_confidence</td>
            <td className="px-3 py-2">Did we read this row correctly?</td>
            <td className="px-3 py-2 tnum">{EXTRACTION_THRESHOLD}</td></tr>
          <tr><td className="px-3 py-2 code text-xs">link_confidence</td>
            <td className="px-3 py-2">Is this row the same article as this canonical product?</td>
            <td className="px-3 py-2 tnum">{LINK_THRESHOLD}</td></tr>
          {(["I", "IIa", "IIb", "III"] as const).map((c) => (
            <tr key={c}>
              <td className="px-3 py-2 code text-xs">substitution · MDR {c}</td>
              <td className="px-3 py-2">Are these different articles clinically interchangeable?</td>
              <td className="px-3 py-2 tnum">
                {SUBSTITUTION_THRESHOLD[c] === null
                  ? <span className="font-semibold text-rose-600 dark:text-rose-400">never auto-confirms</span>
                  : SUBSTITUTION_THRESHOLD[c]}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">Which layer resolved what</h2>
        <Table head={["Layer", "Confirmed", "Proposed (held for review)", "Rejected"]}>
          {Object.keys(METHOD_LABEL).map((m) => {
            const row = (st: string) => methods.find((x) => x.link_method === m && x.status === st)?.n ?? 0;
            const total = row("confirmed") + row("proposed") + row("rejected");
            if (total === 0) return null;
            return (
              <tr key={m}>
                <td className="px-3 py-2">{METHOD_LABEL[m]}</td>
                <td className="px-3 py-2 tnum font-medium">{row("confirmed")}</td>
                <td className="px-3 py-2 tnum">{row("proposed")}</td>
                <td className="px-3 py-2 tnum text-ink-300">{row("rejected")}</td>
              </tr>
            );
          })}
        </Table>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">
              Suggestion pipeline
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-ink-400">
              Every hospital line against every supplier product, cheapest stage first. Runs by
              itself after every upload. Stage 3 keeps pairs Jev scores at or above{" "}
              <span className="font-semibold tnum">{SUGGEST.jevThreshold}</span>; stage 2 keeps
              each line&apos;s top <span className="font-semibold tnum">{SUGGEST.topK}</span>; stage 4
              suggests at <span className="font-semibold tnum">{SUGGEST.minConfidence}</span>+
              confidence. Only the best match per line gets the full analysis.
            </p>
          </div>
          <form action={runSuggestionsAction}>
            <SubmitButton disabled={lastSuggest?.status === "running"}>
              {lastSuggest?.status === "running" ? "Running…" : "Run suggestions now"}
            </SubmitButton>
          </form>
        </div>
        <SuggestionsPoller pending={lastSuggest?.status === "running"} />
        {lastSuggest ? <Funnel run={lastSuggest} /> : <Empty>No suggestion run yet.</Empty>}

        {suggestRuns.length > 0 && (
          <Table head={["Started", "Trigger", "Pairs", "S1", "S2", "S3", "Matched", "Analysed", "Jev", "Claude", "Analyses", "Reused", "Status"]}>
            {suggestRuns.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs text-ink-400">{new Date(r.startedAt).toLocaleString("de-CH")}</td>
                <td className="px-3 py-2 text-xs">{r.trigger}</td>
                <td className="px-3 py-2 tnum">{r.pairsTotal}</td>
                <td className="px-3 py-2 tnum">{r.afterStage1}</td>
                <td className="px-3 py-2 tnum">{r.afterStage2}</td>
                <td className="px-3 py-2 tnum">{r.afterStage3}</td>
                <td className="px-3 py-2 tnum font-medium">{r.matched}</td>
                <td className="px-3 py-2 tnum">{r.analysed}</td>
                <td className="px-3 py-2 tnum" title={`$${r.jevCost.toFixed(5)}`}>{r.jevCalls}</td>
                <td className="px-3 py-2 tnum">{r.claudeCalls}</td>
                <td className="px-3 py-2 tnum">{r.analysisCalls}</td>
                <td className="px-3 py-2 tnum text-ink-400">{r.reused}</td>
                <td className={`px-3 py-2 text-xs ${r.status === "failed" ? "text-rose-600 dark:text-rose-400" : ""}`}
                  title={r.error ?? r.adapters ?? ""}>{r.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">
              Dropped and rejected pairs
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-ink-400">
              For auditing false negatives while the thresholds are tuned — closest calls first.
              Stage 1 and 2 drops stop being recorded with <code>SUGGEST_LOG_DROPS=0</code>.
            </p>
          </div>
          {/* A segmented pill control, like the product views. */}
          <nav className="inline-flex flex-wrap gap-1 rounded-xl bg-ink-50 p-1 text-xs dark:bg-ink-900" aria-label="Filter by stage">
            {[{ href: "/admin/pipeline", label: "All", on: !stageFilter },
              ...logCounts.map((c) => ({ href: `/admin/pipeline?stage=${c.stage}`, label: `${STAGE_LABEL[c.stage] ?? c.stage} · ${c.n}`, on: stageFilter === c.stage }))]
              .map((f) => (
                <a key={f.href} href={f.href} aria-current={f.on ? "true" : undefined}
                  className={`rounded-lg px-3 py-1.5 tnum transition ${
                    f.on ? "bg-white font-bold text-ink-950 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_2px_8px_-2px_rgb(40_42_120/0.18)] dark:bg-ink-800 dark:text-white"
                      : "font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"}`}>
                  {f.label}
                </a>
              ))}
          </nav>
        </div>
        {log.length === 0 ? <Empty>Nothing dropped yet.</Empty> : (
          <Table head={["Stage", "Hospital line", "Supplier product", "Similarity", "Jev", "Reason"]}>
            {log.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{STAGE_LABEL[r.stage ?? 0] ?? "—"}</td>
                <td className="max-w-[14rem] truncate px-3 py-2" title={r.itemName}>{r.itemName}</td>
                <td className="max-w-[18rem] truncate px-3 py-2" title={r.productName}>{r.productName}</td>
                <td className="px-3 py-2 tnum text-ink-400">{r.similarity?.toFixed(3) ?? "—"}</td>
                <td className="px-3 py-2 tnum">{r.jevScore?.toFixed(2) ?? "—"}</td>
                <td className="max-w-[24rem] truncate px-3 py-2 text-xs text-ink-500 dark:text-ink-300" title={r.reason ?? ""}>
                  {r.reason}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">Run history</h2>
        {runs.length === 0 ? <Empty>No runs recorded.</Empty> : (
          <Table head={["Started", "Items", "Identifier", "Reranker", "Claude", "To review", "LLM calls", "Adapter"]}>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs text-ink-400">{new Date(r.started_at).toLocaleString("de-CH")}</td>
                <td className="px-3 py-2 tnum">{r.items_seen}</td>
                <td className="px-3 py-2 tnum">{r.by_identifier}</td>
                <td className="px-3 py-2 tnum">{r.by_reranker}</td>
                <td className="px-3 py-2 tnum">{r.by_llm}</td>
                <td className="px-3 py-2 tnum text-amber-700 dark:text-amber-400">{r.to_review}</td>
                <td className="px-3 py-2 tnum">{r.llm_calls}</td>
                <td className="px-3 py-2 code text-[11px] text-ink-400">{r.adapter}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </Page>
  );
}

/** What each stage let through, as a share of every possible pair. */
function Funnel({ run }: { run: SuggestionRun }) {
  const steps: [string, number, string][] = [
    ["All pairs", run.pairsTotal, `${run.lines} lines × ${run.products} products`],
    ["Rules", run.afterStage1, "category, codes, unit, dimensions"],
    ["Retrieval", run.afterStage2, `top ${SUGGEST.topK} per line`],
    ["Jev", run.afterStage3, `${run.jevCalls} calls · $${run.jevCost.toFixed(4)}`],
    ["Matched", run.matched, `${run.claudeCalls} Claude calls`],
    ["Analysed", run.analysed, `${run.analysisCalls} full analyses`],
  ];
  const max = Math.max(1, run.pairsTotal);
  return (
    <div className="card space-y-2 p-4">
      {steps.map(([label, n, sub]) => (
        <div key={label} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-3 text-sm">
          <span className="text-ink-500 dark:text-ink-300">{label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-ink-50 dark:bg-ink-800" title={sub}>
            <div className="h-full rounded-full bg-gradient-to-r from-brand-800 to-brand-400" style={{ width: `${Math.max(n ? 0.6 : 0, (n / max) * 100)}%` }} />
          </div>
          <span className="text-right tnum font-medium">{n}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-ink-400">
        {run.reused} paid result{run.reused === 1 ? "" : "s"} reused from earlier runs or the file cache
        {run.adapters ? ` · ${run.adapters}` : ""}
      </p>
    </div>
  );
}
