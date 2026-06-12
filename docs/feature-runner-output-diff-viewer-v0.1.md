# Feature Runner Output / Diff Viewer v0.1

## What this adds

Read-only inspection for Feature Sprint implementation runner results **before** the user saves agent output or sends a review packet.

Card Detail Backroom **Recent runner runs** now includes **View details** with:

- Runner profile/status/time, worktree, branch, imported marker
- Full implementation output (with truncation notice when capped)
- Changed files list
- Diff stat
- Full diff text when git tracked it (`git diff --`)
- Verification summary + per-command status + failure excerpts
- Safety notes (manual save/review, no auto-commit)

Core helper: `buildFeatureSprintRunnerOutputView(data, runId)` in `src/core/featureSprintRunnerOutputView.ts`.

UI component: `src/components/featureSprint/FeatureRunnerOutputDetails.tsx`.

## Why inspection before cleanup/commit approval

The implementation loop already works in isolated worktrees, but shallow history rows made it hard to answer:

- What did the agent say?
- What files changed?
- What does the diff look like?
- Which verification commands passed/failed?
- Is this safe to save/review?

This ticket adds observability only. Save, import, review, and advance remain explicit manual gates.

## Captured diff fields

After `codex_implementation` runs, the local runner captures (read-only git, `shell: false`):

| Field | Source |
|-------|--------|
| `gitStatus` | `git status --short` (8k cap) |
| `diffStat` | `git diff --stat` (8k cap) |
| `changedFiles` | `git diff --name-only` + untracked names (200 cap) |
| `diffText` | `git diff --` (**50k cap — persisted in app state**) |

**Persistence note:** Runner history lives in `LifeHarnessData.featureSprintRunnerRuns` and is stored locally. `diffText` is capped at 50,000 characters per run to limit storage growth. Future work may store full diffs as external artifact files instead of in-state blobs.

If diff capture fails, the run still succeeds; `diffText` is omitted.

Untracked-only changes (mock implementation marker file) appear in `changedFiles` / `gitStatus` but may not produce `diffText` — the UI shows an explicit fallback.

## Truncation notices

When caps apply, the detail panel shows:

- *Diff truncated at 50,000 characters.*
- *Output truncated at 50,000 characters.* (history output cap)

Copy actions copy the stored (possibly truncated) text.

## Card Detail viewer

1. Open a card → Backroom → **Recent runner runs**
2. Click **View details** on a run
3. Inspect sections; use **Copy output**, **Copy diff**, **Copy verification summary**
4. When the latest successful implementation run is ready and agent output is empty, helper copy appears above **Agent output**

No rerun, cleanup, save, import, advance, or commit from the detail panel.

## Safety boundaries

- Read-only git capture — no staging, commit, merge, push, or worktree cleanup
- No auto-save, auto-review, auto-import, or auto-advance
- Verification failures do not auto-reject implementation output
- S3 cards still blocked from runner history mutation (unchanged)

## Limitations (v0.1)

- Untracked file **content** may not appear in `diffText` unless git tracks the change
- `diffText` and stored output are capped; truncated content is labeled in UI
- No syntax highlighting or side-by-side diff viewer
- Feature Sprint Workbench rows unchanged (Card Detail is the inspection surface)

## Related docs

- [feature-sprint-implementation-runner-v0.1.md](./feature-sprint-implementation-runner-v0.1.md)
- [feature-sprint-runner-history-v0.2.md](./feature-sprint-runner-history-v0.2.md)
- [feature-sprint-verification-capture-v0.2.md](./feature-sprint-verification-capture-v0.2.md)
- [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md)

## Future path

- Worktree cleanup UI
- Richer diff viewer (syntax highlight, file tree)
- External artifact files for large diffs
- Commit approval gate before advance
- Automatic review packet enrichment from captured diff/verification
