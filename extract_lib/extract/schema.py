"""JSON schema for per-page product extraction.

Used as `output_config={"format": {"type": "json_schema", "schema": PAGE_SCHEMA}}`
on the Messages API call, so the model cannot return a shape we can't parse.

Figure association is done by the model, not by geometry: a single photo often
shows several SKUs side by side (p10 fig1), and a photo may sit in the
whitespace of one table while depicting a product from another (p10 fig3). The
model is shown the *annotated* page render, where each figure carries a red
"figN" label matching assets/manifest.json, and assigns those ids to products.

Schema constraints that structured outputs enforce, and which shape the design:
  * every object needs additionalProperties: false, so an open key/value map is
    expressed as an array of {column, value} pairs rather than a free-form dict;
  * every property must appear in `required`, so optional fields are modelled as
    nullable via anyOf rather than by omission.
"""


def _nullable(*types: str) -> dict:
    return {"anyOf": [{"type": t} for t in types] + [{"type": "null"}]}


ATTRIBUTE = {
    "type": "object",
    "additionalProperties": False,
    "required": ["column", "value"],
    "properties": {
        "column": {
            "type": "string",
            "description": "Table column header, verbatim (e.g. 'Größe', 'Länge (mm)').",
        },
        "value": {
            "type": "string",
            "description": "Cell value for this row, verbatim (e.g. '27 G 5/8\"', '0,4').",
        },
    },
}

FIGURE_REF = {
    "type": "object",
    "additionalProperties": False,
    "required": ["figure_id", "role", "region", "caption", "confidence"],
    "properties": {
        "figure_id": {
            "type": "string",
            "description": "Figure label from the annotated page, e.g. 'p10_fig1'.",
        },
        "role": {
            "type": "string",
            "enum": ["primary", "variant", "shared", "detail", "packaging"],
            "description": (
                "primary: the photo shows this product alone. "
                "variant: the photo shows this product among several SKUs. "
                "shared: a section-level hero shot covering the whole table. "
                "detail: a close-up of a feature. packaging: box or blister shot."
            ),
        },
        "region": _nullable("string") | {
            "description": (
                "Where in the figure this product appears when the figure shows "
                "several, e.g. 'leftmost of three'. null for role 'primary'."
            )
        },
        "caption": _nullable("string") | {
            "description": "Caption printed under the figure, verbatim. null if none."
        },
        "confidence": {
            "type": "string",
            "enum": ["certain", "likely", "uncertain"],
            "description": (
                "certain: a caption or callout names this product. "
                "likely: unambiguous from layout. "
                "uncertain: a plausible guess - flag for human review."
            ),
        },
    },
}

PRODUCT = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "product_name", "manufacturer_part_number", "gtin", "section_title",
        "attributes", "color", "pack_quantity", "carton_quantity",
        "order_note", "description", "figures",
    ],
    "properties": {
        "product_name": {
            "type": "string",
            "description": "Full product name including brand and trademark marks.",
        },
        "manufacturer_part_number": {
            "type": "string",
            "description": (
                "Value of the Produkt-Nr. / REF column, copied character for "
                "character from the text layer. May be numeric ('303172') or "
                "alphanumeric ('TP-INTER-X'). Never invent or reformat one."
            ),
        },
        "gtin": _nullable("string") | {
            "description": (
                "Only if a GTIN/EAN is literally printed on the page. This "
                "catalogue contains none, so expect null. Never derive one."
            )
        },
        "section_title": {
            "type": "string",
            "description": "Heading of the table this row belongs to.",
        },
        "attributes": {
            "type": "array",
            "description": (
                "One entry per table column for this row, in column order. "
                "Columns differ per section, so this list is open-ended."
            ),
            "items": ATTRIBUTE,
        },
        "color": _nullable("string") | {
            "description": "Farbcode value if the table has such a column, else null."
        },
        "pack_quantity": _nullable("integer") | {
            "description": "First number of the 'VE / UK' cell (units per pack)."
        },
        "carton_quantity": _nullable("integer") | {
            "description": "Second number of the 'VE / UK' cell (units per carton)."
        },
        "order_note": _nullable("string") | {
            "description": "Footnote tied to this row, e.g. 'Nur in Umkarton-Menge bestellbar'."
        },
        "description": _nullable("string") | {
            "description": "Prose on the page describing this product family."
        },
        "figures": {"type": "array", "items": FIGURE_REF},
    },
}

PAGE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["page", "products", "unassigned_figures"],
    "properties": {
        "page": {"type": "integer"},
        "products": {
            "type": "array",
            "description": "One entry per table ROW (per SKU), not per product family.",
            "items": PRODUCT,
        },
        "unassigned_figures": {
            "type": "array",
            "description": (
                "Figure ids on this page belonging to no product (decorative, "
                "application photo, icon). Accounting for every figure here "
                "means a dropped photo shows up as a gap, not silently."
            ),
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["figure_id", "reason"],
                "properties": {
                    "figure_id": {"type": "string"},
                    "reason": {"type": "string"},
                },
            },
        },
    },
}
