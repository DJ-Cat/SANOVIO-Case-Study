"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { selectReplacementAction, type ReplaceOutcome } from "@/lib/actions";
import type { ReplacementOption } from "@/lib/queries";
import { Spinner } from "./OpenProblems";

/**
 * "Replace with this": the buyer names which of their own lines this product
 * is to replace.
 *
 * Confirming records the choice at once and starts the match analysis in the
 * background. The dialog says so, then hands the buyer back to the product
 * page — which now compares against the chosen line and shows the analysis
 * arriving — rather than holding them on a spinner for minutes.
 */
export function ReplaceWithThis({ canonicalId, productName, manufacturer, options, defaultItemId }: {
  canonicalId: string; productName: string; manufacturer: string;
  options: ReplacementOption[]; defaultItemId: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_14px_-6px_rgba(86,89,251,.6)] transition hover:bg-brand-600">
        <SwapIcon /> Replace with this
      </button>
      {open && (
        <Dialog canonicalId={canonicalId} productName={productName} manufacturer={manufacturer}
          options={options} defaultItemId={defaultItemId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

type Phase =
  | { kind: "choose" } | { kind: "saving" }
  | { kind: "calculating"; itemId: string; lineName: string }
  /** The suggestion pipeline had already analysed this pair; it was adopted as is. */
  | { kind: "ready"; itemId: string; lineName: string };

function Dialog({ canonicalId, productName, manufacturer, options, defaultItemId, onClose }: {
  canonicalId: string; productName: string; manufacturer: string;
  options: ReplacementOption[]; defaultItemId: string | null; onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const initial = options.find((o) => o.id === defaultItemId)?.id ?? "";
  const [itemId, setItemId] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);

  const chosen = options.find((o) => o.id === itemId) ?? null;
  const busy = phase.kind === "saving";

  // Back to the product page, now comparing against the line just chosen.
  const finish = (id: string, tab?: "problems") => {
    onClose();
    router.replace(`/hospital/products/${canonicalId}?item=${id}${tab ? `&tab=${tab}` : ""}`,
      { scroll: false });
    router.refresh();
  };

  useEffect(() => { selectRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (phase.kind === "calculating" || phase.kind === "ready") finish(phase.itemId); else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, phase]);

  // The notice is read, not acted on; it closes itself.
  useEffect(() => {
    if (phase.kind !== "calculating") return;
    const t = setTimeout(() => finish(phase.itemId), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const confirm = async () => {
    if (!chosen) return;
    setPhase({ kind: "saving" }); setError(null);
    const res: ReplaceOutcome = await selectReplacementAction(chosen.id, canonicalId)
      .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
    if (!res.ok) { setError(res.message); setPhase({ kind: "choose" }); return; }
    setPhase({ kind: res.precomputed ? "ready" : "calculating", itemId: chosen.id, lineName: chosen.name });
  };

  // Portalled for the reason TierEditor gives: a `.card` ancestor's
  // backdrop-filter would otherwise become the containing block of `fixed`.
  return createPortal((
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-100 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
        {phase.kind === "ready" ? (
          <div className="flex flex-col items-center py-4 text-center" aria-live="polite">
            <h2 id={titleId} className="text-base font-semibold text-ink-950 dark:text-white">
              The match is already calculated
            </h2>
            <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-300">
              {productName} is now the replacement for <span className="font-medium">{phase.lineName}</span>.
              It was analysed in advance when it was suggested, on the same data it has now, so its
              points are ready to sign off or send.
            </p>
            <button onClick={() => finish(phase.itemId, "problems")}
              className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
              Review the points
            </button>
          </div>
        ) : phase.kind === "calculating" ? (
          <div className="flex flex-col items-center py-4 text-center" aria-live="polite">
            <Spinner />
            <h2 id={titleId} className="mt-4 text-base font-semibold text-ink-950 dark:text-white">
              The match is being calculated
            </h2>
            <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-300">
              {productName} is now the replacement for <span className="font-medium">{phase.lineName}</span>.
              Price, replaceability, safety and correctness are being checked — this takes a minute
              or two.
            </p>
            <p className="mt-2 max-w-sm text-xs text-ink-400">
              The points it finds appear on this product page and in your catalogue as they land.
            </p>
            <button onClick={() => finish(phase.itemId)}
              className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
              Back to the product
            </button>
          </div>
        ) : (
          <>
            <h2 id={titleId} className="text-base font-semibold text-ink-950 dark:text-white">
              Replace with this
            </h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
              {productName} <span className="text-ink-400">· {manufacturer}</span>
            </p>

            {options.length === 0 ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Your catalogue is empty, so there is nothing to replace yet. Upload your article
                master under{" "}
                <Link href="/hospital/documents" className="font-semibold underline">Documents</Link> first.
              </p>
            ) : (
              <>
                <label htmlFor={`${titleId}-line`}
                  className="mt-5 block text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Which article from your catalogue does it replace?
                </label>
                <select id={`${titleId}-line`} ref={selectRef} value={itemId} disabled={busy}
                  onChange={(e) => setItemId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 disabled:opacity-50 dark:border-ink-600 dark:bg-ink-950 dark:text-ink-50">
                  <option value="" disabled>Choose an article…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}{o.detail ? ` — ${o.detail}` : ""}
                    </option>
                  ))}
                </select>

                {chosen && <ChoiceNote option={chosen} canonicalId={canonicalId} />}

                <p className="mt-4 text-xs leading-relaxed text-ink-400">
                  Confirming starts a match against that article: price, replaceability, safety and
                  correctness, looked up on the web where the catalogue data runs out. Each issue it
                  finds becomes a point you can sign off yourself or send to {manufacturer}.
                </p>
              </>
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} disabled={busy}
                className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
                Cancel
              </button>
              <button onClick={confirm} disabled={busy || !chosen}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40">
                {busy ? "Confirming…" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}

/** What confirming will do to this particular line, when it is not obvious. */
function ChoiceNote({ option, canonicalId }: { option: ReplacementOption; canonicalId: string }) {
  const current = option.currentReplacement;
  if (current && current.canonicalId === canonicalId) {
    return (
      <p className="mt-2 text-xs text-ink-500 dark:text-ink-300">
        This is already the chosen replacement for that line. Confirming changes nothing.
      </p>
    );
  }
  if (current) {
    return (
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        That line is already set to be replaced by <span className="font-semibold">{current.name}</span>.
        Confirming switches it to this product. Points you signed off or sent stay on record.
      </p>
    );
  }
  if (option.sameArticle) {
    return (
      <p className="mt-2 text-xs text-ink-500 dark:text-ink-300">
        This is the article that line already is — the switch is to buying it direct, not to a
        different product.
      </p>
    );
  }
  return null;
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M4 7h11m0 0-3-3m3 3-3 3M16 13H5m0 0 3-3m-3 3 3 3" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
