# Agent Task Prompt Templates

Default copy-paste prompts for coding agents (Cursor, Codex, etc.) on Life Harness.

For v0.1 **feature tickets** with product constraints and acceptance criteria, see [`feature_ticket_prompt_template.md`](feature_ticket_prompt_template.md).

Use [`docs/AGENT_CONTEXT_MAP.md`](../docs/AGENT_CONTEXT_MAP.md) after preflight when you need task-scoped read-first files, tests, and boundaries.

---

## Default — most implementation tasks

```text
Follow AGENTS.md.

Run `npm run agent:preflight` first.

Task:
<scoped task>

Complete the scoped task fully. Use the smallest safe implementation that satisfies the task. Do not broaden scope or do unrelated cleanup.

Before finishing, run `npm run agent:auto-check`.

Final response must include:
- files changed
- checks run
- known failures
- skipped checks and why
- boundary/scope risks
```

---

## Context scout — big or uncertain tasks (no implementation)

Run this first when the work is large, ambiguous, or spans multiple subsystems. Follow with the **default** template for the recommended smallest slice.

```text
Follow AGENTS.md.

Run `npm run agent:preflight`.

Prepare a repo context packet for this proposed work. Do not implement.

Question:
<thing we are considering>

Return:
- relevant task area
- relevant files/surfaces
- current behavior summary
- likely tests/checks
- boundary risks
- open questions
- recommended smallest slice
```

Helpful commands during context scout (read-only orientation):

- `npm run agent:map -- --task <task-area>`
- `npm run agent:impact -- --changed` (if you already have local edits)
- `npm run agent:grep -- "<symbol or phrase>"`
- `npm run agent:tests-for -- <path>`

---

## Related

- Root rules: [`AGENTS.md`](../AGENTS.md)
- Task router: [`docs/AGENT_CONTEXT_MAP.md`](../docs/AGENT_CONTEXT_MAP.md)
- Optional Codex hooks: [`docs/CODEX_HOOKS.md`](../docs/CODEX_HOOKS.md)
