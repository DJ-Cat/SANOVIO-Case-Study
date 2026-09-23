/** CSV variant of the hospital demand file — same column matching as the xlsx. */
import { HOSPITAL_COLUMNS, buildHospitalRow, type HospitalRowExtract } from "./parse-hospital";
import { splitCsv } from "./csv-util";

export function parseHospitalCsv(buf: Buffer): HospitalRowExtract[] {
  const rows = splitCsv(buf.toString("utf8"));
  if (rows.length < 2) return [];

  const header = rows[0];
  const idx = {} as Record<keyof typeof HOSPITAL_COLUMNS, number>;
  for (const key of Object.keys(HOSPITAL_COLUMNS) as (keyof typeof HOSPITAL_COLUMNS)[]) {
    idx[key] = header.findIndex((h) => HOSPITAL_COLUMNS[key].test(h));
  }
  return rows.slice(1).map((r) => buildHospitalRow((k) => (idx[k] >= 0 ? (r[idx[k]] ?? "") : "")))
    .filter((r) => r.name);
}
