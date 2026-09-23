/**
 * Keep lib/ingest/extract-lib.ts honest against extract_lib/extract/schema.py.
 *
 * The TypeScript interfaces are hand-written against a Python source of truth
 * that lives outside this repo's typechecker. A field added or an enum widened
 * there would otherwise surface as a silently dropped value at import time, on
 * a catalogue somebody has already paid to extract.
 *
 * Run standalone, or as part of `npm run verify`.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extractLibDir, extractLibPython } from "../lib/ingest/extract-lib.ts";

/** What lib/ingest/extract-lib.ts declares. Update both together, deliberately. */
const DECLARED = {
  product: [
    "product_name", "manufacturer_part_number", "gtin", "section_title", "attributes",
    "color", "pack_quantity", "carton_quantity", "order_note", "description", "figures",
  ],
  figure: ["figure_id", "role", "region", "caption", "confidence"],
  attribute: ["column", "value"],
  page: ["page", "products", "unassigned_figures"],
  role: ["primary", "variant", "shared", "detail", "packaging"],
  confidence: ["certain", "likely", "uncertain"],
};

const DUMP = `
import json, sys
sys.path.insert(0, ".")
from extract.schema import PAGE_SCHEMA
prod = PAGE_SCHEMA["properties"]["products"]["items"]
fig = prod["properties"]["figures"]["items"]
print(json.dumps({
    "product": prod["required"],
    "figure": fig["required"],
    "attribute": prod["properties"]["attributes"]["items"]["required"],
    "page": PAGE_SCHEMA["required"],
    "role": fig["properties"]["role"]["enum"],
    "confidence": fig["properties"]["confidence"]["enum"],
}))
`;

export interface SchemaCheck { ok: boolean; skipped: boolean; problems: string[] }

export function checkExtractSchema(): SchemaCheck {
  const dir = extractLibDir();
  const python = extractLibPython();
  if (!existsSync(dir) || !existsSync(python)) {
    return { ok: true, skipped: true, problems: [] };
  }

  let actual: Record<string, string[]>;
  try {
    actual = JSON.parse(execFileSync(python, ["-c", DUMP], { cwd: dir, encoding: "utf8" }));
  } catch (e) {
    return { ok: false, skipped: false, problems: [`could not read schema.py: ${(e as Error).message}`] };
  }

  const problems: string[] = [];
  for (const [key, declared] of Object.entries(DECLARED)) {
    const theirs = actual[key] ?? [];
    for (const f of theirs) {
      if (!declared.includes(f)) problems.push(`${key}: schema.py has '${f}', the importer does not`);
    }
    for (const f of declared) {
      if (!theirs.includes(f)) problems.push(`${key}: the importer expects '${f}', schema.py no longer has it`);
    }
  }
  return { ok: problems.length === 0, skipped: false, problems };
}

if (import.meta.filename === process.argv[1]) {
  const r = checkExtractSchema();
  if (r.skipped) { console.log("extract_lib not present — schema check skipped"); process.exit(0); }
  if (r.ok) { console.log("importer matches extract_lib/extract/schema.py"); process.exit(0); }
  for (const p of r.problems) console.log(`  FAIL ${p}`);
  process.exit(1);
}
