# Runner lifecycle boundary v0.2

## Goal

Centralize how Life Harness reasons about job/source runner lifecycle (idle, running, success, failure, stale, due) without adding background scheduling, new storage backends, or changing sidecar boundaries.

## What was centralized

Pure lifecycle helpers live in [`src/core/jobRunnerLifecycle.ts`](../src/core/jobRunnerLifecycle.ts):

| Export | Responsibility |
|--------|----------------|
| `deriveSourceLifecycle` | Per-source phase, status line, health, due badge, single-run guard |
| `deriveBatchRunnerLifecycle` | Batch action kind, labels, empty messages, Find-tab panel copy |
| `summarizeLastRunOutcome` | Last-run counts/message with optional pagination stop reason |
| `formatPaginationStoppedReason` | Human copy for pagination stop reasons |
| `formatLastRunDetailLine` | Detail line including pagination clause when present |

The module **composes** existing primitives — it does not replace them:

- [`jobSourceSchedule.ts`](../src/core/jobSourceSchedule.ts) — due/runnable lists
- [`jobSourceHealth.ts`](../src/core/jobSourceHealth.ts) — health/stale threshold
- [`jobSourceRunner.ts`](../src/core/jobSourceRunner.ts) — `canRunJobSource`
- [`jobFindings.ts`](../src/core/jobFindings.ts) — run finding count formatting

Wired consumers:

- [`jobSourceRunActions.ts`](../src/state/lifeHarness/jobSourceRunActions.ts) — empty batch messages
- [`JobBoardFindTab.tsx`](../src/components/career/jobBoard/JobBoardFindTab.tsx) — primary panel action/title/reason
- [`app/job-sources.tsx`](../app/job-sources.tsx) — per-source status line and last-run detail

Async run orchestration (`runSourceViaRunner`, batch loops, dispatch) is unchanged.

## What intentionally did not change

- `LifeHarnessData` shape and persistence envelope
- `services/job-scout-runner` sidecar API and behavior
- ATS adapters and pagination implementation in `jobSourceRunner`
- Job Board workflow, routes, and layout
- No background/cron scheduling
- No auto-run on app open

## Lifecycle phases (per source)

Priority order in `deriveSourceLifecycle`:

| Phase | When |
|-------|------|
| `running` | `runStatus === "running"` or active batch on this source |
| `failed` | `runStatus === "error"` or latest run has errors |
| `stale` | Health stale (no recent candidate-producing run) |
| `due` | Runnable and schedule-due |
| `succeeded` | `runStatus === "success"` |
| `idle` | Default (never run, weak pass, not due, etc.) |

## Batch runner actions

| Action | Label (typical) | When |
|--------|-----------------|------|
| `run_due_sources` | Run due sources | Due count > 0 |
| `run_enabled_sources` | Run all enabled | Runnable, none due |
| `retry_failed_source` | Retry failed sources | Runnable with failed phase, none due |
| `no_runnable_sources` | No runnable sources | Nothing enabled/runnable |

Empty messages (unchanged strings):

- Due batch empty: `No due sources to run.`
- Enabled batch empty: `No enabled runnable sources.`

## Preparation for future scheduling

This boundary isolates **decision/copy** from **execution**. A future scheduler can call the same helpers to decide what to run and what to show, while `jobSourceRunActions` or a background worker performs runs — without scattering phase logic across UI components.

Scheduling is **not** implemented in v0.2.

## Follow-up tickets

1. **Manual vs scheduled run policy** — explicit user-facing rules for due vs manual cadence beyond current schedule helpers.
2. **Optional background runner** — due-run worker outside React provider (requires scheduling ticket + product approval).
3. **Source-level retry/backoff** — failed-source retry timing without hammering sidecar.
4. **Proof ledger integration** — record completed batch/single runs as proof items.

## Verification

```bash
npm run typecheck
npm run test -- jobSource
npm run test
```

Lifecycle tests: [`src/core/jobRunnerLifecycle.test.ts`](../src/core/jobRunnerLifecycle.test.ts)
