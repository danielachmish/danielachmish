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

## Israeli documents & regulation
- Documents: חשבונית מס, חשבונית מס/קבלה, קבלה, חשבונית זיכוי, חשבון עסקה (proforma, not a tax doc), תעודת משלוח, הצעת מחיר, הזמנה.
- Sequential numbering per document type, no gaps, no deletion; cancellation only via credit document. Original/copy marking ("מקור"/"העתק").
- Business types: עוסק פטור (no VAT, issues receipts only), עוסק מורשה, חברה בע"מ, עמותה/מלכ"ר (receipts with סעיף 46 for donations).
- VAT 18% (since 1.1.2025) — keep rate as dated config, never hard-code.
- "חשבוניות ישראל": tax invoices above a threshold need an allocation number (מספר הקצאה) from the Tax Authority API. Threshold dropped stepwise (25k→20k→10k→5k ₪ during 2024–2026) — verify current value via research before building.
- Software issuing documents must comply with הוראות ניהול פנקסי חשבונות (incl. software registration) and export the unified format (מבנה אחיד / OPENFRMT). Retain records 7 years.
- Withholding tax (ניכוי במקור) on supplier payments; advance tax payments (מקדמות); bi-monthly/monthly VAT reporting (PCN874 file for larger businesses).
- Integrations: bank feeds/Open Banking, payment gateways (Tranzila, Cardcom, Meshulam/Grow, PayPlus), existing invoicing services (Green Invoice/Morning, iCount, EZcount) — often smarter to integrate than to become registered software.

## ERP modules
Sales (quote→order→delivery→invoice→receipt), Purchasing (PR→PO→goods receipt→supplier invoice→payment, 3-way match), Inventory (items, warehouses, movements, FIFO/average cost, stock count), CRM, HR/payroll, Projects/cost centers, Fixed assets (depreciation), Budget vs actual.

## Roles
Owner, CFO/accountant (all + period close), bookkeeper (entry, no close), sales rep (own customers, quotes), purchasing, warehouse, external CPA (read + export), auditor (read-only).

## Pitfalls
Floats; editable posted entries; numbering gaps; VAT rate hard-coded; timezone date shifts on documents; deleting customers with history (archive instead).
