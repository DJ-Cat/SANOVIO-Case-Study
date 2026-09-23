"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { saveProductIdentity } from "@/lib/actions";
import type { ProductExposure } from "@/lib/queries";
import { buttonClass } from "./controls";
import { price } from "./format";
import { usePrefs } from "./Prefs";
import type { Translate } from "@/lib/i18n";

/**
 * The manufacturer correcting the facts a hospital reads first: risk class,
 * unit and article number.
 *
 * Each of them is load-bearing somewhere a buyer cannot see. The class
 * decides whether switching needs clinical sign-off; every price on the
 * product is per unit; hospitals find the article by its number. So a change
 * that would read differently on the hospital side is spelled out before it
 * is saved, with how many hospital lines it reaches — and saving it anyway
 * takes a second, deliberate click.
 */

type Cls = "I" | "IIa" | "IIb" | "III";
const CLASSES: Cls[] = ["I", "IIa", "IIb", "III"];
const CLINICAL = new Set<Cls>(["IIb", "III"]);
const UNITS = ["Stück", "Packung", "Box", "Karton", "Paar", "Set", "Beutel", "Rolle"];

interface Values { mdrClass: Cls; uom: string; packSize: string; sku: string }

export function IdentityEditor(props: {
  canonicalId: string; mdrClass: Cls; uom: string; packSize: number; sku: string;
  exposure: ProductExposure; priced: boolean; currency: string; basePrice: number | null;
}) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost")}>
        {t("Edit details")}
      </button>
      {open && <Dialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ canonicalId, mdrClass, uom, packSize, sku, exposure, priced, currency, basePrice, onClose }:
  Parameters<typeof IdentityEditor>[0] & { onClose: () => void }) {
  const { t } = usePrefs();
  const [state, action, pending] = useActionState(saveProductIdentity, null);
  const [v, setV] = useState<Values>({ mdrClass, uom, packSize: String(packSize), sku });
  // The warnings, once shown, have to be answered before anything is saved.
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  useEffect(() => { if (state && !state.ok) setConfirming(false); }, [state]);

  const set = (k: keyof Values, value: string) => {
    setConfirming(false);
    setV((d) => ({ ...d, [k]: value }));
  };

  const warnings = warningsFor(
    { mdrClass, uom, packSize, sku },
    { ...v, packSize: Math.round(Number(v.packSize)) || packSize },
    exposure, priced, currency, basePrice, t);
  const unchanged = v.mdrClass === mdrClass && v.uom.trim() === uom
    && Number(v.packSize) === packSize && v.sku.trim() === sku;

  const input = "w-full rounded-lg border hair-strong bg-[var(--sheet)] outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 px-2.5 py-1.5 text-sm disabled:opacity-50";

  // Portalled for the same reason as the pricing dialog: `.card`'s
  // backdrop-filter would otherwise trap a fixed overlay inside it.
  return createPortal((
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[var(--sheet)] p-6 shadow-[0_0_0_1px_rgb(87_89_242/0.12),0_30px_80px_-20px_rgb(40_42_120/0.45)]">
        <h2 id={titleId} className="text-base font-semibold text-ink-950 dark:text-white">
          {confirming ? t("Hospitals will read this differently") : t("Product details")}
        </h2>
        <p className="mt-1 text-xs text-ink-400">
          {confirming
            ? t("Check each point below is what you mean before saving.")
            : t("Correct what extraction read wrong. Every change is kept in the correction log with its old value.")}
        </p>

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="canonicalId" value={canonicalId} />

          {/* Kept mounted while confirming so the form still posts every field. */}
          <div className={confirming ? "hidden" : "space-y-4"}>
            <div>
              <span className="label block">{t("Risk class")}</span>
              <div className="mt-1.5 inline-flex gap-1 rounded-xl bg-ink-50 p-1 dark:bg-ink-900" role="radiogroup">
                {CLASSES.map((c) => (
                  <label key={c} className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-sm transition ${
                    v.mdrClass === c
                      ? "bg-white font-bold text-ink-950 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_2px_8px_-2px_rgb(40_42_120/0.18)] dark:bg-ink-800 dark:text-white"
                      : "font-semibold text-ink-500 hover:text-ink-900 dark:text-ink-300"}`}>
                    <input type="radio" name="mdrClass" value={c} checked={v.mdrClass === c}
                      onChange={() => set("mdrClass", c)} disabled={pending} className="sr-only" />
                    MDR {c}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <label className="block">
                <span className="label block">{t("Unit — one price is per")}</span>
                <input name="uom" value={v.uom} list={`${titleId}-units`} disabled={pending}
                  onChange={(e) => set("uom", e.target.value)} className={`mt-1.5 ${input}`} />
                <datalist id={`${titleId}-units`}>
                  {UNITS.map((u) => <option key={u} value={u} />)}
                </datalist>
              </label>
              <label className="block">
                <span className="label block">{t("Per pack")}</span>
                <input name="packSize" inputMode="numeric" value={v.packSize} disabled={pending}
                  onChange={(e) => set("packSize", e.target.value.replace(/[^\d]/g, ""))}
                  className={`mt-1.5 tnum ${input}`} />
              </label>
            </div>

            <label className="block">
              <span className="label block">{t("Article no.")}</span>
              <input name="sku" value={v.sku} disabled={pending}
                onChange={(e) => set("sku", e.target.value)} className={`mt-1.5 code ${input}`} />
            </label>

            {warnings.length > 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-[0_0_0_1px_rgb(245_158_11/0.22)] dark:bg-amber-500/10 dark:text-amber-100">
                {t(warnings.length === 1
                  ? "This change affects what hospitals see — you will be shown how before it saves."
                  : "These {n} changes affect what hospitals see — you will be shown how before it saves.", { n: warnings.length })}
              </p>
            )}
          </div>

          {confirming && (
            <ul className="space-y-2.5">
              {warnings.map((w) => (
                <li key={w.title} className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${w.strong
                  ? "bg-rose-50 text-rose-900 shadow-[0_0_0_1px_rgb(244_63_94/0.20)] dark:bg-rose-500/10 dark:text-rose-100"
                  : "bg-amber-50 text-amber-900 shadow-[0_0_0_1px_rgb(245_158_11/0.22)] dark:bg-amber-500/10 dark:text-amber-100"}`}>
                  <span className="block font-bold">{w.title}</span>
                  {w.body}
                </li>
              ))}
            </ul>
          )}

          {state && !state.ok && (
            <p className="text-xs text-rose-700 dark:text-rose-300">{state.message}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-ink-50 pt-4 dark:border-ink-800">
            {confirming ? (
              <>
                <button type="button" onClick={() => setConfirming(false)} disabled={pending}
                  className={buttonClass("ghost")}>
                  {t("Go back")}
                </button>
                <button type="submit" disabled={pending} className={buttonClass("primary")}>
                  {pending ? t("Saving…") : t("Save anyway")}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} disabled={pending} className={buttonClass("ghost")}>
                  {t("Cancel")}
                </button>
                {warnings.length > 0 ? (
                  <button type="button" disabled={pending || unchanged}
                    onClick={() => setConfirming(true)} className={buttonClass("primary")}>
                    {t("Review changes")}
                  </button>
                ) : (
                  <button type="submit" disabled={pending || unchanged} className={buttonClass("primary")}>
                    {pending ? t("Saving…") : t("Save")}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  ), document.body);
}

interface Warning { title: string; body: string; strong?: boolean }

/**
 * What each change would do on the hospital side, in the words a
 * manufacturer can check. Only a change some hospital would actually read
 * differently is listed: correcting a product nobody has matched yet saves
 * straight away — except a lowered class, which is questioned whoever reads
 * it, and a new unit under an existing price, which changes what it costs.
 */
function warningsFor(
  before: { mdrClass: Cls; uom: string; packSize: number; sku: string },
  after: { mdrClass: Cls; uom: string; packSize: number; sku: string },
  x: ProductExposure, priced: boolean, currency: string, basePrice: number | null, t: Translate,
): Warning[] {
  const out: Warning[] = [];
  const lines = (n: number) => t(n === 1 ? "{n} hospital line" : "{n} hospital lines", { n });
  const seen = x.linked + x.suggested + x.chosen;
  const reach = seen === 0 ? ""
    : x.openOrders > 0
      ? t(x.openOrders === 1
          ? "It is in front of {lines} today, with {n} open order."
          : "It is in front of {lines} today, with {n} open orders.", { lines: lines(seen), n: x.openOrders })
      : t("It is in front of {lines} today.", { lines: lines(seen) });
  const join = (...parts: (string | false)[]) => parts.filter(Boolean).join(" ");
  const newUnit = after.uom.trim() || t("unit");

  if (after.mdrClass !== before.mdrClass
      && (seen > 0 || x.openOrders > 0 || CLASSES.indexOf(after.mdrClass) < CLASSES.indexOf(before.mdrClass))) {
    const up = CLASSES.indexOf(after.mdrClass) > CLASSES.indexOf(before.mdrClass);
    const gateOn = CLINICAL.has(after.mdrClass) && !CLINICAL.has(before.mdrClass);
    const gateOff = !CLINICAL.has(after.mdrClass) && CLINICAL.has(before.mdrClass);
    out.push({
      title: t("Risk class MDR {from} → MDR {to}", { from: before.mdrClass, to: after.mdrClass }),
      strong: !up || gateOff,
      body: join(
        gateOn && t("Switching to this becomes a clinical decision: new orders will need clinical sign-off before they can be approved."),
        gateOff && t("Hospitals will no longer need clinical sign-off to switch to it."),
        !up && t("A lower class than your catalogue stated is the change a hospital will question first — make sure it matches your declaration of conformity."),
        x.chosen > 0 && t("{lines} already chose it as a replacement; that analysis was made against MDR {cls} and will not re-run on its own.", { lines: lines(x.chosen), cls: before.mdrClass }),
        x.openOrders > 0 && t("Orders already placed keep the sign-off route they were placed with."),
        x.chosen === 0 && x.openOrders === 0 && reach,
      ),
    });
  }

  if (after.uom.trim() !== before.uom && (priced || seen > 0)) {
    out.push({
      title: t("Unit “{from}” → “{to}”", { from: before.uom, to: after.uom.trim() || "—" }),
      strong: priced,
      body: join(
        priced
          ? t("Your prices are not converted. A hospital will read {price} per {to} where it read it per {from} — if one is not the same as the other, change the pricing as well.", {
              price: basePrice != null ? `${currency} ${price(basePrice)}` : t("the same price"), to: newUnit, from: before.uom })
          : t("Any price you set will be read per {unit}.", { unit: newUnit }),
        seen > 0 && t("Hospitals compare it against what they pay per unit today, so their savings shift with it."),
        seen > 0 && reach,
      ),
    });
  }

  if (after.packSize !== before.packSize && seen > 0) {
    out.push({
      title: t("Pack {from} → {to} per pack", { from: before.packSize, to: after.packSize }),
      body: join(
        t("Hospitals read the pack beside the price and compare it with the pack they buy today — {to} where they expected {from} reads as a different article, and the switch analysis weighs it that way. The price per {unit} stays as it is.", {
          to: after.packSize, from: before.packSize, unit: after.uom.trim() || before.uom }),
        reach,
      ),
    });
  }

  if (after.sku.trim() !== before.sku && seen > 0) {
    out.push({
      title: t("Article no. {from} → {to}", { from: before.sku, to: after.sku.trim() || "—" }),
      body: join(
        t("Hospitals find your article by this number."),
        x.linked > 0
          ? t("The {lines} already matched keep their link, but their article masters still quote {sku} — an upload using the old number will no longer be matched exactly, and has to be found by description instead.", { lines: lines(x.linked), sku: before.sku })
          : t("An article master quoting {sku} — an upload using the old number will no longer be matched exactly, and has to be found by description instead.", { sku: before.sku }),
      ),
    });
  }

  return out;
}
