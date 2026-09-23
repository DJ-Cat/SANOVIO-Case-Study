"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  replacementStatusAction, rerunReplacementAction, withdrawReplacementAction,
  signOffPointAction, sendProblemAction, suggestionsPendingAction, orderReplacementAction,
} from "@/lib/actions";
import type { Orderability } from "@/lib/replacement";
import { price, num } from "./format";
import type { ReplacementView, ReplacementPointView, AnalysisStatus, SuggestionView } from "@/lib/queries";
import { Spinner } from "./OpenProblems";

const POLL_MS = 3000;

/**
 * Keeps a server-rendered page current while an analysis runs.
 *
 * Asks for the state only — a few bytes — and refreshes the page once it
 * changes, so the finished points arrive through the same render as
 * everything else instead of a second client-side copy of them.
 */
export function AnalysisPoller({ ids }: { ids: { id: string; status: AnalysisStatus }[] }) {
  const router = useRouter();
  const watching = ids.filter((i) => i.status === "pending" || i.status === "running");
  const key = watching.map((i) => `${i.id}:${i.status}`).join(",");

  useEffect(() => {
    if (!watching.length) return;
    let stopped = false;
    const t = setInterval(async () => {
      const now = await Promise.all(watching.map((i) => replacementStatusAction(i.id).catch(() => i.status)));
      if (!stopped && now.some((s, n) => s !== watching[n].status)) router.refresh();
    }, POLL_MS);
    return () => { stopped = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/**
 * While the suggestion pipeline is still working, re-render the page every
 * few seconds so matches and their analyses appear as they land, and stop
 * once it reports it is done.
 */
export function SuggestionsPoller({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let ticks = 0;
    const t = setInterval(async () => {
      ticks++;
      const still = await suggestionsPendingAction().catch(() => true);
      if (!still || ticks % 3 === 0) router.refresh();
      if (!still) clearInterval(t);
    }, POLL_MS + 1000);
    return () => clearInterval(t);
  }, [pending, router]);
  return null;
}

/**
 * The strip above a product's tabs once it has been chosen as a replacement:
 * which line it replaces, and where the analysis of that switch stands.
 */
export function ReplacementBanner({ view, problemsHref, orderability }: {
  view: ReplacementView; problemsHref: string; orderability?: Orderability | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { status, counts } = view;

  if (status === "pending" || status === "running") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3.5 dark:border-brand-500/30 dark:bg-brand-500/10"
        aria-live="polite">
        <Spinner small />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-brand-800 dark:text-brand-100">
            The match is being calculated
          </div>
          <p className="mt-0.5 text-brand-700/80 dark:text-brand-200/80">
            Replacing <span className="font-medium">{view.lineName}</span> — checking price,
            replaceability, safety and correctness. The points appear here when it is done.
          </p>
        </div>
        <AnalysisPoller ids={[{ id: view.id, status }]} />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        <div className="font-semibold">The match for {view.lineName} could not be calculated.</div>
        {view.error && <div className="mt-0.5 text-xs opacity-80">{view.error}</div>}
        <button disabled={pending} onClick={() => start(async () => {
            await rerunReplacementAction(view.id); router.refresh();
          })}
          className="mt-2 text-xs font-semibold underline disabled:opacity-40">
          {pending ? "Starting…" : "Try again"}
        </button>
      </div>
    );
  }

  const settled = counts.open === 0;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3.5 text-sm ${
      settled
        ? "border-good-100 bg-good-100/25 dark:border-good-500/40 dark:bg-good-500/10"
        : counts.blockingOpen
          ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/70 dark:bg-rose-950/20"
          : "border-ink-100 bg-white/70 dark:border-ink-800 dark:bg-ink-900/60"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          Chosen replacement for
        </div>
        <div className="truncate font-medium text-ink-900 dark:text-ink-50">{view.lineName}</div>
      </div>
      <div className="text-ink-600 dark:text-ink-200 tnum">
        {settled ? (
          <span className="font-semibold text-good-500 dark:text-good-100">
            {counts.total ? `All ${counts.total} points signed off` : "Nothing to settle"}
          </span>
        ) : (
          <>
            <span className="font-semibold">{counts.open}</span> open point{counts.open === 1 ? "" : "s"}
            {counts.blockingOpen > 0 && (
              <span className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {counts.blockingOpen} blocking
              </span>
            )}
            {counts.signedOff > 0 && <span className="text-ink-400"> · {counts.signedOff} signed off</span>}
          </>
        )}
      </div>
      <Link href={problemsHref}
        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-25 dark:border-ink-600 dark:text-ink-100 dark:hover:bg-ink-800">
        Review points →
      </Link>
      {orderability && <OrderControl view={view} o={orderability} />}
    </div>
  );
}

const ORDER_LABEL: Record<string, string> = {
  pending_clinical: "awaiting clinical sign-off",
  pending_approval: "awaiting budget approval",
  approved: "approved", pooled: "approved · in the pool",
  sanovio_fulfillment: "in fulfilment", fulfilled: "delivered",
};

/**
 * Ordering the chosen replacement: the button, why it is not available yet,
 * or where the order now stands. The order itself joins the ordinary §5
 * chain — clinical sign-off where required, then budget approval, then pool.
 */
function OrderControl({ view, o }: { view: ReplacementView; o: Orderability }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (o.order) {
    return (
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5 text-xs dark:border-ink-800">
        <span className="font-semibold text-brand-700 dark:text-brand-200">
          Ordered · {ORDER_LABEL[o.order.status] ?? o.order.status}
        </span>
        <Link href="/hospital/approvals" className="font-semibold text-brand-600 underline dark:text-brand-300">
          Open approvals →
        </Link>
      </div>
    );
  }

  const confirm = async () => {
    setBusy(true); setError(null);
    const res = await orderReplacementAction(view.id)
      .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setOpen(false);
    router.refresh();
  };

  const dearer = o.savingsPct != null && o.savingsPct < 0;
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5 dark:border-ink-800">
      <span className="min-w-0 text-xs text-ink-500 dark:text-ink-300">
        {o.canOrder
          ? `${o.currency} ${price(o.unitPrice!)} per unit · ${num(o.volume)} a year` +
            (o.savingsPct != null ? ` · ${dearer ? "+" : "−"}${Math.abs(o.savingsPct)}%` : "")
          : o.reasons[0]}
      </span>
      <button onClick={() => setOpen(true)} disabled={!o.canOrder}
        title={o.canOrder ? undefined : o.reasons.join(" ")}
        className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40">
        Order this replacement
      </button>
      {open && (
        <ConfirmDialog title="Order this replacement?" confirmLabel="Place order" busy={busy}
          onCancel={() => { setOpen(false); setError(null); }} onConfirm={confirm}
          body={<>
            <span className="block">
              {view.productName} replaces <span className="font-medium">{view.lineName}</span>,
              sourced direct from {o.supplierName ?? view.manufacturer}.
            </span>
            <span className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-ink-25 px-3 py-2.5 text-xs tnum dark:bg-ink-800">
              <span className="text-ink-400">Annual volume</span><span className="text-right">{num(o.volume)} units</span>
              <span className="text-ink-400">Unit price</span>
              <span className="text-right">{o.currency} {price(o.unitPrice!)} <span className="text-ink-400">at the pool&apos;s current tier</span></span>
              <span className="text-ink-400">Today</span><span className="text-right">{o.currency} {price(o.baseline!)}</span>
              <span className="text-ink-400">{dearer ? "Extra cost" : "Saving"} per year</span>
              <span className={`text-right font-semibold ${dearer ? "text-rose-700 dark:text-rose-300" : "text-good-500 dark:text-good-100"}`}>
                {o.currency} {num(Math.abs(o.annualSavings ?? 0))}
              </span>
            </span>
            <span className="mt-3 block text-xs">
              {o.requiresClinical
                ? "A change of article at this risk class goes to clinical sign-off first, then to budget approval."
                : "It goes to budget approval, then joins the pool."}
              {view.counts.open > 0 && ` ${view.counts.open} non-blocking point${view.counts.open === 1 ? " is" : "s are"} still open; they do not hold the order up.`}
            </span>
            {error && (
              <span className="mt-3 block rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </span>
            )}
          </>} />
      )}
    </div>
  );
}

const CATEGORY: Record<string, { label: string; blurb: string }> = {
  safety: { label: "Safety", blurb: "Risk class, sterility, materials, recalls" },
  replaceability: { label: "Replaceability", blurb: "Will it do the same job" },
  price: { label: "Price", blurb: "What the switch costs" },
  correctness: { label: "Correctness", blurb: "Can the data be trusted" },
  other: { label: "Other questions", blurb: "Raised before the replacement was chosen" },
};
const ORDER = ["safety", "replaceability", "price", "correctness", "other"];

/** The Open problems tab for a chosen replacement: the analysis, point by point. */
export function ReplacementPoints({ view, productName, canSend, readOnly = false, ordered = false }: {
  view: ReplacementView; productName: string; canSend: boolean;
  /** A suggestion's pre-calculated analysis: nothing is chosen, so nothing is signable. */
  readOnly?: boolean;
  /** Once ordered, the analysis is what the order was placed on; it is not re-run or withdrawn. */
  ordered?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  if (view.status === "pending" || view.status === "running") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Spinner />
        <p className="text-sm font-medium text-ink-600 dark:text-ink-200">
          Calculating the match against {view.lineName}
        </p>
        <p className="max-w-sm text-xs text-ink-400">
          Reading both specifications, the prices, and what the manufacturer publishes about
          this article.
        </p>
      </div>
    );
  }

  const groups = ORDER
    .map((key) => ({ key, points: view.points.filter((p) => (p.category ?? "other") === key) }))
    .filter((g) => g.points.length);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-ink-50 bg-white/70 px-4 py-3 dark:border-ink-800 dark:bg-ink-900/60">
        {view.status === "failed" ? (
          <p className="text-sm text-rose-700 dark:text-rose-300">
            The analysis failed{view.error ? `: ${view.error}` : "."}
          </p>
        ) : (
          <p className="text-sm text-ink-700 dark:text-ink-100">{view.summary}</p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
          {view.verdict && (
            <>
              <span className="font-medium uppercase tracking-wide">{view.verdict.replace("_", " ")}</span>
              <span>·</span><span className="tnum">{view.confidence}% confidence</span><span>·</span>
            </>
          )}
          {view.adapter && <span>{view.adapter}</span>}
          {view.webSearches > 0 && <><span>·</span><span className="tnum">{view.webSearches} web searches</span></>}
          {view.finishedAt && <><span>·</span><span>{new Date(view.finishedAt).toLocaleString("de-CH")}</span></>}
          {!readOnly && !ordered && <span className="ml-auto flex gap-3">
            <button disabled={pending} onClick={() => start(async () => {
                await rerunReplacementAction(view.id); router.refresh();
              })}
              className="font-semibold text-brand-600 underline disabled:opacity-40 dark:text-brand-300">
              Run again
            </button>
            <button disabled={pending} onClick={() => setWithdrawing(true)}
              className="font-semibold text-ink-500 underline disabled:opacity-40 dark:text-ink-300">
              Withdraw replacement
            </button>
          </span>}
        </p>
        {withdrawError && (
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{withdrawError}</p>
        )}
        {view.sources.length > 0 && (
          <details className="mt-2 text-[11px] text-ink-400">
            <summary className="cursor-pointer select-none">
              {view.sources.length} page{view.sources.length === 1 ? "" : "s"} consulted
            </summary>
            <ul className="mt-1.5 space-y-0.5">
              {view.sources.map((s) => (
                <li key={s.url} className="truncate">
                  <a href={s.url} target="_blank" rel="noreferrer noopener"
                    className="text-brand-600 hover:underline dark:text-brand-300">{s.title}</a>
                  <span className="ml-1.5 text-ink-300">{host(s.url)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {readOnly && view.points.length > 0 && (
        <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-800 dark:bg-brand-500/10 dark:text-brand-100">
          Calculated in advance, because this is the best match found for {view.lineName}. Choose{" "}
          <span className="font-semibold">Replace with this</span> to sign these points off or
          send them to {view.manufacturer} — the analysis is taken over as it is, not run again.
        </p>
      )}

      {view.points.length === 0 ? (
        <div className="rounded-xl border border-good-100 bg-good-100/25 px-4 py-6 text-center text-sm text-good-500 dark:border-good-500/40 dark:bg-good-500/10 dark:text-good-100">
          Nothing stands out. The analysis found no issue with this switch.
        </div>
      ) : (
        <>
          {view.counts.blockingOpen > 0 && (
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              {view.counts.blockingOpen} blocking — this replacement should not be ordered until
              they are signed off. A manufacturer&apos;s answer still needs your sign-off.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-300">
                {CATEGORY[g.key].label}
                <span className="font-normal normal-case tracking-normal text-ink-300">
                  {CATEGORY[g.key].blurb}
                </span>
              </h3>
              <ul className="mt-2 space-y-2.5">
                {g.points.map((p) => (
                  <Point key={p.id} p={p} productName={productName} canSend={canSend}
                    manufacturer={view.manufacturer} readOnly={readOnly}
                    onDone={() => router.refresh()} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {withdrawing && (
        <ConfirmDialog
          title="Withdraw this replacement?"
          body={<>{view.lineName} goes back to having no replacement. Points you signed off or
            sent stay on record; the rest of the analysis is discarded.</>}
          confirmLabel="Withdraw" danger
          onCancel={() => setWithdrawing(false)}
          onConfirm={async () => {
            const res = await withdrawReplacementAction(view.id);
            setWithdrawing(false);
            if (!res.ok) { setWithdrawError(res.message); return; }
            router.replace(`/hospital/products/${view.canonicalId}?item=${view.itemId}`);
            router.refresh();
          }} />
      )}
    </div>
  );
}

function Point({ p, productName, manufacturer, canSend, readOnly, onDone }: {
  p: ReplacementPointView; productName: string; manufacturer: string; canSend: boolean;
  readOnly: boolean; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const signedOff = p.status === "cleared";
  const blocking = p.severity === "blocking" && !signedOff;

  const act = (fn: (id: string) => Promise<void>) => {
    setBusy(true);
    fn(p.id).then(onDone).finally(() => { setBusy(false); setConfirming(false); });
  };

  return (
    <li className={`rounded-2xl border p-4 ${
      signedOff
        ? "border-ink-50 bg-ink-25/60 dark:border-ink-800 dark:bg-ink-900/30"
        : blocking
          ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/70 dark:bg-rose-950/20"
          : "border-ink-100 bg-white/70 dark:border-ink-800 dark:bg-ink-900/60"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={`min-w-0 flex-1 ${signedOff ? "opacity-70" : ""}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              p.severity === "blocking" && !signedOff
                ? "bg-rose-600 text-white"
                : "bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200"}`}>
              {p.severity === "blocking" ? "Blocking" : "For information"}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-ink-400">
              {p.routedTo === "supplier" ? "manufacturer can clarify" : "your decision"}
            </span>
            {p.sentAt && p.status !== "answered" && (
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                sent to {manufacturer}
              </span>
            )}
            {p.status === "answered" && (
              <span className="rounded bg-good-100/60 px-1.5 py-0.5 text-[10px] font-semibold text-good-500 dark:bg-good-500/15 dark:text-good-100">
                answered
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-900 dark:text-ink-50">{p.title ?? p.text}</p>
          {p.detail && (
            <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-200">{p.detail}</p>
          )}
          {p.sources.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
              {p.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" title={s.title}
                  className="text-brand-600 hover:underline dark:text-brand-300">
                  {host(s.url)} ↗
                </a>
              ))}
            </p>
          )}
          {p.answerText && (
            <p className="mt-2 rounded-lg bg-good-100/40 px-3 py-2 text-sm text-good-500 dark:bg-good-500/10 dark:text-good-100">
              <span className="font-semibold">{manufacturer}: </span>{p.answerText}
            </p>
          )}
          {signedOff && (
            <p className="mt-2 text-[11px] text-ink-400">
              Signed off{p.clearedBy ? ` by ${p.clearedBy}` : ""}
              {p.clearedAt ? ` · ${new Date(p.clearedAt).toLocaleString("de-CH")}` : ""}
            </p>
          )}
        </div>

        {!signedOff && !readOnly && (
          <div className="flex shrink-0 gap-2 sm:flex-col sm:gap-1.5">
            <button onClick={() => setConfirming(true)} disabled={busy}
              className="flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 sm:flex-none dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
              Sign off
            </button>
            <button onClick={() => act(sendProblemAction)}
              disabled={busy || Boolean(p.sentAt) || !canSend}
              title={!canSend ? "This product has no manufacturer on the platform to ask" : undefined}
              className="flex-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40 sm:flex-none">
              {p.sentAt ? "Sent" : "Send to supplier"}
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Sign off this point?"
          body={<>
            You are recording that the hospital accepts {productName} as a replacement despite
            this point. It stays on record with your name and the time, and is not sent to{" "}
            {manufacturer}.
            <span className="mt-3 block rounded-lg bg-ink-25 px-3 py-2 text-xs leading-relaxed text-ink-600 dark:bg-ink-800 dark:text-ink-200">
              {p.title ?? p.text}
            </span>
            {p.category === "safety" && (
              <span className="mt-3 block text-xs font-semibold text-rose-700 dark:text-rose-300">
                A safety point is recorded as the clinical sign-off, not the buyer&apos;s.
              </span>
            )}
          </>}
          confirmLabel="Yes, sign it off" busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => act(signOffPointAction)} />
      )}
    </li>
  );
}

function ConfirmDialog({ title, body, confirmLabel, danger = false, busy = false, onCancel, onConfirm }: {
  title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return createPortal((
    <div role="dialog" aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
        <h2 className="text-base font-semibold text-ink-950 dark:text-white">{title}</h2>
        <div className="mt-2 text-sm text-ink-500 dark:text-ink-300">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40 ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-500 hover:bg-brand-600"}`}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * The strip above a product that the suggestion pipeline matched to one of the
 * hospital's lines, before anyone chose it.
 */
export function SuggestionBanner({ view, problemsHref }: {
  view: SuggestionView; problemsHref: string;
}) {
  const a = view.analysis;
  const analysing = a?.status === "pending" || a?.status === "running";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3.5 text-sm dark:border-violet-500/30 dark:bg-violet-500/10">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-200">
          Suggested {view.relation === "identical" ? "as the same article" : "as a substitute"} for
        </div>
        <div className="truncate font-medium text-ink-900 dark:text-ink-50">{view.lineName}</div>
        <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-300">
          {view.confidence}% · {view.rationale}
        </p>
      </div>
      <div className="text-ink-600 dark:text-ink-200">
        {analysing ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <Spinner small /> Analysing the switch…
          </span>
        ) : a?.status === "done" ? (
          <span className="text-xs tnum">
            <span className="font-semibold">{a.counts.total}</span> point{a.counts.total === 1 ? "" : "s"}
            {a.counts.blockingOpen > 0 && (
              <span className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {a.counts.blockingOpen} blocking
              </span>
            )}
          </span>
        ) : null}
      </div>
      {a?.status === "done" && (
        <Link href={problemsHref}
          className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ink-700 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-white">
          See points →
        </Link>
      )}
      <SuggestionsPoller pending={analysing} />
    </div>
  );
}
