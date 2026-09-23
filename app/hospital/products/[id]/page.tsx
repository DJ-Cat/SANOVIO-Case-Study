import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Page, Section, Cells, Callout, Empty, Stamp, Mark, RevMark, RiskBadge, SavingsBadge, num,
  buttonClass, type MarkKind,
} from "@/app/components/ui";
import { Money } from "@/app/components/Prefs";
import { getPrefs } from "@/lib/prefs";
import { pick, type Translate } from "@/lib/i18n";
import { OpenProblems } from "@/app/components/OpenProblems";
import { PointsScroller } from "@/app/components/PointsScroller";
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
  const { t } = await getPrefs();

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

  // No fragment: the banner's link scrolls itself, smoothly, to the first
  // blocking point once it has rendered (PointsScroller).
  const problemsHref = (itemId: string) =>
    `/hospital/products/${id}?tab=problems&item=${itemId}`;

  // The line this product would take the place of, at the head of the
  // verdict's card: what the analysis weighed it against comes before what it
  // concluded.
  const replacing = line ? (
    <ReplacingLine line={line} recId={recId}
      label={replacement ? t("You are replacing") : t("Would replace")} />
  ) : null;

  return (
    <Page title={product.name}
      // A match with points to settle is the first thing to act on, so it
      // sits above even the product's facts.
      notice={replacement ? (
        <ReplacementBanner view={replacement} orderability={orderability}
          problemsHref={problemsHref(replacement.itemId)} />
      ) : suggestion ? (
        <SuggestionBanner view={suggestion} problemsHref={problemsHref(suggestion.itemId)} />
      ) : undefined}
      fields={[
        { label: t("Manufacturer"), value: product.manufacturer },
        { label: t("Risk class"), value: <RiskBadge cls={product.mdrClass} /> },
        { label: t("Unit"), value: <>{t("per {uom}", { uom: product.uom })}{product.packSize > 1 ? <span className="text-ink-400"> · {t("{n} per pack", { n: product.packSize })}</span> : ""}</> },
        ...(product.gtin ? [{ label: "GTIN", value: <span className="code text-[0.85rem]">{product.gtin}</span> }] : []),
        // What this product is being weighed against: the buyer's own line.
        ...(line ? [{ label: replacement ? t("Replacing") : suggestion ? t("Suggested for") : t("Compared with"), value: <span title={line.name}>{line.name}</span> }] : []),
      ]}
      action={
        <ReplaceWithThis canonicalId={id} productName={product.name}
          manufacturer={product.manufacturer} options={replacementOptions(id)}
          defaultItemId={line?.id ?? null} />
      }>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <ProductShot name={product.name} eclass={product.eclass}
          images={productImages(id)} />

        <div className="min-w-0 space-y-5">
          {active === "problems" && <PointsScroller />}
          <Tabs id={id} item={line?.id ?? null} active={active} t={t}
            problems={replacement?.status === "done" ? replacement.counts.open
              : precalculated ? precalculated.counts.total : null} />

          {active === "overview" ? (
            <Overview product={product} line={line} saving={saving}
              replacements={previousReplacements(id)} />
          ) : replacement ? (
            // Once chosen, the replacement analysis is the worklist for this
            // pair; the lighter browse-time comparison would only duplicate it.
            <ReplacementPoints view={replacement} productName={product.name} replacing={replacing}
              canSend={Boolean(product.manufacturerId)} ordered={Boolean(orderability?.order)} />
          ) : precalculated ? (
            // Already paid for by the suggestion pipeline; the browse-time
            // comparison would be a second, lesser call on the same pair.
            <ReplacementPoints view={precalculated} productName={product.name} replacing={replacing}
              canSend={false} readOnly />
          ) : line ? (
            <OpenProblems itemId={line.id} canonicalId={id} replacing={replacing}
              itemName={line.name} productName={product.name} />
          ) : (
            <Empty>
              {t("There is nothing to compare this against yet. Upload your article master, or open this product from a suggestion, and the comparison will name the line it replaces.")}
            </Empty>
          )}
        </div>
      </div>
    </Page>
  );
}

