import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Page, Section, Cells, Callout, Empty, Stamp, Mark, RevMark, RiskBadge, SavingsBadge, price, num,
  buttonClass, type MarkKind,
} from "@/app/components/ui";
import { OpenProblems } from "@/app/components/OpenProblems";
import { dimensionLabel, dimensionValue, isIdentifier } from "@/app/components/format";
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
    <Page title={product.name}
      fields={[
        { label: "Manufacturer", value: product.manufacturer },
        { label: "Risk class", value: <RiskBadge cls={product.mdrClass} /> },
        { label: "Unit", value: <>per {product.uom}{product.packSize > 1 ? <span className="text-ink-400"> · {product.packSize} per pack</span> : ""}</> },
        ...(product.gtin ? [{ label: "GTIN", value: <span className="code text-[0.85rem]">{product.gtin}</span> }] : []),
        // What this product is being weighed against: the buyer's own line.
        ...(line ? [{ label: replacement ? "Replacing" : suggestion ? "Suggested for" : "Compared with", value: <span title={line.name}>{line.name}</span> }] : []),
      ]}
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
          {/* Price, or the honest absence of one. */}
          {product.basePrice == null ? (
            <div className="card px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="label">Direct price</span>
                <span className="font-bold text-ink-700 dark:text-ink-100">Not published</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-300">
                {product.manufacturer}&apos;s catalogue carried no prices, and the platform does not
                estimate them. The product is matchable; a quote follows once the manufacturer sets
                a price.
              </p>
            </div>
          ) : (
            <Cells cols={3}>
              <div className="px-5 py-4">
                <div className="label">Direct price</div>
                <div className="mt-1.5 text-[1.5rem] font-bold tracking-[-0.01em] leading-none tnum text-ink-950 dark:text-white">
                  <span className="text-sm font-medium text-ink-400">{product.currency} </span>{price(product.basePrice)}
                </div>
                <div className="mt-1.5 text-xs text-ink-400">
                  {product.priceOrigin === "catalogue" ? "stated in the catalogue" : "set by the manufacturer"}
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="label">You pay today</div>
                <div className="mt-1.5 text-[1.5rem] font-bold leading-none tnum text-ink-400">
                  {line?.currentPrice != null
                    ? <span className="line-through decoration-ink-300 decoration-1">{price(line.currentPrice)}</span>
                    : <span className="text-base font-semibold">Not on file</span>}
                </div>
                <div className="mt-1.5 text-xs text-ink-400">{line ? `for ${line.name}` : "no line to compare against"}</div>
              </div>
              <div className="px-5 py-4">
                <div className="label">Saving</div>
                <div className="mt-1.5">
                  {saving != null && saving > 0 ? <SavingsBadge pct={saving} /> : saving == null ? <SavingsBadge pct={null} /> : <span className="text-sm text-ink-500">none — dearer than today</span>}
                </div>
                {saving != null && saving > 0 && line && product.basePrice != null && line.currentPrice != null && (
                  <div className="mt-1.5 text-xs text-ink-400 tnum">
                    about {product.currency} {num((line.currentPrice - product.basePrice) * line.annualVolume * (line.packSize || 1))} a year
                  </div>
                )}
              </div>
            </Cells>
          )}

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
            <Empty>
              There is nothing to compare this against yet. Upload your article master, or open
              this product from a suggestion, and the comparison will name the line it replaces.
            </Empty>
          )}
        </div>
      </div>
    </Page>
  );
}

