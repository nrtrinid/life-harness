# Feature Sprint Implementation Runner v0.1

## What this adds

An opt-in `codex_implementation` runner profile that executes one feature step inside an **isolated git worktree**, captures output and diff metadata, and fills the existing Card Detail **Agent output** textarea.

Goal in one sentence: **automate implementation attempts in isolation; user still reviews, saves, reviews, imports, and advances manually.**

## Why worktrees first

Implementation agents may write files. v0.1 never runs Codex in the main repo checkout. Each run:

1. Validates `repoPath` as a git repo
2. Creates a unique branch + worktree under a temp/worktree root
3. Runs mock or real Codex with `cwd` set to the worktree
4. Captures `git status`, `diff --stat`, and changed file names
5. Returns metadata to the app — no commit, merge, or push; cleanup is a separate explicit step (see [feature-sprint-worktree-cleanup-v0.1.md](./feature-sprint-worktree-cleanup-v0.1.md))

## Setup

### Mock mode (default — CI and dogfood)

```bash
npm run feature-runner
```

Mock implementation creates a real isolated worktree and writes `.life-harness/mock-implementation-result.md`.

### Real Codex implementation (experimental / opt-in)

Requires **all** of:

```bash
export FEATURE_SPRINT_RUNNER_MODE=codex
export FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1
export FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
npm run feature-runner
```

Optional:

```bash
export FEATURE_SPRINT_WORKTREE_ROOT=/path/to/worktrees
```

Pair app token: `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token`

## Manual workflow

1. Import a scoped feature plan (or create one manually).
2. Set project **repo path** on the card.
3. **Backroom → Feature Sprint → Check runner**.
4. **Run implementation in worktree** (or copy implementation prompt manually).
5. Inspect agent output textarea: runner text + worktree path + branch + changed files + diff stat + verification summary (when configured).
6. **Save agent output** manually (not auto-saved).
7. **Run review with Codex** or copy review packet.
8. **Import review verdict** manually.
9. **Advance step** / **Mark feature complete** manually.

## Safety boundaries

- Isolated worktree only — never the original repo path as Codex cwd
- No `git add`, `commit`, `merge`, `push`, or `clean`
- Verification commands (v0.2): user-configured Project Registry only; allowlisted parser; expected read-only checks — see [feature-sprint-verification-capture-v0.2.md](./feature-sprint-verification-capture-v0.2.md)
- No auto-save agent output, auto-import, auto-advance, or auto-complete
- Explicit button click required for every implementation run
- Real implementation mode is fail-closed without `ENABLE_IMPLEMENTATION=1`

## Worktree cleanup

v0.1 does not delete worktrees automatically at run completion. After inspecting output/diff in **View details**, use **Clean worktree** (Backroom). See [feature-sprint-worktree-cleanup-v0.1.md](./feature-sprint-worktree-cleanup-v0.1.md).

Manual fallback:

```bash
git worktree list
git worktree remove <path>
git branch -D <branch>
```

Or delete files under `FEATURE_SPRINT_WORKTREE_ROOT` / system temp `life-harness-feature-worktrees`.

## History

Runner history stores worktree path, branch, git status, diff stat, and changed files for implementation runs. See [feature-sprint-runner-history-v0.2.md](./feature-sprint-runner-history-v0.2.md).

Card Backroom **Builder readiness** panel tracks this loop; see [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md).

Inspect runner output, diff, and verification in Backroom via [feature-runner-output-diff-viewer-v0.1.md](./feature-runner-output-diff-viewer-v0.1.md).

## Future

- Verification command capture in worktree
- Automatic review packet from diff/output
- Commit approval gate before advance
- Worktree cleanup UI
- Cursor runner — see [feature-sprint-cursor-runner-v0.1.md](./feature-sprint-cursor-runner-v0.1.md)