/** The product's two views, as a segmented pill control. */
function Tabs({ id, item, active, problems, t }: {
  id: string; item: string | null; active: string; problems: number | null; t: Translate;
}) {
  const q = item ? `&item=${item}` : "";
  const cls = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition ${
      on ? "bg-white font-bold text-ink-950 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_2px_8px_-2px_rgb(40_42_120/0.18)] dark:bg-ink-800 dark:text-white"
         : "font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"}`;
  return (
    <nav className="inline-flex gap-1 rounded-xl bg-ink-50 p-1 dark:bg-ink-900" aria-label={t("Product views")}>
      <Link href={`/hospital/products/${id}?tab=overview${q}`} scroll={false} className={cls(active === "overview")}
        aria-current={active === "overview" ? "page" : undefined}>
        {t("Overview")}
      </Link>
      <Link href={`/hospital/products/${id}?tab=problems${q}`} scroll={false} className={cls(active === "problems")}
        aria-current={active === "problems" ? "page" : undefined}>
        {t("Open problems")}
        {problems != null && problems > 0 && <RevMark n={problems} title={t("{n} open", { n: problems })} />}
      </Link>
    </nav>
  );
}

async function Overview({ product, line, saving, replacements }: {
  product: NonNullable<ReturnType<typeof productDetail>>;
  line: ReturnType<typeof hospitalLine>;
  saving: number | null;
  replacements: PastReplacement[];
}) {
  const { t } = await getPrefs();
  const attrs = Object.entries(product.attributes);
  return (
    <div className="space-y-7">
      {/* What it costs, and what its maker says it is for — read together. */}
      <div className="space-y-5">
        <PriceCard product={product} line={line} saving={saving} />

        {/* The manufacturer's own words. Attributed, because unlike everything
            else on this page it was typed by the seller rather than read off a
            document the platform holds. */}
        {product.description && (
          <Section title={t("From {manufacturer}", { manufacturer: product.manufacturer })}>
            <div className="card px-5 py-4">
              <p className="max-w-[72ch] whitespace-pre-line text-[0.95rem] leading-relaxed text-ink-800 dark:text-ink-100">
                {product.description}
              </p>
            </div>
          </Section>
        )}
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <Section title={t("Specification")}>
          <dl className="card px-5 py-2">
            {attrs.length
              ? attrs.map(([k, v]) => (
                  <Callout key={k} label={dimensionLabel(k, t)} value={dimensionValue(k, v)}
                    code={isIdentifier(k)} />
                ))
              : <p className="py-2 text-sm text-ink-400">{t("Nothing extracted for this article.")}</p>}
          </dl>
        </Section>
        <Section title={t("Classification")}>
          <dl className="card px-5 py-2">
            <Callout label="ECLASS" value={product.eclass ?? "—"} code />
            <Callout label={t("MDR class")} value={product.mdrClass} />
            <Callout label={t("Unit")} value={product.uom} />
            <Callout label={t("Pack size")} value={String(product.packSize)} />
          </dl>
        </Section>
      </div>

      <PreviousReplacements rows={replacements} />
    </div>
  );
}

/** Price, or the honest absence of one — against what the line costs today. */
async function PriceCard({ product, line, saving }: {
  product: NonNullable<ReturnType<typeof productDetail>>;
  line: ReturnType<typeof hospitalLine>;
  saving: number | null;
}) {
  const { t, locale } = await getPrefs();
  // The line's own currency is not carried by hospitalLine; its price is read
  // in the product's, as the saving beside it already assumes.
  if (product.basePrice == null) {
    return (
      <div className="card px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="label">{t("Direct price")}</span>
          <span className="font-bold text-ink-700 dark:text-ink-100">{t("Not published")}</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-300">
          {t("{manufacturer}'s catalogue carried no prices, and the platform does not estimate them. The product is matchable; a quote follows once the manufacturer sets a price.", { manufacturer: product.manufacturer })}
        </p>
      </div>
    );
  }
  const annual = line?.currentPrice != null
    ? <Money amount={(line.currentPrice - product.basePrice) * line.annualVolume * (line.packSize || 1)}
        from={product.currency} digits={0} />
    : null;
  return (
    <Cells cols={3}>
      <div className="px-5 py-4">
        <div className="label">{t("Direct price")}</div>
        <div className="mt-1.5 text-[1.5rem] font-bold tracking-[-0.01em] leading-none tnum text-ink-950 dark:text-white">
          <Money amount={product.basePrice} from={product.currency} />
        </div>
        <div className="mt-1.5 text-xs text-ink-400">
          {product.priceOrigin === "catalogue" ? t("stated in the catalogue") : t("set by the manufacturer")}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="label">{t("You pay today")}</div>
        <div className="mt-1.5 text-[1.5rem] font-bold leading-none tnum text-ink-400">
          {line?.currentPrice != null
            ? <Money amount={line.currentPrice} from={product.currency}
                className="line-through decoration-ink-300 decoration-1" />
            : <span className="text-base font-semibold">{t("Not on file")}</span>}
        </div>
        <div className="mt-1.5 text-xs text-ink-400">{line ? t("for {line}", { line: line.name }) : t("no line to compare against")}</div>
      </div>
      <div className="px-5 py-4">
        <div className="label">{t("Saving")}</div>
        <div className="mt-1.5">
          {saving != null && saving > 0 ? <SavingsBadge pct={saving} /> : saving == null ? <SavingsBadge pct={null} /> : <span className="text-sm text-ink-500">{t("none — dearer than today")}</span>}
        </div>
        {saving != null && saving > 0 && line && line.currentPrice != null && (
          <div className="mt-1.5 text-xs text-ink-400 tnum">
            {pick(locale, <>about {annual} a year</>, <>rund {annual} pro Jahr</>)}
          </div>
        )}
      </div>
    </Cells>
  );
}

/**
 * The buyer's own line, as the head of the Open problems card: the article
 * this one would take the place of, drawn larger than the verdict beneath it,
 * since every point below is read against it.
 */
async function ReplacingLine({ line, recId, label }: {
  line: NonNullable<ReturnType<typeof hospitalLine>>; recId: string | null; label: string;
}) {
  const { t } = await getPrefs();
  return (
    <div className="border-b hair bg-gradient-to-r from-brand-50/70 via-brand-50/30 to-transparent px-5 py-4 dark:from-brand-500/10 dark:via-brand-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label">{label}</div>
          <p className="mt-1 text-[1.1rem] font-bold leading-snug tracking-[-0.01em] text-ink-950 dark:text-white">
            {line.name}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {t("From your article master")}{line.brand ? ` · ${line.brand}` : ""}
          </p>
        </div>
        {recId && (
          <Link href={`/hospital/recommendations/${recId}`} className={buttonClass("primary", "sm")}>
            {t("Continue to order")}
          </Link>
        )}
      </div>
      <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
        <Callout label={t("Annual volume")} value={`${num(line.annualVolume)} ${line.uom}`} />
        <Callout label={t("Bought via")} value={line.currentSupplier ?? "—"} />
        <Callout label={t("Pack")} value={line.packSize > 1 ? t("{n} per pack", { n: line.packSize }) : t("single")} />
        <Callout label={t("Declared class")} value={`MDR ${line.mdrClass}`} />
      </dl>
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
async function PreviousReplacements({ rows }: { rows: PastReplacement[] }) {
  const { t, locale } = await getPrefs();
  return (
    <Section title={t("Previous replacements")}>
      {rows.length === 0 ? (
        <Empty>{t("No replacement has been ordered on this product yet.")}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b hair text-left">
                {["Date", "Change", "Volume", "Supplier", "Status"].map((h) => <th key={h} className="label px-4 py-3">{t(h)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((r) => {
                const st = ORDER_STATE[r.status] ?? { label: r.status, mark: "open" as MarkKind };
                return (
                  <tr key={r.orderId}>
                    <td className="px-3 py-2.5 tnum text-ink-500">{new Date(r.createdAt).toLocaleDateString("de-CH")}</td>
                    <td className="px-3 py-2.5">
                      <Stamp tone={r.direction === "in" ? "brand" : "neutral"}>{r.direction === "in" ? t("Brought in") : t("Replaced")}</Stamp>
                      <span className="ml-2">
                        {r.direction === "in"
                          ? pick(locale,
                              <>replaced <span className="font-medium">{r.fromName}</span> on {r.itemName}</>,
                              <>ersetzte <span className="font-medium">{r.fromName}</span> bei {r.itemName}</>)
                          : pick(locale,
                              <>replaced by <span className="font-medium">{r.toName}</span></>,
                              <>ersetzt durch <span className="font-medium">{r.toName}</span></>)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tnum">{num(r.volume)}</td>
                    <td className="px-3 py-2.5 text-ink-600 dark:text-ink-200">{r.supplierName}</td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5"><Mark kind={st.mark} />{t(st.label)}</span></td>
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
