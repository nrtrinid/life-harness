# Second Codex Review Prompt

Use this after Codex has produced the first scaffold.

```text
Review the current Life Harness v0.1 scaffold against:
- AGENTS.md
- docs/01_final_design_doc.md or docs/design.md
- docs/02_v0_1_scope.md or docs/v0.1.md
- docs/product-rules.md

Do not implement anything yet.

Return:
1. Top 5 gaps from the v0.1 spec.
2. Top 5 risks of overbuilding or product drift.
3. A prioritized patch plan as small tickets.
4. Any files that look too complex or misplaced.
5. Any product rules currently scattered in UI that should move into core logic.

Constraints:
- Do not add new product concepts.
- Do not recommend AI, Supabase, auth, notifications, or integrations yet unless required by docs.
- Focus on getting the core loop working:
  open app -> see Today -> click Pounce -> log one sentence -> Proof Shelf updates -> Salvage/MVD available.
```
