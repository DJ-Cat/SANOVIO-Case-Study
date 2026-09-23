---
version: 1
slug: "app-hospital-page-tsx"
primary_target: "app/hospital/page.tsx"
related_targets: ["app/supplier/page.tsx","app/admin/page.tsx","app/page.tsx"]
---

# Surface brief — SANOVIO platform (all portals)

Scope: hospital, supplier and admin portals plus the landing page, one system. Mode: Operate.
Audience and job: DACH hospital buyers and manufacturer staff doing dense, frequent desk work — matching article lines, reading specs, answering and signing off questions, ordering.
Constraints: follow sanovio.de's own visual language — rounded edges, a soft violet glow around card edges, Manrope, brand blue #5659FB with the site's blue-to-violet gradient, ink greys, the dot grid. Closer to the platform's earlier rounded-card style, but cleaner. The Technical Drawing direction (square corners, hairline rules, stamps, title blocks) was tried and rejected by the user as unusable: hard edges and unclear interfaces.

## Direction contract

THESIS: The platform looks like sanovio.de's product, not a separate tool: calm white cards lifted by a long soft shadow with a faint violet edge glow, lavender light pooling in panel corners, pill chips, and one gradient for the action that matters. Clarity first — every control looks pressable, every state is said in words.

OWN-WORLD: Ground #f7f7fa with the dot grid and a lavender glow at the top of the page. Cards: white, 18px radius, shadow-glow (1px violet tint + wide low violet halo); inset panels 14px radius, pale grey with dot grid and a lavender corner glow (the site's feature tile). Manrope throughout, bold tight headings, tabular figures; no mono, no caps labels. Pills for status (soft tints; solid rose only for "blocking"); primary buttons in the site gradient (#0E10D6 → #5659FB → #7173F4) with a violet glow, secondary as white chips with a hairline edge; segmented pill controls for tabs and filters. Floating rounded sidebar card with the site's vector wordmark. Rounded chat bubbles and avatars in Messages.

STORY: A buyer sees at once what each suggestion replaces, why it matches, what it saves, and what still needs a signature — in an interface that feels like SANOVIO.

FIRST VIEWPORT: Cockpit: bold title with its action on the right, a glowing rounded search field with the gradient Search button, then one card listing every suggestion (number, your item → replacement, kind and MDR pills, price, saving pill, points pill).

FORM: SANOVIO web (sanovio.de), derived from the live site's CSS, shadows, radii, gradient and assets (vector wordmark at public/brand/sanovio-logo.svg).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
