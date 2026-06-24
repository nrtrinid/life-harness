# Standardized Agent Ergonomics Roadmap

Date: 2026-06-23
Status: Roadmap
Scope: `life-harness`, `text-adventure`, and `ev-tracker`

## Goal

Standardize the agent first-five-minutes experience across all three repos while keeping each repo's native stack and command style. An agent should be able to enter any repo and quickly answer:

1. Where do I start?
2. What should I read for this task?
3. What should I avoid reading or touching by default?
4. What focused checks match my changed files?
5. What should my final handoff include?

The target is a shared ergonomics contract, not identical implementation. `life-harness` can keep richer npm-based tooling; `text-adventure` can keep `rtk.ps1`; `ev-tracker` can keep Python plus PowerShell scripts.

## Shared Contract

Each repo should provide these stable surfaces:

- Root `AGENTS.md` or an explicit documented equivalent as the first-read entrypoint.
- `docs/AGENT_CONTEXT_MAP.md` as the task router.
- A read-only preflight command that reports git state, likely task blocks, likely tests, and boundary warnings.
- A doctor or freshness check that catches stale links, dangerous touched files, and command drift.
- A changed-files-to-tests selector or verification helper.
- Default no-read and no-touch guidance for generated, private, large, or dangerous paths.
- A common final response shape for non-trivial work: `Changed / Tests / Docs / Risks / Did not touch / Next safe step`.

## Life Harness Position

`life-harness` is the reference implementation for the richer version of this system.

Already strong:

- Root `AGENTS.md` is canonical.
- `docs/AGENT_CONTEXT_MAP.md` routes tasks by domain.
- `.agentignore` gives concrete context hygiene.
- `npm run agent:preflight`, `agent:map`, `agent:impact`, `agent:tests-for`, `agent:auto-check`, and `agent:review-packet` provide a broad agent toolbelt.
- Local `.agents/skills/` support repo-specific workflows.

Risk:

- The tooling surface is powerful enough that it can become a standardization trap. Other repos should copy the contract, not every Life Harness script.

## Portable vs project-specific

Canonical split for agents and for cross-repo audits. Other repos should copy the **portable contract**, not every Life Harness script.

### Portable contract (required pattern)

| Surface | Life Harness mapping |
|---------|---------------------|
| Entrypoint | Root `AGENTS.md` |
| Task router | `docs/AGENT_CONTEXT_MAP.md` |
| Preflight | `npm run agent:preflight` |
| Freshness / drift | `npm run check:agent-budget`, `npm run check:boundaries` |
| Changed-files → tests | `npm run agent:tests-for -- --changed`, `npm run agent:auto-check` |
| No-read / no-touch | `.agentignore`, per-task `DO_NOT_READ` / `BOUNDARIES` |
| Handoff shape | Changed / Tests / Docs / Risks / Did not touch / Next safe step |

### Life Harness extras (optional)

Do not require these in `text-adventure`, `ev-tracker`, or other repos:

- `.agents/skills/` — Codex workflow skills
- `docs/CODEX_HOOKS.md` and `npm run codex:hooks:smoke`
- `npm run agent:review-packet`
- `npm run check:agent-budget` depth (skill line counts, map budgets)
- Broader `agent:*` suite: `agent:map`, `agent:grep`, `agent:symbols`, `agent:exports`, `agent:impact`, `agent:failures`, `agent:verify`, and similar helpers
- `.github/workflows/agent-guardrails.yml` CI wiring

Pointers: [`docs/README.md`](README.md) (discovery), [`docs/AGENT_CONTEXT_MAP.md`](AGENT_CONTEXT_MAP.md) (task router).

## Roadmap

### Phase 1 - Mark Required vs Extra — Done

Portable vs project-specific guidance lives in this file and is linked from `docs/README.md` and `docs/AGENT_CONTEXT_MAP.md`.

Acceptance:

- A future agent can see which Life Harness ergonomics are portable standards and which are project-specific affordances.

### Phase 2 - Normalize Context Map Headings — Done

All task blocks in `docs/AGENT_CONTEXT_MAP.md` follow this shape; `npm run check:agent-budget` enforces required headings per block.

```md
## Task: <name>

Use when:
READ_FIRST:
LIKELY_FILES:
LIKELY_TESTS:
VERIFY:
DO_NOT_READ:
BOUNDARIES:
NOTES:
```

Acceptance:

- New task blocks follow this shape.
- Existing blocks that are touched for other reasons are normalized opportunistically.

### Phase 3 - Keep Script Claims Tested — Done

`npm run check:agent-commands` smoke-tests portable scripts, scans allowlisted docs/skills for stale `npm run` references, and asserts changed-file helper alignment. CI runs it in `.github/workflows/agent-guardrails.yml`.

Suggested checks:

```powershell
npm run check:agent-commands
npm run agent:preflight
npm run agent:auto-check -- --dry-run
npm run agent:tests-for -- --changed
npm run check:agent-budget
```

Acceptance:

- Agent docs do not recommend stale commands.
- Changed-file helpers agree with preflight on dirty trees.

### Phase 4 - Cross-Repo Audit Cadence — Done

Runbook: [`docs/AGENT_CROSS_REPO_AUDIT.md`](AGENT_CROSS_REPO_AUDIT.md). Log: [`docs/agent-cross-repo-audit-log.md`](agent-cross-repo-audit-log.md).  
CI runs `npm run audit:agent-ergonomics` (life-harness self-audit). Manual 3-repo pass: `npm run audit:agent-ergonomics -- --all`.

Audit questions:

- Does the first command work on clean and dirty trees?
- Does the context map route to narrow read-first docs and focused checks?
- Are ignored/no-touch paths explicit?
- Are final response expectations consistent?
- Are repo-specific extra tools documented as optional?

Acceptance:

- Periodic audits use the portable contract, not Life Harness-only scripts.
- Results are recorded in the audit log.

## Local Next Steps

1. Keep `docs/AGENT_CONTEXT_MAP.md` as the most complete task-router example.
2. Avoid expanding the required standard every time Life Harness gains a useful extra script.
3. Run `npm run audit:agent-ergonomics -- --all` quarterly; update [`agent-cross-repo-audit-log.md`](agent-cross-repo-audit-log.md).

## Definition Of Done

Life Harness remains the reference repo when:

- A new agent starts from `AGENTS.md`, runs `npm run agent:preflight`, and lands on the right context-map block without broad crawling.
- Changed-file helpers suggest focused checks.
- Boundary-sensitive work is routed to `npm run check:boundaries`.
- The final handoff names changed files, checks, docs, risks, untouched surfaces, and the next safe step.
