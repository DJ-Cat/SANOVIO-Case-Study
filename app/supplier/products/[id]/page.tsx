import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, Empty, RiskBadge, ConfidenceBar, chf, num, price } from "@/app/components/ui";
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
      lead={`${me.name} · article ${p.sku}${p.page ? ` · page ${p.page} of ${p.sourceFilename ?? "your catalogue"}` : ""}`}>

      {/* A row still in the review queue has no canonical product, so there is
          nothing yet to price or photograph. Say which step is missing rather
          than showing dead controls. */}
      {!p.canonicalId && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This row is still in your review queue at {p.confidence} extraction confidence, below
          the bar of {EXTRACTION_THRESHOLD}. Confirm it on the{" "}
          <Link href="/supplier" className="font-medium underline">catalogue page</Link> and it
          becomes a product hospitals can be matched against — then it can be priced and
          photographed here.
        </div>
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
          <div className="flex flex-wrap items-center gap-2">
            {p.mdrClass && <RiskBadge cls={p.mdrClass} />}
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">
              per {p.uom ?? "Stück"}{(p.packSize ?? 1) > 1 ? ` · ${p.packSize}/pack` : ""}
            </span>
            <span className="rounded-full bg-ink-50 px-2 py-0.5 font-mono text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">
              art. {p.sku}
            </span>
            {p.gtin && (
              <span className="rounded-full bg-ink-50 px-2 py-0.5 font-mono text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                GTIN {p.gtin}
              </span>
            )}
          </div>

          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
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
                <dl className="mt-3 space-y-1 text-sm tnum">
                  {tiers.map((t, i) => {
                    const next = tiers[i + 1];
                    return (
                      <div key={t.id} className="flex justify-between gap-4 border-b border-ink-50 pb-1 last:border-0 dark:border-ink-800">
                        <dt className="text-ink-500 dark:text-ink-300">
                          {next
                            ? `${num(t.min_volume)} – ${num(next.min_volume - 1)} ${p.uom ?? "units"}`
                            : `${num(t.min_volume)}+ ${p.uom ?? "units"}`}
                        </dt>
                        <dd className="font-medium">{p.currency} {chf(t.unit_price, 4)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
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
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                Specification
              </h2>
              <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(p.attributes).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-ink-50 pb-1 dark:border-ink-800">
                    <dt className="text-ink-400">{k.replace(/_/g, " ")}</dt>
                    <dd className="font-medium tnum">{String(v)}</dd>
                  </div>
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
