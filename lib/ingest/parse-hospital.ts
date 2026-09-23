/**
 * Hospital demand file -> extracted rows.
 *
 * Column names follow the German article-master export the case study
 * supplies (Artikelbezeichnung / Jahresmenge / Bestellmengeneinheit / ...).
 * Header matching is fuzzy because no two hospitals export the same columns.
 */
import { readXlsx } from "./xlsx";

export interface HospitalRowExtract {
  internal_id: string;
  name: string;
  brand: string;
  sku: string;
  annual_volume: number;
  order_uom: string;
  pack_size: number;
  base_uom: string;
  gtin: string;
  ean: string;
  mdr_class: string;
  unit_price: number;
  currency: string;
  current_supplier: string;
  confidence: number;
  missing: string[];
}

export const HOSPITAL_COLUMNS: Record<keyof Omit<HospitalRowExtract, "confidence" | "missing">, RegExp> = {
  internal_id: /internal[_ ]?id|^id$/i,
  name: /artikelbezeichnung|bezeichnung|beschreibung|description/i,
  brand: /marke|hersteller|brand|manufacturer/i,
  sku: /artikelnummer|art.?-?nr|sku/i,
  annual_volume: /jahresmenge|menge|annual|volume/i,
  order_uom: /bestellmengeneinheit|bestell.?einheit|order.?unit/i,
  pack_size: /basismengeneinheiten pro|pro bme|pack.?size|inhalt/i,
  base_uom: /basismengeneinheit$|base.?unit/i,
  gtin: /gtin/i,
  ean: /ean/i,
  mdr_class: /mdr/i,
  unit_price: /zielpreis|preis|price/i,
  currency: /w[äa]hrung|currency/i,
  current_supplier: /lieferant|h[äa]ndler|supplier|vendor/i,
};

export function parseHospitalWorkbook(buf: Buffer): HospitalRowExtract[] {
  const rows = readXlsx(buf);
  if (rows.length < 2) return [];
  const header = rows[0];

  const idx = {} as Record<keyof typeof HOSPITAL_COLUMNS, number>;
  for (const key of Object.keys(HOSPITAL_COLUMNS) as (keyof typeof HOSPITAL_COLUMNS)[]) {
    idx[key] = header.findIndex((h) => HOSPITAL_COLUMNS[key].test(h));
  }

  return rows.slice(1)
    .map((r) => buildHospitalRow((k) => (idx[k] >= 0 ? (r[idx[k]] ?? "") : "")))
    .filter((r) => r.name);
}

/**
 * Shared by the xlsx and csv readers. Confidence reflects what the file
 * actually carried — it is not a model self-report.
 */
export function buildHospitalRow(
  get: (k: keyof typeof HOSPITAL_COLUMNS) => string,
): HospitalRowExtract {
  const missing: string[] = [];
  const g = (k: keyof typeof HOSPITAL_COLUMNS) => (get(k) ?? "").trim();

  const name = g("name");
  const volume = num(g("annual_volume"));
  const price = num(g("unit_price"));
  const packSize = num(g("pack_size")) || 1;
  const gtin = g("gtin").replace(/\D/g, "");

  if (!name) missing.push("name");
  if (!volume) missing.push("annual_volume");
  if (!price) missing.push("unit_price");
  if (!gtin) missing.push("gtin");
  if (!g("mdr_class")) missing.push("mdr_class");

  let confidence = 100 - missing.length * 14;
  if (gtin && gtin.length !== 13 && gtin.length !== 14) { confidence -= 12; missing.push("gtin_checksum"); }
  if (!g("brand")) confidence -= 6;

  return {
    internal_id: g("internal_id"),
    name, brand: g("brand"), sku: g("sku"),
    annual_volume: volume,
    order_uom: g("order_uom") || "Stk",
    pack_size: packSize,
    base_uom: g("base_uom") || "Stück",
    gtin, ean: g("ean").replace(/\D/g, ""),
    mdr_class: g("mdr_class"),
    unit_price: price,
    currency: g("currency") || "CHF",
    current_supplier: g("current_supplier"),
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    missing,
  };
}

function num(s: string): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}
