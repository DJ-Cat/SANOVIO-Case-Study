import { Page, Table, Empty } from "@/app/components/ui";
import { documents } from "@/lib/queries";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function Documents() {
  const { t } = await getPrefs();
  const docs = documents();
  return (
    <Page title={t("Uploaded documents")}
      lead={t("Every uploaded file is stored verbatim. Extraction is re-runnable against the original, and a savings claim can always be traced back to the document it came from.")}>
      {docs.length === 0 ? <Empty>{t("No documents uploaded.")}</Empty> : (
        <Table head={[t("File"), t("Organisation"), t("Kind"), t("Rows"), t("Size"), t("Uploaded"), t("Original")]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-3 py-2.5">
                <div className="font-medium">{d.filename}</div>
                {d.note && <div className="text-xs text-amber-700 dark:text-amber-400">{d.note}</div>}
              </td>
              <td className="px-3 py-2.5 text-ink-500 dark:text-ink-300">{d.org_name}</td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] bg-ink-50 text-ink-600 dark:text-ink-200">
                  {d.kind === "hospital_demand" ? t("hospital demand") : t("supplier catalogue")}
                </span>
              </td>
              <td className="px-3 py-2.5 tnum">{d.row_count}</td>
              <td className="px-3 py-2.5 tnum text-ink-400">
                {d.byte_size > 1e6 ? `${(d.byte_size / 1e6).toFixed(1)} MB` : `${Math.round(d.byte_size / 1024)} KB`}
              </td>
              <td className="px-3 py-2.5 text-xs text-ink-400">{new Date(d.uploaded_at).toLocaleString("de-CH")}</td>
              <td className="px-3 py-2.5">
                <a href={`/api/documents/${d.id}`} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                  {t("Download")}
                </a>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
