# Feature Sprint Runner History v0.2

## What this adds

Persistent, card-anchored history for Feature Sprint local runner attempts. Each run records profile, status, timestamps, command preview, capped output, and whether the user later imported the result.

Goal in one sentence: **see what the runner did before adding more agent power.**

## Why observability first

v0.1 runner fills import textareas but leaves no durable trail. v0.2 stores attempts on `LifeHarnessData` so Backroom can show recent runs, copy output, and mark imports — without changing manual import gates or adding implementation automation.

## Data model

`LifeHarnessData.featureSprintRunnerRuns: HarnessFeatureSprintRunnerRun[]`

Key fields:

- `profile` — `codex_scoping` | `codex_review` | `codex_implementation` | `codex_prompt_audit` | `codex_localization` | `cursor_*` including `cursor_localization`
- `status` — `running` | `succeeded` | `failed`
- `cardId`, optional `planId` / `stepId`, optional `repoPath`
- optional next-job bridge fields (shallow): `nextJobAction`, `nextJobRole`, `nextJobProvider`, `nextJobLifecycleStatus`, `expectedOutputFence`, `stagedAt`
- `commandPreview`, `error`, `exitCode`
- implementation runs may also store `worktreePath`, `branchName`, `gitStatus`, `diffStat`, `diffText` (50k cap), `changedFiles`, `verificationResults`
- `outputExcerpt` — short list UI field (~280 chars)
- `outputText` — capped full output (50k max) for copy
- `startedAt`, `completedAt`, `importedAt`

Hydration defaults missing arrays to `[]` (no schema version bump).

## Card Detail Backroom

**Recent runner runs** (up to 5 per card):

- profile, status, started time, command preview
- failed runs show `error`; succeeded runs show `outputExcerpt` only
- **Copy output** uses `outputText ?? outputExcerpt`
- **Imported** badge when `importedAt` is set

Run flow:

1. Create history row (`running`)
2. Call local runner
3. Complete row (`succeeded` / `failed`) with capped output

**Safety:** if history create fails for missing/S3 card or invalid plan/step refs (`safetyBlocked`), the UI does **not** call the runner.

**Import linking:** `importedAt` is set only after **successful** Import plan / Import review verdict — never on parse failure.

## Manual import unchanged

Runner output still fills textareas only. User must click Import. `importedAt` is audit metadata, not an auto-import gate.

## Non-goals (v0.2)

- Implementation / Cursor runner
- Repo edits, git commands, auto-import, auto-advance
- Background queue, workbench controls
- ai-gateway / Raw Lab / Project Hub changes

Card Detail **View details** inspects stored runs; see [feature-runner-output-diff-viewer-v0.1.md](./feature-runner-output-diff-viewer-v0.1.md).

## Future

- Diff / test capture on complete — **verification capture shipped in v0.2** ([doc](./feature-sprint-verification-capture-v0.2.md))
- Auto-built review packets
- Commit gate before advance
- Optional workbench “last runner” line
