"""Extract product figures from a catalog PDF.

Produces, per page:
  assets/pNN_figK.png        rendered figure crop (includes vector art + shadows)
  assets/pNN_figK_pM.png     one placement of a multi-placement figure
  assets/pNN_figK_parts.png  contact sheet of those placements, numbered
  assets/pNN_figK_srcM.png   the embedded source image(s) at original resolution
  pages/pNN.png              plain page render (for the extraction call)
  pages/pNN_annotated.png    page render with numbered boxes over each figure

plus assets/manifest.json describing every figure.

Embedded images are grouped into "figures": overlapping or near-touching image
placements are almost always one visual product shot composed of several
bitmaps, so they are unioned before cropping.

That union is right for the hero shot and wrong for everything under it. A
catalogue lays a product family out as a cascade - three needles, eleven
syringes - whose bounding boxes overlap heavily while the articles themselves
do not, so the union collapses eleven separately placed products into one
picture and the only figure id left to assign is the whole table's. Every row
of the table then gets the same photograph.

So a figure with more than one placement also keeps its placements, each
croppable and separately addressable as a `part`. The union stays - sometimes
it really is one photo tiled across several bitmaps, and that is not decidable
from geometry - but the finer grain is no longer thrown away before anything
has had the chance to use it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from pathlib import Path

import pymupdf

# A placement covering most of the page, or bleeding across its full width,
# is a cover/background rather than a product shot.
MAX_PAGE_AREA_FRACTION = 0.55
MAX_PAGE_WIDTH_FRACTION = 0.85
# Below this on-page size (PDF points, 1pt = 1/72in) it is an icon or rule.
MIN_SIDE_PT = 24.0
MIN_AREA_PT2 = 900.0
# Placements closer than this are treated as one figure.
CLUSTER_GAP_PT = 8.0
# Breathing room around a figure crop so the product is not cut flush.
CROP_PAD_PT = 4.0

FIGURE_DPI = 300
PAGE_DPI = 150


@dataclass
class Source:
    xref: int
    width_px: int
    height_px: int
    file: str


@dataclass
class Part:
    """One image placement inside a figure, croppable on its own."""
    id: str
    bbox_pt: list[float]
    bbox_norm: list[float]        # normalised against the FIGURE, not the page
    crop_file: str
    crop_px: list[int]
    # The placement's embedded bitmap, when it could be decoded. Preferred over
    # crop_file as *this article's* picture; see where it is set.
    image_file: str | None = None


@dataclass
class Figure:
    id: str
    page: int
    bbox_pt: list[float]          # [x0, y0, x1, y1] in PDF points, origin top-left
    bbox_norm: list[float]        # same, normalised to 0-1 against page size
    crop_file: str
    crop_px: list[int]
    sources: list[Source] = field(default_factory=list)
    # Only for figures built from more than one placement. Empty otherwise:
    # a single-placement figure is already as specific as the file allows.
    parts: list[Part] = field(default_factory=list)
    # A contact sheet of the parts, numbered, drawn to one common scale.
    # Boxing them on the figure itself does not work: in a cascade the boxes
    # overlap so heavily that no label can be read against the right product.
    # Laid out side by side they are unambiguous, and holding the scale common
    # keeps the one cue that separates a 1 ml syringe from a 50 ml one.
    parts_sheet: str | None = None


def _rects_touch(a: pymupdf.Rect, b: pymupdf.Rect, gap: float) -> bool:
    # NB: bool(Rect) is True even for an empty intersection - test explicitly.
    grown = pymupdf.Rect(a.x0 - gap, a.y0 - gap, a.x1 + gap, a.y1 + gap)
    return not (grown & b).is_empty


def _cluster(rects: list[tuple[pymupdf.Rect, int]], gap: float):
    """Union-find over placements so overlapping bitmaps become one figure."""
    parent = list(range(len(rects)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            if _rects_touch(rects[i][0], rects[j][0], gap):
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[ri] = rj

    groups: dict[int, list[int]] = {}
    for i in range(len(rects)):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def _reading_order(clusters, placements):
    """Sort figures left-to-right within visual rows, rows top-to-bottom.

    A plain (y0, x0) sort interleaves rows whenever figures in the same row are
    not perfectly aligned, which makes the numbering confusing for a reviewer
    comparing the annotated page against the manifest.
    """
    boxes = []
    for idxs in clusters:
        box = pymupdf.Rect(placements[idxs[0]][0])
        for i in idxs[1:]:
            box |= placements[i][0]
        boxes.append((box, idxs))
    boxes.sort(key=lambda b: b[0].y0)

    ordered, row, row_bottom = [], [], None
    for box, idxs in boxes:
        # Same row if the figure starts before the current row's shallowest bottom.
        if row and box.y0 >= row_bottom:
            ordered.extend(i for _, i in sorted(row, key=lambda b: b[0].x0))
            row, row_bottom = [], None
        row.append((box, idxs))
        row_bottom = box.y1 if row_bottom is None else min(row_bottom, box.y1)
    if row:
        ordered.extend(i for _, i in sorted(row, key=lambda b: b[0].x0))
    return ordered


def _save_embedded(doc: pymupdf.Document, xref: int, smask: int, path: Path) -> tuple[int, int]:
    """Write the embedded bitmap at original resolution, applying any soft mask."""
    pix = pymupdf.Pixmap(doc, xref)
    if smask:
        try:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
        except (ValueError, RuntimeError):
            pass  # mask geometry mismatch - keep the unmasked bitmap
    if pix.colorspace is None or pix.colorspace.n > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    pix.save(path)
    return pix.width, pix.height


PART_CELL_PT = 190.0
PART_SHEET_PAD_PT = 10.0
PART_SHEET_COLS = 4


def _contact_sheet(parts: list[Part], out_dir: Path, path: str) -> None:
    """Lay the parts out side by side, numbered, at one common scale."""
    cols = min(PART_SHEET_COLS, len(parts))
    rows = (len(parts) + cols - 1) // cols
    sheet = pymupdf.open()
    page = sheet.new_page(width=cols * PART_CELL_PT, height=rows * PART_CELL_PT)

    inner = PART_CELL_PT - 2 * PART_SHEET_PAD_PT
    widest = max(max(p.bbox_pt[2] - p.bbox_pt[0], p.bbox_pt[3] - p.bbox_pt[1]) for p in parts)
    scale = inner / widest if widest else 1.0

    for n, part in enumerate(parts):
        cx = (n % cols) * PART_CELL_PT
        cy = (n // cols) * PART_CELL_PT
        w = (part.bbox_pt[2] - part.bbox_pt[0]) * scale
        h = (part.bbox_pt[3] - part.bbox_pt[1]) * scale
        box = pymupdf.Rect(
            cx + (PART_CELL_PT - w) / 2, cy + (PART_CELL_PT - h) / 2,
            cx + (PART_CELL_PT + w) / 2, cy + (PART_CELL_PT + h) / 2,
        )
        # The placement's own bitmap, so a cell shows this article and not the
        # neighbours whose bounding boxes it happens to overlap.
        src = part.image_file or part.crop_file
        try:
            page.insert_image(box, filename=str(out_dir / src))
        except (ValueError, RuntimeError):
            continue
        cell = pymupdf.Rect(cx + 1, cy + 1, cx + PART_CELL_PT - 1, cy + PART_CELL_PT - 1)
        page.draw_rect(cell, color=(0.82, 0.84, 0.88), width=0.8)
        _label_box(page, pymupdf.Rect(cell.x0, cell.y0 + 14, cell.x1, cell.y1),
                   str(n + 1), colour=(0.1, 0.3, 0.9), outline=False)

    sheet[0].get_pixmap(dpi=150).save(out_dir / path)
    sheet.close()


def _label_box(page, rect: pymupdf.Rect, label: str, colour=(0.9, 0.1, 0.1),
               outline: bool = True) -> None:
    """Outline a region and tag it, so an id in the prompt has a visible referent."""
    if outline:
        page.draw_rect(rect, color=colour, width=1.2)
    page.draw_rect(
        pymupdf.Rect(rect.x0, max(rect.y0 - 13, 0),
                     rect.x0 + 8 * len(label) + 6, max(rect.y0 - 1, 12)),
        color=colour, fill=colour,
    )
    page.insert_text(pymupdf.Point(rect.x0 + 3, max(rect.y0 - 4, 9)),
                     label, fontsize=9, color=(1, 1, 1))


def extract(pdf_path: str | Path, out_dir: str | Path) -> list[Figure]:
    pdf_path, out_dir = Path(pdf_path), Path(out_dir)
    assets = out_dir / "assets"
    pages = out_dir / "pages"
    assets.mkdir(parents=True, exist_ok=True)
    pages.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(pdf_path)
    figures: list[Figure] = []

    for pno, page in enumerate(doc, start=1):
        page_rect = page.rect
        page_area = page_rect.width * page_rect.height

        placements: list[tuple[pymupdf.Rect, int, int]] = []
        for img in page.get_images(full=True):
            xref, smask = img[0], img[1]
            for rect in page.get_image_rects(xref):
                area = rect.width * rect.height
                if (area > page_area * MAX_PAGE_AREA_FRACTION
                        or rect.width > page_rect.width * MAX_PAGE_WIDTH_FRACTION):
                    continue  # cover / full-bleed background
                if min(rect.width, rect.height) < MIN_SIDE_PT or area < MIN_AREA_PT2:
                    continue  # icon, rule, or stray mark
                placements.append((rect, xref, smask))

        if not placements:
            page.get_pixmap(dpi=PAGE_DPI).save(pages / f"p{pno:02d}.png")
            continue

        clusters = _cluster([(r, x) for r, x, _ in placements], CLUSTER_GAP_PT)
        clusters = _reading_order(clusters, placements)

        page_figs: list[Figure] = []
        for k, idxs in enumerate(clusters, start=1):
            box = pymupdf.Rect(placements[idxs[0]][0])
            for i in idxs[1:]:
                box |= placements[i][0]
            crop = (pymupdf.Rect(
                box.x0 - CROP_PAD_PT, box.y0 - CROP_PAD_PT,
                box.x1 + CROP_PAD_PT, box.y1 + CROP_PAD_PT,
            ) & page_rect)

            fig_id = f"p{pno:02d}_fig{k}"
            crop_name = f"{fig_id}.png"
            pix = page.get_pixmap(clip=crop, dpi=FIGURE_DPI)
            pix.save(assets / crop_name)

            # The embedded bitmaps, written before the parts so a part can
            # point at its own. Keyed by placement so the two orderings - the
            # sources' and the parts' reading order - cannot drift apart.
            sources: list[Source] = []
            source_of: dict[int, Source] = {}
            for m, i in enumerate(sorted(idxs), start=1):
                _, xref, smask = placements[i]
                src_name = f"{fig_id}_src{m}.png"
                try:
                    w, h = _save_embedded(doc, xref, smask, assets / src_name)
                except (ValueError, RuntimeError):
                    continue
                src = Source(xref=xref, width_px=w, height_px=h, file=f"assets/{src_name}")
                sources.append(src)
                source_of[i] = src

            # Placements, kept individually addressable. Only worth doing when
            # the figure was built from more than one: a single placement is
            # already the finest grain the file offers.
            parts: list[Part] = []
            parts_sheet: str | None = None
            if len(idxs) > 1:
                # _reading_order works in clusters, so each placement is
                # handed to it as a cluster of one and comes back the same way.
                ordered = [c[0] for c in _reading_order([[j] for j in idxs], placements)]
                for m, i in enumerate(ordered, start=1):
                    pbox = pymupdf.Rect(placements[i][0])
                    pcrop = (pymupdf.Rect(
                        pbox.x0 - CROP_PAD_PT, pbox.y0 - CROP_PAD_PT,
                        pbox.x1 + CROP_PAD_PT, pbox.y1 + CROP_PAD_PT,
                    ) & page_rect)
                    part_id = f"{fig_id}_p{m}"
                    part_name = f"{part_id}.png"
                    ppix = page.get_pixmap(clip=pcrop, dpi=FIGURE_DPI)
                    ppix.save(assets / part_name)
                    src = source_of.get(i)
                    parts.append(Part(
                        id=part_id,
                        bbox_pt=[round(v, 1) for v in (pbox.x0, pbox.y0, pbox.x1, pbox.y1)],
                        # Normalised against the FIGURE, so the id list reads
                        # against the parts overview rather than the page.
                        bbox_norm=[
                            round((pbox.x0 - crop.x0) / crop.width, 4),
                            round((pbox.y0 - crop.y0) / crop.height, 4),
                            round((pbox.x1 - crop.x0) / crop.width, 4),
                            round((pbox.y1 - crop.y0) / crop.height, 4),
                        ],
                        crop_file=f"assets/{part_name}",
                        crop_px=[ppix.width, ppix.height],
                        # The placement's own bitmap, which in a cascade layout
                        # is the one clean picture of this article: the page
                        # crop around it still catches the neighbours it
                        # overlaps, and this does not.
                        image_file=src.file if src else None,
                    ))
                parts_sheet = f"assets/{fig_id}_parts.png"
                _contact_sheet(parts, out_dir, parts_sheet)

            page_figs.append(Figure(
                id=fig_id,
                page=pno,
                bbox_pt=[round(v, 1) for v in (box.x0, box.y0, box.x1, box.y1)],
                bbox_norm=[
                    round(box.x0 / page_rect.width, 4), round(box.y0 / page_rect.height, 4),
                    round(box.x1 / page_rect.width, 4), round(box.y1 / page_rect.height, 4),
                ],
                crop_file=f"assets/{crop_name}",
                crop_px=[pix.width, pix.height],
                sources=sources,
                parts=parts,
                parts_sheet=parts_sheet,
            ))

        figures.extend(page_figs)

        # Plain render for the extraction call.
        page.get_pixmap(dpi=PAGE_DPI).save(pages / f"p{pno:02d}.png")

        # Annotated render: numbered boxes so the model can name figures by id.
        for fig in page_figs:
            _label_box(page, pymupdf.Rect(*fig.bbox_pt), fig.id.split("_")[1])  # "fig3"
        page.get_pixmap(dpi=PAGE_DPI).save(pages / f"p{pno:02d}_annotated.png")

    manifest = {
        "source_pdf": pdf_path.name,
        "page_count": doc.page_count,
        "figure_count": len(figures),
        "figures": [asdict(f) for f in figures],
    }
    (assets / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    doc.close()
    return figures


if __name__ == "__main__":
    import sys

    pdf = sys.argv[1] if len(sys.argv) > 1 else "Produktkatalog 02.pdf"
    out = sys.argv[2] if len(sys.argv) > 2 else "out"
    figs = extract(pdf, out)
    by_page: dict[int, int] = {}
    for f in figs:
        by_page[f.page] = by_page.get(f.page, 0) + 1
    nparts = sum(len(f.parts) for f in figs)
    print(f"{len(figs)} figures ({nparts} parts) across {len(by_page)} pages -> {out}/")
    for p in sorted(by_page):
        print(f"  p{p:02d}: {by_page[p]} figure(s)")
