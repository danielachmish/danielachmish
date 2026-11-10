# Accounting / ERP

> Facts as of 2026-11. Regulation, rates, thresholds and vendor names change – verify via `research` before relying on them in code.

## Double-entry core
- Every transaction = journal entry with ≥2 lines; Σdebit = Σcredit (enforce in DB/engine).
- Chart of accounts (מבנה חשבונות): Assets, Liabilities, Equity, Income, Expenses (+ cost of sales). Hierarchical codes, sort codes for reports.
- Normal balance: assets/expenses debit; liabilities/equity/income credit.
- Entries are immutable after posting; fix with reversing entry. Fiscal periods with close/lock.
- Subledgers: customers (AR / כרטסת לקוחות), suppliers (AP), bank, inventory; control accounts in GL.
- Reports: trial balance (מאזן בוחן), P&L (רווח והפסד), balance sheet (מאזן), cash flow, aging (גיול חובות), VAT report, ledger card (כרטסת), bank reconciliation (התאמת בנקים).
- Money in integer agorot; multi-currency = store original + rate + ILS amount.

## Engine rules (implementation)
- Gapless document/journal numbering per type+company: counter row locked `FOR UPDATE` inside the posting transaction (DB sequences leave gaps – never use them for documents).
- Balance enforced in DB (deferred constraint/trigger: Σdebit=Σcredit per entry), not only in app code. Lines: one non-negative debit OR credit.
- Dates: document date, posting date, value date (bank) – separate fields; period lock checked on posting date.
- Control accounts (AR/AP/inventory/VAT) not directly postable; subledger totals reconciled to them by an automated test.
- Rounding account for VAT/FX cents; suspense account for unknowns, must be zero at period close.
- Opening balances = one dated entry; year-end close moves P&L to retained earnings by entry.
- Dimensions (cost center, project, branch) on lines, not separate accounts.
- Idempotent postings (source doc id unique) – retries never double-post.
- Tests: every posting function → balanced entry property test; trial balance always sums to 0.

## Standard postings
Sale invoice: Dr AR / Cr Revenue / Cr VAT output · Receipt: Dr Bank (or checks-in-hand) / Cr AR · Credit note: reverse of sale · Supplier invoice: Dr Expense or Inventory / Dr VAT input / Cr AP · Supplier payment: Dr AP / Cr Bank / Cr Withholding payable · Inventory sale: Dr COGS / Cr Inventory · Payroll: Dr Salary exp / Cr Net pay payable / Cr Income tax / Cr Bituach Leumi / Cr Pension · Depreciation: Dr Depreciation exp / Cr Accumulated depreciation · VAT payment: Dr VAT output / Cr VAT input / Cr Bank.

## Israeli documents & regulation
- Documents: חשבונית מס, חשבונית מס/קבלה, קבלה, חשבונית זיכוי, חשבון עסקה (proforma, not a tax doc), תעודת משלוח, הצעת מחיר, הזמנה.
- Sequential numbering per document type, no gaps, no deletion; cancellation only via credit document. Original/copy marking ("מקור"/"העתק").
- Business types: עוסק פטור (no VAT, issues receipts only), עוסק מורשה, חברה בע"מ, עמותה/מלכ"ר (receipts with סעיף 46 for donations).
- VAT 18% (since 1.1.2025) — keep rate as dated config, never hard-code.
- "חשבוניות ישראל": tax invoices above a threshold need an allocation number (מספר הקצאה) from the Tax Authority API. Threshold dropped stepwise (25k→20k→10k→5k ₪ during 2024–2026) — verify current value via research before building.
- Software issuing documents must comply with הוראות ניהול פנקסי חשבונות (incl. software registration) and export the unified format (מבנה אחיד / OPENFRMT). Retain records 7 years.
- Withholding tax (ניכוי במקור) on supplier payments per the supplier's certificate (rate + validity dates, re-check on expiry); monthly report + annual 856; advance tax payments (מקדמות).
- VAT: monthly/bi-monthly by turnover; PCN874 detailed file where required; input VAT only with a valid tax invoice, claimable within ~6 months; partial deduction for vehicles/mixed use; zero-rate exports, Eilat. Exempt-dealer turnover ceiling – verify yearly.
- Chart of accounts mapped to Form 6111 sort codes (standardized financial statement attached to the annual return).
- Checks (incl. post-dated): checks-in-hand register → deposit → cleared / bounced (reverse + fee). Credit-card installments and clearing fees. Supplier bulk payments via Masav (מס"ב) file.
- Integrations: bank feeds/Open Banking, payment gateways (Tranzila, Cardcom, Meshulam/Grow, PayPlus), existing invoicing services (Green Invoice/Morning, iCount, EZcount) — often smarter to integrate than to become registered software.

## ERP modules
Sales (quote→order→delivery→invoice→receipt), Purchasing (PR→PO→goods receipt→supplier invoice→payment, 3-way match), Inventory (items, warehouses, movements, FIFO/average cost, stock count), CRM, HR/payroll, Projects/cost centers, Fixed assets (depreciation), Budget vs actual.

## Controls
Segregation of duties (who records ≠ who approves payment ≠ who reconciles bank); approval thresholds for payments; period lock only by accountant; no hard deletes anywhere; full audit log; daily backups, restore tested.

## Build vs integrate
Issuing legal tax documents = registered software + unified format + allocation API. For MVP prefer integrating an existing licensed invoicing service and build the management layer (GL, reports, workflows) on top.

## Roles
Owner, CFO/accountant (all + period close), bookkeeper (entry, no close), sales rep (own customers, quotes), purchasing, warehouse, external CPA (read + export), auditor (read-only).

## Pitfalls
Floats; editable posted entries; numbering gaps; VAT rate hard-coded; timezone date shifts on documents; deleting customers with history (archive instead).
