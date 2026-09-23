import { Page, Empty, RiskBadge, TypeBadge, SubmitButton, num } from "@/app/components/ui";
import { ordersForApproval } from "@/lib/queries";
import { approveOrder, rejectOrder, clinicalSignOff, lockPoolAndFulfil, markFulfilled } from "@/lib/actions";

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

export default function Approvals() {
  const orders = ordersForApproval();

  return (
    <Page title="Approvals & fulfilment"
      lead="Budget approval and clinical sign-off are separate gates asking different questions. Identity matches skip the clinical gate entirely — there is no clinical decision in buying the same article through a different channel.">
      {orders.length === 0 ? <Empty>No orders submitted yet.</Empty> : (
        <div className="space-y-3">
          {orders.map((o) => {
            const stageIdx = STAGES.indexOf(o.status);
            return (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={o.type} />
                      <RiskBadge cls={o.mdr_risk_class} />
                      {o.requires_clinical_review ? (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          Clinical gate
                        </span>
                      ) : (
                        <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-400 dark:bg-ink-800">
                          No clinical gate
                        </span>
                      )}
                    </div>
                    <div className="mt-2 font-medium">{o.recommended_name}</div>
                    <div className="text-xs text-ink-400">
                      replaces {o.item_name} · {o.supplier_name} · requested by {o.requested_by_name}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-lg font-semibold">CHF {num(o.savings_amount)}</div>
                    <div className="text-xs text-ink-400 tnum">−{o.savings_pct}% · {num(o.volume)} units</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {STAGES.map((s, i) => (
                    <span key={s} className={`rounded px-1.5 py-0.5 ${
                      o.status === "rejected" ? "bg-ink-50 text-ink-300 dark:bg-ink-800"
                      : i <= stageIdx ? "bg-ink-900 text-white dark:bg-ink-50 dark:text-ink-900"
                      : "bg-ink-50 text-ink-300 dark:bg-ink-800 dark:text-ink-500"}`}>
                      {STAGE_LABEL[s]}
                    </span>
                  ))}
                  {o.status === "rejected" && (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      Rejected{o.rejected_reason ? `: ${o.rejected_reason}` : ""}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {o.status === "pending_clinical" && (
                    <form action={clinicalSignOff.bind(null, o.id)}>
                      <SubmitButton>Clinical sign-off (Dr. Marti)</SubmitButton>
                    </form>
                  )}
                  {o.status === "pending_approval" && (
                    <>
                      <form action={approveOrder.bind(null, o.id)}>
                        <SubmitButton>Approve (D. Roth)</SubmitButton>
                      </form>
                      <form action={rejectOrder} className="flex items-center gap-1.5">
                        <input type="hidden" name="orderId" value={o.id} />
                        <input name="reason" placeholder="reason (optional)"
                          className="w-40 rounded-lg border border-ink-200 px-2 py-1 text-xs dark:border-ink-600 dark:bg-ink-950" />
                        <SubmitButton variant="danger">Reject</SubmitButton>
                      </form>
                    </>
                  )}
                  {o.status === "pooled" && (
                    <form action={lockPoolAndFulfil.bind(null, o.id)}>
                      <SubmitButton>Place with manufacturer</SubmitButton>
                    </form>
                  )}
                  {o.status === "sanovio_fulfillment" && (
                    <>
                      <span className="rounded bg-ink-50 px-2 py-1 font-mono text-xs dark:bg-ink-800">
                        {o.sanovio_fulfillment_ref}
                      </span>
                      <form action={markFulfilled.bind(null, o.id)}>
                        <SubmitButton variant="ghost">Mark delivered</SubmitButton>
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
