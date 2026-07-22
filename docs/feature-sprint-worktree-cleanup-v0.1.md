# Feature Sprint Worktree Cleanup v0.1

## What this adds

Explicit, safe worktree cleanup from Card Detail Backroom after the user inspects runner output and diff.

Flow:

1. Run `codex_implementation` in an isolated worktree (unchanged).
2. **View details** — inspect output, changed files, diff, verification.
3. Save/review manually when ready (unchanged gates).
4. **Clean worktree** — safety-checked removal via local runner.
5. **Force clean worktree** — only after a blocked safety check for the same run.

History rows stay in Life Harness; cleanup records audit fields on the run.

## Why explicit cleanup

Implementation worktrees accumulate on disk. v0.1 still does not auto-delete them at run completion — the user decides when inspection is done.

Normal cleanup (`force: false`) is the safety check:

- Path must be under `FEATURE_SPRINT_WORKTREE_ROOT` (or default temp root).
- Path must match the recorded branch location (`path.join(root, branchName)` — branch names may contain `/`).
- Path must not be the main repo checkout or filesystem root.
- Worktree must exist and be a git worktree.
- **Uncommitted changes → `blocked`** (expected for most implementation runs).

Blocked is success-path safety, not a failure. Inspect output/diff, then use **Force clean** if you accept losing uncommitted worktree changes.

## Runner endpoint

`POST /feature-sprint/cleanup-worktree`

Body: `FeatureSprintWorktreeCleanupRequest`

```json
{
  "worktreePath": "/tmp/life-harness-feature-worktrees/life-harness/feature-step-abc",
  "branchName": "life-harness/feature-step-abc",
  "repoPath": "C:/Users/me/Projects/life-harness",
  "force": false
}
```

Response: `FeatureSprintWorktreeCleanupResponse` with `status`:

| Status | Meaning |
|--------|---------|
| `cleaned` | Git registration and filesystem path are both absent (including idempotent retry) |
| `blocked` | Uncommitted changes; `force` not set |
| `orphaned_on_disk` | Git registration removed; directory still on disk — retry filesystem cleanup |
| `stale_git_registration` | Directory gone; Git registration remains — retry registration cleanup |
| `not_found` | Legacy / historical only; new reconciliations prefer `cleaned` when both are absent |
| `failed` | Validation error or both still present after an attempt |

Expected safety outcomes (`blocked`, partial statuses) return HTTP 200 with typed body — not HTTP errors.

Cleanup runs in two stages after path validation:

1. **Git registration** — `git worktree remove [--force]` when still registered; final status uses `git worktree list` probes (exit code alone is not trusted).
2. **Filesystem** — only when registration is already gone, the directory remains, and `force: true`. Uses a no-follow recursive walk (symlinks/junctions unlinked, not traversed). On Windows, a bounded-retry walk plus empty-directory `robocopy /MIR` fallback (arg-array spawn, no shell concatenation) **only after** the destination is confirmed link-free; robocopy is refused if any symlink/junction remains.

Never deletes filesystem contents while the path is still a registered Git worktree.

## App wiring

- Client: `cleanupFeatureSprintWorktree()` in `src/core/featureSprintRunnerClient.ts`
- History: `markFeatureSprintRunnerRunWorktreeCleanup()` in `src/core/featureSprintRunnerHistory.ts`
- Fields on `HarnessFeatureSprintRunnerRun`: `worktreeCleanedAt`, `worktreeCleanupStatus`, `worktreeCleanupMessage`
- Output view: `canCleanWorktree`, cleanup helpers in `src/core/featureSprintRunnerOutputView.ts`
- UI: **Worktree cleanup** section in `FeatureRunnerOutputDetails`; handlers in `app/card/[id].tsx` (Backroom only)

### History audit rules

- Always set `worktreeCleanupStatus` and `worktreeCleanupMessage` from the response (including `blocked`, `failed`, `not_found`, and partial statuses).
- Set `worktreeCleanedAt` **only** when `ok && status === "cleaned"`.
- For `not_found`: record status/message; **do not** set `worktreeCleanedAt` (legacy historical rows remain compatible).
- Filesystem deletion of orphan directories (`gitRegistered=false`, path still on disk) requires explicit `force: true` — same consent bar as discarding dirty worktree changes.
- Do not delete the history row; keep `worktreePath` for audit.

### Force clean gate

**Force clean worktree** appears after a `blocked` response for **that same run id**, and may remain available after partial statuses (`orphaned_on_disk`, `stale_git_registration`) so the user can retry. Never on first render; never globally. Normal cleanup never silently escalates to force.

## Limitations (v0.1)

- No auto-cleanup after runs
- No cleanup-all or branch deletion UI
- No arbitrary path deletion — only runner-referenced paths under the worktree root
- No commit/merge/push from cleanup flow
- Client validation is convenience only; runner re-validates all paths

## Related docs

- [feature-runner-output-diff-viewer-v0.1.md](./feature-runner-output-diff-viewer-v0.1.md)
- [feature-sprint-implementation-runner-v0.1.md](./feature-sprint-implementation-runner-v0.1.md)
- [feature-sprint-runner-history-v0.2.md](./feature-sprint-runner-history-v0.2.md)
- [services/feature-sprint-runner/README.md](../services/feature-sprint-runner/README.md)
