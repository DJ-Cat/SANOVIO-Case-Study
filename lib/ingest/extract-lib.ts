/**
 * Bridge to extract_lib, the Python catalogue extractor.
 *
 * A catalogue PDF is a typeset document, not a data file: the part numbers live
 * in a text layer, the table geometry lives in the render, and the product
 * photography lives in embedded bitmaps that belong to rows no coordinate can
 * tell you. extract_lib reads all three and returns SKUs with their figures
 * attached, validating every part number back against the page text so a
 * hallucinated row cannot pass.
 *
 * Two stages, and only the second needs a key:
 *   extract.assets  PyMuPDF only — page renders, figure crops, manifest.json
 *   extract.run     Claude — catalog.json, one record per table row
 *
 * The platform shells out rather than reimplementing it. That means Python,
 * pymupdf, anthropic and a working ANTHROPIC_KEY must exist wherever this is
 * deployed; when they do not, the upload fails loudly and says which piece is
 * missing rather than falling back to something that guesses.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Where the pipeline lives, and which interpreter runs it. */
export function extractLibDir(): string {
  return process.env.EXTRACT_LIB_DIR
    ? path.resolve(process.cwd(), process.env.EXTRACT_LIB_DIR)
    : path.join(process.cwd(), "extract_lib");
}
export function extractLibPython(): string {
  return process.env.EXTRACT_LIB_PYTHON
    ? path.resolve(process.cwd(), process.env.EXTRACT_LIB_PYTHON)
    : path.join(extractLibDir(), ".venv", "bin", "python");
}

/** How long the whole extraction may take. 22 pages runs a few minutes. */
const TIMEOUT_MS = Number(process.env.EXTRACT_LIB_TIMEOUT_MS ?? 15 * 60 * 1000);

// --- the shapes extract_lib emits (extract/schema.py is authoritative) ----

export interface CatalogAttribute { column: string; value: string }

export interface CatalogFigureRef {
  figure_id: string;
  role: "primary" | "variant" | "shared" | "detail" | "packaging";
  region: string | null;
  caption: string | null;
  confidence: "certain" | "likely" | "uncertain";
  /** Added by run.py after the model answers, from the asset manifest. */
  crop_file?: string;
  source_files?: string[];
}

export interface CatalogProduct {
  product_name: string;
  manufacturer_part_number: string;
  gtin: string | null;
  section_title: string;
  attributes: CatalogAttribute[];
  color: string | null;
  pack_quantity: number | null;
  carton_quantity: number | null;
  order_note: string | null;
  description: string | null;
  figures: CatalogFigureRef[];
  /** Added by run.py. */
  source_page?: number;
}

export interface Catalog {
  source_pdf: string;
  model: string;
  pages_processed: number[];
  product_count: number;
  products: CatalogProduct[];
}

export interface PageReport {
  page: number;
  products: number;
  attempts: number;
  error: string | null;
  problems: string[];
  unassigned_figures: { figure_id: string; reason: string }[];
}

export interface RunReport {
  duration_seconds: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  pages: PageReport[];
}

/**
 * One image placement inside a figure.
 *
 * A catalogue lays a product family out as an overlapping cascade, so the
 * figure — the union of those placements — is the whole table's hero shot.
 * The placements under it are one article each, which is the grain a SKU's
 * photograph needs. `image_file` is the placement's own bitmap, clean of the
 * neighbours its bounding box overlaps.
 */
export interface ManifestPart {
  id: string;
  bbox_pt: number[];
  bbox_norm: number[];
  crop_file: string;
  crop_px: [number, number];
  image_file: string | null;
}

export interface ManifestFigure {
  id: string; page: number; crop_file: string; crop_px: [number, number];
  sources: { xref: number; width_px: number; height_px: number; file: string }[];
  /** Absent on figures built from a single placement, and on older captures. */
  parts?: ManifestPart[];
  parts_sheet?: string | null;
}

/**
 * Figures and their parts under one lookup, because a product's `figure_id`
 * may name either. A part resolves to its own bitmap and inherits its parent's
 * page — so whatever the model assigned, the importer stores the picture that
 * id actually refers to.
 */
export function indexFigures(figures: ManifestFigure[]): Map<string, ManifestFigure> {
  const map = new Map<string, ManifestFigure>();
  for (const f of figures) {
    map.set(f.id, f);
    for (const part of f.parts ?? []) {
      map.set(part.id, {
        id: part.id,
        page: f.page,
        crop_file: part.image_file ?? part.crop_file,
        crop_px: part.crop_px,
        sources: [],
      });
    }
  }
  return map;
}

