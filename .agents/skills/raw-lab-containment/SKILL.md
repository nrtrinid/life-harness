---
name: raw-lab-containment
description: Raw Lab sandbox client, UI, and gateway work with strict board isolation.
---

# Raw Lab Containment

## When to use

- Tickets touching `rawLab*`, `app/raw-lab.tsx`, `src/components/rawLab/`, or gateway Raw Lab endpoints
- Containment, thread state, context budget, or reflection client changes

## First command

```bash
npm run agent:preflight
```

Then:

```bash
npm run agent:map -- --task raw-lab-containment
npm run agent:impact -- --changed
npm run agent:tests-for -- --changed
```

## Read via context map

Use [`docs/AGENT_CONTEXT_MAP.md`](../../../docs/AGENT_CONTEXT_MAP.md) task block `raw-lab-containment`.

Authority docs: `docs/raw-lab-architecture.md`, `docs/raw-lab-thread-state.md`, `docs/ai-workflows-current.md`. Use `docs/raw-lab-deep.md` only for deep-mode tickets.

## Forbidden scope

- Raw Lab runtime importing board state, actions, provider, or persistence
- Board context, tools, Memory Bank authority, or mutation paths in Raw Lab
- Weakening Ask Harness, Chat Harness, or S3 containment
- Exporting in-thread jailbreak or framing techniques to other modes
- RTK migration of Raw Lab streaming (streaming stays manual per plan)
- Pasting secrets or S3-style private data into Raw Lab

## Verification

Always:

```bash
npm run check:boundaries
npm run test -- src/core/rawLabScreen.containment.test.ts
```

When gateway code changes:

```bash
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"; pytest -q
```

Or:

```bash
npm run agent:auto-check
```

Update containment tests when boundary code changes.

## Final response checklist

- Files changed
- Containment tests run and results
- Board isolation preserved (no new board imports)
- Gateway changes scoped and mock-tested if touched
- Known failures and containment risks called out
