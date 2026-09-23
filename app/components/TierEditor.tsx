"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { savePriceTiers } from "@/lib/actions";
import type { PriceTierRow } from "@/lib/queries";
import { chf, num } from "./format";
import { Plus, Trash } from "./icons";
import { usePrefs } from "./Prefs";

/**
 * A manufacturer's volume ladder, edited as a whole.
 *
 * A tier is entered as a floor — the quantity it starts at and the unit price
 * from there up — and the range it covers is derived from the next tier
 * rather than typed. Typing both ends invites a gap at 250–499 that no price
 * answers, and this way the ladder cannot express one.
 *
 * Always in the currency the product is quoted in, whatever the reader has
 * chosen to display: this is where the manufacturer states its price, and a
 * converted figure here would be a price it never set.
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
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`whitespace-nowrap rounded-xl bg-white font-semibold text-ink-700 shadow-[0_0_0_1px_var(--line-strong)] transition hover:text-brand-700 hover:shadow-[0_0_0_1px_var(--color-brand-200),0_4px_14px_-4px_rgb(87_89_242/0.30)] dark:bg-ink-900 dark:text-ink-100 ${
          compact ? "w-full px-3 py-1.5 text-xs" : "px-3 py-1.5 text-sm"}`}>
        {tiers.length ? t("Edit pricing") : t("Set pricing")}
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
  const { t } = usePrefs();
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
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[var(--sheet)] p-6 shadow-[0_0_0_1px_rgb(87_89_242/0.12),0_30px_80px_-20px_rgb(40_42_120/0.45)]">
        <h2 id={titleId} className="text-base font-semibold text-ink-950 dark:text-white">
          {t("Pricing")}
        </h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{productName}</p>
        <p className="mt-2 text-xs text-ink-400">
          {t("One row is one price per {uom}, charged from its quantity upwards. Leave it at a single row for a flat price, or add rows for volume breaks — each one ends where the next begins.", { uom })}
        </p>

        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="canonicalId" value={canonicalId} />

          <div className="label grid grid-cols-[1fr_1fr_2rem] gap-2">
            <span>{t("From (units)")}</span>
            <span>{t("Unit price ({currency})", { currency })}</span>
            <span />
          </div>

          {rows.map((d, i) => (
            <div key={d.key} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
              <input name="minVolume" inputMode="numeric" value={d.volume}
                onChange={(e) => set(d.key, "volume", e.target.value)}
                placeholder={i === 0 ? "0" : "250"} disabled={pending}
                className="w-full rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-2.5 py-1.5 text-sm tnum disabled:opacity-50" />
              <input name="unitPrice" inputMode="decimal" value={d.price}
                onChange={(e) => set(d.key, "price", e.target.value)}
                placeholder="0.00" disabled={pending}
                className="w-full rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-2.5 py-1.5 text-sm tnum disabled:opacity-50" />
              <button type="button" disabled={pending || rows.length === 1}
                onClick={() => setRows((r) => r.filter((x) => x.key !== d.key))}
                title={t("Remove this tier")}
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/10">
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button type="button" disabled={pending}
            onClick={() => setRows((r) => [...r, emptyDraft()])}
            className="inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-brand-600 transition hover:text-brand-700 disabled:opacity-40 dark:text-brand-300">
            <Plus className="h-3.5 w-3.5" /> {t("Add a tier")}
          </button>

          <Preview rows={ordered} currency={currency} uom={uom} />

          {duplicate && (
            <p className="text-xs text-rose-700 dark:text-rose-300">
              {t("Two tiers start at the same quantity. Each one needs its own floor.")}
            </p>
          )}
          {rising && !duplicate && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("A price rises with volume here. That is allowed — but check it is what you mean, because a hospital ordering more would pay more per unit.")}
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
              {t("Clear the price")}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white font-semibold text-ink-700 shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(20_21_40/0.04)] transition-all hover:text-brand-700 hover:shadow-[0_0_0_1px_var(--color-brand-200),0_4px_14px_-4px_rgb(87_89_242/0.30)] disabled:opacity-40 dark:bg-ink-900 dark:text-ink-100 px-4 py-2 text-sm">
                {t("Cancel")}
              </button>
              <button type="submit" disabled={pending || duplicate}
                className="inline-flex items-center justify-center gap-1.5 btn-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {pending ? t("Saving…") : t("Save pricing")}
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
  const { t } = usePrefs();
  const usable = rows.filter((r) => Number.isFinite(r.v) && Number.isFinite(r.p) && r.p > 0);
  if (!usable.length) {
    return (
      <p className="rounded-xl bg-ink-25 dark:bg-ink-800/60 px-3 py-2 text-xs text-ink-400">
        {t("No price yet. Saving like this leaves the product listed and matchable, but it cannot be quoted or ordered.")}
      </p>
    );
  }
  return (
    <dl className="space-y-1 rounded-xl bg-ink-25 dark:bg-ink-800/60 px-3 py-2.5 text-xs">
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
