import Link from "next/link";
import { Page, Stat, Empty } from "@/app/components/ui";
import { portalSummary, matchRuns, documents } from "@/lib/queries";
import { adapterName } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default function AdminOverview() {
  const s = portalSummary();
  const last = matchRuns(1)[0];
  const docs = documents();

  return (
    <Page title="Operations"
      lead="Platform-internal view. Everything here arrived through an upload — there is no preloaded catalogue.">

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Canonical products" value={String(s.canonicalProducts)} sub="the harmonisation layer" />
        <Stat label="Confirmed links" value={String(s.links)} />
        <Stat label="Demand pools" value={String(s.pools)} />
        <Stat label="AI adapter" value={adapterName().includes("claude") ? "live" : "stub"} sub={adapterName()} />
      </div>

      {docs.length === 0 ? (
        <Empty>
          Nothing uploaded yet. Start in the{" "}
          <Link href="/supplier/upload" className="underline">supplier portal</Link> with a catalogue,
          then upload hospital demand.
        </Empty>
      ) : (
        <div className="card p-5 text-sm">
          <h2 className="font-semibold text-ink-900 dark:text-ink-50">Last matching run</h2>
          {last ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Items seen", last.items_seen], ["Identifier", last.by_identifier],
                ["Reranker", last.by_reranker], ["Claude", last.by_llm], ["To review", last.to_review],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-xs text-ink-400">{k}</dt>
                  <dd className="text-xl font-semibold tnum">{v}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="mt-2 text-ink-400">No run recorded yet.</p>}
          <Link href="/admin/pipeline" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
            Open the pipeline view →
          </Link>
        </div>
      )}
    </Page>
  );
}
