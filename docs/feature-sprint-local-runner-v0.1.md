# Feature Sprint Local Runner v0.1

## What this adds

An optional localhost runner bridge that executes Feature Sprint packets from the **next-job selector** (`buildNextFeatureSprintJob` → `prepareFeatureSprintRunnerJob`), then fills import textareas or copies packets for manual providers. The user still clicks **Import**, **Save**, **Approve**, and **Advance** manually.

Goal in one sentence: **consume the headless next job, run or prepare the matching provider packet, stage output, and keep every trust gate manual.**

### Builder readiness next-job button

One button in Card Detail → Backroom → Feature Sprint (label depends on mode):

| Label | When |
|-------|------|
| **Run next job** | Runner-eligible job and localhost runner available |
| **Prepare next job** | Manual/chatgpt fallback or packet-only actions (e.g. spec-update prepare). Manual localization copy does **not** mark lifecycle `started`. |
| **Run automated review** | `copy_review` with DeepSeek configured (optional reviewer lane — not the localhost runner) |
| **Show next gate** | Human-only gates (approve, import existing output, advance, adopt, complete) |

`testID`: `feature-sprint-next-job`. Existing per-step Run/Copy buttons remain.

## Why planner/reviewer automation comes first

Implementation automation touches the repo. v0.1 automates packet movement only:

- Codex high/xhigh = planner / reviewer (scoping + review packets)
- Cursor/Codex implementation agent = future bounded builder (not this PR)
- Life Harness = conductor / memory / runner client

**DeepSeek is not the localhost runner.** It is an optional read-only automated reviewer that stages import-compatible verdict text. Codex/Cursor review via `feature-runner` is unchanged. See [feature-sprint-deepseek-reviewer-v0.1.md](feature-sprint-deepseek-reviewer-v0.1.md).
- User = approval gate

## Setup

### Mock mode (default — use this for dogfood and CI)

```bash
npm run feature-runner
```

No Codex binary required. Runner returns valid `feature-sprint-plan`, `feature-review-verdict`, `feature-prompt-localization`, and `feature-prompt-critique` fenced blocks in mock mode.

### Localization profiles (optional Codex wire name)

| Profile | Provider | Notes |
|---------|----------|-------|
| `cursor_localization` | Cursor | Primary localization runner path |
| `codex_localization` | local/mock wire | Optional compatible profile name — **not** a required Codex install |

Staged localization output ≠ imported. On runner failure, phase stays `localizing` and next job retries `copy_localization` (not `import_localization`).

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
3. Expand **How this flow works** for the full loop and mental model.
4. **Start feature panel** — describe spec (optional), check setup, scope it (see [start-feature-flow-v0.2.md](./start-feature-flow-v0.2.md)).
5. **Run scoping with Codex** or copy scoping packet → inspect → **Import plan** manually.
6. **Run implementation in worktree**.
7. **View details** on the run in Recent runner runs → inspect output, changed files, diff, verification.
8. **Save agent output** manually.
9. **Run review with Codex** or copy review packet → inspect → **Import review verdict** manually.
10. **Advance step** → repeat steps 6–10 for each plan slice.
11. **Mark feature complete**.
12. **Clean worktree** — View details → Clean worktree; Force clean only after inspecting output/diff.

Runner controls live on Card Detail Backroom only — not Feature Sprint Workbench. See [feature-sprint-flow-guide-v0.3.md](./feature-sprint-flow-guide-v0.3.md).

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
