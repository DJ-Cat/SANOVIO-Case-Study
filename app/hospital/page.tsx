import Link from "next/link";
import { Empty, RiskBadge, price, num } from "../components/ui";
import { SearchBar } from "../components/SearchBar";
import { SavingsCard, ProductCard, SuggestionCard } from "../components/SavingsCard";
import { SuggestionsPoller } from "../components/ReplacementReview";
import { Spinner } from "../components/OpenProblems";
import { UploadForm } from "../components/UploadForm";
import { Plus } from "../components/icons";
import {
  activeRecommendations, suggestedRecommendations, totals, hospitalReviewQueue,
  currentOrders, hospitalDocuments, suggestionCards, dismissedSuggestions,
  suggestionsPending,
} from "@/lib/queries";
import { reconsider, uploadHospitalDemandAction, reconsiderSuggestionAction } from "@/lib/actions";
import { searchProducts } from "@/lib/search";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  pending_clinical: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  pending_approval: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  pooled: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200",
  sanovio_fulfillment: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200",
  fulfilled: "bg-good-100/50 text-good-500 dark:bg-good-500/15 dark:text-good-100",
  rejected: "bg-ink-50 text-ink-400 dark:bg-ink-800 dark:text-ink-300",
};
const STATUS_LABEL: Record<string, string> = {
  pending_clinical: "Clinical review",
  pending_approval: "Awaiting approval",
  pooled: "Awaiting placement",
  sanovio_fulfillment: "Fulfilment",
  fulfilled: "Delivered",
  rejected: "Rejected",
};

