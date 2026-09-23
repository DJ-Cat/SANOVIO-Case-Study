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

/**
 * Attribute keys as a buyer reads them: the quantity in words,
 * the unit on the value — "Outer diameter … 0.8 mm", not "od mm … 0.8".
 */
const DIMENSIONS: Record<string, [string, string?]> = {
  od_mm: ["Outer diameter", "mm"], length_mm: ["Length", "mm"], size_mm: ["Size", "mm"],
  volume_ml: ["Volume", "ml"], width_cm: ["Width", "cm"], length_m: ["Length", "m"],
  gauge: ["Gauge"], wall: ["Wall"], colour: ["Hub colour"], connector: ["Connector"],
  material: ["Material"], sterile: ["Sterile"], pzn: ["PZN"], fixation: ["Fixation"],
};
export function dimensionLabel(key: string): string {
  const known = DIMENSIONS[key]?.[0];
  if (known) return known;
  const plain = key.replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}
export function dimensionValue(key: string, v: unknown): string {
  const unit = DIMENSIONS[key]?.[1];
  return unit ? `${v} ${unit}` : String(v);
}
/** Identifiers read in the mono face; everything else in the UI face. */
export const isIdentifier = (key: string) => /pzn|gtin|sku|ref|code|ean|udi/i.test(key);
