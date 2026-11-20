---
version: 1
name: All In Capital Triage
description: "A light-first, dense, quiet internal tool. Adapted from the Linear design language (awesome-design-md, MIT): hairline rows, a four-step surface ladder, one lavender-blue accent used only for focus and the single primary action, measured negative tracking on headings. Dark mode uses Linear's own dark ladder. No gradients, no spotlight cards, no decorative colour. Status colour (red/amber/green) appears only where a gate or flag needs Kushal's eye."
source: "https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/linear.app (style only; no Linear brand assets)"

colors:
  light:
    canvas: "#ffffff"
    surface-1: "#f7f8f8"      # rails, table header, inputs
    surface-2: "#f1f2f3"      # hovered row, selected tab
    surface-3: "#e9ebed"      # pressed, drawer header
    hairline: "#e4e6e9"       # row dividers, card edge
    hairline-strong: "#d0d4d9"
    ink: "#0f1011"            # primary text
    ink-muted: "#3c4047"      # secondary text
    ink-subtle: "#62666d"     # meta, labels  (AA on canvas and surface-2)
    ink-disabled: "#9ba0a8"   # disabled only, never body text
    primary: "#5763cc"        # focus ring, primary action, link (Linear #5e6ad2 darkened for AA on surface-1)
    primary-hover: "#4853bd"
    on-primary: "#ffffff"
    red: "#c4372c"            # tripped gate, red flag
    red-bg: "#fdf0ef"
    amber: "#8a5a00"          # warn flag, needs attention
    amber-bg: "#fdf6e7"
    green: "#1f7a3a"          # take the call, clear
    green-bg: "#eef7f0"
  dark:
    canvas: "#0b0c0d"
    surface-1: "#0f1011"
    surface-2: "#141516"
    surface-3: "#191a1b"
    hairline: "#23252a"
    hairline-strong: "#34343a"
    ink: "#f7f8f8"
    ink-muted: "#d0d6e0"
    ink-subtle: "#8a8f98"
    ink-disabled: "#62666d"
    primary: "#7c86e6"
    primary-hover: "#959efa"
    on-primary: "#0b0c0d"
    red: "#f0776d"
    red-bg: "#2a1513"
    amber: "#e3b341"
    amber-bg: "#2a2110"
    green: "#5cc27a"
    green-bg: "#12251a"

typography:
  family-sans: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  family-mono: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
  numbers: "font-variant-numeric: tabular-nums on every score, amount, count and date"
  page-title:   { size: 20px, weight: 600, lineHeight: 1.25, tracking: -0.3px }
  section:      { size: 15px, weight: 600, lineHeight: 1.3,  tracking: -0.1px }
  body:         { size: 14px, weight: 400, lineHeight: 1.5,  tracking: 0 }
  body-sm:      { size: 13px, weight: 400, lineHeight: 1.45, tracking: 0 }
  caption:      { size: 12px, weight: 400, lineHeight: 1.4,  tracking: 0 }
  eyebrow:      { size: 11px, weight: 500, lineHeight: 1.3,  tracking: 0.4px, case: uppercase }
  score-lg:     { size: 28px, weight: 600, lineHeight: 1,    tracking: -0.6px, numbers: tabular }
  mono:         { size: 12px, weight: 400, lineHeight: 1.5 }   # claim IDs, formulas

rounded:
  xs: 4px      # chips, badges, claim chips
  sm: 6px      # buttons, inputs, tags
  md: 8px      # cards, drawers  (inner elements use sm: concentric)
  lg: 12px     # dialogs, command palette
  pill: 9999px

spacing: { xxs: 4px, xs: 8px, sm: 12px, md: 16px, lg: 24px, xl: 32px, xxl: 48px }

elevation:
  0: "none (rows, page)"
  1: "0 0 0 1px var(--hairline), 0 1px 2px rgba(15,16,17,0.04)      # cards (shadow-as-border)"
  2: "0 0 0 1px var(--hairline), 0 4px 12px rgba(15,16,17,0.08)     # popovers, drawer"
  3: "0 0 0 1px var(--hairline), 0 16px 40px rgba(15,16,17,0.16)    # command palette, dialogs"
  focus: "0 0 0 2px var(--canvas), 0 0 0 4px var(--primary)"

motion:
  library: "motion (Framer Motion) only"
  durations: { press: 100ms, hover: 120ms, enter: 180ms, drawer: 240ms }
  easing: "cubic-bezier(0.2, 0, 0, 1)"
  rules: "name properties (never transition: all); scale(0.96) on press; initial={false} on toggles; respect prefers-reduced-motion (fade only)"
