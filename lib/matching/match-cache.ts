/**
 * Paid matching results, kept on disk so they outlive the database.
 *
 * `db:reset` empties the platform, which is right for the product and wrong
 * for a wallet: every Jev score, Claude verdict and web-searched analysis would
 * be bought again on the next upload of the same files. This file keys each
 * result by a hash of the exact input it was computed from, so a replay after
 * a reset is free and identical, and a changed input simply misses.
 *
 * Only live results are written. A deterministic fallback costs nothing to
 * recompute, and caching one would let it stand in for the model later.
 *
 *   SUGGEST_CACHE=off           neither read nor write (the verify run)
 *   SUGGEST_CACHE_DIR=<dir>     somewhere other than fixtures/matches
 *
 * Alongside it, `latest.json` is the last run written out for a human: every
 * pair that reached a paid stage with its scores and verdicts — labelled
 * examples for tuning the thresholds, and cheap test data.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Adjudication, ReplacementAnalysis } from "../ai";

type Entry<T> = { value: T; adapter: string; at: string };
interface CacheFile {
  version: 1;
  gate: Record<string, Entry<{ probability: number }>>;
  adjudication: Record<string, Entry<Adjudication>>;
  analysis: Record<string, Entry<ReplacementAnalysis>>;
}
type Kind = "gate" | "adjudication" | "analysis";

const enabled = () => (process.env.SUGGEST_CACHE ?? "on") !== "off";
const dir = () => path.resolve(process.cwd(), process.env.SUGGEST_CACHE_DIR ?? "fixtures/matches");
const file = () => path.join(dir(), "cache.json");

let loaded: CacheFile | null = null;
let dirty = false;

function load(): CacheFile {
  if (loaded) return loaded;
  const empty: CacheFile = { version: 1, gate: {}, adjudication: {}, analysis: {} };
  try {
    loaded = existsSync(file()) ? { ...empty, ...JSON.parse(readFileSync(file(), "utf8")) } : empty;
  } catch {
    loaded = empty;   // a corrupt cache is a cold cache, not an outage
  }
  return loaded!;
}

export function inputHash(input: unknown): string {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex");
}

export function cached<K extends Kind>(kind: K, hash: string): CacheFile[K][string] | null {
  if (!enabled()) return null;
  return (load()[kind][hash] as CacheFile[K][string] | undefined) ?? null;
}

export function remember<K extends Kind>(
  kind: K, hash: string, value: CacheFile[K][string]["value"], adapter: string,
): void {
  if (!enabled() || isFallback(adapter)) return;
  (load()[kind] as Record<string, unknown>)[hash] = { value, adapter, at: new Date().toISOString() };
  dirty = true;
}

/** Deterministic adapters label themselves; none of them is worth keeping. */
export const isFallback = (adapter: string | null | undefined) =>
  !adapter || /stub|deterministic/.test(adapter);

/** Write the cache if anything was added. Atomic, so a crash cannot truncate it. */
export function flushCache(): void {
  if (!enabled() || !dirty || !loaded) return;
  mkdirSync(dir(), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(loaded, null, 1));
  renameSync(tmp, file());
  dirty = false;
}

/** The human-readable record of the last run. */
export function exportRun(report: unknown): string | null {
  if (!enabled()) return null;
  mkdirSync(dir(), { recursive: true });
  const out = path.join(dir(), "latest.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  return out;
}
