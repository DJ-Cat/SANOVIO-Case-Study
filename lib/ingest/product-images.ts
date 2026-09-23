/**
 * Store the figures extract_lib assigned to each SKU.
 *
 * The crop is what gets stored, not the embedded source bitmap: a figure is
 * frequently several overlapping bitmaps plus vector art and a drop shadow, and
 * only the rendered crop is the picture a person would recognise. The sources
 * stay on disk in the run directory for anyone who needs originals.
 *
 * Bytes go into the database rather than onto a filesystem, for the same reason
 * uploaded documents do: a deployment that scales horizontally has no shared
 * disk, and a product photograph that 404s is worse than none.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { db, id, nowIso, tx } from "../db";
import type { ExtractOutput } from "./extract-lib";
import type { MappedRow } from "./catalog-import";
import type { SupplierSheetRow } from "./parse-supplier-sheet";

/** Pictures above this are downsampled by the browser anyway; skip the outliers. */
const MAX_BYTES = Number(process.env.PRODUCT_IMAGE_MAX_BYTES ?? 4_000_000);

export function storeFigures(
  out: ExtractOutput,
  documentId: string,
  items: { itemId: string; row: MappedRow | SupplierSheetRow }[],
): number {
  const conn = db();

  // Only promoted rows have a canonical product to hang a picture on.
  const canonicalOf = new Map<string, string>();
  for (const { itemId } of items) {
    const r = conn.prepare(
      `SELECT canonical_product_id AS cp FROM supplier_catalog_items WHERE id=?`)
      .get(itemId) as { cp: string | null } | undefined;
    if (r?.cp) canonicalOf.set(itemId, r.cp);
  }

  const ins = conn.prepare(
    `INSERT OR IGNORE INTO product_images (id,canonical_product_id,source_document_id,figure_id,
       page,role,region,caption,confidence,content_type,byte_size,image_bytes,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // One figure can be assigned to many SKUs, so its bytes are read once.
  const cache = new Map<string, Buffer | null>();
  const bytesFor = (figureId: string, cropFile?: string): Buffer | null => {
    if (cache.has(figureId)) return cache.get(figureId) ?? null;
    const rel = cropFile ?? out.figures.get(figureId)?.crop_file;
    const abs = rel ? path.join(out.outDir, rel) : null;
    const buf = abs && existsSync(abs) ? readFileSync(abs) : null;
    cache.set(figureId, buf && buf.byteLength <= MAX_BYTES ? buf : null);
    return cache.get(figureId) ?? null;
  };

  let stored = 0;
  tx(() => {
    for (const { itemId, row } of items) {
      const canonicalId = canonicalOf.get(itemId);
      const figures = (row as MappedRow).figures;
      if (!canonicalId || !figures?.length) continue;

      for (const f of figures) {
        const buf = bytesFor(f.figure_id, f.crop_file);
        if (!buf) continue;
        ins.run(id("img"), canonicalId, documentId, f.figure_id,
          out.figures.get(f.figure_id)?.page ?? null,
          f.role, f.region, f.caption, f.confidence,
          "image/png", buf.byteLength, new Uint8Array(buf), nowIso());
        stored++;
      }
    }
  });
  return stored;
}