export interface ExtractOutput {
  /** Directory the run wrote into; asset paths in the JSON are relative to it. */
  outDir: string;
  catalog: Catalog;
  report: RunReport;
  figures: Map<string, ManifestFigure>;
  /** Pages the run could not extract at all, when others succeeded. */
  failedPages: number[];
  /** Called by the caller once it has read the image bytes it needs. */
  cleanup: () => void;
}

class ExtractLibError extends Error {}

interface Ran { code: number; out: string; err: string }

function run(python: string, args: string[], cwd: string): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, args, { cwd, env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new ExtractLibError(
        `${args.join(" ")} did not finish within ${Math.round(TIMEOUT_MS / 1000)}s.`));
    }, TIMEOUT_MS);

    proc.stdout.on("data", (d) => { out += d; });
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(new ExtractLibError(`could not start ${python}: ${e.message}`));
    });
    proc.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out, err }); });
  });
}

/**
 * One line a person can act on, out of a run that failed.
 *
 * run.py reports per page, so a key that is rejected produces the same message
 * twenty-two times. Showing that verbatim buries the one fact that matters.
 */
function summarise(r: Ran): string {
  const text = `${r.err}\n${r.out}`;
  if (/ANTHROPIC_KEY not found/.test(text)) {
    return "extract_lib has no API key: set ANTHROPIC_KEY in extract_lib/.env.";
  }
  if (/authentication_error|401/.test(text)) {
    return "extract_lib could not authenticate — the ANTHROPIC_KEY in extract_lib/.env was rejected.";
  }
  if (/rate_limit|429/.test(text)) {
    return "extract_lib was rate limited by the API. Try again, or lower MAX_WORKERS in run.py.";
  }
  if (/ModuleNotFoundError|No module named/.test(text)) {
    const mod = /No module named '([^']+)'/.exec(text)?.[1];
    return `extract_lib is missing its Python dependency${mod ? ` '${mod}'` : ""}. ` +
           `Install it into the interpreter at EXTRACT_LIB_PYTHON.`;
  }
  // Unrecognised: collapse repeats so the distinct failures are visible.
  const lines = [...new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))];
  return lines.slice(-6).join(" · ").slice(0, 500) || `extract_lib exited ${r.code}.`;
}

/**
 * Run both stages over one PDF and read the result back.
 *
 * The PDF is written into a scratch directory rather than being read from the
 * upload in place: extract_lib takes a path, and the uploaded bytes only exist
 * in memory and in the database.
 */
export async function runExtractLib(filename: string, bytes: Buffer): Promise<ExtractOutput> {
  const dir = extractLibDir();
  const python = extractLibPython();

  if (!existsSync(dir)) {
    throw new ExtractLibError(
      `extract_lib is not at ${dir}. Set EXTRACT_LIB_DIR to where the extractor lives.`);
  }
  if (!existsSync(python)) {
    throw new ExtractLibError(
      `no Python interpreter at ${python}. Create the virtualenv in extract_lib, or set ` +
      `EXTRACT_LIB_PYTHON to one that has pymupdf and anthropic installed.`);
  }

  const work = mkdtempSync(path.join(tmpdir(), "sanovio-extract-"));
  const cleanup = () => { try { rmSync(work, { recursive: true, force: true }); } catch { /* gone */ } };

  try {
    const pdfPath = path.join(work, path.basename(filename));
    writeFileSync(pdfPath, bytes);
    const outDir = path.join(work, "out");

    // Stage 1 — figures and page renders. No API key, no cost.
    const assets = await run(python, ["-m", "extract.assets", pdfPath, outDir], dir);
    if (assets.code !== 0) throw new ExtractLibError(summarise(assets));

    // Stage 2 — the SKUs themselves.
    const extracted = await run(
      python, ["-m", "extract.run", "--pdf", pdfPath, "--out", outDir], dir);

    const read = <T>(rel: string): T | null => {
      const p = path.join(outDir, rel);
      return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
    };

    // run.py exits non-zero when *any* page errored, but it still writes what
    // the other pages produced. Twenty good pages must not be discarded because
    // two failed — the failures become a note on the upload instead.
    const catalog = read<Catalog>("catalog.json");
    const report = read<RunReport>("report.json");
    const manifest = read<{ figures: ManifestFigure[] }>(path.join("assets", "manifest.json"));

    if (!catalog || !report || !manifest) throw new ExtractLibError(summarise(extracted));
    if (!catalog.products.length) throw new ExtractLibError(summarise(extracted));

    const failedPages = report.pages.filter((p) => p.error).map((p) => p.page);

    return {
      outDir, catalog, report,
      figures: indexFigures(manifest.figures),
      failedPages,
      cleanup,
    };
  } catch (e) {
    cleanup();
    throw e;
  }
}

/** Which pages the run could not fully validate, by page number. */
export function troubledPages(report: RunReport): Set<number> {
  return new Set(report.pages.filter((p) => p.error || p.problems.length).map((p) => p.page));
}
