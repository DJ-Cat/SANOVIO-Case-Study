"""Page text extraction, normalisation, and verbatim anchoring.

The text layer is the ground truth for character sequences. The page image tells
the model which cell a value sits in; the text layer tells it exactly what the
characters are. Anchoring every extracted part number back to this text is what
makes a hallucinated SKU impossible to pass through undetected.
"""

from __future__ import annotations

import re
import unicodedata

import pymupdf

SOFT_HYPHEN = "­"

# InDesign sets superscript runs (tm, (R), footnote marks) as their own text
# run, so PyMuPDF emits them on a separate line: "BD SafetyGlide\n™ Sicherheits...".
# Re-join them so product names survive as one string.
_ORPHAN_SUPERSCRIPT = re.compile(r"\n([™®©*])")


def page_text(page: pymupdf.Page) -> str:
    """Text layer of one page, cleaned of typesetting artefacts."""
    raw = page.get_text("text")
    raw = raw.replace(SOFT_HYPHEN, "")
    raw = _ORPHAN_SUPERSCRIPT.sub(r"\1", raw)
    raw = unicodedata.normalize("NFC", raw)
    # Collapse runs of blank lines but keep line structure - it carries the
    # column ordering the model uses to line cells up with the image.
    return re.sub(r"\n{3,}", "\n\n", raw).strip()


def fold(s: str) -> str:
    """Aggressively fold a string for comparison only.

    Part numbers pick up thin spaces, non-breaking hyphens and stray dots in
    typeset PDFs. Folding both sides avoids false 'hallucination' reports
    without weakening the check: the digits and letters must still all be there
    in the same order.
    """
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[^0-9a-z]", "", s.lower())


def anchored(value: str, haystack_folded: str) -> bool:
    """True if `value` occurs verbatim (modulo typesetting) in the page text."""
    folded = fold(value)
    return bool(folded) and folded in haystack_folded


def parse_pack(value: str) -> tuple[int | None, int | None]:
    """Split a 'VE / UK' cell such as '100 / 2.400*' into (100, 2400).

    German thousands separators are dots, so '2.400' is 2400, not 2.4.
    """
    if not value:
        return None, None
    nums = re.findall(r"\d[\d.  ]*", value)
    out: list[int | None] = []
    for n in nums[:2]:
        digits = re.sub(r"\D", "", n)
        out.append(int(digits) if digits else None)
    while len(out) < 2:
        out.append(None)
    return out[0], out[1]


def gtin_check_digit_ok(gtin: str) -> bool:
    """GS1 mod-10 validation for GTIN-8/12/13/14."""
    digits = re.sub(r"\D", "", gtin)
    if len(digits) not in (8, 12, 13, 14):
        return False
    body, check = digits[:-1], int(digits[-1])
    total = 0
    # Weights alternate 3,1 from the rightmost body digit leftwards.
    for i, ch in enumerate(reversed(body)):
        total += int(ch) * (3 if i % 2 == 0 else 1)
    return (10 - total % 10) % 10 == check
