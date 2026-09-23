import Link from "next/link";
import { Page, Stat, DataSheet, Empty } from "@/app/components/ui";
import { portalSummary, matchRuns, documents } from "@/lib/queries";
import { adapterName } from "@/lib/ai";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const { t } = await getPrefs();
  const s = portalSummary();
  const last = matchRuns(1)[0];
  const docs = documents();

  return (
    <Page title={t("Operations")}
      lead={t("Platform-internal view. Everything here arrived through an upload — there is no preloaded catalogue.")}>

      <DataSheet>
        <Stat label={t("Canonical products")} value={String(s.canonicalProducts)} sub={t("the harmonisation layer")} />
        <Stat label={t("Confirmed links")} value={String(s.links)} />
        <Stat label={t("Demand pools")} value={String(s.pools)} />
        <Stat label={t("AI adapter")} value={adapterName().includes("claude") ? t("live") : t("stub")} sub={adapterName()} />
      </DataSheet>

      {docs.length === 0 ? (
        <Empty>
          {t("Nothing uploaded yet. Start in the")}{" "}
          <Link href="/supplier/upload" className="underline">{t("supplier portal")}</Link>{" "}
          {t("with a catalogue, then upload hospital demand.")}
        </Empty>
      ) : (
        <div className="space-y-2">
          {last ? (
            <DataSheet title={t("Last matching run")}>
              <Stat label={t("Items seen")} value={last.items_seen} />
              <Stat label={t("By identifier")} value={last.by_identifier} />
              <Stat label={t("By reranker")} value={last.by_reranker} />
              <Stat label={t("By Claude")} value={last.by_llm} />
              <Stat label={t("To review")} value={last.to_review} />
            </DataSheet>
          ) : <Empty>{t("No matching run recorded yet.")}</Empty>}
          <Link href="/admin/pipeline" className="inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
            {t("Open the pipeline view")}
          </Link>
        </div>
      )}
    </Page>
  );
}