export default async function HospitalCockpit({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const docs = hospitalDocuments();
  const hasData = docs.length > 0;
  const recs = activeRecommendations();
  const dismissed = suggestedRecommendations();
  const suggestions = suggestionCards();
  const dismissedSuggested = dismissedSuggestions();
  const pending = suggestionsPending();
  const orders = currentOrders();
  const t = totals();
  const { lowExtraction, proposals } = hospitalReviewQueue();
  const reviewCount = lowExtraction.length + proposals.length;
  const search = query ? await searchProducts(query) : null;
  const hits = search?.hits ?? [];
  const close = hits.filter((h) => h.match === "meaning").length;

  return (
    <div className="space-y-8">
      {/* Search — always at the top, independent of the recommendation feed */}
      <SearchBar q={query} />

      {query ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {hits.length} result{hits.length === 1 ? "" : "s"} for “{query}”
              </h2>
              {search && hits.length > 0 && (
                <p className="mt-0.5 text-xs text-ink-400">
                  {close > 0
                    ? `${close} close match${close === 1 ? "" : "es"} by meaning or language`
                    : "Matched on your words"}
                  {search.expanded.length > 0 && ` · also searched for ${search.expanded.join(", ")}`}
                  {search.semantic && ` · ${search.semantic}`}
                </p>
              )}
            </div>
            <Link href="/hospital" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
              Clear search
            </Link>
          </div>
          {hits.length === 0 ? (
            <Empty>
              Nothing in the harmonised catalogue is close to “{query}”, in any language. Coverage
              is bounded by what manufacturers have uploaded.
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {hits.map((h) => <ProductCard key={h.canonicalId} hit={h} />)}
            </div>
          )}
        </section>
      ) : !hasData ? (
        /* ---------- Empty state: upload comes first ---------- */
        <section className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Upload and extract</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-400">
              Start with an excerpt of your article master as Excel or CSV. The file is stored as
              uploaded, so any savings claim can be traced back to the document it came from.
            </p>
          </div>

          <UploadForm
            action={uploadHospitalDemandAction}
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hint="Excel (.xlsx) or CSV — Artikelbezeichnung, Jahresmenge, GTIN, MDR-Klasse, Netto-Zielpreis" />
        </section>
      ) : (
        /* ---------- Populated state ---------- */
        <>
          {reviewCount > 0 && (
            <Link href="/hospital/documents"
              className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300/70 bg-amber-50/80 px-5 py-3.5 text-sm backdrop-blur transition hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950/40">
              <span className="text-amber-900 dark:text-amber-200">
                <strong>{reviewCount} item{reviewCount > 1 ? "s" : ""} need approval</strong> before
                they can feed the matching engine.
              </span>
              <span className="shrink-0 font-semibold text-amber-900 dark:text-amber-200">Open documents →</span>
            </Link>
          )}

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Suggested replacements</h1>
                <p className="mt-1 text-sm text-ink-400 tnum">
                  {recs.length + suggestions.length} open · CHF {num(t.savings)} identified against
                  CHF {num(t.spend)} of addressable spend
                  {suggestions.length > 0 && ` · ${suggestions.length} found by automatic matching`}
                </p>
              </div>
              <Link href="/hospital/documents"
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white/80 px-3.5 py-2 text-sm font-medium text-ink-600 backdrop-blur transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-700 dark:bg-ink-900/80 dark:text-ink-200">
                <Plus className="h-4 w-4" /> Upload more data
              </Link>
            </div>

            {pending && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100"
                aria-live="polite">
                <Spinner small />
                Matching your catalogue against the manufacturers&apos; — suggestions appear here as
                they are found, and each best match is analysed in full.
              </div>
            )}
            <SuggestionsPoller pending={pending} />

            {recs.length === 0 && suggestions.length === 0 ? (
              <Empty>
                {pending
                  ? "Nothing matched yet — the run is still going."
                  : "No open recommendations. Clear the review queue, or wait for a manufacturer " +
                    "catalogue covering these categories."}
              </Empty>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recs.map((r) => <SavingsCard key={r.id} rec={r} />)}
                {suggestions.map((s) => <SuggestionCard key={`${s.itemId}|${s.canonicalId}`} s={s} />)}
              </div>
            )}
          </section>

          {/* ---------- Current orders ---------- */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Current orders</h2>
            {orders.length === 0 ? (
              <Empty>Nothing submitted yet. Open a recommendation to start an order.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-[22px] border border-ink-50 bg-white/85 shadow-[0_1px_2px_rgba(16,18,40,.04),0_12px_32px_-16px_rgba(16,18,40,.16)] backdrop-blur dark:border-ink-800 dark:bg-ink-900/85">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-50 text-left text-[11px] uppercase tracking-wider text-ink-300 dark:border-ink-800">
                      {["Name", "ID", "Quantity", "Supplier", "Price", "Status"].map((h) => (
                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
                    {orders.map((o) => (
                      <tr key={o.id} className="transition hover:bg-brand-50/40 dark:hover:bg-brand-500/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{o.recommended_name}</span>
                            <RiskBadge cls={o.mdr_risk_class as "I" | "IIa" | "IIb" | "III"} />
                          </div>
                          <div className="text-xs text-ink-400">replaces {o.item_name}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-400">{o.id}</td>
                        <td className="px-4 py-3 tnum">{num(o.volume)}</td>
                        <td className="px-4 py-3 text-ink-500 dark:text-ink-300">{o.supplier_name}</td>
                        <td className="px-4 py-3 tnum">
                          {o.currency} {price(o.unit_price)}
                          <span className="ml-1.5 text-xs text-good-500">−{o.savings_pct}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            STATUS_TONE[o.status] ?? "bg-ink-50 text-ink-500 dark:bg-ink-800"}`}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {dismissedSuggested.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
                Dismissed suggestions
              </h2>
              <div className="divide-y divide-ink-50 overflow-hidden rounded-[22px] border border-ink-50 bg-white/85 backdrop-blur dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900/85">
                {dismissedSuggested.map((d) => (
                  <div key={`${d.itemId}|${d.canonicalId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.name}</div>
                      <div className="truncate text-xs text-ink-400">for {d.itemName}</div>
                    </div>
                    <form action={reconsiderSuggestionAction.bind(null, d.itemId, d.canonicalId)}>
                      <button className="rounded-lg border border-ink-100 px-2.5 py-1 text-xs font-medium transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-700">
                        Reconsider
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dismissed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
                Dismissed — never deleted
              </h2>
              <div className="divide-y divide-ink-50 overflow-hidden rounded-[22px] border border-ink-50 bg-white/85 backdrop-blur dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900/85">
                {dismissed.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.recommendedName}</div>
                      <div className="truncate text-xs text-ink-400">
                        replaces {r.itemName}
                        {r.dismissedReason ? ` · ${r.dismissedReason}` : " · no reason given"}
                      </div>
                    </div>
                    <span className="tnum text-sm text-ink-400">−{r.savingsPct}%</span>
                    <form action={reconsider.bind(null, r.id)}>
                      <button className="rounded-lg border border-ink-100 px-2.5 py-1 text-xs font-medium transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-700">
                        Reconsider
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
