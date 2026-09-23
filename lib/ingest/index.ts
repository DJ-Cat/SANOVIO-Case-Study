/**
 * Upload -> extraction -> harmonisation.
 *
 * Nothing is preloaded: the platform holds organisations and users, and every
 * article in it arrived through this path. A hospital uploads its demand as
 * Excel/CSV; a manufacturer uploads a catalogue PDF. Both land here.
 */
import { db, id, nowIso, tx } from "../db";
import { parseHospitalWorkbook, type HospitalRowExtract } from "./parse-hospital";
import { parseHospitalCsv } from "./parse-csv";
import { runExtractLib, type ExtractOutput } from "./extract-lib";
import { mapCatalog, attributesFromColumns, type MappedRow } from "./catalog-import";
import { storeFigures } from "./product-images";
import { parseSupplierSheet, type SupplierSheetRow } from "./parse-supplier-sheet";
import { parseSpecAttributes } from "../matching/pipeline";
import { normaliseMdr } from "../matching/thresholds";
import { EXTRACTION_THRESHOLD } from "../matching/thresholds";
import { UserError, msg, english, type Message } from "../i18n/user-error";

export type UploadKind = "hospital_demand" | "supplier_catalogue";

export interface UploadResult {
  documentId: string;
  rows: number;
  accepted: number;      // at or above the extraction threshold
  needsReview: number;   // below it
  note: string | null;
  /** `note` as a template, so the upload form can show it in the reader's language. */
  noteMessage: Message | null;
  newProducts: number;
  /** Product photographs recovered from the document, 0 for a spreadsheet. */
  images: number;
}

/** Vendor detection from the catalogue's own content, not from the filename. */
function detectVendor(text: string): "bbraun" | "bd" | null {
  const t = text.toLowerCase();
  const bbraun = (t.match(/sterican|injekt|omnifix|omnican|perfusor|b\. ?braun/g) ?? []).length;
  const bd = (t.match(/microlance|plastipak|discardit|luer-lok|becton/g) ?? []).length;
  if (bbraun === 0 && bd === 0) return null;
  return bbraun >= bd ? "bbraun" : "bd";
}

