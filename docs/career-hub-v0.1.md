# Career Hub v0.1

The **Career** screen (`/career`) is the career pipeline home — overview chips, Fit Finder, and links to career tools.

## Purpose

```text
Open Career → see queue pressure, follow-ups, due sources → jump to the right tool or run Fit Finder.
```

Complements Today (daily pounce/recovery) with a durable career-work surface.

## Pipeline chips

Built by [`buildCareerPipelineState()`](../src/core/careerPipeline.ts) from current board state:

| Chip | Meaning |
|------|---------|
| **N in queue** | Job candidates with status `new` or `saved` |
| **N active apps** | Application cards in `active` state |
| **N follow-ups** | Follow-ups due today or overdue |
| **N due sources** | Enabled job sources past their cadence |

Chips accent when count > 0.

## Fit Finder

**Find jobs that fit me** runs [`runFitFinder`](../src/state/LifeHarnessState.tsx) → [`src/core/jobScout.ts`](../src/core/jobScout.ts):

1. Collects all runnable enabled job sources
2. Batch-runs them via the local runner (`npm run scout:runner` on `127.0.0.1:8122`)
3. Creates new candidates in the queue
4. Surfaces result notice (created count, runner unreachable, etc.)

Without the runner, Fit Finder shows a start-runner message — no browser fetch fallback.

## Tool links

| Link | Route | Purpose |
|------|-------|---------|
| Intake | `/career-intake` | Create application card directly |
| Paste | `/candidate-intake` | Paste posting into candidate queue |
| Queue | `/job-candidates` | Review and approve candidates |
| Bank | `/resume-bank` | Resume modules |
| Sources | `/job-sources` | Run approved sources (due/all) |
| Setup | `/source-setup` | Detect and save adapters |

## Navigation

Career sits in the **Primary** nav group alongside Today, Board, Ask, Progress, and Review. See [`career-command-board-v0.1.md`](./career-command-board-v0.1.md) for the full grouped nav table.

## Related Job Scout docs

| Version | Doc |
|---------|-----|
| v0.2 | [`job-scout-foundation-v0.2.md`](./job-scout-foundation-v0.2.md) — resume bank, candidates, manual intake |
| v0.3 | [`job-scout-approved-sources-v0.3.md`](./job-scout-approved-sources-v0.3.md) — approved source fetch |
| v0.4 | [`job-scout-runner-v0.4.md`](./job-scout-runner-v0.4.md) — local runner service |
| v0.5 | [`persistence-audit-v0.5.md`](./persistence-audit-v0.5.md) — JSON snapshot persistence |
| v0.6–v0.11 | Run due, setup, GovernmentJobs, Workday adapters — see [`docs/README.md`](./README.md) |

## Code map

| File | Role |
|------|------|
| [`app/career.tsx`](../app/career.tsx) | Career hub screen |
| [`src/core/careerPipeline.ts`](../src/core/careerPipeline.ts) | Pipeline aggregation |
| [`src/core/career.ts`](../src/core/career.ts) | Application cards, follow-ups |
| [`src/core/jobScout.ts`](../src/core/jobScout.ts) | Fit Finder logic |
