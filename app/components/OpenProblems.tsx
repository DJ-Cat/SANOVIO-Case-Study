"use client";

import { useEffect, useState, useTransition } from "react";
import { reviewProductAction, clearProblemAction, sendProblemAction } from "@/lib/actions";
import type { ComparisonResult, OpenProblem } from "@/lib/workflow";
import { Stamp, RevMark, Mark, Balloon } from "./marks";
import { buttonClass, DIALOG } from "./controls";

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
      <div className="panel flex flex-col items-center gap-3 py-14 text-center">
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
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 px-5 py-3.5 text-sm shadow-[0_0_0_1px_rgb(244_63_94/0.18)] dark:bg-rose-500/10">
        <Stamp tone="danger">Not run</Stamp>
        <div className="min-w-0 flex-1 text-ink-700 dark:text-ink-100">
          The comparison could not be run.
          <span className="block text-xs text-ink-400">{error}</span>
        </div>
        <button onClick={() => run(true)} className={buttonClass("ghost", "sm")}>Try again</button>
      </div>
    );
  }

  const problems = result?.problems ?? [];
  const blocking = problems.filter((p) => p.type === "blocking" && p.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <p className="px-5 py-4 text-sm leading-relaxed text-ink-700 dark:text-ink-100">{result?.summary}</p>
        <div className="flex flex-wrap items-stretch gap-y-1 border-t hair px-2 py-1.5 text-[12px] text-ink-700 dark:text-ink-100">
          <Cell label="Relation"><span className="capitalize">{result?.relation.replace("_", " ")}</span></Cell>
          <Cell label="Confidence"><span className="tnum">{result?.confidence} %</span></Cell>
          <Cell label="Analysed by">{result?.adapter}</Cell>
          <span className="ml-auto flex items-center gap-2 px-3 py-2">
            {running && <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-400"><Spinner small /> re-running</span>}
            <button onClick={() => run(true)} disabled={running} className={buttonClass("ghost", "sm")}>Run again</button>
          </span>
        </div>
      </div>

      {problems.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50/70 px-4 py-7 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <Mark kind="done" className="h-3.5 w-3.5" /> Nothing outstanding. Every attribute the platform holds for both articles agrees.
        </div>
      ) : (
        <div className="card overflow-hidden">
          {blocking > 0 && (
            <p className="flex items-center gap-2 border-b hair bg-rose-50/60 px-5 py-3 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
              <Stamp tone="solid-danger">{blocking} blocking</Stamp>
              This substitution cannot be ordered until they are resolved.
            </p>
          )}
          <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_8.5rem] gap-x-4 border-b hair px-5 py-3 md:grid">
            <span className="label">#</span><span className="label">Point</span>
            <span className="label">Status</span>
          </div>
          <ol className="divide-y divide-[var(--line)]">
            {problems.map((p, i) => (
              <Problem key={p.id} n={i + 1} p={p} productName={productName}
                onDone={() => startTransition(() => run(false))} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5">
      <span className="label block text-[11px]">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </span>
  );
}

/** One point: its number, what it says, where it stands, and what can be done with it. */
function Problem({ n, p, productName, onDone }: {
  n: number; p: OpenProblem; productName: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const answered = p.status === "answered";
  const blocking = p.type === "blocking" && !answered;
  const ph = answered ? { word: "Answered", tone: "brand" as const }
    : p.sentAt ? { word: "With manufacturer", tone: "brand" as const }
    : blocking ? { word: "Blocking", tone: "danger" as const }
    : { word: "Open", tone: "neutral" as const };

  const act = (fn: (id: string) => Promise<void>) => {
    setBusy(true);
    fn(p.id).then(onDone).finally(() => { setBusy(false); setConfirming(false); });
  };

  return (
    <li className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem] md:items-start`}>
      <span className="pt-0.5"><Balloon n={n} blocking={blocking} /></span>
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-100">{p.text}</p>
        <p className="mt-1 label">{p.routedTo === "supplier" ? "Manufacturer can answer" : "SANOVIO to resolve"}</p>
        {answered && p.answerText && (
          <div className="mt-2.5 rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-sm leading-relaxed text-ink-700 dark:bg-brand-500/10 dark:text-ink-100">
            <span className="mr-1.5 font-bold text-brand-700 dark:text-brand-200">Answer</span>{p.answerText}
          </div>
        )}
        <div className="mt-2 md:hidden"><Stamp tone={ph.tone}>{ph.word}</Stamp></div>
      </div>
      <span className="hidden pt-0.5 md:block"><Stamp tone={ph.tone}>{ph.word}</Stamp></span>

      {!answered ? (
        <div className="col-start-2 flex flex-wrap gap-2">
          <button onClick={() => setConfirming(true)} disabled={busy} className={buttonClass("ghost", "sm")}>
            Cleared
          </button>
          <button onClick={() => act(sendProblemAction)} disabled={busy || Boolean(p.sentAt) || p.routedTo !== "supplier"}
            title={p.routedTo !== "supplier" ? "Only SANOVIO can resolve this one" : undefined}
            className={buttonClass("ghost", "sm")}>
            {p.sentAt ? "Sent" : "Send to supplier"}
          </button>
        </div>
      ) : null}

      {confirming && (
        <Confirm
          n={n}
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

function Confirm({ n, question, blocking, productName, busy, onCancel, onConfirm }: {
  n: number; question: string; blocking: boolean; productName: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Clear this question?" className={DIALOG.scrim}>
      <div className={DIALOG.panel}>
        <h2 className={`${DIALOG.head} text-base font-semibold text-ink-950 dark:text-white`}>
          Clear this question?
        </h2>
        <div className={DIALOG.body}>
          <p>
            You are recording that it does not apply to {productName}. It leaves your worklist and
            is not sent to the manufacturer.
          </p>
          <p className="mt-3 flex gap-2.5 rounded-xl bg-ink-25 dark:bg-ink-800/60 px-3 py-2 text-xs leading-relaxed text-ink-700 dark:text-ink-100">
            <Balloon n={n} blocking={blocking} /><span>{question}</span>
          </p>
          {blocking && (
            <p className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
              This one is blocking. Clearing it removes the barrier to ordering.
            </p>
          )}
        </div>
        <div className={DIALOG.foot}>
          <button onClick={onCancel} disabled={busy} className={buttonClass("ghost")}>Keep it</button>
          <button onClick={onConfirm} disabled={busy} className={`${buttonClass("primary")} !bg-rose-600 hover:!bg-rose-700`}>
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
