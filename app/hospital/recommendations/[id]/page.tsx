import { notFound } from "next/navigation";
import Link from "next/link";
import { Page, Section, Note, Stamp, Mark, Balloon, Callout, TypeBadge, RiskBadge, SavingsBadge, ConfidenceBar, num, SubmitButton, buttonClass } from "@/app/components/ui";
import { recommendation, questionsFor } from "@/lib/queries";
import { SUBSTITUTION_THRESHOLD } from "@/lib/matching/thresholds";
import { dismiss, startReplace, askQuestion, skipQuestion, submitOrder, sendProblemAction } from "@/lib/actions";
import { getPrefs } from "@/lib/prefs";
import { pick } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Stored in English, as the reason's identity; shown in the reader's language.
const DISMISS_REASONS = [
  "Price too close", "Wrong spec", "Don't trust supplier",
  "Already contracted", "Clinical objection", "Other",
];

const REC_STATUS: Record<string, string> = {
  new: "New", in_progress: "In progress", blocked: "Blocked", ordered: "Ordered", dismissed: "Dismissed",
};

export default async function RecommendationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, money, locale } = await getPrefs();
  const rec = recommendation(id);
  if (!rec) notFound();

  const questions = questionsFor(id);
  const openBlocking = questions.filter((q) => q.type === "blocking" && q.status === "open");
  const bar = SUBSTITUTION_THRESHOLD[rec.mdrClass];
  const canSubmit = openBlocking.length === 0 && rec.status !== "ordered";

  return (
    <Page title={rec.recommendedName}
      lead={t("Replacing {item}, currently bought via {supplier}.", { item: rec.itemName, supplier: String(rec.currentSupplier) })}
      fields={[
        { label: t("Kind"), value: <TypeBadge type={rec.type} /> },
        { label: t("Risk class"), value: <RiskBadge cls={rec.mdrClass} /> },
        { label: t("Status"), value: <span className="capitalize">{REC_STATUS[rec.status] ? t(REC_STATUS[rec.status]) : rec.status}</span> },
      ]}>

      {rec.requiresClinical && (
        <Note tone="warn" label={t("Clinical gate.")} mark={<Mark kind="waiting" className="h-3.5 w-3.5" />}>{t("Clinical sign-off is required before budget approval.")}</Note>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t("Saving")}>
          <dl className="card px-5 py-2">
            <Callout label={t("Per year")} value={money(rec.savingsAmount, rec.currency, 0)} />
            <Callout label={t("Per unit")} value={`${money(rec.baseline, rec.currency, 3)} → ${money(rec.offered, rec.currency, 3)}`} />
            <Callout label={t("Volume")} value={t("{n} units a year", { n: num(rec.volume) })} />
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <dt className="shrink-0 text-ink-500 dark:text-ink-300">{t("Band (§4)")}</dt>
              <dd><SavingsBadge pct={rec.savingsPct} /></dd>
            </div>
          </dl>
        </Section>

        <Section title={t("Why this match")}>
          <div className="card space-y-3 px-5 py-4 text-sm">
            <p className="leading-relaxed text-ink-700 dark:text-ink-100">{rec.rationale}</p>
            {rec.type === "substitution" && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500 dark:text-ink-300">
                {bar === null
                  ? <><Stamp tone="danger">{t("Class III")}</Stamp> {t("never auto-confirms, regardless of confidence (§2).")}</>
                  : <><ConfidenceBar value={rec.matchConfidence ?? 0} threshold={bar} /> {t("Class {cls} auto-confirm bar (§2)", { cls: rec.mdrClass })}</>}
              </div>
            )}
            {rec.differing.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="label mr-1">{t("Differs in")}</span>
                {rec.differing.map((d) => <Stamp key={d} tone="warn">{d}</Stamp>)}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Questions — the red gate. */}
      <Section title={t("Questions")} meta={`${t("{n} raised", { n: questions.length })} · ${t("{n} blocking open", { n: openBlocking.length })}`}>
        {openBlocking.length > 0 && (
          <Note tone="danger" label={t("Blocked.")} mark={<Mark kind="blocked" className="h-3.5 w-3.5" />}>
            {t(openBlocking.length > 1
              ? "Submission is blocked while {n} blocking questions remain open."
              : "Submission is blocked while {n} blocking question remains open.", { n: openBlocking.length })}
          </Note>
        )}
        <div className="card">
          <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_9rem_9rem] gap-x-4 border-b hair px-5 py-3 md:grid">
            <span className="label">#</span><span className="label">{t("Question")}</span>
            <span className="label">{t("Status")}</span><span className="label">{t("Date · by")}</span><span />
          </div>
          {questions.length === 0 && <div className="px-4 py-5 text-sm text-ink-400">{t("No questions raised.")}</div>}
          <ol className="divide-y divide-[var(--line)]">
          {questions.map((q, i) => {
            const open = q.status === "open";
            const blocking = q.type === "blocking" && open;
            const ph = q.status === "answered" ? { w: t("Answered"), t: "brand" as const }
              : q.status === "skipped" ? { w: t("Skipped"), t: "neutral" as const }
              : q.sent_at ? { w: t("With supplier"), t: "brand" as const }
              : blocking ? { w: t("Blocking"), t: "danger" as const } : { w: t("Open"), t: "neutral" as const };
            const at = q.sent_at ?? q.created_at;
            const by = q.answer_text ? (q.answered_by_name ?? rec.supplierName)
              : q.origin === "ai_drafted" ? t("matching engine") : t("you");
            return (
            <li key={q.id} className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 text-sm md:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_9rem_9rem] md:items-start`}>
              <span className="pt-0.5"><Balloon n={i + 1} blocking={blocking} /></span>
              <div className="min-w-0">
              <p className="leading-relaxed text-ink-800 dark:text-ink-100">{q.text}</p>
              <p className="label mt-1">{q.type === "blocking" ? t("Blocking") : t("Non-blocking")} · {t("to {name}", { name: q.routed_to === "supplier" ? rec.supplierName : "SANOVIO" })}</p>
              {q.answer_text && (
                <div className="mt-2.5 rounded-xl bg-brand-50/70 px-3.5 py-2.5 leading-relaxed text-ink-700 dark:bg-brand-500/10 dark:text-ink-100">
                  <span className="mr-1.5 font-bold text-brand-700 dark:text-brand-200">{q.answered_by_name ?? t("Supplier")}</span>{q.answer_text}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-400 md:hidden">
                <Stamp tone={ph.t}>{ph.w}</Stamp>
                <span className="code">{new Date(at).toLocaleDateString("de-CH")}</span><span>{by}</span>
              </div>
              </div>
              <span className="hidden pt-0.5 md:block"><Stamp tone={ph.t}>{ph.w}</Stamp></span>
              <span className="hidden text-[12px] leading-snug text-ink-500 md:block dark:text-ink-300">
                <span className="code block">{new Date(at).toLocaleDateString("de-CH")}</span>
                <span className="block truncate">{by}</span>
              </span>
              <div className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto md:flex-col md:items-start md:gap-1.5">
                {/* The manufacturer sees a question only once the hospital sends
                    it — a drafted one waits here until somebody decides to. */}
                {q.routed_to === "supplier" && q.status === "open" && (q.sent_at ? (
                  <Link href={`/hospital/messages?s=${rec.supplierId}`}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                    {t("Open in Messages")}
                  </Link>
                ) : (
                  <form action={sendProblemAction.bind(null, q.id)}>
                    <button className={buttonClass("ghost", "sm")}>{t("Send to supplier")}</button>
                  </form>
                ))}
                {q.status === "open" && q.type === "non_blocking" && (
                  <form action={skipQuestion.bind(null, q.id)}>
                    <button className={buttonClass("ghost", "sm")}>{t("Skip")}</button>
                  </form>
                )}
              </div>
            </li>
            );
          })}
          </ol>
        </div>

        <form action={askQuestion} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="recId" value={rec.id} />
          <label className="min-w-0 flex-1 text-xs text-ink-400">
            {t("Ask {name} — it goes straight to your chat with them", { name: rec.supplierName })}
            <input name="text" required placeholder={t("e.g. Is the sterile barrier identical?")}
              className="mt-1 w-full rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-3 py-1.5 text-sm text-ink-900 dark:text-ink-50" />
          </label>
          <label className="text-xs text-ink-400">
            {t("Type")}
            <select name="type" className="mt-1 block rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-2 py-1.5 text-sm">
              <option value="non_blocking">{t("Non-blocking")}</option>
              <option value="blocking">{t("Blocking")}</option>
            </select>
          </label>
          <SubmitButton variant="ghost">{t("Ask")}</SubmitButton>
        </form>
      </Section>

      {/* Actions */}
      <section className="card space-y-4 p-6">
        <h2 className="text-[1.02rem] font-bold text-ink-950 dark:text-white">{t("Decision")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {rec.status === "new" && (
            <form action={startReplace.bind(null, rec.id)}>
              <SubmitButton>{t("Replace this item")}</SubmitButton>
            </form>
          )}
          <form action={submitOrder.bind(null, rec.id)}>
            {/* One gradient: replacing comes first while the row is new. */}
            <SubmitButton variant={rec.status === "new" ? "ghost" : "primary"} disabled={!canSubmit}>
              {rec.requiresClinical ? t("Submit for clinical review") : t("Submit for approval")}
            </SubmitButton>
          </form>
          {rec.status === "ordered" && (
            <span className="text-sm text-ink-400">
              {pick(locale,
                <>Submitted — see <Link href="/hospital/approvals" className="underline">Approvals</Link>.</>,
                <>Eingereicht — siehe <Link href="/hospital/approvals" className="underline">Freigaben</Link>.</>)}
            </span>
          )}
        </div>

        {rec.status !== "ordered" && (
          <div className="border-t hair pt-3">
            <div className="text-xs text-ink-400">{t("Dismiss — moves to Suggested, never deleted. Reason optional.")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DISMISS_REASONS.map((reason) => (
                <form key={reason} action={dismiss.bind(null, rec.id, reason)}>
                  <button className={buttonClass("ghost", "sm")}>{t(reason)}</button>
                </form>
              ))}
              <form action={dismiss.bind(null, rec.id, null)}>
                <button className="px-2.5 py-1 text-xs text-ink-400 underline hover:text-ink-800 dark:hover:text-ink-100">
                  {t("Skip — dismiss without a reason")}
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}
