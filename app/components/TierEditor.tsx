"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { savePriceTiers } from "@/lib/actions";
import type { PriceTierRow } from "@/lib/queries";
import { chf, num } from "./format";
import { Plus, Trash } from "./icons";

/**
 * A manufacturer's volume ladder, edited as a whole.
 *
 * A tier is entered as a floor — the quantity it starts at and the unit price
 * from there up — and the range it covers is derived from the next tier
 * rather than typed. Typing both ends invites a gap at 250–499 that no price
 * answers, and this way the ladder cannot express one.
 */

interface Draft { key: string; volume: string; price: string }

let seq = 0;
const draftFrom = (t: PriceTierRow): Draft =>
  ({ key: t.id, volume: String(t.min_volume), price: String(t.unit_price) });
const emptyDraft = (): Draft => ({ key: `new-${++seq}`, volume: "", price: "" });

export function TierEditor({ canonicalId, productName, uom, tiers, currency = "CHF", compact }: {
  canonicalId: string; productName: string; uom: string;
  tiers: PriceTierRow[]; currency?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`whitespace-nowrap rounded-lg border border-ink-200 font-medium text-ink-600 transition hover:bg-ink-25 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800 ${
          compact ? "w-full px-3 py-1.5 text-xs" : "px-3 py-1.5 text-sm"}`}>
        {tiers.length ? "Edit pricing" : "Set pricing"}
      </button>
      {open && (
        <Dialog canonicalId={canonicalId} productName={productName} uom={uom}
          tiers={tiers} currency={currency} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function Dialog({ canonicalId, productName, uom, tiers, currency, onClose }: {
  canonicalId: string; productName: string; uom: string;
  tiers: PriceTierRow[]; currency: string; onClose: () => void;
}) {
  const [state, action, pending] = useActionState(savePriceTiers, null);
  const [rows, setRows] = useState<Draft[]>(
    tiers.length ? tiers.map(draftFrom) : [{ ...emptyDraft(), volume: "0" }]);
  const titleId = useId();

  // Escape closes, and the save that succeeded closes with it — the table
  // behind is already showing the new ladder by then.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);

  const set = (key: string, field: "volume" | "price", value: string) =>
    setRows((r) => r.map((d) => (d.key === key ? { ...d, [field]: value } : d)));

  // Sorted only for the preview: the rows stay where the user put them while
  // typing, and the ladder is read in quantity order regardless.
  const parsed = rows
    .map((d) => ({ ...d, v: Number(d.volume.replace(/[^\d-]/g, "")), p: Number(d.price.replace(",", ".")) }))
    .filter((d) => d.volume.trim() !== "" || d.price.trim() !== "");
  const ordered = [...parsed].sort((a, b) => a.v - b.v);
  const duplicate = new Set(ordered.map((d) => d.v)).size !== ordered.length;
  const rising = ordered.some((d, i) => i > 0 && d.p > ordered[i - 1].p);

  /**
   * Portalled to the body, not rendered in place.
   *
   * `.card` carries `backdrop-blur`, and a backdrop-filter makes its element
   * the containing block for `position: fixed` descendants. Rendered inline,
   * the overlay was therefore trapped inside whichever card the button sits
   * in — visible, but with the page painting over it and swallowing the
   * clicks. Only reached after a click, so there is no server render to guard.
   */
  return createPortal((
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-100 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
        <h2 id={titleId} className="text-base font-semibold text-ink-950 dark:text-white">
          Pricing
        </h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{productName}</p>
        <p className="mt-2 text-xs text-ink-400">
          One row is one price per {uom}, charged from its quantity upwards. Leave it at a single
          row for a flat price, or add rows for volume breaks — each one ends where the next
          begins.
        </p>

        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="canonicalId" value={canonicalId} />

          <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-400">
            <span>From (units)</span>
            <span>Unit price ({currency})</span>
            <span />
          </div>

          {rows.map((d, i) => (
            <div key={d.key} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
              <input name="minVolume" inputMode="numeric" value={d.volume}
                onChange={(e) => set(d.key, "volume", e.target.value)}
                placeholder={i === 0 ? "0" : "250"} disabled={pending}
                className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm tnum disabled:opacity-50 dark:border-ink-600 dark:bg-ink-950" />
              <input name="unitPrice" inputMode="decimal" value={d.price}
                onChange={(e) => set(d.key, "price", e.target.value)}
                placeholder="0.00" disabled={pending}
                className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm tnum disabled:opacity-50 dark:border-ink-600 dark:bg-ink-950" />
              <button type="button" disabled={pending || rows.length === 1}
                onClick={() => setRows((r) => r.filter((x) => x.key !== d.key))}
                title="Remove this tier"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-950/40">
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button type="button" disabled={pending}
            onClick={() => setRows((r) => [...r, emptyDraft()])}
            className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-brand-600 transition hover:text-brand-700 disabled:opacity-40 dark:text-brand-300">
            <Plus className="h-3.5 w-3.5" /> Add a tier
          </button>

          <Preview rows={ordered} currency={currency} uom={uom} />

          {duplicate && (
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Two tiers start at the same quantity. Each one needs its own floor.
            </p>
          )}
          {rising && !duplicate && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              A price rises with volume here. That is allowed — but check it is what you mean,
              because a hospital ordering more would pay more per unit.
            </p>
          )}
          {state && !state.ok && (
            <p className="text-xs text-rose-700 dark:text-rose-300">{state.message}</p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-ink-50 pt-4 dark:border-ink-800">
            {/* Removing every row is a real choice — an unpriced product is
                listed and matchable, just not quotable — so it is reachable
                rather than blocked by the one-row minimum above. */}
            <button type="button" disabled={pending}
              onClick={() => setRows([{ ...emptyDraft(), volume: "", price: "" }])}
              className="text-xs text-ink-400 underline transition hover:text-rose-600 disabled:opacity-40">
              Clear the price
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={pending}
                className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
                Cancel
              </button>
              <button type="submit" disabled={pending || duplicate}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">
                {pending ? "Saving…" : "Save pricing"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  ), document.body);
}

/** The ladder as a hospital will read it, from what is typed so far. */
function Preview({ rows, currency, uom }: {
  rows: { v: number; p: number }[]; currency: string; uom: string;
}) {
  const usable = rows.filter((r) => Number.isFinite(r.v) && Number.isFinite(r.p) && r.p > 0);
  if (!usable.length) {
    return (
      <p className="rounded-lg bg-ink-25 px-3 py-2 text-xs text-ink-400 dark:bg-ink-800/60">
        No price yet. Saving like this leaves the product listed and matchable, but it cannot be
        quoted or ordered.
      </p>
    );
  }
  return (
    <dl className="space-y-1 rounded-lg bg-ink-25 px-3 py-2.5 text-xs dark:bg-ink-800/60">
      {usable.map((r, i) => {
        const next = usable[i + 1];
        const from = i === 0 ? 0 : r.v;
        return (
          <div key={`${r.v}-${i}`} className="flex justify-between gap-4">
            <dt className="text-ink-500 dark:text-ink-300 tnum">
              {next ? `${num(from)} – ${num(next.v - 1)}` : `${num(from)}+`} {uom}
            </dt>
            <dd className="font-medium tnum">{currency} {chf(r.p, 4)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
