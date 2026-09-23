/**
 * Supplier catalogue as CSV/XLSX — the common case for a price list, and the
 * only way to carry a price, which PDFs never do.
 */
import { readXlsx } from "./xlsx";
import { splitCsv } from "./csv-util";

const COLUMNS = {
  name: /artikelbezeichnung|bezeichnung|produkt|description|name/i,
  sku: /artikelnummer|art.?-?nr|produkt.?nr|sku|item/i,
  gtin: /gtin|ean/i,
  pack_size: /pack|inhalt|vpe|einheiten pro/i,
  // Anchored so it cannot swallow "Einheiten pro VPE", which is the pack size.
  uom: /basismengeneinheit|^einheit$|^uom$|^unit$|^base.?unit$/i,
  mdr_class: /mdr|risiko|risk/i,
  eclass: /eclass|klassifik|category/i,
  price: /preis|price|listenpreis/i,
  spec: /spezifikation|merkmale|attributes|spec|dimension/i,
} as const;

/** Shape a spreadsheet row shares with an extracted catalogue row. */
export interface SupplierSheetRow {
  name: string;
  sku: string;
  spec: string;
  uom: string;
  pack_size: number;
  confidence: number;
  missing: string[];
  /** Kept for the audit payload: which sheet row this came from, and its text. */
  page: number;
  raw: string;
  gtin: string;
  mdr_class: string;
  eclass: string;
  price: number;
}

export function parseSupplierSheet(buf: Buffer, isCsv: boolean): SupplierSheetRow[] {
  const rows = isCsv ? splitCsv(buf.toString("utf8")) : readXlsx(buf);
  if (rows.length < 2) return [];
  const header = rows[0];

  const idx = {} as Record<keyof typeof COLUMNS, number>;
  for (const k of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
    idx[k] = header.findIndex((h) => COLUMNS[k].test(h));
  }

  return rows.slice(1).map((r, i) => {
    const g = (k: keyof typeof COLUMNS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    const missing: string[] = [];
    const name = g("name");
    const sku = g("sku");
    const spec = g("spec");
    const pack = num(g("pack_size")) || 1;

    if (!name) missing.push("name");
    if (!sku) missing.push("sku");
    if (!spec) missing.push("dimensions");
    if (!g("price")) missing.push("price");

    // A spreadsheet is a structured source: what is present is trusted.
    const confidence = Math.max(0, Math.min(100, 100 - missing.length * 12));

    return {
      name, sku, spec, pack_size: pack,
      uom: g("uom") || "Stück",
      confidence, missing, page: 0,
      raw: r.join(" | ").slice(0, 400),
      gtin: g("gtin").replace(/\D/g, ""),
      mdr_class: g("mdr_class"),
      eclass: g("eclass"),
      price: num(g("price")),
    } satisfies SupplierSheetRow;
  }).filter((r) => r.name);
}

function num(s: string): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}
