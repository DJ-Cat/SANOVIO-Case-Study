/**
 * extract_lib's output -> the platform's canonical products.
 *
 * One catalog.json record is one table row, which is *nearly* the grain a
 * canonical product needs. Two things stand between the two, and both are
 * handled here rather than downstream:
 *
 *   1. A catalogue states the same article in more than one table. The product
 *      tables carry the dimensions and the photography; an appendix restates
 *      the same part numbers against a national identifier. Those are one
 *      article, so the rows are folded (`foldDuplicateSkus`).
 *   2. A catalogue names a *family* once and distinguishes its rows by the
 *      table around them. Carried over literally, every size of a needle
 *      arrives with the same name (`distinguishNames`).
 *
 * The mapping is otherwise deliberately lossless: every column of the source
 * table survives in `attributes` under its original German header, because a
 * header we do not recognise today is still the manufacturer's own description
 * of the article.
 */
import type {
  CatalogProduct, CatalogAttribute, ExtractOutput,
} from "./extract-lib";
import { troubledPages } from "./extract-lib";
import { EXTRACTION_THRESHOLD } from "../matching/thresholds";

export interface MappedRow {
  name: string;
  sku: string;
  gtin: string | null;
  spec: string;
  uom: string;
  pack_size: number;
  confidence: number;
  missing: string[];
  /** Every column of the source row, header verbatim. */
  attributes: Record<string, string>;
  section: string;
  description: string | null;
  order_note: string | null;
  carton_quantity: number | null;
  color: string | null;
  page: number | null;
  figures: CatalogProduct["figures"];
}

/** Columns whose value reads as the unit a price would be quoted per. */
const UOM_COLUMN = /^(ve|verpackungseinheit|einheit|uom)$/i;

/**
 * Columns that identify or count an article rather than describe it.
 *
 * A table built only from these is a lookup — a part number against a national
 * article number — not a product table. It restates articles specified
 * elsewhere in the catalogue, which is why it is used to enrich a row rather
 * than to create one.
 */
const IDENTIFIER_COLUMN =
  /^(produkt|artikel|bestell|katalog)?[\s.-]*(nr|nummer|no|ref|code)\b|^(pharmazentralnummer|pzn|gtin|ean|udi)|^(ve\b|uk\b|ve\s*\/\s*uk|menge|verpackung|umkarton)/i;

/** The national article number a DACH catalogue lists its products against. */
const PZN_COLUMN = /pharmazentralnummer|^pzn/;

const isDescriptive = (a: CatalogAttribute) => !IDENTIFIER_COLUMN.test(a.column.trim());

/**
 * Confidence, from what the run actually established — never a model
 * self-report.
 *
 * extract_lib already refuses to emit a row whose part number is absent from
 * the page text, so a row that exists at all has cleared the hardest check.
 * What remains is whether its own page validated cleanly, and how much of the
 * row survived.
 */
function confidenceFor(p: CatalogProduct, pageTroubled: boolean): {
  confidence: number; missing: string[];
} {
  const descriptive = p.attributes.filter(isDescriptive);
  const missing: string[] = [];
  if (!p.attributes.length) missing.push("attributes");
  else if (!descriptive.length) missing.push("descriptive_columns");
  if (p.pack_quantity == null) missing.push("pack_quantity");
  if (!p.gtin) missing.push("gtin");
  if (!p.figures.length) missing.push("figure");

  // A page whose output failed validation was re-run once and still disagreed
  // with the text layer somewhere. Every row on it goes to a human.
  if (pageTroubled) return { confidence: 55, missing: [...missing, "page_failed_validation"] };

  // A figure the model itself called uncertain is not a reason to doubt the
  // row's identifiers, so it costs less than a missing attribute does.
  const uncertainFigure = p.figures.some((f) => f.confidence === "uncertain");

  let score = 100;
  if (!p.attributes.length) score -= 25;
  // A row whose every column is an identifier says what the article is called
  // and nothing about what it is. On its own it cannot be matched against a
  // hospital line, so it belongs in front of a human rather than in the
  // catalogue — even though its part number read cleanly.
  else if (!descriptive.length) score -= 25;
  if (p.pack_quantity == null) score -= 6;
  if (uncertainFigure) score -= 4;
  return { confidence: Math.max(0, score), missing };
}

