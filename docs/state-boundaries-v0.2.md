# State boundaries v0.2

## Goal

Reduce scaling pressure in the Life Harness app state layer by splitting the monolithic reducer/provider into domain modules **without** changing product behavior, persistence shape, routes, sidecar services, or public hook APIs.

## What was split

Reducer and provider logic now live under `src/state/lifeHarness/`:

| Module | Domain | Responsibility |
|--------|--------|----------------|
| `boardReducer.ts` | Board / daily | Session start, pounce, MVD, salvage, quick capture, card state |
| `careerReducer.ts` | Career / Job Scout | Career intake, candidates, job sources (snapshot dispatch) |
| `harnessReducer.ts` | Harness / memory / agent | Chat summaries, memory bank, projects, agent sessions, feature sprints |
| `proofReducer.ts` | Proof / playback | Domain marker; proof/log mutations still flow through board + harness core actions today |
| `rootReducer.ts` | Composition | Delegates to domain reducers; handles `state_replaced` |
| `*ProviderActions.ts` | Provider edge | Domain-grouped dispatch helpers used by `LifeHarnessProvider` |
| `LifeHarnessState.tsx` (inline) | Career runner | Async batch source runs via RTK `useRunJobSourceMutation` (unchanged behavior) |

`src/state/LifeHarnessState.tsx` remains the public entry point (thin composition layer — **~108 lines**, down from ~1,203 before v0.2 integration):

- `LifeHarnessProvider`
- `useLifeHarness()`
- Re-exports for `BatchRunProgress`, `LifeCard`, `LifeLogEntry`, `ProofItem`, `DailyState`

`src/state/lifeHarnessHooks.ts` domain selector hooks are unchanged.

## What stayed intentionally unchanged

- `LifeHarnessData` shape and fields
- Persisted JSON envelope (`schemaVersion`, `savedAt`, `data`)
- `src/core/*` pure action logic (`apply*` helpers)
- `services/ai-gateway` and `services/job-scout-runner` boundaries
- All routes, screens, and UX flows
- No new state-management libraries
- No framework migration

## Current domain boundaries

```text
LifeHarnessData (single persisted root)
├── board/daily     → cards, dailyState, quick capture, pounce/MVD/salvage
├── career/jobScout → jobSources, jobSourceRuns, jobCandidates, resumeModules, careerSourcePack
├── harness         → chatSummaries, memoryItems, projects, agentSessions, featureSprintPlans
└── proof/playback  → logs, proofItems (mutated via board/harness core actions today)
```

Cross-domain updates still produce a single `LifeHarnessData` snapshot for persistence. Domain reducers operate on the full root state by design so hydration and export/import stay one envelope.

## Known follow-up tickets

1. **Structured persistence stores** — see [`docs/persistence-boundary-v0.2.md`](persistence-boundary-v0.2.md); move from one localStorage JSON blob to structured stores without changing the export envelope contract.
2. **Runner lifecycle / scheduling** — see [`docs/runner-lifecycle-boundary-v0.2.md`](runner-lifecycle-boundary-v0.2.md); background due-source runs and runner health outside the React provider.
3. **Selector hooks or context split** — if render pressure from the large context value becomes visible, split read contexts per domain while keeping `useLifeHarness()` stable.
4. **Optional web-shell reassessment** — only after the primary product target (web vs mobile) is clearer; not a state-boundary prerequisite.

## Verification

```bash
npm run typecheck
npm run test
```

Reducer parity tests: `src/state/lifeHarness/rootReducer.test.ts`.

Integration status: domain modules are wired into `LifeHarnessProvider` as of v0.2; provider action factories are memoized per domain with the same closure semantics as the prior inline `useCallback` handlers.
