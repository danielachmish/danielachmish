---
name: visual-design
description: Design and motion standards for any UI - app screens, live/realtime systems, dashboards, landing pages, Artifacts, logos, branding, mockups - including component stack, RTL, animations and micro-interactions. Use whenever producing something people look at or interact with.
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

## Component stack (React/Next apps)
Tailwind + shadcn/ui (Radix primitives: accessible dialogs, menus, tabs) · lucide icons · sonner toasts · Recharts for charts (`dataviz` rules) · react-hook-form + Zod for forms · TanStack Table for data grids. Set `dir="rtl"` on `<html>` and verify Radix popovers/menus open on the correct side.

## Motion – which tool
| Need | Tool |
|---|---|
| Hover, focus, press, simple fades | CSS transitions / Tailwind `transition` + `animate-*` |
| Lists that add/remove/reorder | `@formkit/auto-animate` (one line) or Motion `layout` |
| Enter/exit, modals, drawers, tabs, shared-element, gestures/drag | Motion (`motion/react`, ex-Framer Motion) + `AnimatePresence` |
| Page-to-page transitions | View Transitions API (Next.js support; progressive – fine if browser lacks it) |
| Complex timelines, scroll-driven storytelling (landing pages) | GSAP + ScrollTrigger (free incl. plugins) |
| Illustrated animations (success, empty states, loaders) | Lottie (`@lottiefiles/dotlottie-react`) from LottieFiles assets; Rive for interactive state machines (needs designer-made file) |
| 3D / particles / hero visuals | React Three Fiber (three.js); canvas for particles – lazy-load |
| Celebrations | `canvas-confetti` (sparingly: real milestones only) |

## Motion rules
- Purpose first: feedback, orientation, continuity, delight – never decoration that delays work.
- Durations: micro 100–150ms · small UI 200–250ms · modal/drawer/page 250–350ms · large/hero ≤ 500ms. Enter ease-out, exit ease-in (exit ~20% faster). Springs for drag/gestures.
- Animate only `transform` and `opacity` (GPU); never width/height/top/left on big elements; no animation on lists > ~100 rows.
- RTL: "forward" = slide from the left, back = from the right; drawers open from the start side (right). Use a direction variable, never hard-coded x signs.
- Always honor `prefers-reduced-motion` (Motion `useReducedMotion` / CSS media query) – required for accessibility (IS 5568).
- Lazy-load heavy libs (GSAP, three, Lottie) per route; keep INP < 200ms.

## Live / realtime UI
- Data push: SSE or WebSockets / Supabase Realtime / Postgres LISTEN; fallback polling with backoff.
- Optimistic updates with rollback + toast on failure.
- Changed values: brief highlight flash (bg fade 600–1000ms) or number tween; new rows slide/fade in at top; don't steal scroll position.
- Status: connection indicator (live / reconnecting), "updated X seconds ago", presence avatars when collaborative.
- Loading: skeletons matching final layout (no spinners for > 300ms waits); empty states with an action.

## Verify
Screenshot with Playwright at the width most users have (mobile 375 for consumer apps, 1280 for back-office); add the second width only for layout-heavy screens. Fix misalignment/overflow/contrast before delivering. For animations: record the interaction with Playwright `recordVideo`, extract frames with ffmpeg and check timing/jank; test once with reduced motion emulated.
