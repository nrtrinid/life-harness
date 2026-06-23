---
name: agent-review
description: End-of-task review packet before handoff; review-only, no new implementation.
---

# Agent Review

## When to use

- Before finishing any task with local file changes
- When you need a compact handoff summary without implementing new scope
- After failures or when verification choice is unclear

## First command

```bash
npm run agent:preflight
```

Use preflight output for changed files, likely task areas, matching context-map blocks, and likely tests.

If unsure which checks apply:

```bash
npm run agent:auto-check -- --dry-run
```

## Read via context map

Process reference: [`docs/AGENT_CONTEXT_MAP.md`](../../../docs/AGENT_CONTEXT_MAP.md) task block `docs-planning`.

For substance, use the task area from preflight (e.g. `npm run agent:map -- --task <area>`). Do not broad-read the repo during review.

## Forbidden scope

- Implementing new features or cleanup outside the ticket during review
- Broad repo reads instead of targeted map/grep/tests-for
- Treating review as permission to expand scope

## Verification

Primary:

```bash
npm run agent:review-packet
```

Confirm prior checks ran (or run now if missing):

```bash
npm run agent:auto-check
npm run check:boundaries
```

For docs/agent-tooling-only changes:

```bash
npm run check:agent-budget
```

## Final response checklist

- Changed files (grouped by task area if helpful)
- Matching context-map task blocks used
- Checks run and pass/fail
- Known failures with first relevant error
- Skipped checks and why
- Boundary/scope risks
- Recommended narrow rerun if anything failed
