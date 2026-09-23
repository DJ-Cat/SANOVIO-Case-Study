import { notFound } from "next/navigation";
import Link from "next/link";
import { Page, TypeBadge, RiskBadge, SavingsBadge, chf, num, SubmitButton } from "@/app/components/ui";
import { recommendation, questionsFor } from "@/lib/queries";
import { SUBSTITUTION_THRESHOLD } from "@/lib/matching/thresholds";
import { dismiss, startReplace, askQuestion, skipQuestion, submitOrder, sendProblemAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const DISMISS_REASONS = [
  "Price too close", "Wrong spec", "Don't trust supplier",
  "Already contracted", "Clinical objection", "Other",
];

export default async function RecommendationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = recommendation(id);
  if (!rec) notFound();

  const questions = questionsFor(id);
  const openBlocking = questions.filter((q) => q.type === "blocking" && q.status === "open");
  const bar = SUBSTITUTION_THRESHOLD[rec.mdrClass];
  const canSubmit = openBlocking.length === 0 && rec.status !== "ordered";

  return (
    <Page title={rec.recommendedName}
      lead={`Replacing ${rec.itemName}, currently bought via ${rec.currentSupplier}.`}>

      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={rec.type} />
        <RiskBadge cls={rec.mdrClass} />
        <span className="rounded bg-ink-50 px-2 py-0.5 text-xs text-ink-500 dark:bg-ink-800 dark:text-ink-300">
          status: {rec.status}
        </span>
        {rec.requiresClinical && (
          <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            Clinical sign-off required before approval
          </span>
        )}
      </div>

      <div>
        <div className="card space-y-3 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-400">Annual saving</div>
              <div className="mt-1 text-3xl font-semibold tnum">CHF {num(rec.savingsAmount)}</div>
              <div className="mt-1 text-sm text-ink-400 tnum">
                CHF {chf(rec.baseline, 3)} → {chf(rec.offered, 3)} per unit · {num(rec.volume)} units/year
              </div>
            </div>
            <SavingsBadge pct={rec.savingsPct} />
          </div>

          <div className="border-t border-ink-50 pt-3 text-sm dark:border-ink-800">
            <div className="text-xs uppercase tracking-wide text-ink-400">Why this match</div>
            <p className="mt-1 text-ink-600 dark:text-ink-200">{rec.rationale}</p>
            {rec.type === "substitution" && (
              <p className="mt-2 text-xs text-ink-400">
                Equivalence confidence <strong className="tnum">{rec.matchConfidence}</strong>
                {bar === null
                  ? " · Class III never auto-confirms, regardless of confidence (§2)."
                  : ` · Class ${rec.mdrClass} auto-confirm bar is ${bar} (§2).`}
              </p>
            )}
            {rec.differing.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {rec.differing.map((d) => (
                  <li key={d} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>

      {/* Questions — the red gate */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Questions</h2>
        {openBlocking.length > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Submission is blocked while {openBlocking.length} blocking question
            {openBlocking.length > 1 ? "s remain" : " remains"} open.
          </div>
        )}
        <div className="card divide-y divide-ink-50 dark:divide-ink-800">
          {questions.length === 0 && <div className="p-4 text-sm text-ink-400">No questions raised.</div>}
          {questions.map((q) => (
            <div key={q.id} className="space-y-1.5 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  q.type === "blocking"
                    ? "bg-red-600 text-white"
                    : "bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-300"}`}>
                  {q.type === "blocking" ? "Blocking" : "Non-blocking"}
                </span>
                <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-400 dark:bg-ink-800">
                  → {q.routed_to === "supplier" ? "supplier" : "SANOVIO"}
                </span>
                {q.origin === "ai_drafted" && (
                  <span className="text-[11px] text-ink-300">drafted by the matching engine</span>
                )}
                <span className="ml-auto text-[11px] text-ink-300">{q.status}</span>
              </div>
              <p className="text-ink-800 dark:text-ink-100">{q.text}</p>
              {q.answer_text && (
                <p className="rounded-lg bg-ink-25 p-2 text-ink-500 dark:bg-ink-800/60 dark:text-ink-200">
                  <strong className="text-ink-800 dark:text-ink-50">{q.answered_by_name ?? "Supplier"}:</strong> {q.answer_text}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {/* The manufacturer sees a question only once the hospital sends
                    it — a drafted one waits here until somebody decides to. */}
                {q.routed_to === "supplier" && q.status === "open" && (q.sent_at ? (
                  <Link href={`/hospital/messages?s=${rec.supplierId}`}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                    Sent to {rec.supplierName} · open in Messages →
                  </Link>
                ) : (
                  <form action={sendProblemAction.bind(null, q.id)}>
                    <button className="rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-600">
                      Send to {rec.supplierName}
                    </button>
                  </form>
                ))}
                {q.status === "open" && q.type === "non_blocking" && (
                  <form action={skipQuestion.bind(null, q.id)}>
                    <button className="text-xs text-ink-400 underline hover:text-ink-800 dark:hover:text-ink-100">Skip</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>

        <form action={askQuestion} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="recId" value={rec.id} />
          <label className="min-w-0 flex-1 text-xs text-ink-400">
            Ask {rec.supplierName} — it goes straight to your chat with them
            <input name="text" required placeholder="e.g. Is the sterile barrier identical?"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-900 dark:border-ink-600 dark:bg-ink-950 dark:text-ink-50" />
          </label>
          <label className="text-xs text-ink-400">
            Type
            <select name="type" className="mt-1 block rounded-lg border border-ink-200 px-2 py-1.5 text-sm dark:border-ink-600 dark:bg-ink-950">
              <option value="non_blocking">Non-blocking</option>
              <option value="blocking">Blocking</option>
            </select>
          </label>
          <SubmitButton variant="ghost">Ask</SubmitButton>
        </form>
      </section>

      {/* Actions */}
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Decision</h2>
        <div className="flex flex-wrap items-center gap-2">
          {rec.status === "new" && (
            <form action={startReplace.bind(null, rec.id)}>
              <SubmitButton>Replace this item</SubmitButton>
            </form>
          )}
          <form action={submitOrder.bind(null, rec.id)}>
            <SubmitButton disabled={!canSubmit}>
              {rec.requiresClinical ? "Submit for clinical review" : "Submit for approval"}
            </SubmitButton>
          </form>
          {rec.status === "ordered" && (
            <span className="text-sm text-ink-400">Submitted — see <Link href="/hospital/approvals" className="underline">Approvals</Link>.</span>
          )}
        </div>

        {rec.status !== "ordered" && (
          <div className="border-t border-ink-50 pt-3 dark:border-ink-800">
            <div className="text-xs text-ink-400">Dismiss — moves to Suggested, never deleted. Reason optional.</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DISMISS_REASONS.map((reason) => (
                <form key={reason} action={dismiss.bind(null, rec.id, reason)}>
                  <button className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs transition hover:bg-ink-25 dark:border-ink-600 dark:hover:bg-ink-800">
                    {reason}
                  </button>
                </form>
              ))}
              <form action={dismiss.bind(null, rec.id, null)}>
                <button className="rounded-lg px-2.5 py-1 text-xs text-ink-400 underline hover:text-ink-800 dark:hover:text-ink-100">
                  Skip — dismiss without a reason
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}
