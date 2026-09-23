import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, RiskBadge, price, num } from "@/app/components/ui";
import { OpenProblems } from "@/app/components/OpenProblems";
import { ProductShot } from "@/app/components/ProductShot";
import { ReplaceWithThis } from "@/app/components/ReplaceWithThis";
import { replacementOrderability } from "@/lib/replacement";
import { ReplacementBanner, ReplacementPoints, SuggestionBanner } from "@/app/components/ReplacementReview";
import {
  productDetail, hospitalLine, likelyReplacedLine, recommendationFor, productImages,
  previousReplacements, replacementFor, replacementLineFor, replacementOptions,
  suggestionFor, suggestedLineFor, type PastReplacement,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * A product, seen from the hospital side.
 *
 * Reached by clicking any tile — a suggestion or a search hit — so it is the
 * one page that has to work both when the platform already proposed this
 * product and when the buyer went looking for it themselves.
 */
export default async function ProductPage(
  { params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ item?: string; tab?: string }>;
  },
) {
  const { id } = await params;
  const { item, tab } = await searchParams;

  const product = productDetail(id);
  if (!product) notFound();

  // Which of our own lines this would replace. Given explicitly when we came
  // from a suggestion or the catalogue; the line the buyer chose it for, when
  // they did; otherwise inferred from category.
  const lineId = item ?? replacementLineFor(id) ?? suggestedLineFor(id) ?? likelyReplacedLine(id);
  const line = lineId ? hospitalLine(lineId) : null;
  const recId = line ? recommendationFor(line.id, id) : null;
  const replacement = line ? replacementFor(line.id, id) : null;
  // Matched by the suggestion pipeline, and not chosen yet.
  const suggestion = line && !replacement ? suggestionFor(line.id, id) : null;
  const precalculated = suggestion?.analysis?.status === "done" ? suggestion.analysis : null;
  const orderability = replacement?.status === "done" ? replacementOrderability(replacement.id) : null;
  const active = tab === "problems" ? "problems" : "overview";

  const saving = line?.currentPrice && product.basePrice
    ? Math.round(((line.currentPrice - product.basePrice) / line.currentPrice) * 1000) / 10
    : null;

  return (
    <Page title={product.name} lead={`${product.manufacturer} · direct from the manufacturer`}
      action={
        <ReplaceWithThis canonicalId={id} productName={product.name}
          manufacturer={product.manufacturer} options={replacementOptions(id)}
          defaultItemId={line?.id ?? null} />
      }>
      {replacement && (
        <ReplacementBanner view={replacement} orderability={orderability}
          problemsHref={`/hospital/products/${id}?tab=problems&item=${replacement.itemId}`} />
      )}
      {suggestion && (
        <SuggestionBanner view={suggestion}
          problemsHref={`/hospital/products/${id}?tab=problems&item=${suggestion.itemId}`} />
      )}
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <ProductShot name={product.name} eclass={product.eclass}
          images={productImages(id)} />

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge cls={product.mdrClass} />
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">
              per {product.uom}{product.packSize > 1 ? ` · ${product.packSize}/pack` : ""}
            </span>
            {product.gtin && (
              <span className="rounded-full bg-ink-50 px-2 py-0.5 font-mono text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                GTIN {product.gtin}
              </span>
            )}
          </div>

          {/* Price, or the honest absence of one. */}
          <div className="rounded-2xl border border-ink-50 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/60">
            {product.basePrice == null ? (
              <>
                <div className="text-lg font-semibold text-ink-500 dark:text-ink-300">
                  No price published
                </div>
                <p className="mt-1 text-sm text-ink-400">
                  {product.manufacturer}&apos;s catalogue carried no prices, and the platform does
                  not estimate them. The product is matchable; a quote follows once the
                  manufacturer sets a price.
                </p>
              </>
            ) : (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-400">
                    Direct price
                  </div>
                  <div className="text-2xl font-bold tnum text-ink-950 dark:text-white">
                    {product.currency} {price(product.basePrice)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-400">
                    {product.priceOrigin === "catalogue" ? "stated in the catalogue" : "set by the manufacturer"}
                  </div>
                </div>
                {line?.currentPrice != null && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-ink-400">You pay today</div>
                    <div className="text-2xl font-bold tnum text-ink-400 line-through">
                      {product.currency} {price(line.currentPrice)}
                    </div>
                  </div>
                )}
                {saving != null && saving > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-good-500 px-4 py-3 text-center text-white shadow-[0_8px_18px_-6px_rgba(86,89,251,.55)]">
                    <div className="text-xl font-extrabold leading-none tnum">{saving.toFixed(0)}%</div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-90">off</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Tabs id={id} item={line?.id ?? null} active={active}
            problems={replacement?.status === "done" ? replacement.counts.open
              : precalculated ? precalculated.counts.total : null} />

          {active === "overview" ? (
            <Overview product={product} line={line} recId={recId}
              replacements={previousReplacements(id)} />
          ) : replacement ? (
            // Once chosen, the replacement analysis is the worklist for this
            // pair; the lighter browse-time comparison would only duplicate it.
            <ReplacementPoints view={replacement} productName={product.name}
              canSend={Boolean(product.manufacturerId)} ordered={Boolean(orderability?.order)} />
          ) : precalculated ? (
            // Already paid for by the suggestion pipeline; the browse-time
            // comparison would be a second, lesser call on the same pair.
            <ReplacementPoints view={precalculated} productName={product.name}
              canSend={false} readOnly />
          ) : line ? (
            <OpenProblems itemId={line.id} canonicalId={id}
              itemName={line.name} productName={product.name} />
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              There is nothing to compare this against yet. Upload your article master, or open
              this product from a suggestion, and the comparison will name the line it replaces.
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function Tabs({ id, item, active, problems }: {
  id: string; item: string | null; active: string; problems: number | null;
}) {
  const q = item ? `&item=${item}` : "";
  const cls = (on: boolean) =>
    `rounded-lg px-3.5 py-2 text-sm font-medium transition ${
      on ? "bg-ink-900 text-white dark:bg-ink-50 dark:text-ink-900"
         : "text-ink-500 hover:bg-ink-25 dark:text-ink-300 dark:hover:bg-ink-800"}`;
  return (
    <div className="flex gap-1.5 border-b border-ink-50 pb-3 dark:border-ink-800">
      <Link href={`/hospital/products/${id}?tab=overview${q}`} className={cls(active === "overview")}>
        Overview
      </Link>
      <Link href={`/hospital/products/${id}?tab=problems${q}`} className={cls(active === "problems")}>
        Open problems
        {problems != null && problems > 0 && (
          <span className={`ml-1.5 rounded-full px-1.5 text-[11px] font-semibold tnum ${
            active === "problems" ? "bg-white/20" : "bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200"}`}>
            {problems}
          </span>
        )}
      </Link>
    </div>
  );
}

function Overview({ product, line, recId, replacements }: {
  product: NonNullable<ReturnType<typeof productDetail>>;
  line: ReturnType<typeof hospitalLine>;
  recId: string | null;
  replacements: PastReplacement[];
}) {
  const attrs = Object.entries(product.attributes);
  return (
    <div className="space-y-5">
      {line && (
        <div className="rounded-2xl border border-ink-50 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/60">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
            Replaces, from your article master
          </h2>
          <p className="mt-2 font-medium text-ink-900 dark:text-ink-50">{line.name}</p>
          <p className="mt-0.5 text-sm text-ink-400 tnum">
            {num(line.annualVolume)} {line.uom}/yr
            {line.currentSupplier ? ` · via ${line.currentSupplier}` : ""}
            {line.packSize > 1 ? ` · ${line.packSize}/pack` : ""}
          </p>
          {recId && (
            <Link href={`/hospital/recommendations/${recId}`}
              className="mt-3 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
              Continue to order →
            </Link>
          )}
        </div>
      )}

      {/* The manufacturer's own words. Attributed, because unlike everything
          else on this page it was typed by the seller rather than read off a
          document the platform holds. */}
      {product.description && (
        <section className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            From {product.manufacturer}
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-200">
            {product.description}
          </p>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Facts title="Specification" rows={attrs.length ? attrs.map(([k, v]) => [k.replace(/_/g, " "), String(v)]) : [["—", "nothing extracted"]]} />
        <Facts title="Classification" rows={[
          ["ECLASS", product.eclass ?? "—"],
          ["MDR class", product.mdrClass],
          ["per", product.uom],
          ["pack size", String(product.packSize)],
        ]} />
      </div>

      <PreviousReplacements rows={replacements} />
    </div>
  );
}

const ORDER_STATE: Record<string, string> = {
  pending_clinical: "awaiting clinical sign-off",
  pending_approval: "awaiting approval",
  approved: "approved",
  pooled: "awaiting placement",
  sanovio_fulfillment: "in fulfilment",
  fulfilled: "delivered",
};

/**
 * Swaps this hospital has already put through on this product — as the article
 * brought in, or the one moved away from. Only placed orders appear: a
 * recommendation nobody acted on is a suggestion, not a replacement.
 */
function PreviousReplacements({ rows }: { rows: PastReplacement[] }) {
  return (
    <div className="rounded-2xl border border-ink-50 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/60">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
        Previous replacements
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-300">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-50 dark:divide-ink-800">
          {rows.map((r) => (
            <li key={r.orderId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                r.direction === "in"
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                  : "bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-300"}`}>
                {r.direction === "in" ? "brought in" : "replaced"}
              </span>
              <span className="min-w-0 flex-1">
                {r.direction === "in"
                  ? <>replaced <span className="font-medium">{r.fromName}</span> on {r.itemName}</>
                  : <>replaced by <span className="font-medium">{r.toName}</span></>}
              </span>
              <span className="text-xs text-ink-400 tnum">
                {num(r.volume)} units · {r.supplierName} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("de-CH")} ·{" "}
                {ORDER_STATE[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Facts({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-2xl border border-ink-50 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/60">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-ink-400">{k}</dt>
            <dd className="text-right font-medium tnum text-ink-800 dark:text-ink-100">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
