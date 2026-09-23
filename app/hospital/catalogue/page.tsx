import Link from "next/link";
import { Page, Empty, RiskBadge, price, num } from "@/app/components/ui";
import { Trash } from "@/app/components/icons";
import { AnalysisPoller } from "@/app/components/ReplacementReview";
import { Spinner } from "@/app/components/OpenProblems";
import { hospitalCatalogue, type CatalogueEntry, type CatalogueReplacement } from "@/lib/queries";
import { deleteProduct, deleteHospitalLine } from "@/lib/actions";

export const dynamic = "force-dynamic";

/**
 * The hospital's own shelf.
 *
 * Every line of its article master, as read out of the file it uploaded, plus
 * whatever the platform has proposed against those lines. A line appears here
 * whether or not a manufacturer sells something that matches it: coverage is
 * bounded by which catalogues exist, and an unmatched line is a fact about the
 * market rather than a reason to hide the row.
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
        : `${mine.length} line${mine.length === 1 ? "" : "s"} from your article master — ${matched} matched to a manufacturer's catalogue so far` +
          `${proposed ? `, plus ${proposed} proposed product${proposed === 1 ? "" : "s"}` : ""}` +
          `${replacing ? `; ${replacing} with a replacement chosen` : ""}. ` +
          `A line with no match is not an error: nobody has uploaded a catalogue carrying it yet.`}>

      {items.length === 0 ? (
        <Empty>
          Nothing here yet. Upload your article master under{" "}
          <Link href="/hospital/documents" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            Documents
          </Link>
          , and every line it contains appears here.
        </Empty>
      ) : (
        <div className="card divide-y divide-ink-50 dark:divide-ink-800">
          {items.map((p) => (
            <div key={p.lineId ?? p.canonicalId}>
              <Row p={p} />
              {p.replacement && p.lineId && <ReplacementRow r={p.replacement} lineId={p.lineId} />}
            </div>
          ))}
        </div>
      )}
      {/* Rows whose analysis is still running update themselves. */}
      <AnalysisPoller ids={mine.flatMap((i) => i.replacement
        ? [{ id: i.replacement.id, status: i.replacement.status }] : [])} />
    </Page>
  );
}

