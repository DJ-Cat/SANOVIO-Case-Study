/**
 * Number formatting, and nothing else.
 *
 * Split out of `ui.tsx` because that module reaches into `lib/pooling`, which
 * reaches into `node:sqlite` — importing a formatter from a client component
 * dragged the whole data layer into the browser bundle and failed the build.
 * These are pure, so both sides can have them.
 */
export const chf = (n: number, digits = 2) =>
  new Intl.NumberFormat("de-CH", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/**
 * Unit prices in this domain span four orders of magnitude — CHF 0.038 for a
 * cannula, CHF 812 for an implant. Fixed precision makes one of them
 * unreadable, so scale the decimals to the magnitude.
 */
export const price = (n: number) => chf(n, n < 1 ? 3 : 2);

export const num = (n: number) => new Intl.NumberFormat("de-CH").format(Math.round(n));
