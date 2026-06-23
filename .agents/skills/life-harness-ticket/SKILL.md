---
name: life-harness-ticket
description: Default scoped implementation for Life Harness board, core, app, or UI tickets.
---

# Life Harness Ticket

## When to use

- Normal feature or fix tickets touching `src/core/`, `app/`, `src/state/`, or board product logic
- Ticket does not primarily belong to Job Scout, Raw Lab, Ask Harness, or ai-gateway

## First command

```bash
npm run agent:preflight
```

Then:

```bash
npm run agent:map -- --task core-board-product-logic
```

If the ticket names another area, swap the task block (`core-board-usability`, `core-career-hub`, etc.).

Helpful during work:

```bash
npm run agent:impact -- --changed
npm run agent:tests-for -- --changed
npm run agent:grep -- "<symbol or phrase>"
```

## Read via context map

1. [`AGENTS.md`](../../../AGENTS.md) — hard rules and v0.1 constraints
2. [`docs/AGENT_CONTEXT_MAP.md`](../../../docs/AGENT_CONTEXT_MAP.md) — task block READ_FIRST / LIKELY_FILES / LIKELY_TESTS / BOUNDARIES
3. [`prompts/agent_task_prompt_template.md`](../../../prompts/agent_task_prompt_template.md) — default implementation wording when pasting a task prompt

Do not broad-read `docs/plans/`, `docs/meta/`, fixtures, or compiled context unless the ticket names them.

## Forbidden scope

- New product concepts not in the ticket
- v0.1 forbidden adds from `AGENTS.md` (auth, cloud sync, notifications, integrations, local LLM setup, full AI autonomy, etc.)
- Product rules scattered in UI instead of `src/core/`
- `app/` or `src/` importing from `services/`
- RTK, Redux app-state migration, persistence schema changes, or Raw Lab streaming unless the ticket explicitly asks

## Verification

Before finishing:

```bash
npm run agent:auto-check
```

For narrow core-only changes, the context map may instead name:

```bash
npm run agent:typecheck
npm run agent:test -- -- src/core/<nearest>.test.ts
npm run check:boundaries
```

## Final response checklist

- Files changed
- Checks run (and exit results)
- Known failures
- Skipped checks and why
- Boundary/scope risks
- Remaining gaps, if any
