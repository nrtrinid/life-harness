# Agent Token Reduction Dogfood Results v0.1

## Status

RTK availability check was done and RTK was installed as a user-level local developer CLI.

- Shell: PowerShell (x64 Windows)
- Install source: official rtk-ai GitHub release
- Release: `v0.42.4`
- Installed path: `C:\Users\nicki\AppData\Local\rtk\rtk.exe`
- Installed on this machine via prebuilt Windows archive (`rtk-x86_64-pc-windows-msvc.zip`)
- `Get-Command rtk`/`where.exe rtk` are now expected after a fresh shell refresh to pick up user PATH.
- This is tooling-only; no repo dependency or code changes were added.

## Measurement commands

| Command style | Command | Exit | Approx. output lines | Notes |
|---|---|---:|---:|---|
| Raw | `npm run agent:preflight` (baseline control) | 0 | 58 | Baseline for task-first orientation. |
| Raw | `git status --short` | 0 | 2 | Smallest signal, no task policy. |
| Raw | `git diff --stat` | 0 | 1 | Useful only after changes are present. |
| Raw | `rg "LifeHarnessProvider" .` | 0 | 21 | Good for known-token queries. |
| Raw | `npm run agent:auto-check -- --dry-run` (baseline control) | 0 | 19 | Baseline verification selector summary. |
| Repo-native | `npm run agent:map -- --task docs-planning` | 0 | 51 | Gives read-first docs/tests and boundaries. |
| Repo-native | `npm run agent:grep -- "LifeHarnessProvider"` | 0 | 19 | Safe scoped search via repo conventions. |
| Repo-native | `npm run agent:review-packet` | 0 | 35 | Compact diff/risk-focused summary. |
| RTK prefixed | `rtk --version` | 0 | 2 | Confirms installed binary. |
| RTK prefixed | `rtk git status --short` | 0 | 2 | Comparable to raw `git status --short` with compression. |
| RTK prefixed | `rtk git diff --stat` | 0 | 2 | Comparable to raw; little room to compress here. |
| RTK prefixed | `rtk rg "LifeHarnessProvider" .` | 0 | 21 | Comparable to raw with no visible gain in this repo slice. |
| RTK prefixed | `rtk gain` | 0 | 20 | Tooling telemetry output shows no prior command history yet. |

## Noise and failure observations

- `agent:preflight` still provides the strongest orientation signal versus raw commands.
- `agent:auto-check -- --dry-run` remains the cleanest way to choose a minimal verification set.
- `agent:map`/`agent:grep` add useful task routing and context-map boundaries that raw search does not.
- In this measurement, RTK output line counts were not materially lower than repo-native commands for the sampled commands.
- RTK binary invocation succeeds, but a fresh shell session may require PATH refresh to resolve `rtk` by name.
- No failures in command execution once RTK was called directly from the installed path.
- For this docs-only scope, `npm run agent:review-packet` plus docs scope checks were still the tightest signal path.

## Recommendation

Use `rtk` as **optional extra compression only for noisy command outputs not already covered by repo-native wrappers**.

- Keep Life Harness `agent:*` commands as default (`agent:preflight`, `agent:map`, `agent:grep`, `agent:auto-check`, `agent:review-packet`).
- Do not replace AGENTS.md recommendations with RTK at this stage.
- Recommend status: `keep optional` (no broad adoption required).

### For the question at hand

- Do repo-native commands already solve most token waste?  
  Yes, for this docs/core workflow and task routing.

- Does RTK add enough value on top right now?  
  Not enough to change default workflow; gains are likely in noisy ad-hoc command output outside already-wrapped agent paths.

- Should AGENTS.md recommend RTK as required?  
  No. Keep RTK as optional.

## Verification run after doc update

- `npm run agent:auto-check`
