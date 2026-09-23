import Link from "next/link";
import { Page, Section, Empty, Stamp, Mark, Note, RiskBadge, num, buttonClass, type MarkKind } from "../components/ui";
import { Money } from "../components/Prefs";
import { SearchBar } from "../components/SearchBar";
import { PartsList, RecRow, SuggestionRow, HitRow } from "../components/PartsList";
import { UploadForm } from "../components/UploadForm";
import { SuggestionsPoller } from "../components/ReplacementReview";
import { Spinner } from "../components/OpenProblems";
import {
  activeRecommendations, suggestedRecommendations, totals, hospitalReviewQueue,
  currentOrders, hospitalDocuments, suggestionCards, dismissedSuggestions,
  suggestionsPending,
} from "@/lib/queries";
import { reconsider, uploadHospitalDemandAction, reconsiderSuggestionAction } from "@/lib/actions";
import { searchProducts } from "@/lib/search";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

/** Where an order stands, as a mark and a word — never colour alone. */
const ORDER_STATE: Record<string, { label: string; mark: MarkKind }> = {
  pending_clinical: { label: "Clinical review", mark: "waiting" },
  pending_approval: { label: "Awaiting approval", mark: "waiting" },
  approved: { label: "Approved", mark: "working" },
  pooled: { label: "Awaiting placement", mark: "working" },
  sanovio_fulfillment: { label: "Fulfilment", mark: "working" },
  fulfilled: { label: "Delivered", mark: "done" },
  rejected: { label: "Rejected", mark: "rejected" },
};

/**
 * The hospital cockpit: the search field, every suggestion in one list with
 * what they add up to beside its heading, then the orders.
 */