---

## Overview

The tool is a working surface for Riya and the partners, not a website. It should read at a glance: which applications need Kushal, why, and where the evidence is. Density comes from compact rows and tight type, not from shrinking hit areas. Colour carries meaning only: the lavender accent marks what you can act on or where focus is; red, amber and green mark gate and flag states. Everything else is ink on neutral surfaces.

Adapted from Linear's design language (hairlines, surface ladder, scarce accent, negative tracking on headings). The light theme is ours: Linear documents only dark, so light tokens are derived from its inverse surfaces and checked for WCAG AA.

## Colors

- **Surfaces**: canvas → surface-1 → surface-2 → surface-3. Hierarchy by one step of lift; never skip levels. Page is canvas; table headers, side rails and inputs sit on surface-1; hover is surface-2.
- **Ink**: ink for primary text, ink-muted for secondary, ink-subtle for labels and meta. ink-disabled is for disabled controls only.
- **Accent** (`primary`): focus ring, the one primary button per view, links, the selected nav item marker, the active score segment on hover. Never a fill for cards or sections.
- **Status**: red = tripped gate or red flag; amber = warn flag, low confidence, needs attention; green = take the call / clear. Always paired with an icon and a word, never colour alone. Backgrounds (`*-bg`) only behind the matching badge.

## Typography

Inter for everything, JetBrains Mono for claim IDs (`GK-d07`), formulas and Langfuse IDs. Every number is `tabular-nums`. Headings use `text-wrap: balance`; long rationale uses `text-wrap: pretty`. No weight above 600.

## Layout

- Left rail (220px, collapsible) with nav; content max width 1440px; 24px page gutter desktop, 16px mobile.
- Pipeline: a table, not cards. Row height 40px (min hit area). Bucket headers are sticky eyebrows.
- Detail: header band (score, recommendation, gates, Kushal's decision bar) over two columns: criteria (left, 3fr) and dossier (right, 2fr). Below 1024px the columns stack.
- Source drawer slides from the right (480px; full width on mobile).

## Elevation

Cards use shadow-as-border (elevation 1) rather than a CSS border, so stacked cards don't double their edges. Popovers and the drawer use elevation 2; the command palette and dialogs elevation 3. Dark mode uses the same hairline ring with darker shadow alpha.

## Shapes

Concentric radii: an 8px card holds 6px buttons and 4px chips, with padding ≥ the radius difference. Pills only for status badges and segmented toggles.

## Components

- **Score**: `score-lg` number + a 6-segment breakdown bar (C1–C6 widths = weights after lens; fill = score/10). Never a lone number.
- **Gate badge**: `G3 Portfolio conflict` with icon, red-bg/red; tripped gates link to their cited reason.
- **Claim chip**: mono ID + short label, surface-2, xs radius; click opens the source drawer. Unverified sources never render as chips.
- **Confidence**: High / Med / Low text badge (green / ink-subtle / amber).
- **Criterion card**: name + weight, score, confidence, 2–3 line rationale, chips, rules applied (R1…R9 tags), precedent memo line, override button.
- **Gap panel**: "Searched N sources, nothing found", list of queries, the cost to the score.
- **Buttons**: primary (accent fill, one per view), secondary (surface-1 + hairline ring), ghost. 32px visual height inside a 40px hit area; `scale(0.96)` on press.
- **Inputs**: surface-1, sm radius, focus ring = elevation.focus.

## Do's and Don'ts

Do: keep the accent scarce; pair every status colour with a word; show the formula next to every computed number; keep hit areas ≥ 40px; keyboard first (j/k, Enter, /, ⌘K).

Don't: gradients, glows, spotlight cards, illustration, hero sections, decorative colour, `transition: all`, weights above 600, pure #000 canvas in dark mode, lone numbers without their breakdown.

## Responsive

1440 (default), 1024 (columns stack, rail collapses to icons), 768 (table drops secondary columns into a row subtitle), 390 (single column; table becomes a list; drawer full-screen). Touch targets ≥ 44px below 768px.

## Iteration guide

1. Decide which surface step a new element sits on before styling it.
2. If you reach for a new colour, it is probably a status: use red/amber/green with a word, or nothing.
3. Run the make-interfaces-feel-better checklist and an accessibility review before calling a screen done.

## Known gaps

- Light theme values are derived, not taken from the source; contrast is verified by `scripts/check-contrast.ts`.
- Chart styling beyond the score bar (calibration confusion matrix, cost charts) is defined when those screens are built (Phases 4–5).
