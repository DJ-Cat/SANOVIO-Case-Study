/**
 * Reference exchange rates, fetched from the Frankfurter API — the European
 * Central Bank's daily reference rates, free and without a key.
 *
 * The ECB publishes once a working day, so a rate is kept for twelve hours
 * and every page in between reads it from memory. When the service cannot be
 * reached, the last rate that was fetched stands; with none at all, the
 * built-in fallback does, and says so.
 */
import { CURRENCIES, FALLBACK_RATES, type Currency, type Rates } from "./currency";

const URL = `https://api.frankfurter.dev/v1/latest?base=CHF&symbols=${CURRENCIES.filter((c) => c !== "CHF").join(",")}`;
const TTL_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 2500;

let cached: { rates: Rates; at: number } | null = null;
let failedAt = 0;
let inflight: Promise<Rates> | null = null;

export async function exchangeRates(): Promise<Rates> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.rates;
  // A failed fetch is not retried on every page view; the page would wait on it.
  if (now - failedAt < RETRY_MS) return cached?.rates ?? FALLBACK_RATES;
  inflight ??= fetchRates().finally(() => { inflight = null; });
  return inflight;
}

async function fetchRates(): Promise<Rates> {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`rates: HTTP ${res.status}`);
    const body = await res.json() as { date: string; rates: Partial<Record<Currency, number>> };
    const perChf = { ...FALLBACK_RATES.perChf, CHF: 1 };
    for (const c of CURRENCIES) if (c !== "CHF" && typeof body.rates[c] === "number") perChf[c] = body.rates[c]!;
    const rates: Rates = { date: body.date, source: "ecb", perChf };
    cached = { rates, at: Date.now() };
    return rates;
  } catch {
    failedAt = Date.now();
    return cached?.rates ?? FALLBACK_RATES;
  }
}
