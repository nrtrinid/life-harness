# Feature Ticket Prompt Template

Use this for small Codex tasks after the initial scaffold.

```text
You are working on Life Harness v0.1.

Read first:
- AGENTS.md
- docs/01_final_design_doc.md or docs/design.md
- docs/02_v0_1_scope.md or docs/v0.1.md
- docs/product-rules.md

Task:
[Describe one specific feature or fix.]

Why this matters:
[Name the user failure mode this addresses: start sooner, recover faster, capture faster, resume easier, see progress, reduce overwhelm, prevent over-optimization, or create useful pressure.]

Constraints:
- Do not add new product concepts.
- Do not add AI.
- Do not add Supabase unless explicitly requested.
- Do not add auth, notifications, integrations, or styling rabbit holes.
- Keep changes small and focused.
- Put reusable product logic in src/core.

Acceptance criteria:
- [Specific checkable outcome 1]
- [Specific checkable outcome 2]
- [Specific checkable outcome 3]
- TypeScript/checks pass.
- Final response summarizes files changed and commands run.
```
