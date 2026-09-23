import Link from "next/link";
import { Page, Table, ConfidenceBar, RiskBadge, Empty, SubmitButton, chf, buttonClass } from "@/app/components/ui";
import { UploadForm } from "@/app/components/UploadForm";
import { Download, Trash } from "@/app/components/icons";
import { hospitalReviewQueue, thresholds, hospitalDocuments } from "@/lib/queries";
import {
  confirmLink, rejectLink, confirmExtraction, correctField,
  uploadHospitalDemandAction, deleteDocument,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

/**
 * Documents: what the hospital has uploaded, and what those uploads are still
 * waiting on a human for.
 *
 * Upload leads, because a file is where every row in this platform starts. The
 * queue below it is the same two gates as before — did we read the row, and is
 * it the article we think it is — held together on the page that owns the files
 * those rows came from.
 */
export default function HospitalDocuments() {
  const { lowExtraction, proposals } = hospitalReviewQueue();
  const { EXTRACTION_THRESHOLD, LINK_THRESHOLD } = thresholds();
  const docs = hospitalDocuments();
  const pending = lowExtraction.length + proposals.length;

  return (
    <Page title="Documents"
      lead="Your article master, as uploaded. The file is stored verbatim — extraction is re-runnable, and any savings claim can be traced back to the document it came from. Deleting a file removes everything read out of it.">

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <UploadForm
          action={uploadHospitalDemandAction}
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hint="Excel (.xlsx) or CSV — max ~25 MB" />

        <aside className="card space-y-3 p-5 text-sm">
          <h2 className="font-semibold text-ink-900 dark:text-ink-50">Columns we look for</h2>
          <ul className="space-y-1.5 text-xs text-ink-500 dark:text-ink-300">
            {[
              ["Artikelbezeichnung", "article description"],
              ["Marke / Hersteller", "brand"],
              ["Artikelnummer", "your internal article number"],
              ["Jahresmenge", "annual volume"],
              ["Bestellmengeneinheit", "order unit"],
              ["Basismengeneinheiten pro BME", "pack size"],
              ["GTIN / EAN", "identifiers — the free path to a match"],
              ["MDR-Klasse", "drives the substitution risk gate"],
              ["Netto-Zielpreis", "current unit price"],
            ].map(([de, en]) => (
              <li key={de}>
                <span className="font-medium text-ink-700 dark:text-ink-100">{de}</span>
                <span className="text-ink-400"> — {en}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-ink-50 pt-3 text-xs text-ink-400 dark:border-ink-800">
            Header matching is fuzzy and English equivalents work. Rows missing identifiers or a
            price still load — they land below, rather than being dropped.
          </p>
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">Uploaded files</h2>
        {docs.length === 0 ? (
          <Empty>Nothing uploaded yet. The platform starts empty.</Empty>
        ) : (
          <div className="card divide-y divide-ink-50 dark:divide-ink-800">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.filename}</div>
                  <div className="text-xs text-ink-400 tnum">
                    {new Date(d.uploaded_at).toLocaleString("de-CH")} · {kb(d.byte_size)} · {d.row_count} rows
                    {d.note ? ` · ${d.note}` : ""}
                  </div>
                </div>
                <a href={`/api/documents/${d.id}`} title="Download original"
                  className={buttonClass("ghost", "sm")}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
                <form action={deleteDocument.bind(null, d.id)}>
                  <button title="Delete file and every article read out of it"
                    className={buttonClass("danger", "sm")}>
                    <Trash className="h-3.5 w-3.5" /> Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Waiting for your approval
            {pending > 0 && (
              <span className="ml-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 align-middle text-[11px] font-bold text-amber-800 tnum dark:bg-amber-500/20 dark:text-amber-200">
                {pending}
              </span>
            )}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-400">
            Two separate gates. Extraction confidence below {EXTRACTION_THRESHOLD} means we may have
            misread the file. Link confidence below {LINK_THRESHOLD} means we read it fine but are
            not certain which product it is. Nothing here feeds matching or pricing until you clear it.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">
            Unconfirmed links — we have a candidate, below the {LINK_THRESHOLD} bar
          </h3>
          {proposals.length === 0
            ? <Empty>No unconfirmed links.</Empty>
            : (
              <div className="space-y-3">
                {proposals.map((p) => (
                  <div key={p.link_id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs text-ink-300">Your line · {p.extracted_brand} · art. {p.extracted_sku}</div>
                        <div className="font-medium">{p.extracted_name}</div>
                        <div className="mt-2 text-xs text-ink-300">Proposed match</div>
                        <div className="flex items-center gap-2">
                          <Link href={`/hospital/products/${p.candidate_id}`}
                            className="font-medium hover:text-brand-600 hover:underline dark:hover:text-brand-300">
                            {p.candidate_name}
                          </Link>
                          <RiskBadge cls={p.mdr_risk_class} />
                        </div>
                        <div className="text-xs text-ink-400">{p.candidate_maker}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <ConfidenceBar value={p.link_confidence} threshold={LINK_THRESHOLD} />
                        <div className="mt-1 text-[11px] text-ink-300">via {p.link_method}</div>
                      </div>
                    </div>
                    <p className="mt-3 border-l hair-strong pl-3 text-xs leading-relaxed text-ink-600 dark:text-ink-200">
                      {p.link_rationale}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <form action={confirmLink.bind(null, p.link_id)}>
                        <SubmitButton>Confirm — same article</SubmitButton>
                      </form>
                      <form action={rejectLink.bind(null, p.link_id)}>
                        <SubmitButton variant="danger">Not a match</SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="space-y-3">
          <h3 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">
            Low-confidence extractions — below {EXTRACTION_THRESHOLD}
          </h3>
          {lowExtraction.length === 0
            ? <Empty>Every uploaded row was read cleanly.</Empty>
            : (
              <Table head={["Article", "Confidence", "What is missing", "Correct & confirm"]}>
                {lowExtraction.map((r) => {
                  const missing: string[] = (() => {
                    try { return JSON.parse(r.raw_extraction_payload)?.missing ?? []; } catch { return []; }
                  })();
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium">{r.extracted_name}</div>
                        <div className="text-xs text-ink-400 tnum">
                          {r.extracted_brand} · {r.annual_volume} {r.extracted_order_uom} ·
                          CHF {chf(r.current_unit_price ?? 0, 3)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ConfidenceBar value={r.extraction_confidence} threshold={EXTRACTION_THRESHOLD} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {missing.length === 0
                            ? <span className="text-xs text-ink-300">—</span>
                            : missing.map((m: string) => (
                              <span key={m} className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] bg-amber-50 text-amber-800 dark:text-amber-200">{m}</span>
                            ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <form action={correctField} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="itemId" value={r.id} />
                          <input type="hidden" name="kind" value="hospital" />
                          <select name="field" className="rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-1.5 py-1 text-xs">
                            <option value="extracted_gtin">GTIN</option>
                            <option value="extracted_name">Name</option>
                            <option value="extracted_sku">Article no.</option>
                            <option value="current_unit_price">Unit price</option>
                            <option value="extracted_pack_size">Pack size</option>
                            <option value="declared_mdr_class">MDR class</option>
                          </select>
                          <input name="value" placeholder="value"
                            className="w-28 rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-1.5 py-1 text-xs" />
                          <SubmitButton variant="ghost">Save</SubmitButton>
                        </form>
                        <form action={confirmExtraction.bind(null, r.id, "hospital")} className="mt-1.5">
                          <button className="text-xs text-ink-400 underline hover:text-ink-800 dark:hover:text-ink-100">
                            Confirm as read
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
        </div>
      </section>
    </Page>
  );
}

const kb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
