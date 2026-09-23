/**
 * Every string the code passes to `t(...)` should have a German entry.
 *
 *   npx tsx scripts/check-i18n.ts [path-prefix ...]
 *
 * Scans app/ and lib/ for literal first arguments to `t(` and lists the ones
 * missing from the dictionary — optionally only in files under the given
 * prefixes. Strings built at runtime cannot be checked here, which is one
 * more reason to pass values as {placeholders} rather than concatenating.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DE } from "../lib/i18n/de";

const root = path.resolve(import.meta.dirname, "..");
const only = process.argv.slice(2);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "i18n") yield* files(p); }
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

// t("..."), t('...'), t(`...`) without interpolation; also plural(t, n, "one", "many").
const CALL = /\bt\(\s*(["'`])((?:\\.|(?!\1).)*?)\1/gs;
const PLURAL = /\bplural\(\s*t\s*,[^,]+,\s*(["'`])((?:\\.|(?!\1).)*?)\1\s*,\s*(["'`])((?:\\.|(?!\3).)*?)\3/gs;
const unescape = (s: string) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");

let missing = 0;
for (const dir of ["app", "lib"]) {
  for (const f of files(path.join(root, dir))) {
    const rel = path.relative(root, f);
    if (only.length && !only.some((o) => rel.startsWith(o))) continue;
    const src = readFileSync(f, "utf8");
    const keys = new Set<string>();
    for (const m of src.matchAll(CALL)) if (!m[2].includes("${")) keys.add(unescape(m[2]));
    for (const m of src.matchAll(PLURAL)) { keys.add(unescape(m[2])); keys.add(unescape(m[4])); }
    for (const k of keys) {
      if (!(k in DE)) { console.log(`${rel}: ${JSON.stringify(k)}`); missing++; }
    }
  }
}
console.log(missing ? `\n${missing} string(s) without a German entry.` : "Every t() string has a German entry.");
process.exitCode = missing ? 1 : 0;
