import Link from "next/link";
import { Close } from "./icons";
import { RiskBadge, TypeBadge, SavingsBadge, Stamp, Mark, RevMark, Balloon } from "./ui";
import type { RecCard, SuggestionCardView } from "@/lib/queries";
import type { SearchHit } from "@/lib/search";
import { dismiss, dismissSuggestionAction } from "@/lib/actions";
import { getPrefs } from "@/lib/prefs";

/*
 * The cockpit's suggestion list: every suggestion as one row of the same
 * anatomy inside a single card, so a buyer reads down a column instead of
 * across a mosaic of cards. A row's state shows in its number and pills —
 * a blocking point, an analysis still running — without the columns moving.
 */

const ROW = "md:grid-cols-[2.25rem_minmax(0,1fr)_11rem_7rem_7.5rem_6.5rem_2rem]";

export async function PartsList({ children, empty, head = true }: {
  children: React.ReactNode; empty?: React.ReactNode; head?: boolean;
}) {
  const { t } = await getPrefs();
  return (
    <div className="card overflow-hidden">
      {head && (
        <div className={`hidden border-b hair px-4 py-3 md:grid ${ROW} md:gap-x-4`}>
          <span className="label">{t("Pos")}</span>
          <span className="label">{t("Your item → proposed article")}</span>
          <span className="label">{t("Kind")}</span>
          <span className="label text-right">{t("Unit price")}</span>
          <span className="label">{t("Saving")}</span>
          <span className="label">{t("Points")}</span>
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

async function PriceCell({ offered, baseline, currency }: { offered: number | null; baseline: number | null; currency: string }) {
  const { t, moneyParts, rates } = await getPrefs();
  if (offered == null) {
    return <span className="text-xs font-medium text-ink-400">{t("No price yet")}</span>;
  }
  const o = moneyParts(offered, currency);
  const b = baseline != null ? moneyParts(baseline, currency) : null;
  return (
    <div className="leading-tight tnum"
      title={o.approx ? t("{original}, converted at the {source} rate of {date}", {
        original: o.original, date: rates.date,
        source: rates.source === "ecb" ? t("ECB reference") : t("approximate"),
      }) : undefined}>
      <div className="text-[0.95rem] font-semibold text-ink-950 dark:text-white">
        <span className="text-[0.72rem] font-medium text-ink-400">{o.approx ? "≈ " : ""}{o.code} </span>{o.text}
      </div>
      {b && (
        <div className="text-xs text-ink-400 line-through decoration-ink-300">{b.text}</div>
      )}
    </div>
  );
}

/** A priced, orderable recommendation. */
export async function RecRow({ rec, pos }: { rec: RecCard; pos: number }) {
  const { t, money } = await getPrefs();
  return (
    <Row pos={pos} href={`/hospital/products/${rec.recommendedCanonicalId}?item=${rec.hospitalItemId}`}
      label={t("Open {name}", { name: rec.recommendedName })}
      item={<>{rec.itemName}<span className="text-ink-400"> · {t("via {supplier}", { supplier: rec.currentSupplier ?? "—" })}</span></>}
      proposed={rec.recommendedName} maker={`${rec.supplierName} · ${t("direct")}`}
      tone={rec.openBlocking > 0 ? "blocking" : undefined}
      stamps={<><TypeBadge type={rec.type} /><RiskBadge cls={rec.mdrClass} /></>}
      priceCell={<PriceCell offered={rec.offered} baseline={rec.baseline} currency={rec.currency} />}
      saving={<div className="space-y-1"><SavingsBadge pct={rec.savingsPct} />
        <div className="text-[0.72rem] text-ink-400 tnum">{t("{amount} / yr", { amount: money(rec.savingsAmount, rec.currency, 0) })}</div></div>}
      points={rec.openBlocking > 0
        ? <RevMark n={rec.openBlocking} blocking label={t("blocking")} title={t(rec.openBlocking === 1 ? "{n} blocking question" : "{n} blocking questions", { n: rec.openBlocking })} />
        : rec.openNonBlocking > 0 ? <RevMark n={rec.openNonBlocking} label={t("open")} title={t("Open questions")} /> : <span className="text-xs text-ink-400">{t("None")}</span>}
      dismissAction={dismiss.bind(null, rec.id, null)} dismissTitle={t("Dismiss — moves to Dismissed, never deleted")} />
  );
}

/** A match the pipeline found by itself; possibly unpriced, possibly still being analysed. */
export async function SuggestionRow({ s, pos }: { s: SuggestionCardView; pos: number }) {
  const { t } = await getPrefs();
  const analysing = s.analysisStatus === "pending" || s.analysisStatus === "running";
  return (
    <Row pos={pos} href={`/hospital/products/${s.canonicalId}?item=${s.itemId}`} label={t("Open {name}", { name: s.name })}
      item={<>{s.itemName}{s.chosenInstead && <span className="text-amber-700 dark:text-amber-300"> · {t("you chose {name}", { name: s.chosenInstead })}</span>}</>}
      proposed={s.name} maker={`${s.manufacturer} · ${t("{n}% match", { n: s.confidence })}`}
      tone={s.blocking > 0 ? "blocking" : undefined}
      stamps={<>
        {s.relation === "identical" ? <Stamp tone="brand">{t("Same article")}</Stamp> : <Stamp tone="violet">{t("Substitute")}</Stamp>}
        <RiskBadge cls={s.mdrClass} />
        <Stamp tone="neutral" title={t("Found by automatic matching")}>{t("Auto")}</Stamp>
      </>}
      priceCell={<PriceCell offered={s.basePrice} baseline={s.basePrice != null ? s.currentPrice : null} currency={s.currency} />}
      saving={s.savingsPct != null && s.savingsPct > 0
        ? <SavingsBadge pct={s.savingsPct} />
        : s.basePrice == null ? <span className="hidden text-xs text-ink-400 md:inline">{t("Needs a price")}</span> : <span className="text-xs text-ink-400">{t("No saving")}</span>}
      points={analysing
        ? <span title={t("Analysing the switch")}><Mark kind="working" className="h-3.5 w-3.5" label={t("Analysing")} /></span>
        : s.analysisStatus === "done" && s.points > 0
          ? <RevMark n={s.blocking || s.points} blocking={s.blocking > 0} label={s.blocking > 0 ? t("blocking") : t("open")}
              title={`${t(s.points === 1 ? "{n} point" : "{n} points", { n: s.points })}${s.blocking ? `, ${t("{n} blocking", { n: s.blocking })}` : ""}`} />
          : <span className="text-xs text-ink-400">{t("None")}</span>}
      dismissAction={dismissSuggestionAction.bind(null, s.itemId, s.canonicalId)}
      dismissTitle={t("Dismiss — the next-best match takes its place")} />
  );
}

/** A search hit, in the same anatomy so the two feeds read as one list. */
export async function HitRow({ hit, pos }: { hit: SearchHit; pos: number }) {
  const { t } = await getPrefs();
  return (
    <Row pos={pos} href={`/hospital/products/${hit.canonicalId}`} label={t("Open {name}", { name: hit.name })}
      item={<>
        {t("per {unit}", { unit: hit.uom })}{hit.packSize > 1 ? ` · ${t("{n} per pack", { n: hit.packSize })}` : ""}
        {hit.gtin && <span className="code ml-2 text-[0.76rem] text-ink-400">GTIN {hit.gtin}</span>}
      </>}
      proposed={hit.name} maker={hit.manufacturer}
      stamps={<>
        <RiskBadge cls={hit.mdrClass} />
        {hit.ownedByHospital && <Stamp tone="brand">{t("You buy this")}</Stamp>}
        {hit.match === "meaning" && <Stamp tone="violet" title={t("Found by meaning or in another language, not by the exact words")}>{t("Close match")}</Stamp>}
        {hit.match === "identifier" && <Stamp tone="neutral">{t("Identifier")}</Stamp>}
      </>}
      priceCell={<PriceCell offered={hit.basePrice} baseline={hit.basePrice != null ? hit.currentPrice : null} currency={hit.currency} />}
      saving={hit.savingsPct != null && hit.savingsPct > 0 ? <SavingsBadge pct={hit.savingsPct} /> : <span className="text-xs text-ink-300">—</span>}
      points={<span className="text-ink-300">—</span>} />
  );
}
