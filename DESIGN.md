---
name: SANOVIO
description: Procurement platform for DACH hospital medical supplies, drawn in sanovio.de's own web language.
colors:
  sanovio-blue: "#5659fb"
  sanovio-blue-deep: "#4e51e4"
  sanovio-blue-ink: "#3d3fb2"
  gradient-start: "#0e10d6"
  gradient-end: "#7173f4"
  periwinkle: "#b1b3fd"
  lavender-wash: "#dcdcfe"
  lavender-mist: "#eeeeff"
  sheet: "#ffffff"
  ground: "#f7f7fa"
  panel-grey: "#f6f6f9"
  line: "#ececf1"
  line-strong: "#dfe0e7"
  ink-25: "#fafafb"
  ink-50: "#f1f1f4"
  ink-100: "#dcdde3"
  ink-300: "#8e909b"
  ink-400: "#737582"
  ink-500: "#5e5e6b"
  ink-600: "#4a4c5b"
  ink-700: "#3a3c47"
  ink-900: "#1c1d24"
  ink-950: "#0d0e14"
  sheet-dark: "#14151c"
  ground-dark: "#0a0b10"
  panel-dark: "#191a22"
  line-dark: "#23242d"
  line-strong-dark: "#30313c"
  blocking-rose: "oklch(58.6% 0.253 17.585)"
  danger-ink: "oklch(51.4% 0.222 16.935)"
  danger-tint: "oklch(96.9% 0.015 12.422)"
  warn-ink: "oklch(47.3% 0.137 46.201)"
  warn-tint: "oklch(98.7% 0.022 95.277)"
  good-ink: "oklch(50.8% 0.118 165.612)"
  good-tint: "oklch(97.9% 0.021 166.113)"
  substitute-ink: "oklch(49.1% 0.27 292.581)"
  substitute-tint: "oklch(96.9% 0.016 293.756)"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2.4rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.85rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  figure:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  body-dense:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.005em"
  pill:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.35
  caption:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontWeight: 500
    letterSpacing: "0.02em"
    fontFeature: "\"tnum\" 1, \"zero\" 1"
rounded:
  sm: "8px"
  md: "12px"
  panel: "14px"
  lg: "16px"
  card: "18px"
  xl: "24px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "28px"
components:
  button-primary:
    textColor: "{colors.sheet}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-sm:
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-700}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.sanovio-blue-ink}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.card}"
  panel:
    backgroundColor: "{colors.panel-grey}"
    rounded: "{rounded.panel}"
  pill-neutral:
    backgroundColor: "{colors.ink-50}"
    textColor: "{colors.ink-600}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  pill-brand:
    backgroundColor: "{colors.lavender-mist}"
    textColor: "{colors.sanovio-blue-ink}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  pill-blocking:
    backgroundColor: "{colors.blocking-rose}"
    textColor: "{colors.sheet}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  search-field:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
    padding: "6px 6px 6px 16px"
  segmented-control:
    backgroundColor: "{colors.ink-50}"
    rounded: "{rounded.md}"
    padding: "4px"
  segmented-control-active:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-950}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  nav-item-active:
    backgroundColor: "{colors.lavender-mist}"
    textColor: "{colors.sanovio-blue-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  sidebar:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.xl}"
    width: "15.25rem"
  chat-bubble-mine:
    backgroundColor: "{colors.sanovio-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  note-brand:
    textColor: "{colors.sanovio-blue-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: SANOVIO

## Overview

**Creative North Star: "SANOVIO Web, at the Desk"**

The platform is drawn the way sanovio.de draws its own product, so it reads as the same company's tool, not a separate one. Everything sits on calm white cards with generous rounded corners, lifted by a long, very soft shadow and ringed by a faint violet edge glow. Inside them, pale inset panels carry the site's dot grid with lavender light pooling in one corner. A lavender glow washes the top of every page. Manrope runs throughout, in bold, tightly tracked headings and tabular figures.

It is a dense working surface for buyers and manufacturer staff, so clarity comes before atmosphere. Every control looks pressable: buttons are rounded chips, tabs are segmented pills, and the one action that matters on a page carries the site's blue-to-violet gradient. Every state is said in words. Pills say what they count ("7 blocking"), and a drawn mark (ring, half ring, dot, triangle, cross) goes with each colour, so no state depends on colour alone.

