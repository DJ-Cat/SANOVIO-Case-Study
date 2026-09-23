import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, Note, Empty, RiskBadge, ConfidenceBar, chf, num, Callout } from "@/app/components/ui";
import { dimensionLabel, dimensionValue, isIdentifier } from "@/app/components/format";
import { ProductPictures, ProductDescription } from "@/app/components/ProductEditor";
import { IdentityEditor } from "@/app/components/IdentityEditor";
import { TierEditor } from "@/app/components/TierEditor";
import { supplierProduct, productImages, productExposure, thresholds, tiersBySupplier } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";
import { getPrefs } from "@/lib/prefs";
import type { Translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * One article, as its own manufacturer sees it.
 *
 * The hospital-side product page is a read: it shows what the platform knows.
 * This one is the other half — the three things only the manufacturer can
 * supply, and which no amount of extraction will ever recover from a
 * catalogue PDF: what the article costs, what it actually looks like, and
 * what it is for. It is also where the manufacturer corrects the facts
 * extraction misread — class, unit, article number — with a warning first
 * wherever a hospital would read the change differently.
 */
export default async function SupplierProduct(
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getPrefs();
  const me = await currentSupplier();
  if (!me) return <Empty>{t("No manufacturer is signed in.")}</Empty>;

  const { id } = await params;
  const p = supplierProduct(id, me.id);
  if (!p) notFound();

  const images = p.canonicalId ? productImages(p.canonicalId) : [];
  const { EXTRACTION_THRESHOLD } = thresholds();
  const tiers = p.canonicalId ? (tiersBySupplier(me.id).get(p.canonicalId) ?? []) : [];

  return (
    <Page title={p.name ?? p.extractedName}
      lead={p.page ? t("Page {page} of {file}", { page: p.page, file: p.sourceFilename ?? t("your catalogue") }) : undefined}
      action={p.canonicalId && p.mdrClass ? (
        <IdentityEditor canonicalId={p.canonicalId} mdrClass={p.mdrClass} uom={p.uom ?? "Stück"}
          packSize={p.packSize ?? 1} sku={p.sku} exposure={productExposure(p.canonicalId)}
          priced={tiers.length > 0} currency={p.currency} basePrice={p.basePrice} />
      ) : undefined}
      fields={[
        ...(p.mdrClass ? [{ label: t("Risk class"), value: <RiskBadge cls={p.mdrClass} /> }] : []),
        { label: t("Unit"), value: <>{t("per {uom}", { uom: p.uom ?? "Stück" })}{(p.packSize ?? 1) > 1 ? <span className="text-ink-400"> · {t("{n} per pack", { n: p.packSize ?? 1 })}</span> : ""}</> },
        { label: t("Article no."), value: <span className="code text-[0.85rem]">{p.sku}</span> },
        ...(p.gtin ? [{ label: "GTIN", value: <span className="code text-[0.85rem]">{p.gtin}</span> }] : []),
      ]}>

      {/* A row still in the review queue has no canonical product, so there is
          nothing yet to price or photograph. Say which step is missing rather
          than showing dead controls. */}
      {!p.canonicalId && (
        <Note tone="warn" label={t("In review")}>
          {t("This row is still in your review queue at {confidence} extraction confidence, below the bar of {threshold}. Confirm it on the", { confidence: p.confidence, threshold: EXTRACTION_THRESHOLD })}{" "}
          <Link href="/supplier" className="font-medium underline">{t("catalogue page")}</Link>{" "}
          {t("and it becomes a product hospitals can be matched against — then it can be priced and photographed here.")}
        </Note>
      )}

      {/* The product first — picture, words, price, specification — and how
          the row was read off the catalogue last: it is where the page came
          from, not what a manufacturer comes here to change. */}
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <ProductPictures canonicalId={p.canonicalId} images={images} />

        <div className="min-w-0 space-y-5">
          {p.canonicalId && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
              <ProductDescription canonicalId={p.canonicalId} description={p.description} />

              <section className="card flex flex-col p-5">
                <h2 className="label">{t("Pricing")}</h2>
                {tiers.length === 0 ? (
                  <p className="mt-2 flex-1 text-sm text-ink-400">
                    {t("No price set. The product is listed and searchable, but no saving is claimed against it and a hospital cannot order it.")}
                  </p>
                ) : (
                  <div className="flex-1">
                    <p className="mt-1 text-xs text-ink-400">
                      {p.priceOrigin === "catalogue"
                        ? t("Stated in the catalogue you uploaded.")
                        : t("Set by you.")}
                    </p>
                    {/* In the currency it was quoted in: this is the ladder the
                        manufacturer edits, so it is never shown converted. */}
                    <dl className="mt-2">
                      {tiers.map((tier, i) => {
                        const next = tiers[i + 1];
                        return (
                          <Callout key={tier.id}
                            label={next
                              ? `${num(tier.min_volume)} – ${num(next.min_volume - 1)}`
                              : `${num(tier.min_volume)}+`}
                            value={`${p.currency} ${chf(tier.unit_price, 4)}`} />
                        );
                      })}
                    </dl>
                    <p className="mt-1 text-[11px] text-ink-400">{t("per {uom}, by quantity ordered", { uom: p.uom ?? t("unit") })}</p>
                  </div>
                )}
                <div className="mt-3">
                  <TierEditor canonicalId={p.canonicalId} productName={p.name ?? p.extractedName}
                    uom={p.uom ?? "Stück"} tiers={tiers} currency={p.currency} compact />
                </div>
              </section>
            </div>
          )}

          {Object.keys(p.attributes).length > 0 && (
            <section className="card p-5">
              <h2 className="label">
                {t("Specification")}
              </h2>
              <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
                {Object.entries(p.attributes).map(([k, v]) => (
                  <Callout key={k} label={dimensionLabel(k, t)} value={dimensionValue(k, v)} code={isIdentifier(k)} />
                ))}
              </dl>
            </section>
          )}

          <section className="card p-5">
            <h2 className="label">
              {t("As extracted from your catalogue")}
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              <Field label={t("Row read as")}>{p.extractedName}</Field>
              {p.spec && <Field label={t("Columns")}>{p.spec}</Field>}
              <Field label={t("Extraction")}>
                <ConfidenceBar value={p.confidence} threshold={EXTRACTION_THRESHOLD} />
              </Field>
              <Field label={t("Status")}>{statusWord(p.status, t)}</Field>
              {p.sourceDocumentId && (
                <Field label={t("Source")}>
                  <a href={`/api/documents/${p.sourceDocumentId}`}
                    className="text-brand-600 hover:underline dark:text-brand-300">
                    {p.sourceFilename}
                  </a>
                  {p.page ? `, ${t("page {page}", { page: p.page })}` : ""}
                </Field>
              )}
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

/** A catalogue row's status, as the reader's language names it. */
function statusWord(status: string, t: Translate): string {
  const known: Record<string, string> = { unchecked: "unchecked", active: "active", linked: "linked" };
  return known[status] ? t(known[status]) : status;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs text-ink-400">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