export default async function HospitalCockpit({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const { t, money } = await getPrefs();

  const docs = hospitalDocuments();
  const hasData = docs.length > 0;
  const recs = activeRecommendations();
  const dismissed = suggestedRecommendations();
  const suggestions = suggestionCards();
  const dismissedSuggested = dismissedSuggestions();
  const pending = suggestionsPending();
  const orders = currentOrders();
  const sum = totals();
  const { lowExtraction, proposals } = hospitalReviewQueue();
  const reviewCount = lowExtraction.length + proposals.length;
  const search = query ? await searchProducts(query) : null;
  const hits = search?.hits ?? [];
  const close = hits.filter((h) => h.match === "meaning").length;
  const open = recs.length + suggestions.length;

  if (!hasData && !query) {
    return (
      <Page title={t("Upload your article master")}
        lead={t("Start with an excerpt of your article master as Excel or CSV. The file is stored as uploaded, so every saving the platform claims can be traced back to the document it came from.")}>
        <UploadForm
          action={uploadHospitalDemandAction}
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hint={t("Excel (.xlsx) or CSV — Artikelbezeichnung, Jahresmenge, GTIN, MDR-Klasse, Netto-Zielpreis")} />
      </Page>
    );
  }

  return (
    <Page title={t("Suggested replacements")}
      lead={t("What the platform found against your article master, cheapest to act on first.")}
      action={
        <Link href="/hospital/documents" className={buttonClass("ghost")}>{t("Upload more data")}</Link>
      }>

      <SearchBar q={query} />

      {reviewCount > 0 && !query && (
        <Note as="a" href="/hospital/documents" tone="warn" mark={<Mark kind="waiting" className="h-3 w-3" />}
          action={<span className="text-xs font-semibold text-ink-700 dark:text-ink-100">{t("Open documents")}</span>}>
          <span className="font-semibold tnum">{t(reviewCount > 1 ? "{n} items" : "{n} item", { n: reviewCount })}</span>{" "}
          {t("need approval before they can feed the matching engine.")}
        </Note>
      )}

      {query ? (
        <Section title={t("Search · “{query}”", { query })}
          meta={`${t(hits.length === 1 ? "{n} result" : "{n} results", { n: hits.length })}${close ? ` · ${t(close === 1 ? "{n} close match" : "{n} close matches", { n: close })}` : ""}`}
          action={<Link href="/hospital" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">{t("Clear search")}</Link>}>
          {search && hits.length > 0 && (search.expanded.length > 0 || search.semantic) && (
            <p className="-mt-1 text-xs text-ink-400">
              {search.expanded.length > 0 && <>{t("Also searched for {terms}.", { terms: search.expanded.join(", ") })} </>}
              {t("Meaning matched by {model}.", { model: String(search.semantic) })}
            </p>
          )}
          {hits.length === 0 ? (
            <Empty>
              {t("Nothing in the harmonised catalogue is close to “{query}”, in any language. Coverage is bounded by what manufacturers have uploaded.", { query })}
            </Empty>
          ) : (
            <PartsList>{hits.map((h, i) => <HitRow key={h.canonicalId} hit={h} pos={i + 1} />)}</PartsList>
          )}
        </Section>
      ) : (
        <>
          <Section title={t("Suggestions")}
            meta={`${t("{n} open", { n: open })} · ${t("{amount} identified", { amount: money(sum.savings, "CHF", 0) })} · ${t("{amount} addressable", { amount: money(sum.spend, "CHF", 0) })}${suggestions.length ? ` · ${t("{n} by automatic matching", { n: suggestions.length })}` : ""}`}>
            {pending && (
              <Note tone="brand" label={t("Running")} mark={<Spinner small />} live>
                {t("Matching your catalogue against the manufacturers' — rows appear as they are found, and each best match is analysed in full.")}
              </Note>
            )}
            <SuggestionsPoller pending={pending} />
            {open === 0 ? (
              <Empty>
                {pending
                  ? t("Nothing matched yet — the run is still going.")
                  : t("No open suggestions. Clear the review queue, or wait for a manufacturer catalogue covering these categories.")}
              </Empty>
            ) : (
              <PartsList>
                {recs.map((r, i) => <RecRow key={r.id} rec={r} pos={i + 1} />)}
                {suggestions.map((s, i) => (
                  <SuggestionRow key={`${s.itemId}|${s.canonicalId}`} s={s} pos={recs.length + i + 1} />
                ))}
              </PartsList>
            )}
          </Section>

          <Section title={t("Orders")} meta={orders.length ? `${orders.length}` : undefined}>
            {orders.length === 0 ? (
              <Empty>{t("Nothing ordered yet. Open a row above to replace an item.")}</Empty>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b hair-strong text-left">
                      {["Order", "Article · replaces", "Quantity", "Supplier", "Unit price", "Status"].map((h) => (
                        <th key={h} className="label px-3 py-2.5">{t(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {orders.map((o) => {
                      const st = ORDER_STATE[o.status] ?? { label: o.status, mark: "open" as MarkKind };
                      return (
                        <tr key={o.id} className="align-top transition-colors hover:bg-ink-25/60 dark:hover:bg-ink-800/40">
                          <td className="code px-3 py-3 text-[0.78rem] text-ink-500">{o.id.slice(-8).toUpperCase()}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink-950 dark:text-white">{o.recommended_name}</span>
                              <RiskBadge cls={o.mdr_risk_class as "I" | "IIa" | "IIb" | "III"} />
                            </div>
                            <div className="mt-0.5 text-xs text-ink-400">{t("replaces {name}", { name: o.item_name })}</div>
                          </td>
                          <td className="px-3 py-3 tnum">{num(o.volume)}</td>
                          <td className="px-3 py-3 text-ink-600 dark:text-ink-200">{o.supplier_name}</td>
                          <td className="px-3 py-3 tnum">
                            <Money amount={o.unit_price} from={o.currency} />
                            <span className="ml-1.5 text-xs text-ink-400">{o.savings_pct >= 0 ? "−" : "+"}{Math.abs(o.savings_pct)} %</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[0.85rem]">
                              <Mark kind={st.mark} /> {t(st.label)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {(dismissed.length > 0 || dismissedSuggested.length > 0) && (
            <Section title={t("Dismissed")} meta={t("kept, never deleted")}>
              <div className="card divide-y divide-[var(--line)]">
                {dismissedSuggested.map((d) => (
                  <div key={`${d.itemId}|${d.canonicalId}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.name}</div>
                      <div className="truncate text-xs text-ink-400">{t("for {name}", { name: d.itemName })}</div>
                    </div>
                    <Stamp tone="neutral">{t("Auto")}</Stamp>
                    <form action={reconsiderSuggestionAction.bind(null, d.itemId, d.canonicalId)}>
                      <button className={buttonClass("ghost", "sm")}>{t("Reconsider")}</button>
                    </form>
                  </div>
                ))}
                {dismissed.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.recommendedName}</div>
                      <div className="truncate text-xs text-ink-400">
                        {t("replaces {name}", { name: r.itemName })}
                        {r.dismissedReason ? ` · ${t(r.dismissedReason)}` : ` · ${t("no reason given")}`}
                      </div>
                    </div>
                    <span className="tnum text-sm text-ink-400">−{r.savingsPct} %</span>
                    <form action={reconsider.bind(null, r.id)}>
                      <button className={buttonClass("ghost", "sm")}>{t("Reconsider")}</button>
                    </form>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
