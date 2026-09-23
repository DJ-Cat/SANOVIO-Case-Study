import Link from "next/link";
import { Close } from "./icons";
import { RiskBadge, price, num } from "./ui";
import { savingsBand } from "@/lib/pooling";
import type { RecCard } from "@/lib/queries";
import type { ProductHit, SuggestionCardView } from "@/lib/queries";
import { dismiss, dismissSuggestionAction } from "@/lib/actions";

/** Depth treatment shared by every tile on the cockpit. */
const SHELL =
  "relative flex flex-col rounded-[28px] border border-white/70 bg-gradient-to-b from-white to-ink-25 " +
  "shadow-[0_1px_2px_rgba(16,18,40,.05),0_10px_28px_-10px_rgba(16,18,40,.14),0_28px_56px_-20px_rgba(86,89,251,.22)] " +
  "transition duration-200 hover:-translate-y-1 " +
  "hover:shadow-[0_2px_4px_rgba(16,18,40,.06),0_16px_36px_-10px_rgba(16,18,40,.18),0_40px_72px_-24px_rgba(86,89,251,.32)] " +
  "dark:border-ink-700/70 dark:from-ink-800 dark:to-ink-900";

const BAND_CHIP: Record<ReturnType<typeof savingsBand>, string> = {
  neutral: "from-ink-300 to-ink-400",
  good: "from-brand-400 to-brand-600",
  strong: "from-brand-500 via-brand-600 to-good-500",
  exceptional: "from-good-500 to-good-500",
};

