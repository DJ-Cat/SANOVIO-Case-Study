import Link from "next/link";
import { Page, Note, Table, ConfidenceBar, Empty, SubmitButton, Stat, DataSheet } from "@/app/components/ui";
import { Money } from "@/app/components/Prefs";
import { getPrefs } from "@/lib/prefs";
import type { Translate } from "@/lib/i18n";
import { supplierCatalogue, supplierReviewQueue, thresholds, primaryImages } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";
import { confirmExtraction, correctField } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  const { t } = await getPrefs();
  const active = await currentSupplier();
  if (!active) return <Empty>{t("No manufacturer is signed in.")}</Empty>;

  const unchecked = supplierReviewQueue(active.id);
  const catalogue = supplierCatalogue(active.id);
  const { EXTRACTION_THRESHOLD } = thresholds();
  const linked = catalogue.filter((c) => c.status === "linked").length;
  const shots = primaryImages(
    catalogue.map((c) => c.canonical_product_id).filter(Boolean) as string[]);
  const withImage = catalogue.filter((c) => shots.has(c.canonical_product_id)).length;

  return (
    <Page title={t("Catalogue")}
      lead={t("Catalogue uploaded and extracted. Rows below the extraction threshold surface at the top rather than being buried in a tab — a bad extraction must never silently produce a savings claim to a hospital.")}>

      <DataSheet>
        <Stat label={t("Catalogue rows")} value={String(catalogue.length)} />
        <Stat label={t("Linked to a canonical product")} value={String(linked)} />
        <Stat label={t("Needs review")} value={String(unchecked.length)} sub={t("below {threshold} extraction confidence", { threshold: EXTRACTION_THRESHOLD })} />
        <Stat label={t("With product image")} value={String(withImage)} sub={t("recovered from your catalogue PDF")} />
      </DataSheet>

      {unchecked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">
            {t("Needs review")}
          </h2>
          {unchecked[0].note && (
            <Note tone="warn" label={t("Extraction")}><span className="code text-[0.8rem]">{unchecked[0].filename}</span> — {unchecked[0].note}</Note>
          )}
          <Table head={[t("Row"), t("Confidence"), t("Missing"), t("Correct & confirm")]}>
            {unchecked.slice(0, 40).map((r) => {
              const missing: string[] = (() => {
                try { return JSON.parse(r.raw_extraction_payload)?.missing ?? []; } catch { return []; }
              })();
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{r.extracted_name}</div>
                    <div className="text-xs text-ink-400">{t("art.")} {r.extracted_sku} · {t("p.")}{JSON.parse(r.raw_extraction_payload ?? "{}").page ?? "?"}</div>
                  </td>
                  <td className="px-3 py-3"><ConfidenceBar value={r.extraction_confidence} threshold={EXTRACTION_THRESHOLD} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {missing.map((m: string) => (
                        <span key={m} className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] bg-amber-50 text-amber-800 dark:text-amber-200">{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <form action={correctField} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="itemId" value={r.id} />
                      <input type="hidden" name="kind" value="supplier" />
                      <select name="field" className="rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-1.5 py-1 text-xs">
                        <option value="extracted_spec">{t("Dimensions")}</option>
                        <option value="extracted_name">{t("Name")}</option>
                        <option value="extracted_gtin">GTIN</option>
                        <option value="extracted_pack_size">{t("Pack size")}</option>
                      </select>
                      <input name="value" placeholder={t("value")}
                        className="w-28 rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-1.5 py-1 text-xs" />
                      <SubmitButton variant="ghost">{t("Save")}</SubmitButton>
                    </form>
                    <form action={confirmExtraction.bind(null, r.id, "supplier")} className="mt-1.5">
                      <button className="text-xs text-ink-400 underline hover:text-ink-800 dark:hover:text-ink-100">{t("Confirm as read")}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
          {unchecked.length > 40 && (
            <p className="text-xs text-ink-300">{t("Showing {shown} of {total}.", { shown: 40, total: unchecked.length })}</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">{t("Catalogue")}</h2>
        {catalogue.length === 0 ? (
          <Empty>
            {t("No catalogue rows yet —")}{" "}
            <Link href="/supplier/upload" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              {t("upload a catalogue")}
            </Link>{" "}
            {t("and every row read out of it appears here.")}
          </Empty>
        ) : (
          <Table head={["", t("Article"), t("Art. no."), t("Price"), t("Extraction"), t("Status")]}>
            {catalogue.slice(0, 200).map((c) => (
              /* The whole row is a link target: a manufacturer opens this page
                 to find one article and fix its price or its picture. */
              <tr key={c.id} className="group transition hover:bg-ink-25/60 dark:hover:bg-ink-800/40">
                <td className="px-3 py-2">
                  <Thumb id={shots.get(c.canonical_product_id)} alt={c.extracted_name} t={t} />
                </td>
                <td className="max-w-md px-3 py-2">
                  <Link href={`/supplier/products/${c.id}`}
                    className="block truncate font-medium group-hover:text-brand-600 dark:group-hover:text-brand-300">
                    {c.canonical_name ?? c.extracted_name}
                  </Link>
                  {c.canonical_name && c.canonical_name !== c.extracted_name && (
                    <div className="truncate text-[11px] text-ink-400">{t("read as {name}", { name: c.extracted_name })}</div>
                  )}
                </td>
                <td className="px-3 py-2 code text-xs text-ink-400">{c.extracted_sku}</td>
                <td className="px-3 py-2 tnum">
                  {c.base_price != null
                    ? <Money amount={c.base_price} from={c.currency ?? "CHF"} className="font-medium" />
                    : <span className="text-xs text-amber-700 dark:text-amber-400">{t("no price")}</span>}
                </td>
                <td className="px-3 py-2"><ConfidenceBar value={c.extraction_confidence} threshold={EXTRACTION_THRESHOLD} /></td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] bg-ink-50 text-ink-600 dark:text-ink-200">{t(STATUS[c.status] ?? c.status)}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {catalogue.length > 200 && <p className="text-xs text-ink-300">{t("Showing {shown} of {total}.", { shown: 200, total: catalogue.length })}</p>}
      </section>
    </Page>
  );
}

/** A row's status word, as the reader's language names it. */
const STATUS: Record<string, string> = { unchecked: "unchecked", active: "active", linked: "linked" };

/** Catalogue thumbnail, or an empty frame so rows keep a constant height. */
function Thumb({ id, alt, t }: { id?: string; alt: string; t: Translate }) {
  return (
    <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border hair bg-white dark:bg-ink-800">
      {id ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/api/product-images/${id}`} alt={alt}
          className="h-full w-full object-contain p-0.5" />
      ) : (
        <span className="text-[11px] font-medium text-ink-400">{t("none")}</span>
      )}
    </div>
  );
}
