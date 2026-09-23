import Link from "next/link";
import { Close } from "./icons";
import { RiskBadge, TypeBadge, SavingsBadge, Stamp, Mark, RevMark, Balloon, price, num } from "./ui";
import type { RecCard, SuggestionCardView } from "@/lib/queries";
import type { SearchHit } from "@/lib/search";
import { dismiss, dismissSuggestionAction } from "@/lib/actions";

/*
 * The cockpit's suggestion list: every suggestion as one row of the same
 * anatomy inside a single card, so a buyer reads down a column instead of
 * across a mosaic of cards. A row's state shows in its number and pills —
 * a blocking point, an analysis still running — without the columns moving.
 */

const ROW = "md:grid-cols-[2.25rem_minmax(0,1fr)_11rem_7rem_7.5rem_6.5rem_2rem]";

export function PartsList({ children, empty, head = true }: {
  children: React.ReactNode; empty?: React.ReactNode; head?: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      {head && (
        <div className={`hidden border-b hair px-4 py-3 md:grid ${ROW} md:gap-x-4`}>
          <span className="label">Pos</span>
          <span className="label">Your item → proposed article</span>
          <span className="label">Kind</span>
          <span className="label text-right">Unit price</span>
          <span className="label">Saving</span>
          <span className="label">Points</span>
          <span />
        </div>
      )}
      {empty ?? <ol className="divide-y divide-[var(--line)]">{children}</ol>}
    </div>
  );
}

