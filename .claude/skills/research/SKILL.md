---
name: research
description: Research protocol for questions that need outside information - comparing tools/vendors/technologies, market or competitor research, regulations, prices, "what is the best way to X". Use for any research or investigation request, short or long.
---

# Research

1. **Scope in one line**: the decision the research must support. Inside a project, grep its docs (DECISIONS, setup docs) for prior choices first. Ask ≤3 questions with defaults only if volume/use-case changes the answer. Default market: Israel, costs in ILS incl. VAT.
2. **Size it**:
   - Quick fact → 1–3 `WebSearch` (mode standard), answer in chat.
   - Comparison / decision → ≤6 parallel `standard` searches in one turn, then ≤8 `WebFetch` of primary sources (official pricing/docs, regulator). Switch a search to `extended` only when standard results are missing or undated. Then synthesize – no open-ended digging.
   - Deep multi-angle topic → `anthropic-skills:deep-research` skill.
   - Codebase question → Grep/Glob myself; Explore agent only for wide sweeps.
3. **Rules**: prefer primary sources and dates; note when info may be stale; never invent numbers; separate facts from my recommendation.
4. **Output**:
   - Short answer → chat: verdict first, then 3–6 bullets, sources linked.
   - Report for a decision or for others → Artifact page (quickstart intent "other"; "document" if they will edit it) with: verdict, comparison table (normalize cost to ₪/month at 2–3 realistic volumes), pros/cons, risks (lock-in, payout delay, hidden fees), recommendation, dated sources.
5. Always end with a clear recommendation and the next action.
