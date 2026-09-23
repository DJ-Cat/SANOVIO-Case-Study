"""Extract medical product data from a catalogue PDF into JSON.

Usage:
    .venv/bin/python -m extract.run                      # whole catalogue
    .venv/bin/python -m extract.run --pages 5,10,18      # a subset
    .venv/bin/python -m extract.run --dry-run            # cost estimate only

Reads ANTHROPIC_KEY from .env. Expects `extract/assets.py` to have been run
first so out/pages and out/assets/manifest.json exist.

Each page is sent to Claude as the plain page render, the same page annotated
with numbered figure boxes, a contact sheet for every figure built from more
than one placement, the PDF text layer, and the figure manifest for that page.
The image carries table geometry and colour; the text layer carries exact
character sequences; the manifest supplies the figure ids the model assigns to
products.

The contact sheets are what make a figure assignable at the grain of a SKU.
A catalogue lays a family out as one overlapping cascade, so the merged figure
is the whole table's hero shot and attaching it to every row says only "this
is roughly what these look like". The placements underneath it are one product
each, and shown side by side at a common scale the eleven syringes on page 13
are individually identifiable by volume.

Everything the model returns is then checked against the text layer. A part
number that does not occur on the page is not a finding, it is a hallucination,
and the page is re-run once with the failures fed back before being reported.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import anthropic
import pymupdf
from dotenv import load_dotenv

from .schema import PAGE_SCHEMA
from .text import anchored, fold, gtin_check_digit_ok, page_text, parse_pack

MODEL = "claude-opus-5"
MAX_TOKENS = 16000
MAX_WORKERS = 6
# Input $5 / output $25 per MTok.
COST_IN, COST_OUT = 5.0 / 1_000_000, 25.0 / 1_000_000

SYSTEM = """\
You extract structured product data from medical device catalogue pages.

You are given, for one page: a plain render, the same render annotated with red
numbered boxes over every product figure, the PDF text layer, and the list of
figure ids on the page.

Rules:

1. Emit one product record per TABLE ROW, i.e. per SKU - not one per product
   family. A table with eight size rows yields eight records.
2. Copy `manufacturer_part_number` character for character from the text layer.
   It is the Produkt-Nr. / REF column. It may be numeric (303172) or
   alphanumeric (TP-INTER-X, MP-MF-O). Never invent, pad, or reformat one. If
   you cannot read one for a row, omit the whole row rather than guessing.
3. `attributes` holds one entry per column of that row's table, using the column
   header verbatim as `column`. Keep the original German headers and the
   original cell text, including units and decimal commas ("0,4", not 0.4).
4. `pack_quantity` / `carton_quantity` come from the "VE / UK" cell: "100 / 2.400"
   means 100 and 2400 (the dot is a thousands separator, not a decimal point).
5. `gtin` is null unless a GTIN or EAN is literally printed on the page. This
   catalogue has none. Do not derive one from the part number.
6. Figures: use the ids exactly as labelled. A photo may sit in the whitespace
   of one table while showing a product from another; go by what is depicted
   and by captions, not by proximity. Set `confidence` honestly: "certain" only
   when a caption or callout names the product.
7. Where a figure is listed with parts you are given a contact sheet of them,
   numbered and drawn to ONE COMMON SCALE - relative size across cells is real
   information, and for a table of volumes or lengths it is usually the answer.
   Assign a part id with role "primary" to the one row it depicts. Do not
   assign a part when the parts are tiles of one photo rather than separate
   articles, or when you cannot tell which row it is: a wrong specific answer
   is worse than none.
8. Assign the PARENT figure id, role "shared", to every row of the table the
   figure belongs to - including rows that also got a part of their own, and
   including rows the photo does not individually depict. A family shot is
   worth showing as a family shot; the part is what makes a row specific, and
   the two are ranked apart downstream. A row with neither shows no picture at
   all, which is the worst of the three.
9. Colour is identifying evidence, not decoration. A cannula table with a
   Farbcode column against a photo of coloured hubs names its rows outright -
   "orange" in the table and an orange hub in cell 2 is a match worth calling
   "likely", not "uncertain". Size stated in the table against relative size on
   the contact sheet works the same way.
