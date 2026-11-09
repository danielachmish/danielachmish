---
name: research
description: Research protocol for questions that need outside information - comparing tools/vendors/technologies, market or competitor research, regulations, prices, "what is the best way to X". Use for any research or investigation request, short or long.
---

# Research

1. **Scope in one line**: the decision the research must support. If ambiguous, ask 1 question with a default.
2. **Size it**:
   - Quick fact → 1–3 `WebSearch` (mode standard), answer in chat.
   - Comparison / decision → parallel searches (send all in one turn), `WebFetch` primary sources (official docs, pricing pages, regulator sites). `extended` mode only for niche, fresh, or price/availability facts.
   - Deep multi-angle topic → `anthropic-skills:deep-research` skill.
   - Codebase question → Grep/Glob myself; Explore agent only for wide sweeps.
3. **Rules**: prefer primary sources and dates; note when info may be stale; never invent numbers; separate facts from my recommendation.
4. **Output**:
   - Short answer → chat: verdict first, then 3–6 bullets, sources linked.
   - Report for a decision or for others → Artifact page (quickstart intent "other"; "document" if they will edit it) with: verdict, comparison table, pros/cons, cost, risks, recommendation, sources.
5. Always end with a clear recommendation and the next action.