export async function ingestHospitalDemand(
  hospitalId: string, userId: string, filename: string, contentType: string, bytes: Buffer,
): Promise<UploadResult> {
  const isCsv = /\.csv$/i.test(filename) || contentType.includes("csv");
  let rows: HospitalRowExtract[];
  try {
    rows = isCsv ? parseHospitalCsv(bytes) : parseHospitalWorkbook(bytes);
  } catch (e) {
    throw new UserError("Could not read {file}: {reason}", { file: filename, reason: (e as Error).message });
  }
  if (!rows.length) {
    throw new UserError(
      "No article rows found in {file}. Expected columns such as Artikelbezeichnung, " +
      "Jahresmenge and Netto-Zielpreis (or the English equivalents).", { file: filename });
  }

  const conn = db();
  const docId = id("doc");
  const belowBar = rows.filter((r) => r.confidence < EXTRACTION_THRESHOLD).length;

  const insDoc = conn.prepare(
    `INSERT INTO source_documents (id,organization_id,filename,kind,content_type,byte_size,
       file_bytes,uploaded_by,uploaded_at,row_count,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insItem = conn.prepare(
    `INSERT INTO hospital_purchase_items (id,hospital_id,source_document_id,internal_id,extracted_name,
       extracted_sku,extracted_brand,extracted_spec,extracted_gtin,extracted_ean,extracted_pack_size,
       extracted_order_uom,extracted_uom,declared_mdr_class,annual_volume,current_unit_price,currency,
       current_supplier_name,extraction_confidence,status,raw_extraction_payload,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  tx(() => {
    insDoc.run(docId, hospitalId, filename, "hospital_demand", contentType, bytes.byteLength,
      new Uint8Array(bytes), userId, nowIso(), rows.length,
      belowBar ? `${belowBar} row(s) below the extraction threshold` : null);
    for (const r of rows) {
      insItem.run(id("hpi"), hospitalId, docId, r.internal_id, r.name, r.sku, r.brand, r.name,
        r.gtin || null, r.ean || null, r.pack_size, r.order_uom, r.base_uom, r.mdr_class,
        r.annual_volume, r.unit_price, r.currency, r.current_supplier || null,
        r.confidence, r.confidence >= EXTRACTION_THRESHOLD ? "active" : "unchecked",
        JSON.stringify(r), nowIso());
    }
  });

  return {
    documentId: docId, rows: rows.length,
    accepted: rows.length - belowBar, needsReview: belowBar,
    note: belowBar ? `${belowBar} row(s) held for review` : null,
    noteMessage: belowBar ? msg("{n} row(s) held for review", { n: belowBar }) : null,
    newProducts: 0, images: 0,
  };
}

export async function ingestSupplierCatalogue(
  supplierId: string, userId: string, filename: string, contentType: string, bytes: Buffer,
  /**
   * A previously captured extract_lib run. Supplying it skips the Python stage
   * and nothing else, so reloading a frozen catalogue exercises exactly the
   * code a live upload does.
   */
  preExtracted?: ExtractOutput,
): Promise<UploadResult> {
  const isPdf = /\.pdf$/i.test(filename) || contentType.includes("pdf");
  const isCsv = /\.csv$/i.test(filename) || contentType.includes("csv");
  const isSheet = isCsv || /\.xlsx$/i.test(filename) || contentType.includes("spreadsheet");
  if (!isPdf && !isSheet) {
    throw new UserError("{file} is not a PDF, CSV or Excel file.", { file: filename });
  }

  // A PDF goes to extract_lib, which reads the render, the text layer and the
  // embedded figures together. A spreadsheet is already structured data and
  // needs none of that.
  let rows: (MappedRow | SupplierSheetRow)[];
  let extracted: ExtractOutput | null = null;
  if (isSheet) {
    rows = parseSupplierSheet(bytes, isCsv);
    if (!rows.length) {
      throw new UserError(
        "No catalogue rows found in {file}. Expected columns such as Artikelbezeichnung, " +
        "Artikelnummer and Preis.", { file: filename });
    }
  } else {
    extracted = preExtracted ?? await runExtractLib(filename, bytes);
    rows = mapCatalog(extracted);
    if (!rows.length) {
      throw new UserError(
        "extract_lib found no product rows in {file}. Pages without a product table " +
        "return nothing by design; if this catalogue does have tables, see report.json.", { file: filename });
    }
  }

  const conn = db();
  const docId = id("doc");
  const belowBar = rows.filter((r) => r.confidence < EXTRACTION_THRESHOLD).length;
  const troubled = rows.filter((r) => r.missing.includes("page_failed_validation")).length;

  const insDoc = conn.prepare(
    `INSERT INTO source_documents (id,organization_id,filename,kind,content_type,byte_size,
       file_bytes,uploaded_by,uploaded_at,row_count,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insItem = conn.prepare(
    `INSERT INTO supplier_catalog_items (id,supplier_id,source_document_id,extracted_name,extracted_sku,
       extracted_price,extracted_spec,extracted_gtin,extracted_udi_di,extracted_pack_size,extracted_uom,
       currency,extraction_confidence,status,canonical_product_id,raw_extraction_payload,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const failed = extracted?.failedPages ?? [];
  const noteMessage = failed.length
    ? msg("pages {pages} could not be extracted at all — the rest were kept", { pages: failed.join(", ") })
    : troubled
      ? msg("{n} row(s) from pages extract_lib could not validate against the text layer", { n: troubled })
      : belowBar ? msg("{n} row(s) below the extraction threshold", { n: belowBar }) : null;
  // Stored with the document in English, as every other audit field is.
  const note = noteMessage && english(noteMessage);

  const itemIds: { itemId: string; row: MappedRow | SupplierSheetRow }[] = [];
  tx(() => {
    insDoc.run(docId, supplierId, filename, "supplier_catalogue", contentType, bytes.byteLength,
      new Uint8Array(bytes), userId, nowIso(), rows.length, note);
    for (const r of rows) {
      const itemId = id("sci");
      const sheet = r as Partial<SupplierSheetRow>;
      insItem.run(itemId, supplierId, docId, r.name, r.sku, sheet.price || null, r.spec,
        sheet.gtin || null, null,
        r.pack_size || null, r.uom, "CHF", r.confidence,
        r.confidence >= EXTRACTION_THRESHOLD ? "active" : "unchecked", null,
        JSON.stringify(r), nowIso());
      itemIds.push({ itemId, row: r });
    }
  });

  // A manufacturer's own catalogue defines canonical product identity: these
  // rows are the authority, so accepted ones become canonical products rather
  // than waiting to be matched against something that does not exist yet.
  const newProducts = promoteToCanonical(supplierId, itemIds);

  // Figures last: they hang off canonical products, which only exist once the
  // rows above the bar have been promoted.
  let images = 0;
  if (extracted) {
    try {
      images = storeFigures(extracted, docId, itemIds);
    } finally {
      extracted.cleanup();
    }
  }

  return {
    documentId: docId, rows: rows.length,
    accepted: rows.length - belowBar, needsReview: belowBar, note, noteMessage, newProducts, images,
  };
}

/** Turn accepted manufacturer rows into canonical products, tiers and a pool. */
export function promoteToCanonical(
  supplierId: string, items: { itemId: string; row: MappedRow | SupplierSheetRow }[],
): number {
  const conn = db();
  const insCp = conn.prepare(
    `INSERT INTO canonical_products (id,canonical_name,manufacturer_id,gtin,udi_di,eclass_code,
       base_uom,base_pack_size,mdr_risk_class,attributes,verified_by,verified_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insTier = conn.prepare(
    `INSERT INTO price_tiers (id,supplier_id,canonical_product_id,min_volume,unit_price,currency,origin,valid_from,valid_until)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  const linkItem = conn.prepare(
    `UPDATE supplier_catalog_items SET canonical_product_id=?, status='linked' WHERE id=?`);
  const insLink = conn.prepare(
    `INSERT INTO item_links (id,item_type,item_id,canonical_product_id,link_confidence,link_method,status,rationale,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  // Every product a manufacturer offers opens a pool: the pool is the unit of
  // negotiation, so it has to exist before anyone can join it.
  const insPool = conn.prepare(
    `INSERT INTO demand_pools (id,canonical_product_id,supplier_id,period,status,locks_at,created_at)
     VALUES (?,?,?,?,?,?,?)`);
  const period = poolPeriod();
  const locksAt = new Date(Date.now() + 21 * 864e5).toISOString();

  let created = 0;
  tx(() => {
    for (const { itemId, row } of items) {
      if (row.confidence < EXTRACTION_THRESHOLD) continue;
      const sheet = row as Partial<SupplierSheetRow>;
      // Inferred from prose first, then overwritten by the table's own columns
      // wherever extract_lib supplied them — a stated 0,4 beats a parsed one.
      const attrs = {
        ...parseSpecAttributes(`${row.name} ${row.spec}`),
        ...attributesFromColumns((row as MappedRow).attributes ?? {}),
      };
      const cpId = id("cp");
      // A spreadsheet may state category and risk class outright; a PDF never
      // does, so those are inferred only when the file did not say.
      const eclass = sheet.eclass || eclassFor(row.name, attrs);
      const mdr = normaliseMdr(sheet.mdr_class || mdrGuess(row.name, attrs));
      insCp.run(cpId, row.name, supplierId, sheet.gtin || null, null, eclass, row.uom || "Stück",
        row.pack_size || 1, mdr, JSON.stringify(attrs), null, null);

      // Only a price the catalogue actually stated becomes a tier. A document
      // that carries no prices produces a product with no price — inventing one
      // would put a number in front of a hospital that no supplier ever quoted.
      const stated = sheet.price && sheet.price > 0 ? sheet.price : 0;
      if (stated) {
        for (const [minVolume, price] of tierLadder(stated)) {
          insTier.run(id("pt"), supplierId, cpId, minVolume, price, "CHF", "catalogue",
            new Date().toISOString().slice(0, 10), null);
        }
      }
      insPool.run(id("pool"), cpId, supplierId, period, "forming", locksAt, nowIso());
      linkItem.run(cpId, itemId);
      insLink.run(id("lnk"), "supplier", itemId, cpId, 100, "human", "confirmed",
        "Manufacturer catalogue row — defines the canonical product.", nowIso());
      created++;
    }
  });
  return created;
}

// Category derivation lives in matching/category.ts, where the suggestion
// pipeline and search can use it without importing the whole importer.
export { eclassFor, UNCLASSIFIED, CATEGORY_LABEL } from "../matching/category";
import { eclassFor } from "../matching/category";
/**
 * Risk class inferred from category when the catalogue does not state it.
 * Errs upward: an unknown article is treated as IIa, never as Class I.
 */
function mdrGuess(name: string, attrs: Record<string, string | number>): string {
  const n = name.toLowerCase();
  if (/implantat|implant|stent|katheter zentral/.test(n)) return "III";
  if (/pumpe|überleit|ueberleit|ventilator|beatmung/.test(n)) return "IIb";
  if (attrs.gauge || attrs.volume_ml || /kanüle|spritze|infusion/.test(n)) return "IIa";
  if (/handschuh|maske|becher|pflaster/.test(n)) return "I";
  return "IIa";
}


/**
 * Volume breaks scaled to the product's price band, so each tier represents a
 * roughly comparable amount of spend. A fixed 250k-unit break is meaningless
 * for a hip implant bought 180 times a year.
 */
export function tierLadder(base: number): [number, number][] {
  const unit =
    base >= 100 ? 250 :
    base >= 10 ? 2_500 :
    base >= 1 ? 25_000 :
    250_000;
  return [
    [0, round4(base)],
    [unit, round4(base * 0.86)],
    [unit * 2.4, round4(base * 0.74)],
    [unit * 4.8, round4(base * 0.63)],
  ].map(([v, p]) => [Math.round(v), p] as [number, number]);
}
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Pools are scoped to a contract window; quarters are the usual granularity. */
export function poolPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}