function Row({ pos, href, label, item, proposed, maker, stamps, priceCell, saving, points, dismissAction, dismissTitle, tone }: {
  pos: number; href: string; label: string; item: React.ReactNode; proposed: string; maker: string;
  stamps: React.ReactNode; priceCell: React.ReactNode; saving: React.ReactNode; points: React.ReactNode;
  dismissAction?: () => Promise<void>; dismissTitle?: string;
  /**
   * A row that blocks shows it in its position number and its points pill,
   * both in rose; the row itself stays calm.
   */
  tone?: "blocking";
}) {
  return (
    <li className={`group relative grid grid-cols-[2.25rem_minmax(0,1fr)_2rem] gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-brand-50/40 ${ROW} md:items-center dark:hover:bg-brand-500/5`}>
      <Link href={href} className="absolute inset-0 z-10 focus-visible:outline-offset-[-2px]" aria-label={label} />
      <span className="self-start md:self-center"><Balloon n={pos} blocking={tone === "blocking"} /></span>
      <div className="min-w-0">
        <div className="truncate text-[0.82rem] text-ink-500 dark:text-ink-300">{item}</div>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
          <svg viewBox="0 0 12 12" aria-hidden className="h-2.5 w-2.5 shrink-0 translate-y-[1px] text-brand-400">
            <path d="M1.5 6h8M6.5 2.8L9.7 6 6.5 9.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {/* Wraps rather than truncates: catalogue names differ at the end —
              the gauge, the volume — which is exactly what truncation cuts. */}
          <span className="line-clamp-2 text-[0.98rem] font-semibold leading-snug text-ink-950 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-200">
            {proposed}
          </span>
        </div>
        <div className="ml-4 truncate text-xs text-ink-400">{maker}</div>
        {/* Below md the columns fold under the name, in the same order. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden">{stamps}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 md:hidden">{priceCell}{saving}{points}</div>
      </div>
      <div className="hidden flex-wrap items-center gap-1.5 md:flex">{stamps}</div>
      <div className="hidden text-right md:block">{priceCell}</div>
      <div className="hidden md:block">{saving}</div>
      <div className="hidden md:flex">{points}</div>
      {dismissAction ? (
        <form action={dismissAction} className="relative z-20 col-start-3 row-start-1 self-start md:col-start-auto md:row-start-auto md:self-center">
          <button aria-label={dismissTitle} title={dismissTitle}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-300 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
            <Close className="h-3.5 w-3.5" />
          </button>
        </form>
      ) : <span />}
    </li>
  );
}

function PriceCell({ offered, baseline, currency }: { offered: number | null; baseline: number | null; currency: string }) {
  if (offered == null) {
    return <span className="text-xs font-medium text-ink-400">No price yet</span>;
  }
  return (
    <div className="leading-tight tnum">
      <div className="text-[0.95rem] font-semibold text-ink-950 dark:text-white">
        <span className="text-[0.72rem] font-medium text-ink-400">{currency} </span>{price(offered)}
      </div>
      {baseline != null && (
        <div className="text-xs text-ink-400 line-through decoration-ink-300">{price(baseline)}</div>
      )}
    </div>
  );
}

/** A priced, orderable recommendation. */
export function RecRow({ rec, pos }: { rec: RecCard; pos: number }) {
  return (
    <Row pos={pos} href={`/hospital/products/${rec.recommendedCanonicalId}?item=${rec.hospitalItemId}`}
      label={`Open ${rec.recommendedName}`}
      item={<>{rec.itemName}<span className="text-ink-400"> · via {rec.currentSupplier}</span></>}
      proposed={rec.recommendedName} maker={`${rec.supplierName} · direct`}
      tone={rec.openBlocking > 0 ? "blocking" : undefined}
      stamps={<><TypeBadge type={rec.type} /><RiskBadge cls={rec.mdrClass} /></>}
      priceCell={<PriceCell offered={rec.offered} baseline={rec.baseline} currency={rec.currency} />}
      saving={<div className="space-y-1"><SavingsBadge pct={rec.savingsPct} />
        <div className="text-[0.72rem] text-ink-400 tnum">{rec.currency} {num(rec.savingsAmount)} / yr</div></div>}
      points={rec.openBlocking > 0
        ? <RevMark n={rec.openBlocking} blocking label="blocking" title={`${rec.openBlocking} blocking question${rec.openBlocking === 1 ? "" : "s"}`} />
        : rec.openNonBlocking > 0 ? <RevMark n={rec.openNonBlocking} label="open" title="Open questions" /> : <span className="text-xs text-ink-400">None</span>}
      dismissAction={dismiss.bind(null, rec.id, null)} dismissTitle="Dismiss — moves to Dismissed, never deleted" />
  );
}

/** A match the pipeline found by itself; possibly unpriced, possibly still being analysed. */
export function SuggestionRow({ s, pos }: { s: SuggestionCardView; pos: number }) {
  const analysing = s.analysisStatus === "pending" || s.analysisStatus === "running";
  return (
    <Row pos={pos} href={`/hospital/products/${s.canonicalId}?item=${s.itemId}`} label={`Open ${s.name}`}
      item={<>{s.itemName}{s.chosenInstead && <span className="text-amber-700 dark:text-amber-300"> · you chose {s.chosenInstead}</span>}</>}
      proposed={s.name} maker={`${s.manufacturer} · ${s.confidence}% match`}
      tone={s.blocking > 0 ? "blocking" : undefined}
      stamps={<>
        {s.relation === "identical" ? <Stamp tone="brand">Same article</Stamp> : <Stamp tone="violet">Substitute</Stamp>}
        <RiskBadge cls={s.mdrClass} />
        <Stamp tone="neutral" title="Found by automatic matching">Auto</Stamp>
      </>}
      priceCell={<PriceCell offered={s.basePrice} baseline={s.basePrice != null ? s.currentPrice : null} currency={s.currency} />}
      saving={s.savingsPct != null && s.savingsPct > 0
        ? <SavingsBadge pct={s.savingsPct} />
        : s.basePrice == null ? <span className="hidden text-xs text-ink-400 md:inline">Needs a price</span> : <span className="text-xs text-ink-400">No saving</span>}
      points={analysing
        ? <span title="Analysing the switch"><Mark kind="working" className="h-3.5 w-3.5" label="Analysing" /></span>
        : s.analysisStatus === "done" && s.points > 0
          ? <RevMark n={s.blocking || s.points} blocking={s.blocking > 0} label={s.blocking > 0 ? "blocking" : "open"}
              title={`${s.points} point${s.points === 1 ? "" : "s"}${s.blocking ? `, ${s.blocking} blocking` : ""}`} />
          : <span className="text-xs text-ink-400">None</span>}
      dismissAction={dismissSuggestionAction.bind(null, s.itemId, s.canonicalId)}
      dismissTitle="Dismiss — the next-best match takes its place" />
  );
}

/** A search hit, in the same anatomy so the two feeds read as one list. */
export function HitRow({ hit, pos }: { hit: SearchHit; pos: number }) {
  return (
    <Row pos={pos} href={`/hospital/products/${hit.canonicalId}`} label={`Open ${hit.name}`}
      item={<>
        per {hit.uom}{hit.packSize > 1 ? ` · ${hit.packSize} per pack` : ""}
        {hit.gtin && <span className="code ml-2 text-[0.76rem] text-ink-400">GTIN {hit.gtin}</span>}
      </>}
      proposed={hit.name} maker={hit.manufacturer}
      stamps={<>
        <RiskBadge cls={hit.mdrClass} />
        {hit.ownedByHospital && <Stamp tone="brand">You buy this</Stamp>}
        {hit.match === "meaning" && <Stamp tone="violet" title="Found by meaning or in another language, not by the exact words">Close match</Stamp>}
        {hit.match === "identifier" && <Stamp tone="neutral">Identifier</Stamp>}
      </>}
      priceCell={<PriceCell offered={hit.basePrice} baseline={hit.basePrice != null ? hit.currentPrice : null} currency="CHF" />}
      saving={hit.savingsPct != null && hit.savingsPct > 0 ? <SavingsBadge pct={hit.savingsPct} /> : <span className="text-xs text-ink-300">—</span>}
      points={<span className="text-ink-300">—</span>} />
  );
}
