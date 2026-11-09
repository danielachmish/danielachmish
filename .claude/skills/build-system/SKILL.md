---
name: build-system
description: Architecture and delivery playbook for building anything software - from a tiny one-screen tool or small app to a large multi-role system/SaaS, site or feature. Use when the user asks to build/create an app, system, tool, site, bot or big module. Sizes the job first, then covers discovery, roles/permissions, data model, security, stack, phased delivery and quality gates.
---

# Build System

## Size the job first (lightest tier that fully works – judge by where it's heading, not just day 1)
| Tier | Examples | Stack | Skip |
|---|---|---|---|
| **XS – tool** | calculator, converter, one-page form, mini game, personal tracker | single HTML Artifact (browser storage, or Artifact `db` capability for shared data) | repo, auth, server |
| **S – small app** | one business, few screens, simple data, maybe login | Next.js + TS + Supabase (Postgres + auth + storage) or SQLite; Vercel; PWA for phone | multi-tenant, queues, RLS hand-rolled |
| **M – product** | several roles, payments, notifications | full default stack below + RBAC + audit | multi-tenant unless needed |
| **L – system / SaaS** | many businesses, money, compliance | full stack + multi-tenant + RLS + jobs + audit + phases | nothing |
State the tier in one line. If it will clearly grow (many users, money, roles) start one tier up; XS that may grow → build it as S.

## Project type → stack (non-web-app work)
| Type | Default |
|---|---|
| Native mobile (store app, camera, push, offline) | Expo (React Native) + TS; else prefer PWA |
| WhatsApp / Telegram bot | Node/TS webhook on Vercel or a small server; WhatsApp Cloud API (needs Meta business account) / Telegram Bot API |
| Automation / integration between services | small Node/Python script + cron (scheduled task or GitHub Actions); consider Make/Zapier if user prefers no-code |
| Data script / one-off processing | Python (pandas) in sandbox, deliver result file |
| Chrome extension | Manifest V3 + TS, no build tool if tiny |
| Scraping | Playwright; respect robots/ToS; cache results |
| Desktop app | Tauri or Electron only if web/PWA can't do it |
| AI features (chat, extraction, summarization, agents) | load `claude-api` skill; latest Claude models; server-side keys only |
| Landing page / marketing site | Next.js static or Astro; `visual-design` |

## Phase 0 – Discovery (XS/S: 0–2 questions; M/L: ≤4, all with defaults)
Ask only if unknown: (1) who uses it + scale (one business vs SaaS for many), (2) must-have integrations (payments, invoices, SMS/WhatsApp, calendar, OTA…), (3) platforms (web / mobile PWA / native), (4) launch scope & deadline.
Then load `domain-knowledge` for the domain and draft the plan.

## Phase 1 – One-page spec (M/L: get approval; XS/S: 3 lines then build)
1. Actors & roles table (role → can see / can do). Always include: Owner/Admin, Manager, Staff (scoped), End-user/Customer, Platform super-admin (no tenant data without grant).
2. Core entities + relations (bullet ERD).
3. Key flows (3–7), each happy path + failure path.
4. Screens per role.
5. Integrations, reports/KPIs, notifications.
6. Phases: MVP → v1 → v2. MVP = smallest thing that is usable end-to-end.
Write to `docs/PRODUCT_SPEC.md` (+ `docs/PROGRESS.md` with "Next action") so every session resumes instantly.

## Default stack (change only with reason)
Next.js App Router + TypeScript strict · PostgreSQL + Prisma · Better Auth · Tailwind (RTL) · pg-boss for jobs · Zod validation · Vitest + Playwright · deploy Vercel + managed Postgres.
Mobile → responsive PWA first. Simple static site → Next.js static or plain HTML Artifact.

## Architecture defaults (M/L; for XS/S apply only what fits)
- **Multi-tenant** from day 1 when >1 business may use it: `tenantId` on every business row + Postgres RLS + tenant only from session.
- **RBAC**: roles → permissions map in one file; check on server in every mutation/query (`requireRole`). UI hiding is cosmetic only.
- **Audit log**: who/when/what for every mutation of business data.
- **Money**: integer minor units (agorot), never floats; ledgers append-only; balances computed.
- **Time**: store UTC, display Asia/Jerusalem; Hebrew dates where relevant.
- **Security**: server-side validation (Zod), no secrets in client, rate-limit auth, CSRF-safe actions, least-privilege DB role, PII minimization (Israeli Privacy Protection Law / Amendment 13).
- **Files**: object storage, signed URLs. **Jobs**: queue for emails/SMS/reminders, idempotent with retries.
- **Dev-only fakes** (payment/SMS providers) guarded so they cannot run in production.
- Structure: `src/app` (routes/UI) · `src/server/<domain>` (logic, pure + tested) · `src/lib` (shared) · `prisma/` · `tests/{unit,integration,e2e}`.

## Delivery loop (per phase)
schema → server logic + unit tests → API/actions with auth checks → UI (load `visual-design`) → e2e happy path → screenshot review → commit/push → update PROGRESS.md.
Seed realistic Hebrew demo data so screens look real.

## Ship & operate (M/L always, S when going live)
- Env vars & secrets in the host's settings, `.env.example` documents them; never commit secrets.
- Managed DB with automatic backups; migrations in CI; seed separate from prod.
- Error tracking (Sentry) + basic uptime check; logs without PII.
- Domain + HTTPS; email sender domain (SPF/DKIM) if sending mail.
- Rough monthly cost estimate for hosting/DB/SMS/API before choosing paid services.
- Short `docs/OPERATIONS.md`: how to deploy, roll back, restore backup.

## Quality gate
Scale to tier – XS: works in browser, checked once. S: typecheck + key flow tested. M/L: `lint`, `typecheck`, unit + integration + e2e green; every role tested for allowed AND forbidden actions; empty/loading/error states; mobile width checked; `security-review` before launch.