/** §4 recommendation tile. */
export function SavingsCard({ rec }: { rec: RecCard }) {
  const band = savingsBand(rec.savingsPct);
  return (
    <article className={`${SHELL} group p-5`}>
      {/* Dismiss sits above the link overlay so the whole tile stays clickable. */}
      <form action={dismiss.bind(null, rec.id, null)} className="absolute right-3.5 top-3.5 z-20">
        <button aria-label="Dismiss recommendation" title="Dismiss — moves to Suggested, never deleted"
          className="grid h-7 w-7 place-items-center rounded-full border border-ink-100 bg-white/90 text-ink-300 transition hover:border-rose-200 hover:text-rose-600 dark:border-ink-700 dark:bg-ink-900/90 dark:hover:border-rose-800">
          <Close className="h-3.5 w-3.5" />
        </button>
      </form>
      <Link href={`/hospital/products/${rec.recommendedCanonicalId}?item=${rec.hospitalItemId}`}
        className="absolute inset-0 z-10 rounded-[28px]"
        aria-label={`Open ${rec.recommendedName}`} />

      <div className="flex flex-wrap items-center gap-1.5 pr-9">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          rec.type === "identity"
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
            : "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"}`}>
          {rec.type === "identity" ? "Same article" : "Substitute"}
        </span>
        <RiskBadge cls={rec.mdrClass} />
        {rec.openBlocking > 0 && (
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
            {rec.openBlocking} blocking
          </span>
        )}
      </div>

      <p className="mt-3 truncate text-[11px] text-ink-300">
        Your item · {rec.itemName}
      </p>
      <h3 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-snug text-ink-950 dark:text-white">
        {rec.recommendedName}
      </h3>
      <p className="mt-1 truncate text-xs text-ink-400">{rec.supplierName} · direct</p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-ink-300 line-through tnum">
            {rec.currency} {price(rec.baseline)}
          </div>
          <div className="text-lg font-bold tnum text-ink-950 dark:text-white">
            {rec.currency} {price(rec.offered)}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-400 tnum">
            saves {rec.currency} {num(rec.savingsAmount)}/yr
          </div>
        </div>
        <div className={`shrink-0 rounded-2xl bg-gradient-to-br ${BAND_CHIP[band]} px-3.5 py-2.5 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-6px_rgba(86,89,251,.55)]`}>
          <div className="text-xl font-extrabold leading-none tnum">
            {rec.savingsPct.toFixed(0)}%
          </div>
          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-90">off</div>
        </div>
      </div>

    </article>
  );
}

/** Same tile shape for manual search hits, so the two feeds read as one system. */
export function ProductCard({ hit }: { hit: ProductHit & { match?: "identifier" | "text" | "meaning" } }) {
  const band = hit.savingsPct != null ? savingsBand(hit.savingsPct) : null;
  return (
    <article className={`${SHELL} group p-5`}>
      <Link href={`/hospital/products/${hit.canonicalId}`} className="absolute inset-0 z-10 rounded-[28px]"
        aria-label={`Open ${hit.name}`} />
      <div className="flex flex-wrap items-center gap-1.5">
        <RiskBadge cls={hit.mdrClass} />
        {hit.ownedByHospital && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
            You buy this
          </span>
        )}
        {hit.basePrice == null && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            price pending
          </span>
        )}
        {/* Found by meaning or translation rather than by the words typed —
            said so, so a near match is never read as the article named. */}
        {hit.match === "meaning" && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
            title="Found by meaning or in another language, not by the exact words">
            close match
          </span>
        )}
        {hit.match === "identifier" && (
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
            identifier match
          </span>
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 text-[17px] font-semibold leading-snug text-ink-950 dark:text-white">
        {hit.name}
      </h3>
      <p className="mt-1 truncate text-xs text-ink-400">
        {hit.manufacturer} · per {hit.uom}
        {hit.packSize > 1 ? ` · ${hit.packSize}/pack` : ""}
      </p>
      {hit.gtin && <p className="mt-0.5 truncate font-mono text-[10px] text-ink-300">GTIN {hit.gtin}</p>}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {hit.currentPrice != null && (
            <div className="text-[11px] text-ink-300 line-through tnum">CHF {price(hit.currentPrice)}</div>
          )}
          <div className="text-lg font-bold tnum text-ink-950 dark:text-white">
            {hit.basePrice != null
              ? `CHF ${price(hit.basePrice)}`
              : <span className="text-sm font-medium text-ink-400">awaiting supplier price</span>}
          </div>
        </div>
        {band && hit.savingsPct != null && hit.savingsPct > 0 && (
          <div className={`shrink-0 rounded-2xl bg-gradient-to-br ${BAND_CHIP[band]} px-3.5 py-2.5 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-6px_rgba(86,89,251,.55)]`}>
            <div className="text-xl font-extrabold leading-none tnum">{hit.savingsPct.toFixed(0)}%</div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-90">off</div>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * A match the suggestion pipeline found on its own — the same tile, so the
 * feed reads as one thing, but saying what it is: no order behind it yet,
 * possibly no price, and a pre-calculated analysis that may still be running.
 */
export function SuggestionCard({ s }: { s: SuggestionCardView }) {
  const band = s.savingsPct != null && s.savingsPct > 0 ? savingsBand(s.savingsPct) : null;
  const analysing = s.analysisStatus === "pending" || s.analysisStatus === "running";
  return (
    <article className={`${SHELL} group p-5`}>
      <form action={dismissSuggestionAction.bind(null, s.itemId, s.canonicalId)}
        className="absolute right-3.5 top-3.5 z-20">
        <button aria-label="Dismiss suggestion" title="Dismiss — the next-best match takes its place"
          className="grid h-7 w-7 place-items-center rounded-full border border-ink-100 bg-white/90 text-ink-300 transition hover:border-rose-200 hover:text-rose-600 dark:border-ink-700 dark:bg-ink-900/90 dark:hover:border-rose-800">
          <Close className="h-3.5 w-3.5" />
        </button>
      </form>
      <Link href={`/hospital/products/${s.canonicalId}?item=${s.itemId}`}
        className="absolute inset-0 z-10 rounded-[28px]" aria-label={`Open ${s.name}`} />

      <div className="flex flex-wrap items-center gap-1.5 pr-9">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          s.relation === "identical"
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
            : "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"}`}>
          {s.relation === "identical" ? "Same article" : "Substitute"}
        </span>
        <RiskBadge cls={s.mdrClass} />
        {s.basePrice == null && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            no price yet
          </span>
        )}
        {analysing ? (
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
            analysing…
          </span>
        ) : s.analysisStatus === "done" && s.blocking > 0 ? (
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
            {s.blocking} blocking
          </span>
        ) : s.analysisStatus === "done" && s.points > 0 ? (
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
            {s.points} point{s.points === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <p className="mt-3 truncate text-[11px] text-ink-300">Your item · {s.itemName}</p>
      <h3 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-snug text-ink-950 dark:text-white">
        {s.name}
      </h3>
      <p className="mt-1 truncate text-xs text-ink-400">
        {s.manufacturer} · {s.confidence}% match
      </p>
      {s.chosenInstead && (
        <p className="mt-1 truncate text-[11px] text-amber-700 dark:text-amber-300">
          You chose {s.chosenInstead} for this item
        </p>
      )}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {s.currentPrice != null && s.basePrice != null && (
            <div className="text-[11px] text-ink-300 line-through tnum">{s.currency} {price(s.currentPrice)}</div>
          )}
          <div className="text-lg font-bold tnum text-ink-950 dark:text-white">
            {s.basePrice != null
              ? `${s.currency} ${price(s.basePrice)}`
              : <span className="text-sm font-medium text-ink-400">awaiting supplier price</span>}
          </div>
        </div>
        {band && s.savingsPct != null && (
          <div className={`shrink-0 rounded-2xl bg-gradient-to-br ${BAND_CHIP[band]} px-3.5 py-2.5 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-6px_rgba(86,89,251,.55)]`}>
            <div className="text-xl font-extrabold leading-none tnum">{s.savingsPct.toFixed(0)}%</div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-90">off</div>
          </div>
        )}
      </div>
    </article>
  );
}
