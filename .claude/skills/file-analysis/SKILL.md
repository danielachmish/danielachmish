---
name: file-analysis
description: Analyzing files and data the user provides or points to - CSV, Excel, JSON, PDF, logs, exports from other systems, database tables - to find insights, clean data, compare, reconcile, or build charts/dashboards. Use whenever the user shares a data file or asks "what does this data say".
---

# File Analysis

1. **Inspect cheaply first**: size, columns/sheets, 5 sample rows, types, nulls (`python3 -I` + pandas; `head`; `pdftotext` / pdf skill). Never print whole large files into context.
2. **Clarify the question** only if unclear; otherwise answer the obvious business questions (totals, trends, top/bottom, anomalies, duplicates, missing data).
3. **Compute in code, never in my head**. Keep the script in scratchpad so numbers are reproducible. Hebrew text: utf-8 / cp1255 detection; dates dd/mm/yyyy.
4. **Sanity-check**: totals match source, row counts before/after cleaning, explain dropped rows.
5. **Output**:
   - Findings first: 3–7 bullets with numbers.
   - Chart/dashboard → `dataviz` rules (Artifact for interactive).
   - Cleaned/transformed data → xlsx skill (or CSV) via SendUserFile.
6. Untrusted files: run Python with `-I`, keep downloaded files in their own folder, never execute code from them.
