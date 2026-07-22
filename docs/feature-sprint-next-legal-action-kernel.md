# Feature Sprint next-legal-action kernel (control plane)

Life Harness is the authoritative Feature Sprint state machine. Workers and orchestrators may only execute actions the kernel declares legal.

## Persistence blocker (HTTP)

Feature Sprint plan/map/history state lives in app `LifeHarnessData` (Expo/web `localStorage`). The localhost `services/feature-sprint-runner` does **not** read that snapshot.

Therefore this slice does **not** add:

```text
GET /feature-sprint/plans/:planId/next-legal-action
```

on the runner. Exposing that endpoint without an explicit state-export API would invent a second persistence source.

Use instead:

- `getNextFeatureSprintLegalAction(data, planId)` — pure kernel
- `applyFeatureSprintLegalAction({ actionId, stateRevision, artifact? })` — typed apply boundary
- `runMockFeatureSprintKernelLoop(...)` — deterministic mock headless dogfood

## Defaults

- Autonomy policy mode defaults to `manual`
- No real Cursor / Grok / Codex / Qwen launches from the kernel
- Empty task `allowedPaths` blocks autonomous execution (manual map readiness may still warn-only)

## Material revision lifecycle

```text
frozen
→ requestClarifiedSpecRevision (material / uncertain)
→ revision_required (editable revised content; prior revision archived)
→ approve_spec
→ freeze_spec (new authoritative revision > prior)
```

Material revision **invalidates** execution artifacts whose authority depended on the superseded freeze (implementation proof, worker output evidence, review verdict/status, correction attempts, and done/in_progress advancement evidence on map tasks). It also **reopens** plan-level completion authority (`status`, `completedAt`, `evidenceLogId`, `evidenceProofItemId`) so a prior `complete_sprint` cannot yield `terminal_complete` while map work was reset. Archival log/proof rows in `logs` / `proofItems` remain; only the plan's active evidence pointers are cleared. Non-material patches are rejected by the revision helper and do not invalidate artifacts.

The kernel never silently refreezes a material change.

## Deferred durability / exactly-once limitation

`appliedActionIds` provides **in-snapshot** idempotency for the latest applied action when the caller still holds the post-apply state (and matching `stateRevision`).

It does **not** protect this failure mode:

```text
apply succeeds
→ caller loses / discards the returned state before persistence
→ caller retries against the old pre-apply snapshot
→ mutation can be repeated
```

Historical action IDs still present in the ring buffer also must not false-succeed: only the **latest** applied action ID may short-circuit as idempotent; older IDs are rejected as `stale_action`.

Persisted-state or external-operation exactly-once semantics must be resolved **before** serial autopilot, multiple orchestrators, or automatic provider launching. This core-only/manual slice intentionally does not add a database, event store, lease system, or workflow engine.
