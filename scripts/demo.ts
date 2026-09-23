/**
 * The demo edition's database.
 *
 * The platform ships empty (db/sanovio.db, `npm run dev`). For showing it to
 * somebody, a second, filled edition runs beside it on its own file,
 * db/demo.db, so trying things out in the demo can never put data into the
 * clean one — and a reset of the clean one never costs the demo its data.
 *
 * The demo is restored from a frozen snapshot, db/demo-snapshot.db, which is
 * never served: play with the demo, place orders, sign points off, then
 * `npm run demo:reset` and it is exactly as it was. The snapshot carries the
 * AI analyses too, which cost real calls to produce and would not come back
 * from a rebuild for free.
 *
 *   tsx scripts/demo.ts dev       prepare, then run the demo on :3001 (npm run demo)
 *   tsx scripts/demo.ts build     build the demo edition (npm run build:demo)
 *   tsx scripts/demo.ts start     prepare, then serve that build (npm run start:demo)
 *   tsx scripts/demo.ts prepare   create db/demo.db if it does not exist yet
 *   tsx scripts/demo.ts reset     throw db/demo.db away and restore it
 *   tsx scripts/demo.ts save      freeze the current db/demo.db as the snapshot
 *   tsx scripts/demo.ts freeze <db>  make the snapshot from another database
 *
 * With no snapshot on disk (a fresh checkout — databases are gitignored), a
 * reset builds the demo from the frozen catalogue in fixtures/ instead: the
 * same organisations, the BD catalogue with its photography, and the
 * hospital's article master. No key, no cost — but no AI analyses either.
 */
import { existsSync, rmSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const root = process.cwd();
const DEMO = path.join(root, "db", "demo.db");
const SNAPSHOT = path.join(root, "db", "demo-snapshot.db");
const rel = (p: string) => path.relative(root, p);

/** A database file and the WAL files SQLite keeps beside it. */
function remove(file: string) {
  for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) rmSync(f, { force: true });
}

/**
 * A consistent single-file copy of a live database. VACUUM INTO reads through
 * the WAL, so a copy taken while a server has the file open is still whole —
 * copying the .db file alone would miss whatever sits in the -wal beside it.
 */
function freeze(from: string, to: string) {
  if (!existsSync(from)) fail(`${rel(from)} does not exist.`);
  remove(to);
  const conn = new DatabaseSync(from, { readOnly: true });
  conn.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`);
  conn.close();
}

function counts(file: string): string {
  const conn = new DatabaseSync(file, { readOnly: true });
  const n = (t: string) => (conn.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  const out = `${n("supplier_catalog_items")} catalogue rows, ${n("hospital_purchase_items")} hospital lines, ` +
    `${n("replacements")} replacement(s), ${n("orders")} order(s)`;
  conn.close();
  return out;
}

function run(script: string, args: string[] = []) {
  const tsx = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const res = spawnSync(tsx, [script, ...args], {
    stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, SANOVIO_DB: rel(DEMO) },
  });
  if (res.status !== 0) fail(`${script} failed.`);
}

function reset() {
  remove(DEMO);
  if (existsSync(SNAPSHOT)) {
    copyFileSync(SNAPSHOT, DEMO);
    console.log(`[demo] restored ${rel(DEMO)} from ${rel(SNAPSHOT)} — ${counts(DEMO)}`);
    return;
  }
  if (!existsSync(path.join(root, "fixtures", "bd-catalogue", "catalog.json"))) {
    fail(`No snapshot (${rel(SNAPSHOT)}) and no frozen catalogue in fixtures/ to build one from.\n` +
      "Fill the demo by hand instead: npm run demo, upload in the portals, then npm run demo:save.");
  }
  console.log(`[demo] no snapshot yet — building ${rel(DEMO)} from fixtures/`);
  run("scripts/seed.ts");
  run("scripts/load-fixture.ts");
  console.log(`[demo] built — ${counts(DEMO)}. npm run demo:save keeps it as the snapshot.`);
}

/**
 * Run Next for the demo edition. The environment is set here rather than as
 * `VAR=value next …` in package.json, which Windows shells do not understand.
 */
function next(args: string[]): never {
  const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
  const res = spawnSync(bin, args, {
    stdio: "inherit", shell: process.platform === "win32",
    env: { ...process.env, SANOVIO_DB: rel(DEMO), SANOVIO_EDITION: "demo" },
  });
  process.exit(res.status ?? 1);
}

function prepare() {
  if (existsSync(DEMO)) console.log(`[demo] using ${rel(DEMO)} — ${counts(DEMO)}`);
  else reset();
}

function fail(msg: string): never {
  console.error(`[demo] ${msg}`);
  process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case "dev":
    prepare();
    console.log("[demo] http://localhost:3001 — the clean edition stays on npm run dev (:3000)");
    next(["dev", "-p", "3001"]);
  case "build":
    next(["build"]);
  case "start":
    prepare();
    next(["start", "-p", "3001"]);
  case "prepare":
    prepare();
    break;
  case "reset":
    reset();
    break;
  case "save":
    freeze(DEMO, SNAPSHOT);
    console.log(`[demo] saved ${rel(SNAPSHOT)} — ${counts(SNAPSHOT)}`);
    break;
  case "freeze":
    if (!arg) fail("usage: tsx scripts/demo.ts freeze <database>");
    freeze(path.resolve(arg), SNAPSHOT);
    console.log(`[demo] froze ${arg} as ${rel(SNAPSHOT)} — ${counts(SNAPSHOT)}`);
    break;
  default:
    fail("usage: tsx scripts/demo.ts dev | build | start | prepare | reset | save | freeze <database>");
}