/** The product's two views, as a segmented pill control. */
function Tabs({ id, item, active, problems }: {
  id: string; item: string | null; active: string; problems: number | null;
}) {
  const q = item ? `&item=${item}` : "";
  const cls = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition ${
      on ? "bg-white font-bold text-ink-950 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_2px_8px_-2px_rgb(40_42_120/0.18)] dark:bg-ink-800 dark:text-white"
         : "font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"}`;
  return (
    <nav className="inline-flex gap-1 rounded-xl bg-ink-50 p-1 dark:bg-ink-900" aria-label="Product views">
      <Link href={`/hospital/products/${id}?tab=overview${q}`} className={cls(active === "overview")}
        aria-current={active === "overview" ? "page" : undefined}>
        Overview
      </Link>
      <Link href={`/hospital/products/${id}?tab=problems${q}`} className={cls(active === "problems")}
        aria-current={active === "problems" ? "page" : undefined}>
        Open problems
        {problems != null && problems > 0 && <RevMark n={problems} title={`${problems} open`} />}
      </Link>
    </nav>
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
    <div className="space-y-7">
      {line && (
        <Section title="Replaces, from your article master"
          action={recId ? (
            <Link href={`/hospital/recommendations/${recId}`} className={buttonClass("primary", "sm")}>
              Continue to order
            </Link>
          ) : undefined}>
          <div className="card px-5 py-4">
            <p className="font-semibold text-ink-950 dark:text-white">{line.name}</p>
            <dl className="mt-1.5 grid gap-x-8 sm:grid-cols-2">
              <Callout label="Annual volume" value={`${num(line.annualVolume)} ${line.uom}`} />
              <Callout label="Bought via" value={line.currentSupplier ?? "—"} />
              <Callout label="Pack" value={line.packSize > 1 ? `${line.packSize} per pack` : "single"} />
              <Callout label="Declared class" value={`MDR ${line.mdrClass}`} />
            </dl>
          </div>
        </Section>
      )}

      {/* The manufacturer's own words. Attributed, because unlike everything
          else on this page it was typed by the seller rather than read off a
          document the platform holds. */}
      {product.description && (
        <Section title={`From ${product.manufacturer}`}>
          <p className="max-w-[68ch] whitespace-pre-line text-[0.92rem] leading-relaxed text-ink-700 dark:text-ink-200">
            {product.description}
          </p>
        </Section>
      )}

      <div className="grid gap-7 sm:grid-cols-2">
        <Section title="Specification">
          <dl className="card px-5 py-2">
            {attrs.length
              ? attrs.map(([k, v]) => (
                  <Callout key={k} label={dimensionLabel(k)} value={dimensionValue(k, v)}
                    code={isIdentifier(k)} />
                ))
              : <p className="py-2 text-sm text-ink-400">Nothing extracted for this article.</p>}
          </dl>
        </Section>
        <Section title="Classification">
          <dl className="card px-5 py-2">
            <Callout label="ECLASS" value={product.eclass ?? "—"} code />
            <Callout label="MDR class" value={product.mdrClass} />
            <Callout label="Unit" value={product.uom} />
            <Callout label="Pack size" value={String(product.packSize)} />
          </dl>
        </Section>
      </div>

      <PreviousReplacements rows={replacements} />
    </div>
  );
}

const ORDER_STATE: Record<string, { label: string; mark: MarkKind }> = {
  pending_clinical: { label: "clinical sign-off", mark: "waiting" },
  pending_approval: { label: "awaiting approval", mark: "waiting" },
  approved: { label: "approved", mark: "working" },
  pooled: { label: "awaiting placement", mark: "working" },
  sanovio_fulfillment: { label: "in fulfilment", mark: "working" },
  fulfilled: { label: "delivered", mark: "done" },
};

/**
 * Swaps this hospital has already put through on this product — as the
 * article brought in, or the one moved away from.
 * Only placed orders appear: a recommendation nobody acted on is a
 * suggestion, not a replacement.
 */
function PreviousReplacements({ rows }: { rows: PastReplacement[] }) {
  return (
    <Section title="Previous replacements">
      {rows.length === 0 ? (
        <Empty>No replacement has been ordered on this product yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b hair text-left">
                {["Date", "Change", "Volume", "Supplier", "Status"].map((h) => <th key={h} className="label px-4 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((r) => {
                const st = ORDER_STATE[r.status] ?? { label: r.status, mark: "open" as MarkKind };
                return (
                  <tr key={r.orderId}>
                    <td className="px-3 py-2.5 tnum text-ink-500">{new Date(r.createdAt).toLocaleDateString("de-CH")}</td>
                    <td className="px-3 py-2.5">
                      <Stamp tone={r.direction === "in" ? "brand" : "neutral"}>{r.direction === "in" ? "Brought in" : "Replaced"}</Stamp>
                      <span className="ml-2">
                        {r.direction === "in"
                          ? <>replaced <span className="font-medium">{r.fromName}</span> on {r.itemName}</>
                          : <>replaced by <span className="font-medium">{r.toName}</span></>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tnum">{num(r.volume)}</td>
                    <td className="px-3 py-2.5 text-ink-600 dark:text-ink-200">{r.supplierName}</td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5"><Mark kind={st.mark} />{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
