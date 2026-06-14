# Agent Token Reduction Dogfood v0.1

## Status

Planned docs-only dogfood pass. This evaluates Rust Token Killer (RTK) alongside Life Harness repo-native agent tooling. It does not install dependencies, change runtime code, or touch RTK Query/network work.

## Goal

Compare token output, time-to-orientation, and verification usefulness across four command styles:

```text
normal commands
RTK-prefixed commands
repo-native agent:* wrappers
agent:preflight / agent:auto-check
```

The decision rule is practical: use the smallest command that gives enough context to make the next safe edit.

## Command comparison matrix

| Scenario | Normal command | RTK-prefixed command | Repo-native command | Preferred default |
|---|---|---|---|---|
| Start a task | `git status --short` plus manual doc lookup | `rtk -- git status --short` | `npm run agent:preflight` | `agent:preflight` |
| Find task context | manual doc reads | `rtk -- npm run agent:map -- --task <task>` | `npm run agent:map -- --task <task>` | `agent:map` |
| Search repo | `rg "<term>"` | `rtk -- rg "<term>"` | `npm run agent:grep -- "<term>"` | `agent:grep` |
| Inspect exports/symbols | open files manually | `rtk -- npm run agent:symbols -- <file>` | `npm run agent:symbols -- <file>` | `agent:symbols` |
| Select tests | manual guessing | `rtk -- npm run agent:tests-for -- --changed` | `npm run agent:tests-for -- --changed` | `agent:tests-for` |
| Verify current diff | manual mixed checks | `rtk -- npm run agent:auto-check` | `npm run agent:auto-check` | `agent:auto-check` |
| Review before final | `git diff` and ad hoc notes | `rtk -- npm run agent:review-packet` | `npm run agent:review-packet` | `agent:review-packet` |

`rtk --` means the local Rust Token Killer command prefix if it is already installed and approved in the developer environment. Do not install it as part of this dogfood pass.

## What to measure

- Output size: approximate lines and whether important decisions fit in the visible transcript.
- Orientation quality: whether the command points to the right task docs, files, and tests.
- Edit safety: whether the command surfaces boundary risks before broad reads or broad changes.
- Verification quality: whether failures are summarized without dumping full logs.
- Human overhead: how much prompt text or manual command selection is still needed.

## Recommendation matrix

| Use case | Use RTK | Use repo-native agent commands |
|---|---|---|
| Compressing a noisy third-party command already required by the task | Yes | Maybe, if an agent wrapper exists |
| Starting a Life Harness task | No | Yes: `npm run agent:preflight` |
| Choosing task docs/files/tests | No | Yes: `npm run agent:map`, `agent:impact`, `agent:tests-for` |
| Searching code with repo ignore rules | Usually no | Yes: `npm run agent:grep` |
| Running focused repo verification | Usually no | Yes: `npm run agent:auto-check` |
| Investigating a verbose failure log | Yes, after the wrapper log exists | Yes: `npm run agent:failures` first |
| Working outside this repo's tooling coverage | Yes | No, unless commands are added here |

## Dogfood protocol

1. Pick one small docs task, one core TypeScript task, and one review-only task.
2. For each task, record the first three commands used in each style.
3. Prefer no-op or dry-run forms where possible:

```bash
npm run agent:preflight
npm run agent:auto-check -- --dry-run
rtk -- npm run agent:preflight
rtk -- npm run agent:auto-check -- --dry-run
```

4. Compare whether RTK reduces noise beyond the repo-native wrappers.
5. Do not change product/runtime behavior during the evaluation.

## Working recommendation

Use Life Harness `agent:*` commands as the default control plane because they know repo boundaries, context maps, likely tests, and review packets. Use Rust Token Killer as an outer compression layer for verbose commands that the repo wrappers do not already summarize.

## Results

- Normalized token benchmark pass: [`agent-token-reduction-benchmark-v0.2.md`](agent-token-reduction-benchmark-v0.2.md)
- Noisy-command comparison pass: [`agent-token-reduction-noisy-command-benchmark-v0.3.md`](agent-token-reduction-noisy-command-benchmark-v0.3.md)
