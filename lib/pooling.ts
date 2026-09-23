/**
 * §1.5 — demand pools, volume tiers, and the price a hospital actually gets.
 *
 * The price is a function of the whole pool's committed volume, not of one
 * hospital's order. That is the entire business model, so it lives in one
 * place and every price shown in the UI comes through here.
 */
import { db } from "@/lib/db";

export interface Tier { id: string; min_volume: number; unit_price: number; currency: string }

export interface PoolState {
  poolId: string | null;
  committedVolume: number;
  indicativeVolume: number;
  hospitalCount: number;
  currentTier: Tier | null;
  nextTier: Tier | null;
  volumeToNextTier: number | null;
  nextTierSavingsPct: number | null;
  status: "forming" | "locked" | "contracted" | null;
  locksAt: string | null;
}

export function tiersFor(canonicalProductId: string, supplierId: string): Tier[] {
  return db()
    .prepare(`SELECT id, min_volume, unit_price, currency FROM price_tiers
              WHERE canonical_product_id = ? AND supplier_id = ?
              ORDER BY min_volume ASC`)
    .all(canonicalProductId, supplierId) as unknown as Tier[];
}

/** Highest tier whose min_volume the pool has actually reached. */
export function tierAtVolume(tiers: Tier[], volume: number): Tier | null {
  let found: Tier | null = null;
  for (const t of tiers) if (volume >= t.min_volume) found = t;
  return found ?? tiers[0] ?? null;
}

/**
 * The next volume break above where the pool stands.
 *
 * Private: the portals no longer show how close a product is to its next
 * break, but pricing still has to know which tier the order lands in.
 */
function nextTierAbove(tiers: Tier[], volume: number): Tier | null {
  for (const t of tiers) if (t.min_volume > volume) return t;
  return null;
}

export function poolState(
  canonicalProductId: string,
  supplierId: string,
  prospectiveVolume = 0,
): PoolState {
  const conn = db();
  const tiers = tiersFor(canonicalProductId, supplierId);

  const pool = conn
    .prepare(`SELECT id, status, locks_at FROM demand_pools
              WHERE canonical_product_id = ? AND supplier_id = ?
              ORDER BY created_at DESC LIMIT 1`)
    .get(canonicalProductId, supplierId) as
    { id: string; status: PoolState["status"]; locks_at: string | null } | undefined;

  let committed = 0, indicative = 0, hospitals = 0;
  if (pool) {
    const agg = conn
      .prepare(`SELECT
                  COALESCE(SUM(CASE WHEN commitment='committed' THEN annual_volume END),0) AS c,
                  COALESCE(SUM(annual_volume),0) AS total,
                  COUNT(*) AS n
                FROM pooled_demand WHERE demand_pool_id = ?`)
      .get(pool.id) as unknown as { c: number; total: number; n: number };
    committed = agg.c; indicative = agg.total - agg.c; hospitals = agg.n;
  }

  const effective = committed + prospectiveVolume;
  const currentTier = tierAtVolume(tiers, effective);
  const nextTier = nextTierAbove(tiers, effective);

  return {
    poolId: pool?.id ?? null,
    committedVolume: committed,
    indicativeVolume: indicative,
    hospitalCount: hospitals + (prospectiveVolume > 0 ? 1 : 0),
    currentTier,
    nextTier,
    volumeToNextTier: nextTier ? nextTier.min_volume - effective : null,
    nextTierSavingsPct: null, // filled by the caller, which knows the baseline
    status: pool?.status ?? null,
    locksAt: pool?.locks_at ?? null,
  };
}

export function savingsPct(baseline: number, offered: number): number {
  if (!baseline) return 0;
  return Math.round(((baseline - offered) / baseline) * 1000) / 10;
}

/** §4 colour bands, recalibrated for a distribution where 30-50% is normal. */
export function savingsBand(pct: number): "neutral" | "good" | "strong" | "exceptional" {
  if (pct < 10) return "neutral";
  if (pct < 25) return "good";
  if (pct < 40) return "strong";
  return "exceptional";
}

export const BAND_CLASS: Record<ReturnType<typeof savingsBand>, string> = {
  neutral: "text-ink-400 bg-ink-50 dark:bg-ink-800 dark:text-ink-300",
  good: "text-good-500 bg-good-100/40 dark:bg-good-500/15 dark:text-good-100",
  strong: "text-good-500 bg-good-100/70 dark:bg-good-500/25 dark:text-good-100",
  exceptional: "text-white bg-good-500 dark:text-white",
};
