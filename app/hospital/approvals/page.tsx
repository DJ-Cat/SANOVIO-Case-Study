import { Page, Empty, RiskBadge, TypeBadge, Stamp, Mark, SubmitButton, num } from "@/app/components/ui";
import { ordersForApproval } from "@/lib/queries";
import { approveOrder, rejectOrder, clinicalSignOff, lockPoolAndFulfil, markFulfilled } from "@/lib/actions";
import { Money } from "@/app/components/Prefs";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

const STAGES = ["pending_clinical", "pending_approval", "pooled", "sanovio_fulfillment", "fulfilled"];
const STAGE_LABEL: Record<string, string> = {
  pending_clinical: "Awaiting clinical sign-off",
  pending_approval: "Awaiting budget approval",
  approved: "Approved",
  pooled: "Awaiting placement",
  sanovio_fulfillment: "With SANOVIO fulfilment",
  fulfilled: "Fulfilled",
  rejected: "Rejected",
};

export default async function Approvals() {
  const { t } = await getPrefs();
  const orders = ordersForApproval();

  return (
    <Page title={t("Approvals & fulfilment")}
      lead={t("Budget approval and clinical sign-off are separate gates asking different questions. Identity matches skip the clinical gate entirely — there is no clinical decision in buying the same article through a different channel.")}>
      {orders.length === 0 ? <Empty>{t("No orders submitted yet.")}</Empty> : (
        <div className="space-y-3">
          {orders.map((o) => {
            const stageIdx = STAGES.indexOf(o.status);
            return (
              <div key={o.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={o.type} />
                      <RiskBadge cls={o.mdr_risk_class} />
                      {o.requires_clinical_review ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] bg-rose-50 text-rose-700 dark:text-rose-200">
                          {t("Clinical gate")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] bg-ink-50 text-ink-600 dark:text-ink-200">
                          {t("No clinical gate")}
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 font-bold text-ink-950 dark:text-white">{o.recommended_name}</div>
                    <div className="text-xs text-ink-400">
                      {t("replaces {name}", { name: o.item_name })} · {o.supplier_name} · {t("requested by {name}", { name: o.requested_by_name })}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-lg font-bold text-emerald-700 dark:text-emerald-300"><Money amount={o.savings_amount} from="CHF" digits={0} /></div>
                    <div className="text-xs text-ink-400 tnum">−{o.savings_pct}% · {t("{n} units", { n: num(o.volume) })}</div>
                  </div>
                </div>

                {/* The order's route as a stepper: passed stages ticked, the
                    current one lit in the brand's glow, the rest waiting. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ol className="flex flex-wrap items-center gap-1.5">
                    {STAGES.map((s, i) => {
                      const passed = o.status !== "rejected" && i < stageIdx;
                      const here = o.status !== "rejected" && i === stageIdx;
                      return (
                        <li key={s} aria-current={here ? "step" : undefined} className="flex items-center gap-1.5">
                          {i > 0 && <span aria-hidden className={`h-px w-3 ${passed || here ? "bg-brand-300" : "bg-ink-100 dark:bg-ink-700"}`} />}
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                            o.status === "rejected" ? "bg-ink-50 text-ink-300 line-through dark:bg-ink-800"
                            : here ? "bg-brand-50 text-brand-700 shadow-[0_0_0_1px_rgb(87_89_242/0.25),0_4px_14px_-4px_rgb(87_89_242/0.45)] dark:bg-brand-500/15 dark:text-brand-100"
                            : passed ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                            : "bg-ink-50 text-ink-400 dark:bg-ink-800 dark:text-ink-300"}`}>
                            {passed && <Mark kind="done" className="h-2 w-2" />}
                            {t(STAGE_LABEL[s])}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {o.status === "rejected" && (
                    <Stamp tone="danger">{t("Rejected")}{o.rejected_reason ? `: ${o.rejected_reason}` : ""}</Stamp>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {o.status === "pending_clinical" && (
                    <form action={clinicalSignOff.bind(null, o.id)}>
                      <SubmitButton variant="ghost">{t("Clinical sign-off (Dr. Marti)")}</SubmitButton>
                    </form>
                  )}
                  {o.status === "pending_approval" && (
                    <>
                      <form action={approveOrder.bind(null, o.id)}>
                        <SubmitButton variant="ghost">{t("Approve (D. Roth)")}</SubmitButton>
                      </form>
                      <form action={rejectOrder} className="flex items-center gap-1.5">
                        <input type="hidden" name="orderId" value={o.id} />
                        <input name="reason" placeholder={t("reason (optional)")}
                          className="w-40 rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-2 py-1 text-xs" />
                        <SubmitButton variant="danger">{t("Reject")}</SubmitButton>
                      </form>
                    </>
                  )}
                  {o.status === "pooled" && (
                    <form action={lockPoolAndFulfil.bind(null, o.id)}>
                      <SubmitButton variant="ghost">{t("Place with manufacturer")}</SubmitButton>
                    </form>
                  )}
                  {o.status === "sanovio_fulfillment" && (
                    <>
                      <span className="code rounded-lg bg-ink-50 px-2 py-1 text-xs dark:bg-ink-800">
                        {o.sanovio_fulfillment_ref}
                      </span>
                      <form action={markFulfilled.bind(null, o.id)}>
                        <SubmitButton variant="ghost">{t("Mark delivered")}</SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