This system replaces an earlier "technical drawing" direction that the user rejected. It had square corners, hairline boxes, stamps, title blocks and a mono face, and the user found it hard-edged with unclear interfaces. Nothing from that world carries forward except SANOVIO's brand blue and its grey scale.

**Key Characteristics:**
- White 18px cards with a layered soft shadow and a 1px violet-tinted edge glow; 14px inset panels with a dot grid and a lavender corner glow.
- Manrope only: bold headings with negative tracking, tabular lining figures everywhere, no mono, no all-caps labels.
- One gradient primary action per page (#0E10D6 into #5659FB into #7173F4); all other actions are white ghost chips.
- Pill chips in soft tints; solid rose is reserved for what blocks an order.
- A floating rounded sidebar card carrying SANOVIO's own vector wordmark.
- Light and dark modes, mirrored through `prefers-color-scheme`.

## Colors

One brand hue, SANOVIO's own violet-blue, set against a cool, very light grey scale, with soft semantic tints that only appear on pills and notes.

### Primary
- **SANOVIO Blue** (sanovio-blue): the brand's own #5659FB. Used for the caret, focus rings (via its lighter step), your own chat bubbles, unread count badges, the working mark, and the middle of the gradient.
- **Deep Blue** (gradient-start) into **Soft Violet** (gradient-end): the two ends of the site's gradient, drawn at 95deg with a 55% stop on SANOVIO Blue. Used only on the primary action and the indeterminate progress bar.
- **Blue Ink** (sanovio-blue-ink): text on lavender tints: the active nav item, brand pills, brand notes, and ghost buttons on hover.
- **Lavender Mist / Lavender Wash / Periwinkle** (lavender-mist, lavender-wash, periwinkle): the tint family. Mist fills the active nav item and brand pills, Wash is the text selection colour, and Periwinkle is the ghost-button hover ring and the corner glow in panels and on the page.

### Secondary
- **Substitute Violet** (substitute-ink on substitute-tint): marks a *substitute* (a different article) as opposed to the same article. This is the platform's most important distinction, so it gets its own hue.

### Neutral
- **Sheet** (sheet): card, sidebar, dialog and field surfaces.
- **Ground** (ground): the page, under a fixed 520px lavender glow at the top.
- **Panel Grey** (panel-grey): the base under an inset panel's dot grid and corner glow.
- **Line / Line Strong** (line, line-strong): soft separators. Line is used for table and callout row dividers and card-internal rules; Line Strong is used for ghost-chip rings.
- **Ink scale** (ink-25 to ink-950): cool greys taken from the site. ink-950 is used for titles, ink-900 for body text, ink-500 for leads and secondary copy, ink-400 for labels and meta, ink-300 for placeholders and idle marks, and ink-50 for neutral pill fills and segmented-control wells.
- **Dark surfaces** (sheet-dark, ground-dark, panel-dark, line-dark, line-strong-dark): the dark-mode mirror of Sheet, Ground, Panel Grey and the lines.

### Semantic tints
- **Danger** (danger-ink on danger-tint): used for class III risk, rejections, and blocking counts.
- **Blocking Rose** (blocking-rose): the only solid-filled status colour.
- **Warn** (warn-ink on warn-tint): used for class IIb risk, attention badges, and waiting states.
- **Good** (good-ink on good-tint): used for savings pills and done marks. An exceptional saving flips to a solid emerald fill.

### Named Rules
**The One Gradient Rule.** Each page has exactly one gradient action: the thing the page is for. Everything else is a white ghost chip. If two gradients show at once, one of them is wrong.

**The Solid Rose Rule.** Only a pill for something that blocks an order is filled with solid rose. Every other status is a soft tint with dark ink.

**The Tint-Not-Paint Rule.** Semantic colour arrives as a pale tint behind dark same-hue ink. It never appears as a saturated block of text or a coloured border standing on its own.

## Typography

**Display Font:** Manrope (self-hosted variable, weights 200 to 800, with ui-sans-serif and system-ui fallback)
**Body Font:** Manrope
**Label/Mono Font:** none. Identifiers use Manrope with tabular, slashed-zero figures.

**Character:** One geometric-humanist sans face, as on sanovio.de. Hierarchy comes from weight and tight tracking, not from a second face or capital letters.

### Hierarchy
- **Display** (700, 2.4rem, 1.1, -0.025em): the landing page title only, balanced wrap.
- **Headline** (700, 1.85rem, 1.15, -0.02em): every portal page title, with a 0.95rem ink-500 lead beneath it.
- **Card title** (700, 1.25rem, -0.015em): the portal cards on the landing page.
- **Figure** (700, 1.35rem, -0.01em, tabular): the value in a stat card.
- **Title** (700, 1.02rem, -0.01em): section heads, followed by a 0.8rem ink-400 tabular meta line.
- **Body** (400, 15px, 1.5): the page default, with `tnum` and `lnum` on globally. Tables, notes and dialogs use the denser 0.875rem at 1.625.
- **Field value** (600, 0.92rem, snug): the values in a detail page's fact strip.
- **Label** (600, 12px, 0.005em, sentence case, ink-400): field names, table column heads, stat names.
- **Pill** (600, 11.5px, 1.35): every status chip and count pill. Savings pills use 12px.
- **Caption** (400 to 600, 11px, ink-400): timestamps, secondary meta, message-thread details.

### Named Rules
**The Sentence Case Rule.** Labels are 12px semibold ink-400 in sentence case. No uppercase and no wide tracking anywhere in the system.

**The Figures Not Fonts Rule.** Numbers use tabular lining figures (global `tnum`). Identifiers such as GTIN, REF and PZN use the code treatment (500 weight, 0.02em tracking, slashed zero) in Manrope. A mono face is never introduced.

## Layout

A fixed floating sidebar (15.25rem wide, inset 12px from the viewport edges) sits beside a content column capped at 78rem, with padding of 16px, 24px and 40px at the mobile, small and large breakpoints. Below 1024px the sidebar becomes a drawer over a blurred scrim, and the SANOVIO wordmark moves to the top right of the page. The landing page centres a 72rem column with a three-card grid from `md` up.

Pages stack at a 28px rhythm. A header holds the title and lead, with the page's action at the right. On detail pages a fact strip card follows the header. Sections below use a 12px gap between head and content. Inside cards, rows are padded at 16px by 10 to 12px, with an 8px gap between inline controls and 6px between pills. Stats sit in a grid of small cards with a 12px gap, four or five across on large screens.

## Elevation & Depth

Depth is soft and layered, and it is always tinted. Cards float on a violet-tinted glow rather than a grey drop shadow. Hover and focus strengthen the glow instead of moving the element. Inset panels are recessed with tone (grey, dots and a corner glow), not with shadow. In dark mode, cards keep a 1px violet ring and a wider violet halo.

### Shadow Vocabulary
- **Glow** (`--shadow-glow`): the card and search-field default. It combines a 1px violet ring at 10%, a wide low violet halo and a faint contact shadow.
- **Glow Strong** (`--shadow-glow-strong`): hover on linked cards, and focus-within on the search and composer fields.
- **Soft** (`--shadow-soft`) and **Lift** (`--shadow-lift`): the site's long multi-layer neutral shadows, defined for lifted surfaces.
- **Primary glow**: the gradient button's own violet under-glow with a white inset highlight, deepened on hover.
- **Dialog**: a 1px violet ring with a deep, 80px-wide indigo shadow over a dimmed, 3px-blurred scrim.

### Named Rules
**The Ring-Not-Border Rule.** Edges are drawn with box-shadow rings (1px tinted), never with a bare 1px border box standing alone. Borders appear only as internal row dividers in the Line colour and on drop zones.

## Shapes

Rounded everywhere, and the radius grows with the size of the container. Pills, avatars, position numbers and meters are fully round. Small buttons and segmented tabs use 8px; buttons, fields, nav items and notes use 12px; the inset panel uses 14px; the search field, chat bubbles and conversation rows use 16px; cards use 18px; and the sidebar, messenger shell and dialogs use 24px. Focus outlines are 2px Periwinkle-blue at a 2px offset with an 8px radius. The only dashed edge is a drop target (uploads) or its empty stand-in.

## Components

### Buttons
Rounded chips that plainly look pressable.
- **Shape:** gently rounded (12px); small size 8px.
- **Primary:** the site gradient with white semibold text, padded 8px by 16px (small: 6px by 12px, 12px text), with a violet under-glow. On hover it brightens 5% and the glow deepens; when pressed it darkens slightly. When disabled it loses the gradient and becomes ink-100 with ink-400 text.
- **Ghost:** a white chip with ink-700 text and a 1px Line Strong ring. On hover the text turns Blue Ink and the ring becomes Periwinkle with a small violet halo; when pressed the fill is ink-25.
- **Danger:** a white chip with rose ink and a rose-200 ring, filling rose-50 on hover.
- **Transitions:** 150ms on all properties.

### Chips
- **Status pill:** fully round, padded 3px by 10px, 11.5px semibold, soft tint behind dark same-hue ink. The tones are neutral, brand, violet (substitute), warn, danger, good, and solid-danger (blocking only).
- **Count pill:** a 22px round pill with the number in bold tabular figures. A label can follow it ("7 blocking"). When the count blocks, a triangle mark sits before it in rose.
- **Position number:** a 28px round well, ink-50 with ink-400 text, rose when the row blocks.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** Sheet.
- **Shadow Strategy:** Glow at rest, Glow Strong on hover when the card is a link.
- **Border:** none. The violet ring is the edge.
- **Internal Padding:** 16 to 24px. Tables inside cards pad cells 16px by 12px, with Line dividers between rows.
- **Inset panel:** 14px, Panel Grey with a 14px dot grid at 14% violet and a lavender radial glow in the bottom-right corner. It is used for empty states, the sidebar's workspace tile and landing-card art.

### Inputs / Fields
- **Style:** a white field at 12px (inline fields 8px) with a 1px Line ring.
- **Focus:** the ring shifts to Periwinkle and gains a soft violet halo. Search and composer fields go from Glow to Glow Strong on focus-within.
- **Search:** a 16px white bar with the Glow shadow, a leading search icon, and the gradient Search button inset at its end.

### Navigation
- **Sidebar:** a floating white card at 24px, with a 1px violet ring and a deep soft shadow. It holds the SANOVIO vector wordmark (12px tall), then a panel tile naming the portal and user, then the nav list. Items are 0.9rem medium ink-600 at 12px radius. The active item is Lavender Mist with bold Blue Ink and a 1px violet ring. Badges are round: amber for needs-attention, SANOVIO Blue for unread. The sidebar slides with a 300ms standard easing, and motion is removed under reduced-motion.
- **Segmented tabs:** an ink-50 well at 12px with 4px padding. Each tab is 8px, 14px by 6px, semibold ink-500. The active tab is a white chip in bold ink-950 with a violet ring and a small lift.

### Notes
A softly tinted 12px box with a 1px ring in the same hue. The tones are neutral (ink-25), brand (Lavender Mist at 70%), warn and danger. A note carries a mark, an optional bold lead-in in the tone's ink, and an action on the right. When the note is a link, it gains a violet halo on hover.

### Messages
The messenger is a 24px card with a conversation list and a thread. Your own bubbles are 16px SANOVIO Blue with white text and a blue under-glow. Other people's bubbles are soft white or ink tints. Avatars are round, at 28, 40 and 56px.

### Progress
An indeterminate 6px round bar on Lavender Mist, with a gradient segment sweeping across in 1.4s. It stays deliberately without a percentage, because the server reports none. Under reduced-motion it becomes a static bar at 45% opacity.

## Do's and Don'ts

### Do:
- **Do** round everything: cards 18px, panels 14px, buttons 10 to 12px (small 8px), pills and avatars fully round.
- **Do** say state in words: a pill names what it counts ("7 blocking", "No price yet"), and a drawn mark goes with each status colour.
- **Do** give each page exactly one gradient primary (#0E10D6 into #5659FB into #7173F4). Every other action is a white ghost chip.
- **Do** use soft tinted notes (brand, amber, rose, neutral) with a 1px ring in the same hue.
- **Do** set numbers in tabular figures, and identifiers (GTIN, REF, PZN) in the code treatment in Manrope.
- **Do** set labels at 12px semibold ink-400 in sentence case.
- **Do** mirror every surface in dark mode through `prefers-color-scheme`: dark Sheet, Ground and Panel, with violet rings kept.
- **Do** use SANOVIO's vector wordmark (`public/brand/sanovio-logo.svg`) wherever the brand is shown.

### Don't:
- **Don't** draw a hard 1px box standing alone, square corners, or hairline title-block frames. The user rejected this technical-drawing world.
- **Don't** introduce a mono font, all-caps labels, or letter-spaced eyebrow text.
- **Don't** fill a status pill with solid colour unless it blocks an order.
- **Don't** put the gradient on more than one action on a page, or on anything that is not an action (except the progress bar).
- **Don't** show a number without its unit or what it counts.
- **Don't** use generated raster imagery. Product photos come from the uploaded catalogues, and brand marks are SANOVIO's own files.
