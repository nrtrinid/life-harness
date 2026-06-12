# Feature Sprint Local Runner v0.1

## What this adds

An optional localhost runner bridge that executes Feature Sprint **scoping** and **review** packets, then fills the existing Card Detail import textareas. The user still clicks **Import plan** / **Import review verdict** manually.

Goal in one sentence: **run scoping/review packets locally, fill the import textareas, and require the user to import manually.**

## Why planner/reviewer automation comes first

Implementation automation touches the repo. v0.1 automates packet movement only:

- Codex high/xhigh = planner / reviewer (scoping + review packets)
- Cursor/Codex implementation agent = future bounded builder (not this PR)
- Life Harness = conductor / memory / runner client
- User = approval gate

## Setup

### Mock mode (default — use this for dogfood and CI)

```bash
npm run feature-runner
```

No Codex binary required. Runner returns valid `feature-sprint-plan` and `feature-review-verdict` fenced blocks.

### Token pairing (optional for mock; required for real Codex)

Server:

```bash
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
```

App (web dev):

```bash
export EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
```

`EXPO_PUBLIC_*` values are visible in the client bundle — treat this as a **local safety guard**, not a true secret. Real boundaries are `127.0.0.1` bind, real Codex disabled unless explicitly enabled, no implementation profile, no arbitrary commands, no auto-import, and no repo mutation.

When the server token is set, requests must include `Authorization: Bearer <token>`.

### Real Codex mode (experimental / opt-in)

```bash
export FEATURE_SPRINT_RUNNER_MODE=codex
export FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
npm run feature-runner
```

Real mode is documented and adapter-only. Do not block on perfect local Codex CLI flag syntax — mock mode is the v0.1 contract.

## Manual workflow

1. Start runner: `npm run feature-runner` (mock default).
2. Open card → **Backroom** → **Feature Sprint**.
3. Optionally paste a **Rough feature spec** (see [feature-spec-intake-v0.1.md](./feature-spec-intake-v0.1.md)).
4. **Check runner** → should show available when runner is up.
5. **Run scoping with Codex** → plan import textarea fills → inspect → **Import plan**.
5. **Copy implementation prompt** / save agent output manually (unchanged).
6. **Run review with Codex** → review import textarea fills → inspect → **Import review verdict**.
7. **Advance step** / **Mark feature complete** on Card Detail as before.

Runner controls live on Card Detail Backroom only — not Feature Sprint Workbench.

## Safety boundaries

- No implementation runner in v0.1
- No repo mutation, commits, or git commands from the runner
- No auto-import, auto-advance, or auto-complete
- App works fully without the runner (manual copy/paste unchanged)
- All runner actions require explicit button clicks
- Bearer token when configured on the server
- `MODE=codex` without `ENABLE_CODEX=1` is rejected

## v0.2 — runner history

See [feature-sprint-runner-history-v0.2.md](./feature-sprint-runner-history-v0.2.md). Card Detail Backroom now keeps persistent card-anchored runner history (recent runs, copy output, import marker). Manual import gates are unchanged.

## v0.1 implementation runner

See [feature-sprint-implementation-runner-v0.1.md](./feature-sprint-implementation-runner-v0.1.md). Adds `codex_implementation` profile with isolated git worktree execution. Still approval-gated: output fills the agent textarea only; save/review/advance remain manual.

For mock-mode end-to-end walkthrough, see [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md).

## Future path

- Implementation runner in isolated worktree
- stdout/diff/test capture
- Codex review gate with explicit commit approval
