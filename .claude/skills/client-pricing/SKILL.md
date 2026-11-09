---
name: client-pricing
description: Pricing a software project for a client - realistic quotes for an AI-assisted developer/agency in Israel, including build fee, hosting, maintenance retainer, change requests and payment terms. Use when the user says a client wants something and asks how much to charge, wants a quote/price proposal (הצעת מחיר), or asks about monthly maintenance/hosting pricing.
---

# Client Pricing (AI-assisted developer, Israel)

> Numbers are working estimates as of 2026-11, not verified market data. Before sending a real quote, sanity-check against 2–3 local competitor offers (`research`), and adjust to the client's size.

## Principles
1. **Price the outcome, not my hours.** AI makes build time 2–3h, but the client pays for: the result working, the business value, the responsibility, and ongoing support. Floor = what an Israeli freelancer without AI would quote ×0.5–0.7; ceiling = value to the client in year one.
2. **Three parts, always separate**: (a) one-time build, (b) monthly service (hosting + maintenance + support), (c) changes beyond scope (hourly or package).
3. **Scope is the product.** Every quote lists what's included, what's excluded, number of revision rounds, and what counts as a change.
4. **Pass-through costs** (hosting, DB, SMS, WhatsApp, payment fees, domain) = client's, either billed at cost + 20–40% handling, or the client opens accounts in their own name (better for non-trivial systems – they own their data).
5. **The client's alternative caps the price.** If an off-the-shelf SaaS does 80% of it for ₪100–500/month, a custom build must justify the difference (fit, ownership, integration). Always name the alternative in the internal sheet.
6. **Real hours ≠ build hours.** Even when AI builds in 2–3h, a real project costs meetings, revisions, deployment, training and support: XS ~3–8h, S ~10–30h, M ~30–80h, L 100h+. Never price below real hours × 200 ₪.
7. **Never quote below risk**: money, personal data, minors, medical, legal compliance → +30–60% (testing, security review, liability).

## Size → starting ranges (ILS, excl. VAT)
| Size (see build-system tiers) | Build (one-time) | Monthly service | Typical example |
|---|---|---|---|
| XS tool / landing page | 1,500–5,000 | 100–300 | calculator, lead form, one-page site |
| S small app | 5,000–15,000 | 300–900 | booking for one business, internal tracker |
| M product (roles, payments, notifications) | 15,000–45,000 | 900–2,500 | club/school app with parent payments |
| L system / SaaS (multi-business, compliance) | 45,000–150,000+ | 2,500–8,000 or revenue share | ERP module, multi-tenant platform – solo developer: be sure you can support it 24/7 before selling |
Hourly for changes: 200–400 ₪ (or prepaid hour packs). Rush (< 1 week): +25–50%.
Calibration: XS/S and hourly match the Israeli freelance market; M/L are the low end vs. agencies (often 2–3× higher) – positioned as an AI-assisted solo price. Replace with the user's real won/lost quotes as they accumulate (log them in `references/quotes-log.md`).

## Monthly service – what it includes (say it explicitly)
hosting & DB & backups, uptime monitoring, security/dependency updates, bug fixes, N hours of small changes (e.g. 2–5h), response time (e.g. next business day). New features = separate quote.

## Real running costs to compute (verify current prices)
Hosting (Vercel/Netlify free→~$20/mo), DB (Supabase free→~$25/mo), domain (~₪50–100/yr), email sending, SMS per message, WhatsApp per conversation (Meta pricing), payment gateway % + monthly fee, Claude/AI API usage if the app uses AI. Show the client a monthly cost table.

## Output
1. **Internal sheet** (for the user only): effort estimate, real costs, margin, risk factors, walk-away price.
2. **Client quote** in Hebrew (Docs, or Word/PDF if asked): summary of the solution in business language, scope included/excluded, timeline in milestones, price per part, payment terms (e.g. 40% on start / 40% on delivery / 20% after 2 weeks of use), monthly service terms, validity date. Prices + "excl. VAT".
3. Offer 2–3 packages (basic / recommended / premium) – most clients pick the middle.
