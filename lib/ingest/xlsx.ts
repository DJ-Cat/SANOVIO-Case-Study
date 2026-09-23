/** Read the first worksheet of an .xlsx as rows of strings. */
import { readZip } from "./zip";

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
   .replace(/&amp;/g, "&");

export function readXlsx(buf: Buffer): string[][] {
  const files = readZip(buf);

  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared: string[] = [];
  for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }

  const sheetName = [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetName) return [];
  const sheet = files.get(sheetName)!.toString("utf8");

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1];
      const refCol = /r="([A-Z]+)/.exec(attrs)?.[1];
      const idx = refCol ? colIndex(refCol) : cells.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[2])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];

      let value = "";
      if (inline !== undefined) value = decodeXml(inline);
      else if (v !== undefined) value = type === "s" ? (shared[+v] ?? "") : decodeXml(v);

      while (cells.length < idx) cells.push("");
      cells[idx] = value.replace(/^'/, "").trim();   // Excel text-marker apostrophe
    }
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

function colIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
