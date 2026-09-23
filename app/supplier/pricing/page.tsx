import { Fragment } from "react";
import Link from "next/link";
import { Page, Table, Empty, RiskBadge, chf, num } from "@/app/components/ui";
import { TierEditor } from "@/app/components/TierEditor";
import { pricingRows, tiersBySupplier } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Pricing() {
  const active = await currentSupplier();
  if (!active) return <Empty>No manufacturer is signed in.</Empty>;

  const products = pricingRows(active.id);
  const ladders = tiersBySupplier(active.id);
  const unpriced = products.filter((p) => !ladders.get(p.canonical_id)?.length).length;

  return (
    <Page title="Pricing"
      lead="What each of your products costs. A PDF catalogue carries no prices and the platform will not invent one, so a product arrives unpriced: listed and matchable, but not quotable to a hospital until you set something here. A price can be one figure at every quantity, or a ladder of volume breaks.">

      {unpriced > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>{unpriced}</strong> of {products.length} products have no price. Hospitals can
          find and match them, but no saving is claimed and they cannot be ordered until you set
          one.
        </div>
      )}

      {products.length === 0 ? (
        <Empty>
          No products yet — <Link href="/supplier/upload" className="underline">upload a catalogue</Link> first.
        </Empty>
      ) : (
        <Table head={["Product", "Source", "Price", ""]}>
          {products.map((p) => {
            const tiers = ladders.get(p.canonical_id) ?? [];
            const currency = tiers[0]?.currency ?? "CHF";
            return (
              <tr key={p.canonical_id} className="align-top">
                <td className="max-w-sm px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.canonical_name}</span>
                    <RiskBadge cls={p.mdr_risk_class as "I" | "IIa" | "IIb" | "III"} />
                  </div>
                  <div className="text-xs text-ink-400">per {p.base_uom} · {p.linked_items} catalogue row(s)</div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    tiers.length === 0
                      ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-good-100/50 text-good-500 dark:bg-good-500/15 dark:text-good-100"}`}>
                    {tiers.length === 0 ? "no price yet"
                      : tiers[0].origin === "catalogue" ? "from your catalogue" : "set by you"}
                  </span>
                </td>
                {/* One price column: a flat price and a ladder are the same
                    thing at different lengths, and splitting them put the
                    headline figure in one column and the breaks that override
                    it in another. Rendered from the stored tiers, not from a
                    ladder recomputed off the first one — those agree only
                    while nobody has edited it. */}
                <td className="px-3 py-3">
                  {tiers.length === 0 ? (
                    <span className="text-xs text-ink-300">—</span>
                  ) : (
                    <div className="grid w-max grid-cols-[auto_auto] gap-x-4 gap-y-0.5 whitespace-nowrap tnum">
                      {tiers.map((t, i) => {
                        const next = tiers[i + 1];
                        return (
                          <Fragment key={t.id}>
                            <span className="text-xs text-ink-400">
                              {tiers.length === 1 ? "every quantity"
                                : next ? `${num(t.min_volume)}–${num(next.min_volume - 1)}`
                                : `${num(t.min_volume)}+`}
                            </span>
                            <span className={`text-right ${i === 0 ? "font-medium" : "text-ink-500 dark:text-ink-300"}`}>
                              {i === 0 ? `${currency} ` : ""}{chf(t.unit_price, 4)}
                            </span>
                          </Fragment>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="w-px whitespace-nowrap px-3 py-3 text-right">
                  <TierEditor canonicalId={p.canonical_id} productName={p.canonical_name}
                    uom={p.base_uom} tiers={tiers} currency={currency} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
