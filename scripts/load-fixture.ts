/**
 * Reload a frozen catalogue into the platform.
 *
 * No Python, no API key, no cost — the extraction already happened and its
 * output is on disk. Everything after that point is the live code path, so a
 * feature tested against this is tested against the real importer.
 *
 *   npm run demo:load                       # fixtures/bd-catalogue
 *   npx tsx scripts/load-fixture.ts <dir>   # some other capture
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ingestSupplierCatalogue, ingestHospitalDemand } from "../lib/ingest/index.ts";
import type {
  Catalog, RunReport, ManifestFigure, ExtractOutput,
} from "../lib/ingest/extract-lib.ts";
import { indexFigures } from "../lib/ingest/extract-lib.ts";
import { rerunPipeline } from "../lib/workflow.ts";
import { row } from "../lib/db.ts";
import { HOSPITAL_ID, BUYER } from "../lib/constants.ts";

const dir = path.resolve(process.argv[2] ?? "fixtures/bd-catalogue");

function readJson<T>(rel: string): T {
  const p = path.join(dir, rel);
  if (!existsSync(p)) {
    console.error(`${p} is missing — run scripts/export-fixture.ts first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

async function main() {
  const meta = readJson<{ supplier_org_id: string; source_pdf: string; content_type?: string }>("meta.json");
  const catalog = readJson<Catalog>("catalog.json");
  const report = readJson<RunReport>("report.json");
  const manifest = readJson<{ figures: ManifestFigure[] }>(path.join("assets", "manifest.json"));

  const org = row<{ name: string }>(
    `SELECT name FROM organizations WHERE id = ?`, meta.supplier_org_id);
  if (!org) {
    console.error(`${meta.supplier_org_id} is not an organisation in this database. ` +
      `Run npm run db:reset first.`);
    process.exit(1);
  }

  const already = row<{ n: number }>(
    `SELECT COUNT(*) AS n FROM supplier_catalog_items WHERE supplier_id = ?`, meta.supplier_org_id);
  if ((already?.n ?? 0) > 0) {
    console.log(`${org.name} already has ${already?.n} catalogue rows — nothing loaded.`);
    console.log("Run npm run db:reset first if you want a clean load.");
    return;
  }

  const pdfPath = path.join(dir, meta.source_pdf);
  const bytes = existsSync(pdfPath) ? readFileSync(pdfPath) : Buffer.alloc(0);
  const userId = row<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = ? AND role = 'supplier_user' LIMIT 1`,
    meta.supplier_org_id)?.id ?? "";

  const captured: ExtractOutput = {
    outDir: dir, catalog, report,
    figures: indexFigures(manifest.figures),
    failedPages: [],
    cleanup: () => { /* nothing temporary to remove */ },
  };

  console.log(`loading ${catalog.product_count} SKUs into ${org.name}...`);
  const res = await ingestSupplierCatalogue(
    meta.supplier_org_id, userId, meta.source_pdf,
    meta.content_type ?? "application/pdf", bytes, captured);

  // The hospital half. A spreadsheet is parsed in-process, so this costs
  // nothing and needs no key — which is the whole point: `db:reset` used to
  // leave the platform with a supplier catalogue and no demand at all, and
  // the only documented way back was to re-upload by hand.
  const demand = await loadDemand();

  await rerunPipeline();

  const pngs = readdirSync(path.join(dir, "assets")).filter((f) => f.endsWith(".png")).length;
  console.log(`  ${res.rows} rows, ${res.newProducts} products, ${res.images} image links ` +
              `from ${pngs} figures`);
  if (res.note) console.log(`  note: ${res.note}`);
  if (demand) console.log(`  ${demand}`);
  console.log("\nnpm run dev — the catalogue is loaded.");
}

/**
 * The first hospital demand file that exists, uploaded as the buyer would.
 *
 * Order is deliberate: the real case-study article master before the
 * synthetic sample, so a checkout that has the real file demonstrates with it.
 */
const DEMAND_FILES = [
  "assets/Entwicklungsherausforderungen v01.xlsx",
  "ressources_extra/Entwicklungsherausforderungen v01.xlsx",
  "samples/hospital-hochrisiko-bedarf.csv",
];

async function loadDemand(): Promise<string | null> {
  const already = row<{ n: number }>(
    `SELECT COUNT(*) AS n FROM hospital_purchase_items WHERE hospital_id = ?`, HOSPITAL_ID);
  if ((already?.n ?? 0) > 0) return `hospital already has ${already?.n} lines — left alone`;

  const rel = DEMAND_FILES.find((f) => existsSync(path.resolve(f)));
  if (!rel) return "no hospital demand file on disk — upload one in the cockpit";

  const name = path.basename(rel);
  const out = await ingestHospitalDemand(
    HOSPITAL_ID, BUYER, name, contentTypeFor(name), readFileSync(path.resolve(rel)));
  return `${out.rows} demand line(s) from ${name}`;
}

const contentTypeFor = (name: string) =>
  name.endsWith(".csv") ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

main().catch((e) => { console.error(e); process.exit(1); });
