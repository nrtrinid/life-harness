# Agent Token Benchmark v0.2

## Status

This benchmark was rerun with Rust Token Killer (`rtk`) installed and compares raw shell commands, RTK-prefixed commands, and repo-native `agent:*` wrappers for a docs-only workflow.

- Shell: PowerShell
- RTK path used: `C:\Users\nicki\AppData\Local\rtk\rtk.exe`
- Branch at benchmark time: `agent-token-dogfood-results-v0.1`

## Measurement method

For each command:

- capture exit status
- capture approximate line count (`\n`-separated lines)
- capture approximate character count
- compute rough token estimate as `chars / 4`

This is an observational, command-level comparison only.

## Commands compared

| # | Command | Style | Exit | Approx lines | Approx chars | Rough tokens | Usefulness for next agent action |
|---|---|---|---:|---:|---:|---:|---|
| 1 | `git status --short` | raw | 0 | 1 | 0 | 0 | Low. Confirms working-tree state but no task framing. |
| 2 | `rtk git status --short` | RTK-prefixed | 0 | 2 | 4 | 1 | Low/low+; similar goal as raw with tiny wrapper overhead. |
| 3 | `npm run agent:preflight` | repo-native | 0 | 57 | 1270 | 317.5 | High. Best single-command orientation: branch, likely task areas, matching context-map hints, and boundary reminders. |
| 4 | `rg "LifeHarnessProvider" .` | raw | 0 | 24 | 3037 | 759.25 | Medium. Useful if you already know an exact search target, but no repo policy context. |
| 5 | `rtk rg "LifeHarnessProvider" .` | RTK-prefixed | 0 | 24 | 3037 | 759.25 | Medium. No measurable gain here; same output shape in this repo slice. |
| 6 | `npm run agent:grep -- "LifeHarnessProvider"` | repo-native | 0 | 20 | 631 | 157.75 | High. Same semantic target with significantly reduced output and repo-aware command semantics. |
| 7 | `git diff --stat` | raw | 0 | 1 | 0 | 0 | Medium. Useful only when changes exist; no change-scoped recommendations. |
| 8 | `rtk git diff --stat` | RTK-prefixed | 0 | 2 | 2 | 0.5 | Medium. Similar value to raw in this clean worktree, with no planning benefit. |
| 9 | `npm run agent:review-packet` | repo-native | 0 | 36 | 804 | 201 | High. Produces scoped review summary and diff-risk framing for safer handoff. |
| 10 | `npm run agent:auto-check -- --dry-run` | repo-native | 0 | 19 | 334 | 83.5 | High. Best compact pre-verification selector when commands changed. |

## Quick interpretation

- `agent:preflight` and `agent:auto-check -- --dry-run` are the most useful high-signal startup and verification commands.
- `agent:grep` is significantly more efficient than raw `rg` for the repo and keeps output within agent-relevant context.
- RTK-prefixed variants did not show meaningful token reduction for the sampled commands in this state.
- For this repo-native flow, RTK did not outperform the existing wrappers enough to make it the default.

### Optional commands checked

- `npm run typecheck` (not executed): intentionally skipped to keep this pass docs-only.
- `npm run agent:typecheck` (not executed): intentionally skipped because this task is measurements/docs-only and no runtime/code changes were made.

## Recommendation

- **Default workflow**: keep repo-native `agent:*` command chain as default.

  ```bash
  npm run agent:preflight
  npm run agent:map -- --task <task>
  npm run agent:auto-check -- --dry-run
  npm run agent:review-packet
  ```

- **When to use RTK**: optional only for ad-hoc raw command outputs outside existing wrappers where noise is known to be high.
- **AGENTS.md mention**: keep RTK as optional / opportunistic, not required in the core AGENTS guidance.