10. A part you cannot place, or a figure with no product, is accounted for in
   `unassigned_figures` with a reason. Every parent figure id on the page must
   appear on some product, via one of its parts, or there. Do not silently
   drop one.
11. Pages with no product table (cover, contents, editorial) return an empty
   products list. That is a valid answer - do not manufacture rows.

Accuracy matters far more than completeness of prose. Descriptions may be
summarised; identifiers, quantities and attributes may not.
"""


@dataclass
class PageResult:
    page: int
    products: list[dict] = field(default_factory=list)
    unassigned_figures: list[dict] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    attempts: int = 0
    error: str | None = None


def _b64_png(path: Path) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.standard_b64encode(path.read_bytes()).decode(),
        },
    }


def _figure_lines(figures: list[dict]) -> str:
    """The id list, with each figure's parts nested under it."""
    lines: list[str] = []
    for f in figures:
        lines.append(f"  {f['id']}  bbox_norm={f['bbox_norm']}")
        for n, part in enumerate(f.get("parts") or [], start=1):
            lines.append(
                f"      {part['id']}  = cell {n} of the {f['id']} contact sheet"
            )
    return "\n".join(lines) or "  (no figures on this page)"


def build_content(pno: int, text: str, figures: list[dict], out_dir: Path) -> list[dict]:
    plain = out_dir / "pages" / f"p{pno:02d}.png"
    annotated = out_dir / "pages" / f"p{pno:02d}_annotated.png"

    content: list[dict] = [{"type": "text", "text": f"## Page {pno} - plain render"}]
    content.append(_b64_png(plain))
    if annotated.exists() and figures:
        content.append({
            "type": "text",
            "text": "## Same page, annotated with red figure labels",
        })
        content.append(_b64_png(annotated))

    # One contact sheet per multi-placement figure. This is the only view in
    # which the individual articles of a cascade are separable, so it is worth
    # an image even though the page render already shows them overlapping.
    for f in figures:
        sheet = f.get("parts_sheet")
        if not sheet or not (out_dir / sheet).exists():
            continue
        content.append({
            "type": "text",
            "text": (
                f"## {f['id']}: its {len(f['parts'])} parts, numbered, at one common scale\n"
                f"Cell n is part id {f['id']}_p<n>. Relative size across cells is real."
            ),
        })
        content.append(_b64_png(out_dir / sheet))

    content.append({
        "type": "text",
        "text": (
            f"## Figure ids on page {pno}\n{_figure_lines(figures)}\n\n"
            f"## Text layer of page {pno} (authoritative for characters)\n"
            f"```\n{text}\n```\n\n"
            f"Extract every SKU on this page."
        ),
    })
    return content


