"use client";

import { useEffect, useState, useTransition } from "react";
import { reviewProductAction, clearProblemAction, sendProblemAction } from "@/lib/actions";
import type { ComparisonResult, OpenProblem } from "@/lib/workflow";

/**
 * The Open problems tab.
 *
 * The comparison runs on mount rather than during render, so the page paints
 * immediately and the wait is visible. It is cached on the (line, product)
 * pair server-side, so coming back here is a read.
 */
export function OpenProblems({ itemId, canonicalId, itemName, productName }: {
  itemId: string; canonicalId: string; itemName: string; productName: string;
}) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [, startTransition] = useTransition();

  const run = (force: boolean) => {
    setRunning(true); setError(null);
    reviewProductAction(itemId, canonicalId, force)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRunning(false));
  };

  useEffect(() => { run(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemId, canonicalId]);

  if (running && !result) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Spinner />
        <p className="text-sm font-medium text-ink-600 dark:text-ink-200">
          Comparing against {itemName}
        </p>
        <p className="max-w-sm text-xs text-ink-400">
          Reading both specifications and working out what would stop this substitution
          being signed off.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        <div className="font-medium">The comparison could not be run.</div>
        <div className="mt-0.5 text-xs opacity-80">{error}</div>
        <button onClick={() => run(true)} className="mt-2 text-xs font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  const problems = result?.problems ?? [];
  const blocking = problems.filter((p) => p.type === "blocking" && p.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-50 bg-white/70 px-4 py-3 dark:border-ink-800 dark:bg-ink-900/60">
        <p className="text-sm text-ink-700 dark:text-ink-100">{result?.summary}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
          <span className="font-medium uppercase tracking-wide">{result?.relation.replace("_", " ")}</span>
          <span>·</span><span className="tnum">{result?.confidence}% confidence</span>
          <span>·</span><span>{result?.adapter}</span>
          {running && <span className="ml-1 inline-flex items-center gap-1.5"><Spinner small /> re-running</span>}
          <button onClick={() => run(true)} disabled={running}
            className="ml-auto font-semibold text-brand-600 underline disabled:opacity-40 dark:text-brand-300">
            Run again
          </button>
        </p>
      </div>

      {problems.length === 0 ? (
        <div className="rounded-xl border border-good-100 bg-good-100/25 px-4 py-6 text-center text-sm text-good-500 dark:border-good-500/40 dark:bg-good-500/10 dark:text-good-100">
          Nothing outstanding. Every attribute the platform holds for both articles agrees.
        </div>
      ) : (
        <>
          {blocking > 0 && (
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              {blocking} blocking — this substitution cannot be ordered until they are resolved.
            </p>
          )}
          <ul className="space-y-2.5">
            {problems.map((p) => (
              <Problem key={p.id} p={p} productName={productName}
                onDone={() => startTransition(() => run(false))} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Problem({ p, productName, onDone }: {
  p: OpenProblem; productName: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const answered = p.status === "answered";

  const act = (fn: (id: string) => Promise<void>) => {
    setBusy(true);
    fn(p.id).then(onDone).finally(() => { setBusy(false); setConfirming(false); });
  };

  return (
    <li className={`rounded-2xl border p-4 ${
      p.type === "blocking"
        ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/70 dark:bg-rose-950/20"
        : "border-ink-100 bg-white/70 dark:border-ink-800 dark:bg-ink-900/60"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              p.type === "blocking"
                ? "bg-rose-600 text-white"
                : "bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-200"}`}>
              {p.type === "blocking" ? "Blocking" : "For information"}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-ink-400">
              {p.routedTo === "supplier" ? "manufacturer can answer" : "SANOVIO to resolve"}
            </span>
            {p.sentAt && (
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                sent
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-800 dark:text-ink-100">{p.text}</p>
          {answered && p.answerText && (
            <p className="mt-2 rounded-lg bg-good-100/40 px-3 py-2 text-sm text-good-500 dark:bg-good-500/10 dark:text-good-100">
              <span className="font-semibold">Answered: </span>{p.answerText}
            </p>
          )}
        </div>

        {!answered && (
          <div className="flex shrink-0 gap-2 sm:flex-col sm:gap-1.5">
            <button onClick={() => setConfirming(true)} disabled={busy}
              className="flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 sm:flex-none dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
              Cleared
            </button>
            <button onClick={() => act(sendProblemAction)} disabled={busy || Boolean(p.sentAt) || p.routedTo !== "supplier"}
              title={p.routedTo !== "supplier" ? "Only SANOVIO can resolve this one" : undefined}
              className="flex-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40 sm:flex-none">
              {p.sentAt ? "Sent" : "Send to supplier"}
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <Confirm
          question={p.text}
          blocking={p.type === "blocking"}
          productName={productName}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => act(clearProblemAction)} />
      )}
    </li>
  );
}

function Confirm({ question, blocking, productName, busy, onCancel, onConfirm }: {
  question: string; blocking: boolean; productName: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
        <h2 className="text-base font-semibold text-ink-950 dark:text-white">
          Clear this question?
        </h2>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-300">
          You are recording that it does not apply to {productName}. It leaves your worklist and
          is not sent to the manufacturer.
        </p>
        <p className="mt-3 rounded-lg bg-ink-25 px-3 py-2 text-xs leading-relaxed text-ink-600 dark:bg-ink-800 dark:text-ink-200">
          {question}
        </p>
        {blocking && (
          <p className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
            This one is blocking. Clearing it removes the barrier to ordering.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
            Keep it
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-40">
            {busy ? "Clearing…" : "Yes, clear it"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Circular progress. Honours prefers-reduced-motion by holding still. */
export function Spinner({ small = false }: { small?: boolean }) {
  const s = small ? "h-3.5 w-3.5" : "h-9 w-9";
  return (
    <svg className={`${s} animate-spin motion-reduce:animate-none`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.5"
        className="text-ink-100 dark:text-ink-700" />
      <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" className="text-brand-500" />
    </svg>
  );
}
