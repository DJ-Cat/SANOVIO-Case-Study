import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Where the data lives.
 *
 * Overridable so the verification run gets its own file. The app's database is
 * the user's: a test harness that uploads fixtures must never write into it,
 * or the platform stops starting empty and shows data nobody uploaded.
 */
const DB_PATH = process.env.SANOVIO_DB
  ? path.resolve(process.cwd(), process.env.SANOVIO_DB)
  : path.join(process.cwd(), "db", "sanovio.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const fresh = !existsSync(DB_PATH);
  const conn = new DatabaseSync(DB_PATH);
  conn.exec("PRAGMA journal_mode = WAL");
  conn.exec("PRAGMA foreign_keys = ON");
  if (fresh) conn.exec(readFileSync(SCHEMA_PATH, "utf8"));
  else migrate(conn);
  _db = conn;
  return conn;
}

/**
 * Columns added after a database was created.
 *
 * The schema is only executed for a fresh file, so an existing one — the
 * user's, with a catalogue in it that cost money to extract — would otherwise
 * have to be thrown away to gain a column. Each step is additive and checked
 * against the live table, so running it twice is a no-op.
 */
function migrate(conn: DatabaseSync): void {
  const has = (table: string, column: string) =>
    (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
      .some((c) => c.name === column);

  if (!has("canonical_products", "description")) {
    conn.exec(`ALTER TABLE canonical_products ADD COLUMN description TEXT`);
  }

  // A hospital choosing a replacement, and the analysis points it raised.
  const exists = (table: string) =>
    Boolean(conn.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table));
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  /** A table's DDL, and the index lines directly under it, copied from schema.sql. */
  const createFromSchema = (table: string) => {
    if (exists(table)) return;
    const ddl = schema.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);\\n(?:CREATE INDEX[^\\n]*\\n)*`));
    if (ddl) conn.exec(ddl[0]);
  };
  createFromSchema("replacements");
  createFromSchema("match_pairs");
  createFromSchema("suggestion_runs");
  createFromSchema("chat_reads");
  for (const [column, type] of [["recommendation_id", "TEXT REFERENCES recommendations(id)"],
                                  ["ordered_at", "TEXT"]] as const) {
    if (!has("replacements", column)) conn.exec(`ALTER TABLE replacements ADD COLUMN ${column} ${type}`);
  }
  // Superseded by the suggestion pipeline's match_pairs; its rows were derived.
  conn.exec(`DROP TABLE IF EXISTS product_equivalences`);
  rebuildRecommendations(conn, schema, has);
  if (!has("hospital_purchase_items", "embedding")) {
    conn.exec(`ALTER TABLE hospital_purchase_items ADD COLUMN embedding BLOB`);
  }
  // Which model (and text version) produced each vector. Null on rows embedded
  // before this was recorded, which is exactly "unknown, re-embed".
  for (const table of ["canonical_products", "hospital_purchase_items"]) {
    if (!has(table, "embedding_model")) conn.exec(`ALTER TABLE ${table} ADD COLUMN embedding_model TEXT`);
  }
  for (const [column, type] of [
    ["replacement_id", "TEXT REFERENCES replacements(id)"],
    ["category", "TEXT"], ["title", "TEXT"], ["detail", "TEXT"], ["sources", "TEXT"],
  ] as const) {
    if (!has("questions", column)) conn.exec(`ALTER TABLE questions ADD COLUMN ${column} ${type}`);
  }
}

/**
 * `recommendations.canonical_product_id` lost its NOT NULL and the table
 * gained `origin`. SQLite cannot drop a NOT NULL in place, so the table is
 * rebuilt the documented way — new table, copy, drop, rename — with foreign
 * keys off for the swap, since orders and questions point at it. Every row
 * is carried over; the ids the rest of the schema references do not change.
 */
function rebuildRecommendations(
  conn: DatabaseSync, schema: string, has: (t: string, c: string) => boolean,
) {
  const cols = conn.prepare(`PRAGMA table_info(recommendations)`).all() as { name: string; notnull: number }[];
  const current = cols.find((c) => c.name === "canonical_product_id");
  if (!current || (current.notnull === 0 && has("recommendations", "origin"))) return;

  const ddl = schema.match(/CREATE TABLE recommendations \([\s\S]*?\n\);\n(?:CREATE INDEX[^\n]*\n)*/)?.[0];
  if (!ddl) throw new Error("schema.sql has no recommendations table to migrate to");
  const [table, ...indexes] = ddl.split(/\n(?=CREATE INDEX)/);
  const carried = cols.map((c) => c.name).join(", ");

  conn.exec("PRAGMA foreign_keys = OFF");
  try {
    conn.exec("BEGIN");
    conn.exec(table.replace("CREATE TABLE recommendations (", "CREATE TABLE recommendations_new ("));
    conn.exec(`INSERT INTO recommendations_new (${carried}) SELECT ${carried} FROM recommendations`);
    conn.exec("DROP TABLE recommendations");
    conn.exec("ALTER TABLE recommendations_new RENAME TO recommendations");
    for (const ix of indexes) conn.exec(ix);
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  } finally {
    conn.exec("PRAGMA foreign_keys = ON");
  }
}

/** Fresh database from schema.sql. Used by the seed script. */
export function resetDb(): DatabaseSync {
  if (_db) { _db.close(); _db = null; }
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
  conn.exec("PRAGMA journal_mode = WAL");
  conn.exec("PRAGMA foreign_keys = OFF");
  const tables = conn
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  for (const t of tables) conn.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  conn.exec(readFileSync(SCHEMA_PATH, "utf8"));
  _db = conn;
  return conn;
}

export const nowIso = () => new Date().toISOString();

let counter = 0;
/** Short readable id. Prefix keeps rows legible while debugging. */
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(3, "0")}`;
}

// --- vector helpers: Float32Array <-> BLOB -------------------------------
export function packVector(v: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(v).buffer);
}
export function unpackVector(b: Uint8Array | null): Float32Array | null {
  if (!b) return null;
  // Copy: the backing buffer may not be 4-byte aligned.
  return new Float32Array(new Uint8Array(b).buffer);
}
export function cosine(a: Float32Array, b: Float32Array): number {
  // Vectors of different lengths come from different models. Comparing their
  // first n dimensions yields a number that looks like a similarity and is
  // not one, so it is refused rather than computed.
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** node:sqlite has no transaction helper; this is the equivalent. */
export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try { const r = fn(); conn.exec("COMMIT"); return r; }
  catch (e) { conn.exec("ROLLBACK"); throw e; }
}

/**
 * node:sqlite returns `Record<string, SQLOutputValue>`, which will not narrow
 * to a row interface directly. These wrap the one unavoidable cast so call
 * sites stay readable and it is done in exactly one place.
 */
export function rows<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])) as unknown as T[];
}
export function row<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as unknown as T | undefined;
}
