import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, Note, Empty, RiskBadge, ConfidenceBar, chf, num, price, Callout } from "@/app/components/ui";
import { dimensionLabel, dimensionValue, isIdentifier } from "@/app/components/format";
import { ProductEditor } from "@/app/components/ProductEditor";
import { TierEditor } from "@/app/components/TierEditor";
import { supplierProduct, productImages, thresholds, tiersBySupplier } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * One article, as its own manufacturer sees it.
 *
 * The hospital-side product page is a read: it shows what the platform knows.
 * This one is the other half — the three things only the manufacturer can
 * supply, and which no amount of extraction will ever recover from a
 * catalogue PDF: what the article costs, what it actually looks like, and
 * what it is for.
 */
export default async function SupplierProduct(
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await currentSupplier();
  if (!me) return <Empty>No manufacturer is signed in.</Empty>;

  const { id } = await params;
  const p = supplierProduct(id, me.id);
  if (!p) notFound();

  const images = p.canonicalId ? productImages(p.canonicalId) : [];
  const { EXTRACTION_THRESHOLD } = thresholds();
  const tiers = p.canonicalId ? (tiersBySupplier(me.id).get(p.canonicalId) ?? []) : [];

  return (
    <Page title={p.name ?? p.extractedName}
      lead={p.page ? `Page ${p.page} of ${p.sourceFilename ?? "your catalogue"}` : undefined}
      fields={[
        ...(p.mdrClass ? [{ label: "Risk class", value: <RiskBadge cls={p.mdrClass} /> }] : []),
        { label: "Unit", value: <>per {p.uom ?? "Stück"}{(p.packSize ?? 1) > 1 ? <span className="text-ink-400"> · {p.packSize} per pack</span> : ""}</> },
        { label: "Article no.", value: <span className="code text-[0.85rem]">{p.sku}</span> },
        ...(p.gtin ? [{ label: "GTIN", value: <span className="code text-[0.85rem]">{p.gtin}</span> }] : []),
      ]}>

      {/* A row still in the review queue has no canonical product, so there is
          nothing yet to price or photograph. Say which step is missing rather
          than showing dead controls. */}
      {!p.canonicalId && (
        <Note tone="warn" label="In review">
          This row is still in your review queue at {p.confidence} extraction confidence, below
          the bar of {EXTRACTION_THRESHOLD}. Confirm it on the{" "}
          <Link href="/supplier" className="font-medium underline">catalogue page</Link> and it
          becomes a product hospitals can be matched against — then it can be priced and
          photographed here.
        </Note>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <ProductEditor
            canonicalId={p.canonicalId}
            images={images}
            description={p.description}
          />
        </div>

        <div className="min-w-0 space-y-5">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="label">
                Pricing
              </h2>
              {p.canonicalId && (
                <TierEditor canonicalId={p.canonicalId} productName={p.name ?? p.extractedName}
                  uom={p.uom ?? "Stück"} tiers={tiers} currency={p.currency} />
              )}
            </div>
            {tiers.length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">
                No price set. The product is listed and searchable, but no saving is claimed
                against it and a hospital cannot order it.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-ink-400">
                  {p.priceOrigin === "catalogue"
                    ? "Stated in the catalogue you uploaded."
                    : "Set by you."}
                </p>
                <dl className="mt-2">
                  {tiers.map((t, i) => {
                    const next = tiers[i + 1];
                    return (
                      <Callout key={t.id}
                        label={next
                          ? `${num(t.min_volume)} – ${num(next.min_volume - 1)} ${p.uom ?? "units"}`
                          : `${num(t.min_volume)}+ ${p.uom ?? "units"}`}
                        value={`${p.currency} ${chf(t.unit_price, 4)}`} />
                    );
                  })}
                </dl>
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="label">
              As extracted from your catalogue
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              <Field label="Row read as">{p.extractedName}</Field>
              {p.spec && <Field label="Columns">{p.spec}</Field>}
              <Field label="Extraction">
                <ConfidenceBar value={p.confidence} threshold={EXTRACTION_THRESHOLD} />
              </Field>
              <Field label="Status">{p.status}</Field>
              {p.sourceDocumentId && (
                <Field label="Source">
                  <a href={`/api/documents/${p.sourceDocumentId}`}
                    className="text-brand-600 hover:underline dark:text-brand-300">
                    {p.sourceFilename}
                  </a>
                  {p.page ? `, page ${p.page}` : ""}
                </Field>
              )}
            </div>
          </section>

          {Object.keys(p.attributes).length > 0 && (
            <section className="card p-5">
              <h2 className="label">
                Specification
              </h2>
              <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
                {Object.entries(p.attributes).map(([k, v]) => (
                  <Callout key={k} label={dimensionLabel(k)} value={dimensionValue(k, v)} code={isIdentifier(k)} />
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs text-ink-400">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
