/**
 * Showing a price in the reader's currency.
 *
 * Display only. Every price is stored, compared and ordered in the currency
 * it was quoted in — a manufacturer's ladder in CHF stays in CHF, and a saving
 * is worked out between two CHF figures. Conversion happens at the last step,
 * on the way to the screen, at a reference rate that is marked as approximate
 * wherever it is used: a hospital reading "≈ EUR 0.041" is reading an
 * estimate, never a quote.
 *
 * Pure, so server pages and client components format the same way.
 */

const decimals = (n: number, digits: number) =>
  new Intl.NumberFormat("de-CH", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export type Currency = "CHF" | "EUR" | "USD" | "GBP";
export const CURRENCIES: Currency[] = ["CHF", "EUR", "USD", "GBP"];
export const DEFAULT_CURRENCY: Currency = "CHF";
export const CURRENCY_COOKIE = "sanovio_currency";

export const isCurrency = (v: unknown): v is Currency =>
  typeof v === "string" && (CURRENCIES as string[]).includes(v);

/** Units of each currency per one CHF, and the day they were published. */
export interface Rates {
  date: string;
  /** Where they came from: the ECB reference rates, or the built-in fallback. */
  source: "ecb" | "fallback";
  perChf: Record<Currency, number>;
}

/**
 * Used when the rate service cannot be reached — an offline demo, a firewall.
 * Rough on purpose, and labelled as such by `source`.
 */
export const FALLBACK_RATES: Rates = {
  date: "2026-09-01", source: "fallback",
  perChf: { CHF: 1, EUR: 1.06, USD: 1.2, GBP: 0.91 },
};

/** An amount in `from`, in `to`. Null when the source currency has no known rate. */
export function convert(amount: number, from: string, to: Currency, rates: Rates): number | null {
  if (from === to) return amount;
  const f = isCurrency(from) ? rates.perChf[from] : undefined;
  if (!f) return null;
  return (amount / f) * rates.perChf[to];
}

export interface MoneyParts {
  /** The currency the amount is shown in. */
  code: string;
  /** The formatted figure, without the code. */
  text: string;
  /** True when it was converted, and so is an estimate. */
  approx: boolean;
  /** The amount as stored — what a tooltip on a converted figure shows. */
  original: string;
}

/**
 * The pieces of a displayed amount. `digits` fixes the decimals; without it
 * they scale with the magnitude, as `price` does.
 */
export function moneyParts(
  amount: number, from: string, to: Currency, rates: Rates, digits?: number,
): MoneyParts {
  // Unit prices span four orders of magnitude, so by default the decimals
  // follow the figure — the same rule as `price` in app/components/format.
  const fmt = (n: number) => decimals(n, digits ?? (Math.abs(n) < 1 ? 3 : 2));
  const original = `${from} ${fmt(amount)}`;
  const converted = convert(amount, from, to, rates);
  if (converted == null || from === to) return { code: from, text: fmt(amount), approx: false, original };
  return { code: to, text: fmt(converted), approx: true, original };
}

/** "CHF 0.038", or "≈ EUR 0.040" when converted. */
export function formatMoney(
  amount: number, from: string, to: Currency, rates: Rates, digits?: number,
): string {
  const m = moneyParts(amount, from, to, rates, digits);
  return `${m.approx ? "≈ " : ""}${m.code} ${m.text}`;
}
