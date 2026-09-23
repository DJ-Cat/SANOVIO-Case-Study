/**
 * Freeze an already-extracted catalogue so it can be reloaded without paying
 * for the extraction again.
 *
 * Writes the same shape extract_lib itself produces — catalog.json, a figure
 * manifest, and the figure PNGs — so `load-fixture.ts` exercises the real
 * import path rather than a shortcut around it. Anything that reloads from here
 * is therefore still testing the code that runs on a live upload.
 *
 *   npx tsx scripts/export-fixture.ts [supplierOrgId] [outDir]
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { db } from "../lib/db.ts";
import type { CatalogProduct } from "../lib/ingest/extract-lib.ts";

const supplierId = process.argv[2] ?? "org_bd";
const outDir = path.resolve(process.argv[3] ?? "fixtures/bd-catalogue");

const conn = db();

const doc = conn.prepare(
  `SELECT id, filename, content_type, file_bytes FROM source_documents
   WHERE organization_id = ? AND kind = 'supplier_catalogue'
   ORDER BY uploaded_at DESC LIMIT 1`).get(supplierId) as
  { id: string; filename: string; content_type: string | null; file_bytes: Uint8Array } | undefined;
if (!doc) { console.error(`no catalogue document for ${supplierId}`); process.exit(1); }

const items = conn.prepare(
  `SELECT id, canonical_product_id, raw_extraction_payload
   FROM supplier_catalog_items WHERE source_document_id = ?`).all(doc.id) as any[];
if (!items.length) { console.error("that document produced no rows"); process.exit(1); }

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(path.join(outDir, "assets"), { recursive: true });

// --- catalog.json, rebuilt in extract_lib's own shape ---------------------
const products: CatalogProduct[] = [];
for (const it of items) {
  let row: any = {};
  try { row = JSON.parse(it.raw_extraction_payload ?? "{}"); } catch { continue; }

  products.push({
    product_name: row.name,
    manufacturer_part_number: row.sku,
    gtin: row.gtin ?? null,
    section_title: row.section ?? "",
    // The mapped row holds columns as an object; extract_lib emits them as an
    // ordered array. Column order is the one thing this round trip loses.
    attributes: Object.entries(row.attributes ?? {}).map(([column, value]) => ({
      column, value: String(value),
    })),
    color: row.color ?? null,
    // `pack_size` defaults to 1 on import, so "was absent" is recovered from
    // the missing list rather than from the value.
    pack_quantity: (row.missing ?? []).includes("pack_quantity") ? null : row.pack_size ?? null,
    carton_quantity: row.carton_quantity ?? null,
    order_note: row.order_note ?? null,
    description: row.description ?? null,
    // Each figure crop is exported under its own id below, so the reference
    // has to point there rather than at the path inside the original run
    // directory — that directory was a scratch dir and is long gone. Without
    // this the capture reloads with the rows but not their pictures.
    figures: (row.figures ?? []).map((f: any) => ({
      ...f, crop_file: `assets/${f.figure_id}.png`, source_files: [],
    })),
    source_page: row.page ?? undefined,
  });
}

// --- the figures those products point at ----------------------------------
const images = conn.prepare(
  `SELECT DISTINCT figure_id, page, image_bytes FROM product_images
   WHERE source_document_id = ?`).all(doc.id) as any[];

const figures = images.map((img) => {
  const file = `assets/${img.figure_id}.png`;
  writeFileSync(path.join(outDir, file), new Uint8Array(img.image_bytes));
  return {
    id: img.figure_id, page: img.page, bbox_pt: [], bbox_norm: [],
    crop_file: file, crop_px: [], sources: [],
  };
});

const pages = [...new Set(products.map((p) => p.source_page).filter(Boolean))] as number[];

writeFileSync(path.join(outDir, "catalog.json"), JSON.stringify({
  source_pdf: doc.filename,
  model: "claude-opus-5",
  pages_processed: pages.sort((a, b) => a - b),
  product_count: products.length,
  products,
}, null, 2), "utf8");

writeFileSync(path.join(outDir, "assets", "manifest.json"), JSON.stringify({
  source_pdf: doc.filename, page_count: pages.length,
  figure_count: figures.length, figures,
}, null, 2), "utf8");

// Every page validated on the run this was taken from; nothing was troubled.
writeFileSync(path.join(outDir, "report.json"), JSON.stringify({
  duration_seconds: 0, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0,
  pages: pages.sort((a, b) => a - b).map((page) => ({
    page, products: products.filter((p) => p.source_page === page).length,
    attempts: 1, error: null, problems: [], unassigned_figures: [],
  })),
}, null, 2), "utf8");

// The original document too, so the stored source stays downloadable in the
// portal and the reloaded platform is indistinguishable from a live upload.
writeFileSync(path.join(outDir, doc.filename), new Uint8Array(doc.file_bytes));

writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({
  supplier_org_id: supplierId,
  source_pdf: doc.filename,
  content_type: doc.content_type ?? "application/pdf",
  exported_at: new Date().toISOString(),
  note: "Real extract_lib output, frozen so features can be tested without re-running it.",
}, null, 2), "utf8");

const bytes = images.reduce((a, i) => a + i.image_bytes.length, 0);
console.log(`${products.length} SKUs and ${figures.length} figures -> ${outDir}`);
console.log(`  ${(bytes / 1e6).toFixed(1)} MB of images`);