function specOf(attributes: CatalogAttribute[]): string {
  // The dimensional columns are what the matching layer parses for gauge,
  // length and volume; joining them keeps that reader working unchanged.
  return attributes.map((a) => `${a.column} ${a.value}`).join(" · ");
}

function uomOf(attributes: CatalogAttribute[]): string {
  const hit = attributes.find((a) => UOM_COLUMN.test(a.column.trim()));
  return hit?.value?.trim() || "Stück";
}

/**
 * Part numbers are copied character for character off the page and validated
 * back against its text layer, so the only variation between two printings of
 * one number is incidental whitespace. Nothing else is stripped: a hyphen in
 * `TP-INTER-X` is part of the number, not decoration around it.
 */
const normSku = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

/**
 * How much of an article a row actually describes.
 *
 * Used only to choose between two rows carrying the same part number, so it
 * needs to rank rather than to mean anything absolutely. A row from a product
 * table wins because it has dimensional columns and photography; a row from an
 * identifier appendix has neither.
 */
function richness(p: CatalogProduct): number {
  return p.attributes.filter(isDescriptive).length * 10
    + (p.figures.length ? 5 : 0)
    + (p.description ? 2 : 0)
    + p.attributes.length;
}

/**
 * One part number is one article.
 *
 * A catalogue states an article in its product table — with the dimensions,
 * the pack sizes and the photograph — and then, at the back, restates the same
 * part numbers in an index against a national article number. extract_lib is
 * right to read both: they are both tables, and its rule is one record per
 * table row. But they are not two products, and importing them as two leaves
 * the catalogue half full of twins carrying the appendix's 26-character SAP
 * short text ("BD ECLIPSE SICHER21G 1 1/2") and no photograph.
 *
 * The richest row wins the identity. Every other row is merged into it, so the
 * appendix contributes what it alone knows — the Pharmazentralnummer — instead
 * of contributing a duplicate.
 */
export function foldDuplicateSkus(products: CatalogProduct[]): CatalogProduct[] {
  const groups = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const key = normSku(p.manufacturer_part_number ?? "");
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(p); else groups.set(key, [p]);
  }

  const folded: CatalogProduct[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { folded.push(group[0]); continue; }

    const winner = group.reduce((best, p) => {
      const d = richness(p) - richness(best);
      if (d !== 0) return d > 0 ? p : best;
      // Same richness: the earlier page is the one the catalogue leads with.
      return (p.source_page ?? Infinity) < (best.source_page ?? Infinity) ? p : best;
    });

    const merged: CatalogProduct = { ...winner, attributes: [...winner.attributes] };
    const held = new Set(merged.attributes.map((a) => a.column.trim().toLowerCase()));

    for (const other of group) {
      if (other === winner) continue;
      // Only columns the winner does not already carry. A value stated twice
      // is not evidence of two things, and the product table is the better
      // source for anything both tables mention.
      for (const a of other.attributes) {
        const k = a.column.trim().toLowerCase();
        if (held.has(k) || !a.value?.trim()) continue;
        held.add(k);
        merged.attributes.push(a);
      }
      merged.gtin ??= other.gtin;
      merged.pack_quantity ??= other.pack_quantity;
      merged.carton_quantity ??= other.carton_quantity;
      merged.color ??= other.color;
      merged.description ??= other.description;
      merged.order_note ??= other.order_note;
      // A figure the winner's own table did not carry is still this article's
      // photograph, so figures union rather than being taken from one row.
      for (const f of other.figures) {
        if (!merged.figures.some((g) => g.figure_id === f.figure_id)) {
          merged.figures = [...merged.figures, f];
        }
      }
    }
    folded.push(merged);
  }
  return folded;
}

