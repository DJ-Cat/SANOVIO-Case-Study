import Link from "next/link";
import { Page, Section, Empty, Stamp, Mark, Balloon, RiskBadge, price, num } from "@/app/components/ui";
import { Trash } from "@/app/components/icons";
import { AnalysisPoller } from "@/app/components/ReplacementReview";
import { hospitalCatalogue, type CatalogueEntry, type CatalogueReplacement } from "@/lib/queries";
import { deleteProduct, deleteHospitalLine } from "@/lib/actions";

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
export default function HospitalCatalogue() {
  const items = hospitalCatalogue();
  const mine = items.filter((i) => i.inArticleMaster);
  const matched = mine.filter((i) => i.canonicalId).length;
  const proposed = items.length - mine.length;
  const replacing = mine.filter((i) => i.replacement).length;

  return (
    <Page title="Catalogue"
      lead={items.length === 0
        ? "The lines of your article master, and the products proposed against them, once you have uploaded a file."
        : "Every line of your article master and what is proposed against it. A line with no match is not an error: nobody has uploaded a catalogue carrying it yet."}
      >

      {items.length === 0 ? (
        <Empty>
          Nothing here yet. Upload your article master under{" "}
          <Link href="/hospital/documents" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            Documents
          </Link>
          , and every line it contains appears here.
        </Empty>
      ) : (
        <Section title="Bill of materials"
          meta={`${mine.length} lines · ${matched} matched · ${replacing} replacing${proposed ? ` · ${proposed} proposed` : ""}`}>
          <div className="card overflow-hidden">
            <div className={`hidden border-b hair px-4 py-3 md:grid ${COLS} md:gap-x-4`}>
              <span className="label">Pos</span>
              <span />
              <span className="label">Article · source</span>
              <span className="label">Status</span>
              <span className="label text-right">Unit price</span>
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

function Thumb({ imageId, size = "md" }: { imageId: string | null; size?: "md" | "sm" }) {
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
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="No photograph">
          <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
        </svg>
      )}
    </div>
  );
}

function Row({ p, pos }: { p: CatalogueEntry; pos: number }) {
  // Only a line that resolved to a product has a product page to open.
  const href = p.canonicalId
    ? `/hospital/products/${p.canonicalId}${p.lineId ? `?item=${p.lineId}` : ""}`
    : null;

  return (
    <div className={`group relative grid grid-cols-[2.25rem_3.25rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 ${COLS} ${
      href ? "transition-colors hover:bg-brand-50/40 dark:hover:bg-brand-500/5" : ""}`}>
      {href && <Link href={href} className="absolute inset-0 z-10" aria-label={`Open ${p.name}`} />}
      <Balloon n={pos} />
      <Thumb imageId={p.imageId} />
      <div className="min-w-0">
        <div className={`line-clamp-2 font-semibold leading-snug text-ink-950 dark:text-white ${href ? "group-hover:text-brand-700 dark:group-hover:text-brand-200" : ""}`}>
          {p.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-300">
          {p.canonicalId ? p.manufacturer : "not yet matched to a manufacturer"} · per {p.uom}
          {p.packSize > 1 ? ` · ${p.packSize} per pack` : ""}
          {p.annualVolume ? ` · ${num(p.annualVolume)} a year` : ""}
        </div>
        <div className="mt-0.5 truncate text-[0.72rem] text-ink-400">
          {p.sourceFilename ? `from ${p.sourceFilename}` : "no source document on file"}
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
            ? "Remove this line from your article master"
            : "Delete this product from the platform"}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:text-ink-300 dark:hover:bg-rose-500/10">
          <Trash className="h-3.5 w-3.5" /> Delete
        </button>
      </form>
    </div>
  );
}

function Stamps({ p }: { p: CatalogueEntry }) {
  return (
    <>
      <RiskBadge cls={p.mdrClass} />
      {p.inArticleMaster ? <Stamp tone="brand">You buy this</Stamp> : <Stamp tone="violet">Proposed</Stamp>}
      {/* The distinction the page turns on: harmonised, or still just a line
          in a spreadsheet. */}
      {p.inArticleMaster && !p.canonicalId && <Stamp tone="neutral">No match yet</Stamp>}
    </>
  );
}

function PriceCell({ p }: { p: CatalogueEntry }) {
  if (p.basePrice != null) {
    return (
      <div className="leading-tight">
        <div className="font-semibold text-ink-950 dark:text-white"><span className="text-[0.72rem] font-medium text-ink-400">{p.currency} </span>{price(p.basePrice)}</div>
        {p.currentPrice != null && <div className="text-xs text-ink-400 line-through decoration-ink-300">{price(p.currentPrice)}</div>}
      </div>
    );
  }
  if (p.currentPrice != null) {
    return (
      <div className="leading-tight">
        <div className="font-semibold text-ink-950 dark:text-white"><span className="text-[0.72rem] font-medium text-ink-400">{p.currency} </span>{price(p.currentPrice)}</div>
        <div className="text-[0.72rem] text-ink-400">what you pay today</div>
      </div>
    );
  }
  return <div className="text-xs text-ink-400">no price published</div>;
}

/**
 * The product chosen to replace a line, tucked under the line it replaces
 * on a soft lavender band — the one place the shelf says "we buy this, and
 * are moving to that".
 */
function ReplacementRow({ r, lineId }: { r: CatalogueReplacement; lineId: string }) {
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
          <Stamp tone="brand">Replacement</Stamp>
          <span className="truncate text-sm font-semibold text-ink-900 group-hover:text-brand-700 dark:text-ink-50 dark:group-hover:text-brand-200">
            {r.name}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">
          {r.manufacturer}
          {r.basePrice != null ? ` · ${r.currency} ${price(r.basePrice)}` : " · no price published"}
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
function ReplacementState({ r }: { r: CatalogueReplacement }) {
  if (r.orderStatus) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-200">
        <Mark kind={r.orderStatus === "fulfilled" ? "done" : "working"} />
        {ORDERED[r.orderStatus] ?? `Ordered · ${r.orderStatus}`}
      </span>
    );
  }
  if (r.status === "pending" || r.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-200">
        <Mark kind="working" /> Calculating the match
      </span>
    );
  }
  if (r.status === "failed") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><Mark kind="rejected" /> Match failed — open to retry</span>;
  }
  if (r.openPoints === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <Mark kind="done" /> {r.totalPoints ? "All points signed off" : "Nothing to settle"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-600 tnum dark:text-ink-200">
      {r.openPoints} open point{r.openPoints === 1 ? "" : "s"}
      {r.blockingOpen > 0 && <span className="text-rose-700 dark:text-rose-300">· {r.blockingOpen} blocking</span>}
      {r.signedOff > 0 && <span className="text-ink-400">· {r.signedOff} signed off</span>}
    </span>
  );
}