def validate(payload: dict, pno: int, text: str, figures: list[dict]) -> list[str]:
    """Check the model's output against the page. Returns human-readable problems."""
    problems: list[str] = []
    # A part is assignable in its own right; its parent is what has to be
    # accounted for, so an assignment to any part settles the parent too.
    parent_of: dict[str, str] = {}
    for f in figures:
        parent_of[f["id"]] = f["id"]
        for part in f.get("parts") or []:
            parent_of[part["id"]] = f["id"]
    figure_ids = set(parent_of)
    folded = fold(text)
    seen_parts: set[str] = set()

    for i, p in enumerate(payload.get("products", [])):
        part = (p.get("manufacturer_part_number") or "").strip()
        label = f"product[{i}] {part or '<no part number>'}"

        if not part:
            problems.append(f"{label}: missing manufacturer_part_number")
        elif not anchored(part, folded):
            problems.append(
                f"{label}: part number does not occur in the page text layer "
                f"- it was not read off the page"
            )
        elif part in seen_parts:
            problems.append(f"{label}: duplicate part number on the same page")
        else:
            seen_parts.add(part)

        gtin = p.get("gtin")
        if gtin:
            if not anchored(gtin, folded):
                problems.append(f"{label}: gtin '{gtin}' is not printed on the page")
            elif not gtin_check_digit_ok(gtin):
                problems.append(f"{label}: gtin '{gtin}' fails the GS1 check digit")

        # Cross-check declared quantities against the VE/UK cell when present.
        ve = next(
            (a["value"] for a in p.get("attributes", [])
             if "VE" in a.get("column", "") or "UK" in a.get("column", "")),
            None,
        )
        if ve:
            want_pack, want_carton = parse_pack(ve)
            if want_pack is not None and p.get("pack_quantity") != want_pack:
                problems.append(
                    f"{label}: pack_quantity {p.get('pack_quantity')} != {want_pack} from '{ve}'"
                )
            if want_carton is not None and p.get("carton_quantity") != want_carton:
                problems.append(
                    f"{label}: carton_quantity {p.get('carton_quantity')} != {want_carton} from '{ve}'"
                )

        for ref in p.get("figures", []):
            fid = ref.get("figure_id")
            if fid not in figure_ids:
                problems.append(f"{label}: unknown figure_id '{fid}'")

    used = {
        r["figure_id"]
        for p in payload.get("products", []) for r in p.get("figures", [])
    } | {u["figure_id"] for u in payload.get("unassigned_figures", [])}
    accounted = {parent_of[u] for u in used if u in parent_of}
    for missing in sorted({f["id"] for f in figures} - accounted):
        problems.append(f"figure {missing} was neither assigned nor explained")

    return problems