function Row({ p }: { p: CatalogueEntry }) {
  // Only a line that resolved to a product has a product page to open.
  const href = p.canonicalId
    ? `/hospital/products/${p.canonicalId}${p.lineId ? `?item=${p.lineId}` : ""}`
    : null;

  const body = (
    <>
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-ink-50 bg-white dark:border-ink-700 dark:bg-ink-800">
        {p.imageId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/api/product-images/${p.imageId}`} alt=""
            className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-300">
            no photo
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`truncate font-medium ${href ? "group-hover:text-brand-600 dark:group-hover:text-brand-300" : ""}`}>
            {p.name}
          </span>
          <RiskBadge cls={p.mdrClass} />
          {p.inArticleMaster ? (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
              You buy this
            </span>
          ) : (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
              proposed
            </span>
          )}
          {/* The distinction the page turns on: harmonised, or still just a
              line in a spreadsheet. */}
          {p.inArticleMaster && !p.canonicalId && (
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-400 dark:bg-ink-800 dark:text-ink-300">
              no match yet
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-400">
          {p.canonicalId ? p.manufacturer : "not yet matched to a manufacturer"} · per {p.uom}
          {p.packSize > 1 ? ` · ${p.packSize}/pack` : ""}
          {p.annualVolume ? ` · ${num(p.annualVolume)}/yr` : ""}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-ink-300">
          {p.sourceFilename ? `from ${p.sourceFilename}` : "no source document on file"}
          {/* Spreadsheets often carry the article name as their only spec
              column, and printing it again under the title says nothing. */}
          {p.spec && p.spec.trim() !== p.name.trim() ? ` · ${p.spec}` : ""}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-4 p-4">
      {href
        ? <Link href={href} className="group flex min-w-0 flex-1 items-center gap-4">{body}</Link>
        : <div className="flex min-w-0 flex-1 items-center gap-4">{body}</div>}

      <div className="shrink-0 text-right tnum">
        {p.basePrice != null ? (
          <>
            <div className="font-semibold">{p.currency} {price(p.basePrice)}</div>
            {p.currentPrice != null && (
              <div className="text-xs text-ink-300 line-through">
                {p.currency} {price(p.currentPrice)}
              </div>
            )}
          </>
        ) : p.currentPrice != null ? (
          <>
            <div className="font-semibold">{p.currency} {price(p.currentPrice)}</div>
            <div className="text-[11px] text-ink-400">what you pay today</div>
          </>
        ) : (
          <div className="text-xs text-ink-400">no price published</div>
        )}
      </div>

      {/* Deleting a line removes the row you uploaded; deleting a proposed
          product removes the product. They are not the same act. */}
      <form
        action={p.lineId
          ? deleteHospitalLine.bind(null, p.lineId)
          : deleteProduct.bind(null, p.canonicalId!)}
        className="shrink-0">
        <button
          title={p.lineId
            ? "Remove this line from your article master"
            : "Delete this product from the platform"}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-rose-50 hover:text-rose-600 dark:text-ink-300 dark:hover:bg-rose-950/40">
          <Trash className="h-3.5 w-3.5" /> Delete
        </button>
      </form>
    </div>
  );
}

/**
 * The product chosen to replace a line, hung under the line it replaces — the
 * one place the shelf says "we buy this, and are moving to that".
 */
function ReplacementRow({ r, lineId }: { r: CatalogueReplacement; lineId: string }) {
  const href = `/hospital/products/${r.canonicalId}?item=${lineId}`;
  return (
    <Link href={r.status === "done" ? `${href}&tab=problems` : href}
      className="group flex flex-wrap items-center gap-3 border-t border-dashed border-ink-100 bg-brand-50/30 py-3 pl-8 pr-4 transition hover:bg-brand-50/60 sm:pl-[5.5rem] dark:border-ink-800 dark:bg-brand-500/5 dark:hover:bg-brand-500/10">
      <span aria-hidden className="text-ink-300">↳</span>
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-50 bg-white dark:border-ink-700 dark:bg-ink-800">
        {r.imageId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/api/product-images/${r.imageId}`} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <span className="text-[8px] font-medium uppercase tracking-wide text-ink-300">no photo</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Replacement
          </span>
          <span className="truncate text-sm font-medium group-hover:text-brand-600 dark:group-hover:text-brand-300">
            {r.name}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-ink-400">
          {r.manufacturer}
          {r.basePrice != null ? ` · ${r.currency} ${price(r.basePrice)}` : " · no price published"}
        </div>
      </div>
      <ReplacementState r={r} />
    </Link>
  );
}

const ORDERED: Record<string, string> = {
  pending_clinical: "Ordered · clinical sign-off", pending_approval: "Ordered · awaiting approval",
  approved: "Ordered · approved", pooled: "Ordered · in the pool",
  sanovio_fulfillment: "Ordered · in fulfilment", fulfilled: "Delivered",
};

function ReplacementState({ r }: { r: CatalogueReplacement }) {
  if (r.orderStatus) {
    return (
      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
        {ORDERED[r.orderStatus] ?? `Ordered · ${r.orderStatus}`}
      </span>
    );
  }
  if (r.status === "pending" || r.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-200">
        <Spinner small /> Calculating match…
      </span>
    );
  }
  if (r.status === "failed") {
    return <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">Match failed — open to retry</span>;
  }
  if (r.openPoints === 0) {
    return (
      <span className="text-xs font-semibold text-good-500 dark:text-good-100">
        {r.totalPoints ? "All points signed off" : "Nothing to settle"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-600 tnum dark:text-ink-200">
      {r.blockingOpen > 0 && (
        <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          {r.blockingOpen} blocking
        </span>
      )}
      {r.openPoints} open point{r.openPoints === 1 ? "" : "s"}
      {r.signedOff > 0 && <span className="text-ink-400">· {r.signedOff} signed off</span>}
    </span>
  );
}
