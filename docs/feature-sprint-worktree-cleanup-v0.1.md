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
| `cleaned` | `git worktree remove` succeeded |
| `blocked` | Uncommitted changes; `force` not set |
| `not_found` | Path missing on disk |
| `failed` | Validation, auth, or git error |

Expected safety outcomes (`blocked`, `not_found`) return HTTP 200 with typed body — not HTTP errors.

Removal uses `git -C <repoRoot> worktree remove [--force] <worktreePath>` only. No `rm -rf`, no shell, no branch deletion in v0.1.

## App wiring

- Client: `cleanupFeatureSprintWorktree()` in `src/core/featureSprintRunnerClient.ts`
- History: `markFeatureSprintRunnerRunWorktreeCleanup()` in `src/core/featureSprintRunnerHistory.ts`
- Fields on `HarnessFeatureSprintRunnerRun`: `worktreeCleanedAt`, `worktreeCleanupStatus`, `worktreeCleanupMessage`
- Output view: `canCleanWorktree`, cleanup helpers in `src/core/featureSprintRunnerOutputView.ts`
- UI: **Worktree cleanup** section in `FeatureRunnerOutputDetails`; handlers in `app/card/[id].tsx` (Backroom only)

### History audit rules

- Always set `worktreeCleanupStatus` and `worktreeCleanupMessage` from the response (including `blocked`, `failed`, `not_found`).
- Set `worktreeCleanedAt` **only** when `ok && status === "cleaned"`.
- For `not_found`: record status/message; **do not** set `worktreeCleanedAt` (path already gone ≠ confirmed clean removal in this session).
- Do not delete the history row; keep `worktreePath` for audit.

### Force clean gate

**Force clean worktree** appears only after a `blocked` response for **that same run id**. Never on first render; never globally.

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
