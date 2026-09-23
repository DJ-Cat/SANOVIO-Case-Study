import Link from "next/link";
import { Page, Section, Empty, Stamp, Mark, Balloon, RiskBadge, num } from "@/app/components/ui";
import { Money } from "@/app/components/Prefs";
import { Trash } from "@/app/components/icons";
import { AnalysisPoller } from "@/app/components/ReplacementReview";
import { hospitalCatalogue, type CatalogueEntry, type CatalogueReplacement } from "@/lib/queries";
import { deleteProduct, deleteHospitalLine } from "@/lib/actions";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

const COLS = "md:grid-cols-[2.25rem_3.25rem_minmax(0,1fr)_12rem_8rem_5.5rem]";

/**
 * The hospital's own shelf, as a bill of materials.
 *
 * Every line of its article master, as read out of the file it uploaded, plus
 * whatever the platform has proposed against those lines. A line appears here
 * whether or not a manufacturer sells something that matches it: coverage is
 * bounded by which catalogues exist, and an unmatched line is a fact about the
 * market rather than a reason to hide the row. A chosen replacement hangs
 * under its line on a soft lavender band.
 */
export default async function HospitalCatalogue() {
  const { t } = await getPrefs();
  const items = hospitalCatalogue();
  const mine = items.filter((i) => i.inArticleMaster);
  const matched = mine.filter((i) => i.canonicalId).length;
  const proposed = items.length - mine.length;
  const replacing = mine.filter((i) => i.replacement).length;

  return (
    <Page title={t("Catalogue")}
      lead={items.length === 0
        ? t("The lines of your article master, and the products proposed against them, once you have uploaded a file.")
        : t("Every line of your article master and what is proposed against it. A line with no match is not an error: nobody has uploaded a catalogue carrying it yet.")}
      >

      {items.length === 0 ? (
        <Empty>
          {t("Nothing here yet. Upload your article master under")}{" "}
          <Link href="/hospital/documents" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            {t("Documents")}
          </Link>
          {t(", and every line it contains appears here.")}
        </Empty>
      ) : (
        <Section title={t("Bill of materials")}
          meta={`${t("{n} lines", { n: mine.length })} · ${t("{n} matched", { n: matched })} · ${t("{n} replacing", { n: replacing })}${proposed ? ` · ${t("{n} proposed", { n: proposed })}` : ""}`}>
          <div className="card overflow-hidden">
            <div className={`hidden border-b hair px-4 py-3 md:grid ${COLS} md:gap-x-4`}>
              <span className="label">{t("Pos")}</span>
              <span />
              <span className="label">{t("Article · source")}</span>
              <span className="label">{t("Status")}</span>
              <span className="label text-right">{t("Unit price")}</span>
              <span />
            </div>
            <ol className="divide-y divide-[var(--line)]">
              {items.map((p, i) => (
                <li key={p.lineId ?? p.canonicalId}>
                  <Row p={p} pos={i + 1} />
                  {p.replacement && p.lineId && <ReplacementRow r={p.replacement} lineId={p.lineId} />}
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )}
      {/* Rows whose analysis is still running update themselves. */}
      <AnalysisPoller ids={mine.flatMap((i) => i.replacement
        ? [{ id: i.replacement.id, status: i.replacement.status }] : [])} />
    </Page>
  );
}

async function Thumb({ imageId, size = "md" }: { imageId: string | null; size?: "md" | "sm" }) {
  const { t } = await getPrefs();
  const dims = size === "sm" ? "h-9 w-9" : "h-[3.25rem] w-[3.25rem]";
  return (
    <div className={`grid ${dims} shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_var(--line)] dark:bg-ink-900`}>
      {imageId ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/api/product-images/${imageId}`} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        // No photograph: a quiet package line icon, not an empty tile that
        // reads as a broken image.
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-200 dark:text-ink-600" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={t("No photograph")}>
          <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
        </svg>
      )}
    </div>
  );
}

async function Row({ p, pos }: { p: CatalogueEntry; pos: number }) {
  const { t } = await getPrefs();
  // Only a line that resolved to a product has a product page to open.
  const href = p.canonicalId
    ? `/hospital/products/${p.canonicalId}${p.lineId ? `?item=${p.lineId}` : ""}`
    : null;

  return (
    <div className={`group relative grid grid-cols-[2.25rem_3.25rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 ${COLS} ${
      href ? "transition-colors hover:bg-brand-50/40 dark:hover:bg-brand-500/5" : ""}`}>
      {href && <Link href={href} className="absolute inset-0 z-10" aria-label={t("Open {name}", { name: p.name })} />}
      <Balloon n={pos} />
      <Thumb imageId={p.imageId} />
      <div className="min-w-0">
        <div className={`line-clamp-2 font-semibold leading-snug text-ink-950 dark:text-white ${href ? "group-hover:text-brand-700 dark:group-hover:text-brand-200" : ""}`}>
          {p.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-300">
          {p.canonicalId ? p.manufacturer : t("not yet matched to a manufacturer")} · {t("per {unit}", { unit: p.uom })}
          {p.packSize > 1 ? ` · ${t("{n} per pack", { n: p.packSize })}` : ""}
          {p.annualVolume ? ` · ${t("{n} a year", { n: num(p.annualVolume) })}` : ""}
        </div>
        <div className="mt-0.5 truncate text-[0.72rem] text-ink-400">
          {p.sourceFilename ? t("from {file}", { file: p.sourceFilename }) : t("no source document on file")}
          {/* Spreadsheets often carry the article name as their only spec
              column, and printing it again under the title says nothing. */}
          {p.spec && p.spec.trim() !== p.name.trim() ? ` · ${p.spec}` : ""}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 md:hidden"><Stamps p={p} /></div>
      </div>
      <div className="hidden flex-wrap gap-1.5 md:flex"><Stamps p={p} /></div>
      <div className="col-start-3 text-left tnum md:col-start-auto md:text-right"><PriceCell p={p} /></div>

      {/* Deleting a line removes the row you uploaded; deleting a proposed
          product removes the product. They are not the same act. */}
      <form
        action={p.lineId
          ? deleteHospitalLine.bind(null, p.lineId)
          : deleteProduct.bind(null, p.canonicalId!)}
        className="relative z-20 col-start-3 md:col-start-auto md:justify-self-end">
        <button
          title={p.lineId
            ? t("Remove this line from your article master")
            : t("Delete this product from the platform")}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:text-ink-300 dark:hover:bg-rose-500/10">
          <Trash className="h-3.5 w-3.5" /> {t("Delete")}
        </button>
      </form>
    </div>
  );
}

async function Stamps({ p }: { p: CatalogueEntry }) {
  const { t } = await getPrefs();
  return (
    <>
      <RiskBadge cls={p.mdrClass} />
      {p.inArticleMaster ? <Stamp tone="brand">{t("You buy this")}</Stamp> : <Stamp tone="violet">{t("Proposed")}</Stamp>}
      {/* The distinction the page turns on: harmonised, or still just a line
          in a spreadsheet. */}
      {p.inArticleMaster && !p.canonicalId && <Stamp tone="neutral">{t("No match yet")}</Stamp>}
    </>
  );
}

async function PriceCell({ p }: { p: CatalogueEntry }) {
  const { t, moneyParts } = await getPrefs();
  // The code small, the figure large — both in the reader's currency.
  const figure = (amount: number) => {
    const m = moneyParts(amount, p.currency);
    return (
      <div className="font-semibold text-ink-950 dark:text-white" title={m.approx ? m.original : undefined}>
        <span className="text-[0.72rem] font-medium text-ink-400">{m.approx ? "≈ " : ""}{m.code} </span>{m.text}
      </div>
    );
  };
  if (p.basePrice != null) {
    return (
      <div className="leading-tight">
        {figure(p.basePrice)}
        {p.currentPrice != null && <div className="text-xs text-ink-400 line-through decoration-ink-300">{moneyParts(p.currentPrice, p.currency).text}</div>}
      </div>
    );
  }
  if (p.currentPrice != null) {
    return (
      <div className="leading-tight">
        {figure(p.currentPrice)}
        <div className="text-[0.72rem] text-ink-400">{t("what you pay today")}</div>
      </div>
    );
  }
  return <div className="text-xs text-ink-400">{t("no price published")}</div>;
}

/**
 * The product chosen to replace a line, tucked under the line it replaces
 * on a soft lavender band — the one place the shelf says "we buy this, and
 * are moving to that".
 */
async function ReplacementRow({ r, lineId }: { r: CatalogueReplacement; lineId: string }) {
  const { t } = await getPrefs();
  const href = `/hospital/products/${r.canonicalId}?item=${lineId}`;
  return (
    <Link href={r.status === "done" ? `${href}&tab=problems` : href}
      className={`group grid grid-cols-[2.25rem_3.25rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 bg-brand-50/50 px-4 py-2.5 transition-colors hover:bg-brand-50 ${COLS} dark:bg-brand-500/5 dark:hover:bg-brand-500/10`}>
      {/* A soft curve down from the line above, into the replacement. */}
      <svg viewBox="0 0 36 28" className="h-7 w-9 text-brand-300" aria-hidden>
        <path d="M14 0v6a8 8 0 008 8h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M30 10.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Thumb imageId={r.imageId} size="sm" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Stamp tone="brand">{t("Replacement")}</Stamp>
          <span className="truncate text-sm font-semibold text-ink-900 group-hover:text-brand-700 dark:text-ink-50 dark:group-hover:text-brand-200">
            {r.name}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">
          {r.manufacturer}
          {r.basePrice != null ? <> · <Money amount={r.basePrice} from={r.currency} /></> : ` · ${t("no price published")}`}
        </div>
        <div className="mt-1 md:hidden"><ReplacementState r={r} /></div>
      </div>
      <div className="hidden md:col-span-3 md:block"><ReplacementState r={r} /></div>
    </Link>
  );
}

const ORDERED: Record<string, string> = {
  pending_clinical: "Ordered · clinical sign-off", pending_approval: "Ordered · awaiting approval",
  approved: "Ordered · approved", pooled: "Ordered · in the pool",
  sanovio_fulfillment: "Ordered · in fulfilment", fulfilled: "Delivered",
};

/** Where the replacement stands, as a mark and a word. */
async function ReplacementState({ r }: { r: CatalogueReplacement }) {
  const { t } = await getPrefs();
  if (r.orderStatus) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-200">
        <Mark kind={r.orderStatus === "fulfilled" ? "done" : "working"} />
        {ORDERED[r.orderStatus] ? t(ORDERED[r.orderStatus]) : `${t("Ordered")} · ${r.orderStatus}`}
      </span>
    );
  }
  if (r.status === "pending" || r.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-200">
        <Mark kind="working" /> {t("Calculating the match")}
      </span>
    );
  }
  if (r.status === "failed") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><Mark kind="rejected" /> {t("Match failed — open to retry")}</span>;
  }
  if (r.openPoints === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <Mark kind="done" /> {r.totalPoints ? t("All points signed off") : t("Nothing to settle")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-600 tnum dark:text-ink-200">
      {t(r.openPoints === 1 ? "{n} open point" : "{n} open points", { n: r.openPoints })}
      {r.blockingOpen > 0 && <span className="text-rose-700 dark:text-rose-300">· {t("{n} blocking", { n: r.blockingOpen })}</span>}
      {r.signedOff > 0 && <span className="text-ink-400">· {t("{n} signed off", { n: r.signedOff })}</span>}
    </span>
  );
}
