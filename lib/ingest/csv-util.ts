/** Minimal RFC4180 CSV reader: quoted fields, doubled quotes to escape. */
export function splitCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const delimiter = pickDelimiter(clean);
  return clean.split(/\r?\n/).filter((l) => l.trim()).map((l) => splitLine(l, delimiter));
}

function pickDelimiter(text: string): string {
  const line = text.split(/\r?\n/)[0] ?? "";
  return [";", ",", "\t"]
    .map((d) => [d, line.split(d).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0];
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out.map((v) => v.replace(/^'/, ""));
}
