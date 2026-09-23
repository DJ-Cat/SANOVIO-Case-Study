import { Page } from "@/app/components/ui";
import { UploadForm } from "@/app/components/UploadForm";
import { uploadSupplierCatalogueAction } from "@/lib/actions";
import { documents } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function SupplierUpload() {
  const { t } = await getPrefs();
  const me = await currentSupplier();
  const docs = documents().filter(
    (d) => d.kind === "supplier_catalogue" && d.organization_id === me?.id);

  return (
    <Page title={t("Upload catalogue")}
      lead={t("Your product catalogue, filed against {company}. A PDF is read by extract_lib — one record per table row, with the product photography attached. Rows that extract cleanly become canonical products other participants can be matched against; rows that do not go to your review queue rather than into the index.", { company: me?.name ?? t("your company") })}>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <UploadForm
          action={uploadSupplierCatalogueAction}
          accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hint={t("PDF, CSV or Excel — product tables keyed by article number")} />

        <aside className="card space-y-3 p-5 text-sm">
          <h2 className="font-semibold text-ink-900 dark:text-ink-50">{t("What happens on upload")}</h2>
          <ol className="space-y-2 text-xs text-ink-500 dark:text-ink-300">
            {STEPS.map(([head, body], i) => (
              <li key={head}><span className="font-medium text-ink-700 dark:text-ink-100">{i + 1}. {t(head)}</span> — {t(body)}</li>
            ))}
          </ol>
          <p className="border-t border-ink-50 pt-3 text-xs text-ink-400 dark:border-ink-800">
            {t("A PDF runs the full extractor and takes a few minutes; the page waits for it. Rows from a page whose output failed validation are held below the threshold on purpose — a value we could not confirm against the page is never guessed.")}
          </p>
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">{t("Uploaded catalogues")}</h2>
        {docs.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-400">
            {t("No catalogue uploaded yet.")}
          </div>
        ) : (
          <div className="card divide-y divide-ink-50 dark:divide-ink-800">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.filename}</div>
                  <div className="text-xs text-ink-400 tnum">
                    {new Date(d.uploaded_at).toLocaleString("de-CH")} · {kb(d.byte_size)} · {t(d.row_count === 1 ? "{n} row" : "{n} rows", { n: d.row_count })}
                    {d.note ? ` · ${d.note}` : ""}
                  </div>
                </div>
                <a href={`/api/documents/${d.id}`}
                  className="shrink-0 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                  {t("Download original")}
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}

/** The steps an upload goes through, as headed pairs. */
const STEPS: [string, string][] = [
  ["Figures", "every product photograph is cut from the page and kept with the SKU it depicts."],
  ["Extraction", "one record per table row, read from the page render and the text layer together."],
  ["Validation", "every part number is checked back against the page text. One that is not there is dropped, not guessed."],
  ["Canonical products", "accepted rows define product identity; your catalogue is the authority for your own articles."],
  ["Pricing", "a PDF carries no prices and none are invented. Set them under Pricing."],
];

const kb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