/**
 * Headers are compounds, and a catalogue hyphenates them however the column
 * fits: `Größe`, `Kanülengröße` and `Kanülen-größe (G)` are the same column.
 * Folding away case, umlauts and punctuation lets one pattern match all three.
 */
const foldHeader = (h: string) => h
  .toLowerCase()
  .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
  .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u")
  .replace(/[^a-z0-9]/g, "");

/**
 * Columns a buyer would use to tell two rows of one table apart, in the order
 * they would reach for them. Anything not listed is still in the spec text.
 */
const LABEL_COLUMN: RegExp[] = [
  /gr(o|oss)sse|size|gauge/,
  /volumen|inhalt|volume/,
  /ansatz|anschluss|konus/,
  /lange|length/,
  /wandstarke|wall/,
  /schliff|bevel/,
  /aussen|outer/,
  /farbcode|farbe|colou?r/,
  /graduierung|skalierung/,
];

/** Match a row's columns against LABEL_COLUMN, keeping the priority order. */
function labelColumns(rows: MappedRow[]): string[] {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.attributes)))];
  const out: string[] = [];
  for (const pattern of LABEL_COLUMN) {
    for (const h of headers) {
      if (pattern.test(foldHeader(h)) && !out.includes(h)) out.push(h);
    }
  }
  return out;
}

const compose = (name: string, parts: string[]) =>
  parts.length ? `${name}, ${parts.join(" \u00b7 ")}` : name;

/**
 * Give every row of a family a name that identifies it.
 *
 * A catalogue prints "BD Eclipse\u2122 Sicherheitsinjektionskanülen mit
 * SmartSlip\u2122-Technologie" once, above a table of eight sizes; the row is
 * identified by the table it sits in, not by prose. Copied out literally, all
 * eight articles arrive under one name, which is unusable in a catalogue
 * listing, in a search result and in a recommendation card alike.
 *
 * The distinguishing columns are not chosen from a fixed list but from what
 * actually varies within the family, added in the order a buyer would reach
 * for them and stopping as soon as the names are unique. A family whose rows
 * differ only in size gains only the size.
 */
export function distinguishNames(rows: MappedRow[]): MappedRow[] {
  const families = new Map<string, MappedRow[]>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const g = families.get(key);
    if (g) g.push(r); else families.set(key, [r]);
  }

  for (const family of families.values()) {
    if (family.length < 2) continue;
    const base = family[0].name;

    const varying = labelColumns(family).filter((col) => {
      const seen = new Set(family.map((r) => (r.attributes[col] ?? "").trim()));
      return seen.size > 1;
    });

    const chosen: string[] = [];
    const nameOf = (r: MappedRow) =>
      compose(base, chosen.map((c) => r.attributes[c]?.trim()).filter(Boolean) as string[]);

    for (const col of varying) {
      chosen.push(col);
      if (new Set(family.map(nameOf)).size === family.length) break;
    }

    // Names are proposed for the whole family before any is written, so the
    // collision test cannot see a half-renamed family.
    const proposed = family.map((r) => [r, nameOf(r)] as const);
    const times = new Map<string, number>();
    for (const [, n] of proposed) times.set(n, (times.get(n) ?? 0) + 1);

    for (const [r, n] of proposed) {
      // Columns that vary may still leave two rows identical — a table can
      // carry one article twice under different order codes. Only the rows
      // that actually collide pay for it with a part number in their name.
      r.name = (times.get(n) ?? 0) > 1 ? `${n}, Nr. ${r.sku}` : n;
    }
  }
  return rows;
}

