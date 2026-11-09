---
name: visual-design
description: Design standards for any UI, page, landing page, dashboard, logo, brand, mockup, deck visuals. Use whenever producing something people look at - app screens, Artifacts, marketing pages, icons, branding.
---

# Visual Design

## Route
- Artifact page/dashboard/deck/design → `Artifact` quickstart first (it picks types + design systems), then `artifact-design` skill rules. Charts → `dataviz`.
- App UI in a repo → Tailwind + a consistent token set (below); component library shadcn/ui-style patterns.
- Logo/icon → hand-written SVG (simple geometric mark + wordmark), export PNG via ImageMagick/Playwright.

## Defaults
- Hebrew RTL: `dir="rtl"`, logical CSS (`ms-/me-`, `start/end`), mirrored icons where directional, numbers/LTR runs wrapped in `dir="ltr"` when needed.
- Fonts: Heebo / Assistant / Rubik via Google Fonts (reachable from the sandbox; none installed locally – only DejaVu/Liberation, which look generic). Base 16px, scale 12/14/16/20/24/32/40.
- Color tokens on `:root` + dark mode; one brand hue, neutral grays, semantic success/warn/danger. Contrast ≥ WCAG AA (Israeli accessibility regulation 5568 for public sites).
- Spacing 4/8 grid, radius 8–12, soft shadows, generous whitespace, max ~1200px content.
- Every screen: clear primary action, empty state, loading skeleton, error message in plain Hebrew, mobile layout at 375px.
- Dashboards: KPI tiles on top, then trend chart, then actionable table.

## Verify
Screenshot with Playwright at the width most users have (mobile 375 for consumer apps, 1280 for back-office); add the second width only for layout-heavy screens. Fix misalignment/overflow/contrast before delivering.
