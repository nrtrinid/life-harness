---
name: job-scout-adapter
description: Job Scout adapters, runner, schedule, and career scout pipeline work in Life Harness.
---

# Job Scout Adapter

## When to use

- Tickets touching `jobScout*`, `jobSource*`, `careerHub` scout paths, or `services/job-scout-runner/`
- Adapter, fixture-backed source, runner client, or schedule behavior changes

## First command

```bash
npm run agent:preflight
```

Then:

```bash
npm run agent:map -- --task career-job-scout
npm run agent:impact -- --changed
npm run agent:tests-for -- --changed
```

## Read via context map

Use [`docs/AGENT_CONTEXT_MAP.md`](../../../docs/AGENT_CONTEXT_MAP.md) task block `career-job-scout` for READ_FIRST, LIKELY_FILES, LIKELY_TESTS, DO_NOT_READ, and BOUNDARIES.

Authority docs typically include `docs/career-hub-v0.1.md` and relevant `docs/job-scout-*.md`. Runner-only work: `services/job-scout-runner/README.md`.

## Forbidden scope

- GitHub, bank, calendar, notification, or cloud sync integration unless explicit in the ticket
- `app/` or `src/` importing from `services/` (runner stays bounded; app uses clients)
- Unscoped runner or network changes outside the ticket
- Skipping manual user approval in the candidate review flow

## Verification

Always:

```bash
npm run check:boundaries
```

When runner or adapter code changes:

```bash
npm run verify:job-scout
npm run agent:typecheck
npm run agent:test -- -- src/core/<nearest>.test.ts
```

Or finish with:

```bash
npm run agent:auto-check
```

## Final response checklist

- Files changed (app core vs runner service called out)
- Checks run and results
- Fixture-first adapter tests added or updated when behavior changed
- Manual approval / review flow preserved
- Known failures and boundary risks
