/**
 * Make sure the clean edition's database has its organisations and users.
 *
 * `npm install` seeds it through `postinstall`, but newer npm versions can
 * hold install scripts back until they are approved, and a fresh checkout
 * then starts the app on a file with tables and nobody in them. This runs
 * before `npm run dev` / `npm start` and seeds only when that is the case —
 * a database that already has organisations is never touched.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const file = path.resolve(process.cwd(), process.env.SANOVIO_DB ?? "db/sanovio.db");

function seeded(): boolean {
  if (!existsSync(file)) return false;
  try {
    const conn = new DatabaseSync(file, { readOnly: true });
    const n = (conn.prepare("SELECT COUNT(*) AS n FROM organizations").get() as { n: number }).n;
    conn.close();
    return n > 0;
  } catch {
    return false;   // no organizations table yet
  }
}

if (!seeded()) {
  console.log(`[setup] ${path.relative(process.cwd(), file)} has no organisations yet — seeding it.`);
  const tsx = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const res = spawnSync(tsx, ["scripts/seed.ts"], { stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