def extract_page(
    client: anthropic.Anthropic,
    pno: int,
    text: str,
    figures: list[dict],
    out_dir: Path,
) -> PageResult:
    result = PageResult(page=pno)
    content = build_content(pno, text, figures, out_dir)
    messages: list[dict] = [{"role": "user", "content": content}]

    for attempt in (1, 2):
        result.attempts = attempt
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM,
                messages=messages,
                output_config={"format": {"type": "json_schema", "schema": PAGE_SCHEMA}},
            )
        except anthropic.APIError as exc:
            result.error = f"API error: {exc}"
            return result

        u = resp.usage
        result.usage = {
            "input_tokens": result.usage.get("input_tokens", 0) + u.input_tokens,
            "output_tokens": result.usage.get("output_tokens", 0) + u.output_tokens,
        }

        if resp.stop_reason == "refusal":
            result.error = f"refused: {getattr(resp.stop_details, 'category', None)}"
            return result
        if resp.stop_reason == "max_tokens":
            result.problems.append("response hit max_tokens - output may be truncated")

        raw = next((b.text for b in resp.content if b.type == "text"), None)
        if raw is None:
            result.error = "no text block in response"
            return result
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            result.error = f"unparseable JSON: {exc}"
            return result

        problems = validate(payload, pno, text, figures)
        result.products = payload.get("products", [])
        result.unassigned_figures = payload.get("unassigned_figures", [])
        result.problems = problems

        if not problems or attempt == 2:
            return result

        # Repair pass: show the model its own output and exactly what failed.
        messages += [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": (
                "Validation of that output against the page failed:\n\n"
                + "\n".join(f"- {p}" for p in problems)
                + "\n\nRe-read the page and text layer and return corrected JSON. "
                  "Drop any row whose part number you cannot find in the text "
                  "layer rather than guessing at it."
            )},
        ]

    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf", default="Produktkatalog 02.pdf")
    ap.add_argument("--out", default="out")
    ap.add_argument("--pages", help="comma-separated page numbers, 1-based")
    ap.add_argument("--dry-run", action="store_true", help="estimate cost, call nothing")
    args = ap.parse_args()

    out_dir = Path(args.out)
    manifest_path = out_dir / "assets" / "manifest.json"
    if not manifest_path.exists():
        print(f"missing {manifest_path} - run extract/assets.py first", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    figs_by_page: dict[int, list[dict]] = {}
    for f in manifest["figures"]:
        figs_by_page.setdefault(f["page"], []).append(f)

    doc = pymupdf.open(args.pdf)
    wanted = (
        [int(x) for x in args.pages.split(",")]
        if args.pages else list(range(1, doc.page_count + 1))
    )
    pages = [(pno, page_text(doc[pno - 1])) for pno in wanted]
    doc.close()

    if args.dry_run:
        imgs = sum(2 if figs_by_page.get(p) else 1 for p, _ in pages)
        est_in = sum(len(t) // 3 for _, t in pages) + imgs * 3100 + len(pages) * 1400
        est_out = len(pages) * 2500
        print(f"{len(pages)} pages, ~{imgs} images")
        print(f"~{est_in:,} input + ~{est_out:,} output tokens")
        print(f"~${est_in * COST_IN + est_out * COST_OUT:.2f}")
        return 0

    load_dotenv()
    api_key = os.getenv("ANTHROPIC_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_KEY not found in .env or environment", file=sys.stderr)
        return 1
    client = anthropic.Anthropic(api_key=api_key)

    started = time.monotonic()
    print(f"extracting {len(pages)} pages with {MODEL} ({MAX_WORKERS} at a time)...")

    def work(item: tuple[int, str]) -> PageResult:
        pno, text = item
        r = extract_page(client, pno, text, figs_by_page.get(pno, []), out_dir)
        flag = "!" if (r.error or r.problems) else " "
        note = r.error or (f"{len(r.problems)} problem(s)" if r.problems else "ok")
        retried = " (retried)" if r.attempts > 1 else ""
        print(f" {flag} p{pno:02d}: {len(r.products):>2} SKU  {note}{retried}")
        return r

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        results = sorted(pool.map(work, pages), key=lambda r: r.page)

    products: list[dict] = []
    for r in results:
        for p in r.products:
            p["source_page"] = r.page
            products.append(p)

    tin = sum(r.usage.get("input_tokens", 0) for r in results)
    tout = sum(r.usage.get("output_tokens", 0) for r in results)
    # Parts resolve to their own bitmap, which is the point of having them: the
    # importer stores whatever crop_file names, so a part-level assignment has
    # to arrive carrying the part's picture and not its parent's hero shot.
    fig_index: dict[str, dict] = {}
    for f in manifest["figures"]:
        fig_index[f["id"]] = {
            "crop_file": f["crop_file"],
            "source_files": [s["file"] for s in f["sources"]],
            "page": f["page"],
        }
        for part in f.get("parts") or []:
            fig_index[part["id"]] = {
                "crop_file": part.get("image_file") or part["crop_file"],
                "source_files": [x for x in (part.get("image_file"),) if x],
                "page": f["page"],
            }
    for p in products:
        for ref in p.get("figures", []):
            fig = fig_index.get(ref["figure_id"])
            if fig:
                ref["crop_file"] = fig["crop_file"]
                ref["source_files"] = fig["source_files"]

    catalog = {
        "source_pdf": manifest["source_pdf"],
        "model": MODEL,
        "pages_processed": [r.page for r in results],
        "product_count": len(products),
        "products": products,
    }
    report = {
        "duration_seconds": round(time.monotonic() - started, 1),
        "input_tokens": tin,
        "output_tokens": tout,
        "estimated_cost_usd": round(tin * COST_IN + tout * COST_OUT, 4),
        "pages": [
            {
                "page": r.page,
                "products": len(r.products),
                "attempts": r.attempts,
                "error": r.error,
                "problems": r.problems,
                "unassigned_figures": r.unassigned_figures,
            }
            for r in results
        ],
    }

    (out_dir / "catalog.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    failed = [r for r in results if r.error]
    flagged = [r for r in results if r.problems]
    print(f"\n{len(products)} SKUs from {len(results)} pages -> {out_dir}/catalog.json")
    print(f"{tin:,} in + {tout:,} out tokens = ${report['estimated_cost_usd']:.2f}"
          f" in {report['duration_seconds']}s")
    if failed:
        print(f"{len(failed)} page(s) errored: {[r.page for r in failed]}")
    if flagged:
        print(f"{len(flagged)} page(s) with unresolved problems: {[r.page for r in flagged]}"
              f" - see {out_dir}/report.json")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
