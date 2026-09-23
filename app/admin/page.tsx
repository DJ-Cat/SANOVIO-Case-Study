import Link from "next/link";
import { Page, Stat, DataSheet, Empty } from "@/app/components/ui";
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

      <DataSheet>
        <Stat label="Canonical products" value={String(s.canonicalProducts)} sub="the harmonisation layer" />
        <Stat label="Confirmed links" value={String(s.links)} />
        <Stat label="Demand pools" value={String(s.pools)} />
        <Stat label="AI adapter" value={adapterName().includes("claude") ? "live" : "stub"} sub={adapterName()} />
      </DataSheet>

      {docs.length === 0 ? (
        <Empty>
          Nothing uploaded yet. Start in the{" "}
          <Link href="/supplier/upload" className="underline">supplier portal</Link> with a catalogue,
          then upload hospital demand.
        </Empty>
      ) : (
        <div className="space-y-2">
          {last ? (
            <DataSheet title="Last matching run">
              <Stat label="Items seen" value={last.items_seen} />
              <Stat label="By identifier" value={last.by_identifier} />
              <Stat label="By reranker" value={last.by_reranker} />
              <Stat label="By Claude" value={last.by_llm} />
              <Stat label="To review" value={last.to_review} />
            </DataSheet>
          ) : <Empty>No matching run recorded yet.</Empty>}
          <Link href="/admin/pipeline" className="inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
            Open the pipeline view
          </Link>
        </div>
      )}
    </Page>
  );
}
