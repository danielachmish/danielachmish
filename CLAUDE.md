# Synagogue SaaS – project rules

Hebrew RTL SaaS for synagogue pledges (נדרים), payments and reminders. Code in English, UI in Hebrew.
Read `docs/PROGRESS.md` first in every new session, then continue from "Next action".

## Stack
Next.js App Router + TypeScript strict · PostgreSQL + Prisma 7 (adapter-pg) · Better Auth · pg-boss worker · Tailwind v4 · Vitest · Playwright.

## Money rules (never break)
- Amounts are integer agorot (`Int`), currency ILS. No floats. Parse with `parseShekelsToAgorot`.
- Balances are computed (`src/server/ledger/balance.ts`). Never store or overwrite a balance.
- Ledger rows are append-only: corrections = `Adjustment` (reason required), reversals = negative `Allocation`.
- Every ledger mutation goes through `src/server/ledger/engine.ts` and takes the card lock (`lockCard`).
- Only a provider-verified charge (server-side status query) reduces debt. Browser return pages never do.
- External payments (cash/transfer/check) reduce debt only after gabbai approval.
- Payment identity is unique on (provider, environment, account, transaction id).

## Tenant / permission rules
- Tenant comes only from the authenticated session (`requireGabbai`) or a registered provider account.
- All business queries run inside `withContext(...)` (sets transaction-local RLS context).
- Runtime DB role `synagogue_app` is not owner/superuser/BYPASSRLS. Migrations use `synagogue_owner`.
- Platform admin never sees congregant data without a time-limited `SupportGrant` from the gabbai.
- Fake providers / dev routes must stay impossible in production (`config.ts`, `providers/guard.ts`).

## Commands
`npm run dev` · `npm run worker` · `npm run db:migrate` · `npm run db:seed` · `npm run db:reset`
`npm run lint` · `npm run typecheck` · `npm run test:unit` · `npm run test:integration` · `npm run test:e2e` · `npm run build`
New migration: edit `prisma/schema.prisma`, `npx prisma migrate dev --create-only --name x`, add grants/RLS SQL, `npm run db:migrate`, `npx prisma generate`.
Local Chromium for e2e in the cloud sandbox: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Docs
`docs/PRODUCT_SPEC.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`,
`docs/PROVIDER_SETUP.md`, `docs/ACCEPTANCE.md`, `docs/OPERATIONS.md`, `docs/FINAL_REPORT.md`.
