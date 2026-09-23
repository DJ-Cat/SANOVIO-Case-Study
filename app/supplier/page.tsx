import Link from "next/link";
import { Page, Table, ConfidenceBar, Empty, SubmitButton, Stat, price } from "@/app/components/ui";
import { supplierCatalogue, supplierReviewQueue, thresholds, primaryImages } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";
import { confirmExtraction, correctField } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  const active = await currentSupplier();
  if (!active) return <Empty>No manufacturer is signed in.</Empty>;

  const unchecked = supplierReviewQueue(active.id);
  const catalogue = supplierCatalogue(active.id);
  const { EXTRACTION_THRESHOLD } = thresholds();
  const linked = catalogue.filter((c) => c.status === "linked").length;
  const shots = primaryImages(
    catalogue.map((c) => c.canonical_product_id).filter(Boolean) as string[]);
  const withImage = catalogue.filter((c) => shots.has(c.canonical_product_id)).length;

  return (
    <Page title="Catalogue"
      lead="Catalogue uploaded and extracted. Rows below the extraction threshold surface at the top rather than being buried in a tab — a bad extraction must never silently produce a savings claim to a hospital.">

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Catalogue rows" value={String(catalogue.length)} />
        <Stat label="Linked to a canonical product" value={String(linked)} />
        <Stat label="Needs review" value={String(unchecked.length)} sub={`below ${EXTRACTION_THRESHOLD} extraction confidence`} />
        <Stat label="With product image" value={String(withImage)} sub="recovered from your catalogue PDF" />
      </div>

      {unchecked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Needs review
          </h2>
          {unchecked[0].note && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {unchecked[0].filename}: {unchecked[0].note}
            </p>
          )}
          <Table head={["Row", "Confidence", "Missing", "Correct & confirm"]}>
            {unchecked.slice(0, 40).map((r) => {
              const missing: string[] = (() => {
                try { return JSON.parse(r.raw_extraction_payload)?.missing ?? []; } catch { return []; }
              })();
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{r.extracted_name}</div>
                    <div className="text-xs text-ink-400">art. {r.extracted_sku} · p.{JSON.parse(r.raw_extraction_payload ?? "{}").page ?? "?"}</div>
                  </td>
                  <td className="px-3 py-3"><ConfidenceBar value={r.extraction_confidence} threshold={EXTRACTION_THRESHOLD} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {missing.map((m: string) => (
                        <span key={m} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <form action={correctField} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="itemId" value={r.id} />
                      <input type="hidden" name="kind" value="supplier" />
                      <select name="field" className="rounded border border-ink-200 px-1.5 py-1 text-xs dark:border-ink-600 dark:bg-ink-950">
                        <option value="extracted_spec">Dimensions</option>
                        <option value="extracted_name">Name</option>
                        <option value="extracted_gtin">GTIN</option>
                        <option value="extracted_pack_size">Pack size</option>
                      </select>
                      <input name="value" placeholder="value"
                        className="w-28 rounded border border-ink-200 px-1.5 py-1 text-xs dark:border-ink-600 dark:bg-ink-950" />
                      <SubmitButton variant="ghost">Save</SubmitButton>
                    </form>
                    <form action={confirmExtraction.bind(null, r.id, "supplier")} className="mt-1.5">
                      <button className="text-xs text-ink-400 underline hover:text-ink-800 dark:hover:text-ink-100">Confirm as read</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
          {unchecked.length > 40 && (
            <p className="text-xs text-ink-300">Showing 40 of {unchecked.length}.</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Catalogue</h2>
        {catalogue.length === 0 ? (
          <Empty>
            No catalogue rows yet —{" "}
            <Link href="/supplier/upload" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              upload a catalogue
            </Link>{" "}
            and every row read out of it appears here.
          </Empty>
        ) : (
          <Table head={["", "Article", "Art. no.", "Price", "Extraction", "Status"]}>
            {catalogue.slice(0, 200).map((c) => (
              /* The whole row is a link target: a manufacturer opens this page
                 to find one article and fix its price or its picture. */
              <tr key={c.id} className="group transition hover:bg-brand-50/40 dark:hover:bg-brand-500/5">
                <td className="px-3 py-2">
                  <Thumb id={shots.get(c.canonical_product_id)} alt={c.extracted_name} />
                </td>
                <td className="max-w-md px-3 py-2">
                  <Link href={`/supplier/products/${c.id}`}
                    className="block truncate font-medium group-hover:text-brand-600 dark:group-hover:text-brand-300">
                    {c.canonical_name ?? c.extracted_name}
                  </Link>
                  {c.canonical_name && c.canonical_name !== c.extracted_name && (
                    <div className="truncate text-[11px] text-ink-300">read as {c.extracted_name}</div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-400">{c.extracted_sku}</td>
                <td className="px-3 py-2 tnum">
                  {c.base_price != null
                    ? <span className="font-medium">{c.currency ?? "CHF"} {price(c.base_price)}</span>
                    : <span className="text-xs text-amber-700 dark:text-amber-400">no price</span>}
                </td>
                <td className="px-3 py-2"><ConfidenceBar value={c.extraction_confidence} threshold={EXTRACTION_THRESHOLD} /></td>
                <td className="px-3 py-2">
                  <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">{c.status}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {catalogue.length > 200 && <p className="text-xs text-ink-300">Showing 200 of {catalogue.length}.</p>}
      </section>
    </Page>
  );
}

/** Catalogue thumbnail, or an empty frame so rows keep a constant height. */
function Thumb({ id, alt }: { id?: string; alt: string }) {
  return (
    <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-ink-50 bg-white dark:border-ink-700 dark:bg-ink-800">
      {id ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/api/product-images/${id}`} alt={alt}
          className="h-full w-full object-contain p-0.5" />
      ) : (
        <span className="text-[9px] uppercase tracking-wide text-ink-300">none</span>
      )}
    </div>
  );
}