export function mapCatalog(out: ExtractOutput): MappedRow[] {
  const troubled = troubledPages(out.report);

  const rows = foldDuplicateSkus(out.catalog.products).map((p) => {
    const attributes: Record<string, string> = {};
    for (const a of p.attributes) attributes[a.column] = a.value;
    const { confidence, missing } = confidenceFor(p, troubled.has(p.source_page ?? -1));

    return {
      name: p.product_name,
      sku: p.manufacturer_part_number,
      gtin: p.gtin,
      spec: specOf(p.attributes),
      uom: uomOf(p.attributes),
      pack_size: p.pack_quantity ?? 1,
      confidence,
      missing,
      attributes,
      section: p.section_title,
      description: p.description,
      order_note: p.order_note,
      carton_quantity: p.carton_quantity,
      color: p.color,
      page: p.source_page ?? null,
      figures: p.figures,
    };
  });

  return distinguishNames(rows);
}

export const acceptsWithoutReview = (r: MappedRow) => r.confidence >= EXTRACTION_THRESHOLD;

/**
 * Canonical attributes from the table's own columns.
 *
 * extract_lib hands back each row as its real columns — "Außendurchmesser (mm)"
 * with the value "0,4" — which is strictly better information than re-reading a
 * dimension out of the product name with a regex. The matching layer keys off
 * `od_mm` and `length_mm`, so the columns are mapped onto those names and win
 * over anything inferred from prose.
 *
 * Headers vary by manufacturer and section, so this matches on meaning rather
 * than on an exact string, and anything it does not recognise is left in the
 * spec text where a human can still read it. Matching runs against the folded
 * header — the syringe-with-cannula tables spell the same columns
 * `Kanülen-Außen-0 (mm)` and `Kanülen-länge (mm)`, and anchored patterns
 * dropped both, leaving a page that showed neither diameter nor length while
 * the table stated both.
 */
const COLUMN_MAP: [RegExp, string][] = [
  [/aussen|outerdiam|^od/, "od_mm"],
  [/lange|length/, "length_mm"],
  [/wandstarke|wall/, "wall"],
  [/farbcode|farbe|colou?r/, "colour"],
  [/volumen|inhalt|volume/, "volume_ml"],
  [/innendurchmesser|^id$/, "id_mm"],
];

/** "0,4" is 0.4; "2.400" is 2400. German sheets use the comma for decimals. */
function germanNumber(v: string): number | null {
  const m = /-?\d[\d.\s]*(?:,\d+)?/.exec(v.replace(/ /g, " "));
  if (!m) return null;
  const cleaned = m[0].replace(/[.\s]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "30 G 1/2\"" -> 30G. The gauge is the discriminating half of a size cell. */
function gaugeFrom(value: string): string | null {
  const m = /\b(\d{2})\s*G\b/i.exec(value);
  return m ? `${m[1]}G` : null;
}

export function attributesFromColumns(
  columns: Record<string, string>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};

  for (const [header, raw] of Object.entries(columns)) {
    const value = (raw ?? "").trim();
    if (!value) continue;

    const folded = foldHeader(header);

    // A size cell carries the gauge, which is what a clinician actually matches on.
    if (/grosse|size|gauge/.test(folded)) {
      const g = gaugeFrom(value);
      if (g) out.gauge = g;
      else out.size_label = value;
      continue;
    }

    // The national article number is an exact identifier, which is the
    // cheapest layer of the matching pipeline. It arrives from the catalogue's
    // own index, so it is worth carrying as an attribute rather than leaving
    // in the spec text where only a human would ever read it.
    if (PZN_COLUMN.test(folded)) {
      const digits = value.replace(/\D/g, "");
      if (digits) out.pzn = digits;
      continue;
    }

    const hit = COLUMN_MAP.find(([re]) => re.test(folded));
    if (!hit) continue;
    const [, key] = hit;

    if (key.endsWith("_mm") || key === "volume_ml") {
      const n = germanNumber(value);
      if (n !== null) out[key] = n;
    } else {
      out[key] = value;
    }
  }
  return out;
}
