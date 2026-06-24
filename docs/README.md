# Life Harness docs

## Product and scope

- [`01_final_design_doc.md`](01_final_design_doc.md) — product thesis and core loop
- [`02_v0_1_scope.md`](02_v0_1_scope.md) — v0.1 boundaries
- [`05_product_rules.md`](05_product_rules.md) — board rules (Active cap, Inbox, parking)
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — local dev setup
- [`AGENT_BUDGETS.md`](AGENT_BUDGETS.md) — token budgets and bootstrap guardrails for coding agents
- [`AGENT_CONTEXT_MAP.md`](AGENT_CONTEXT_MAP.md) — task-scoped docs/files/tests router for coding agents
- [`../prompts/agent_task_prompt_template.md`](../prompts/agent_task_prompt_template.md) — default implementation + context-scout agent prompts
- [`CODEX_HOOKS.md`](CODEX_HOOKS.md) — optional local Codex hook guardrails

Agent quickstart: `npm run agent:preflight`, `npm run agent:map`, `npm run agent:impact -- --changed`, `npm run agent:auto-check -- --dry-run`, and `npm run agent:review-packet`. Optional hook smoke test: `npm run codex:hooks:smoke`. Compact verification logs are written by `npm run agent:typecheck`, `npm run agent:test`, `npm run agent:verify`, and `npm run agent:auto-check` to `tmp/agent-logs/`. Human verification commands include `npm run verify:core`, `npm run verify:job-scout`, `npm run verify:app`, and `npm run verify`.

## Features (by version)

| Area | Doc |
|------|-----|
| Nav / Backroom | [`nav-backroom-cleanup-v0.1.md`](nav-backroom-cleanup-v0.1.md) |
| Spine attachment audit | [`spine-attachment-audit-v0.1.md`](spine-attachment-audit-v0.1.md) |
| Persistence | [`persistence-audit-v0.5.md`](persistence-audit-v0.5.md) |
| Memory Bank | [`memory-bank-v0.1.md`](memory-bank-v0.1.md) |
| AI workflow map | [`ai-workflows-current.md`](ai-workflows-current.md) |
| Agent spine inventory / policy resolver, guards, and audit | [`agent-spine-inventory-v0.1.md`](agent-spine-inventory-v0.1.md) |
| Feature Sprint / builder loop | [`feature-sprint-architecture-v0.1.md`](feature-sprint-architecture-v0.1.md) (authority), [`feature-sprint-orchestrator-v0.1.md`](feature-sprint-orchestrator-v0.1.md), [`feature-sprint-flow-guide-v0.3.md`](feature-sprint-flow-guide-v0.3.md), [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md), `feature-sprint-*.md` slices |

**Feature Sprint status (mid-v2):** Living spec, typed handoffs, proof normalization, spec updates, and next-slice adoption are partially or mostly landed. The next architectural jump is **`currentSlice` + phase machine**, then risk-tier routing and UI consolidation around **Next Handoff**. Codex is optional — not a structural dependency.
| Ask Harness | [`ask-harness-v0.1.md`](ask-harness-v0.1.md) |
| Thread intelligence | [`conversation-thread-intelligence.md`](conversation-thread-intelligence.md) |
| Raw Lab | [`raw-lab-architecture.md`](raw-lab-architecture.md), [`raw-lab-thread-state.md`](raw-lab-thread-state.md), [`raw-lab-deep.md`](raw-lab-deep.md), [`raw-lab-emergence-review-pack.md`](raw-lab-emergence-review-pack.md), [`raw-lab-benchmark-runner.md`](raw-lab-benchmark-runner.md) |
| Career hub | [`career-hub-v0.1.md`](career-hub-v0.1.md) |
| Career pipeline | [`career-v0.1-pipeline.md`](career-v0.1-pipeline.md) |
| Job Board UX | [`career-job-board-ux-v0.13.md`](career-job-board-ux-v0.13.md) |
| Full pipeline Find UX | [`career-full-pipeline-ux-v0.14.md`](career-full-pipeline-ux-v0.14.md) |
| Job Scout | `job-scout-*.md` (v0.2–v0.11) |
| Local A770 / AI gateway | [`local-a770-plan.md`](local-a770-plan.md), [`08_ai_provider_and_a770_plan.md`](08_ai_provider_and_a770_plan.md) |

## Plans and roadmaps

- [`plans/`](plans/) — active design plans (A770 stack, deep synthesis, UX)
- A770 stack authority: [`plans/model-stack-freeze-v3.md`](plans/model-stack-freeze-v3.md), [`plans/a770-model-promotion-gates.md`](plans/a770-model-promotion-gates.md)
- Roadmaps: [`plans/a770-local-intelligence-integrated-roadmap.md`](plans/a770-local-intelligence-integrated-roadmap.md), [`plans/a770-local-intelligence-roadmap.md`](plans/a770-local-intelligence-roadmap.md)
- Gateway / synthesis: [`plans/ai-gateway-model-slots-v0.1.md`](plans/ai-gateway-model-slots-v0.1.md), [`plans/deep-synthesis-overnight-brain-v0.1.md`](plans/deep-synthesis-overnight-brain-v0.1.md), [`plans/phi4-critic-deep-pass-v0.1.md`](plans/phi4-critic-deep-pass-v0.1.md)
- Companion / context: [`plans/companion-reflection-engine-v0.1.md`](plans/companion-reflection-engine-v0.1.md), [`plans/context-packet-builder-v0.1.md`](plans/context-packet-builder-v0.1.md)
- Pattern extraction: [`plans/odysseus-patterns-repo-map-v0.1.md`](plans/odysseus-patterns-repo-map-v0.1.md)
- Evals / agents: [`plans/local-ai-evals-v0.1.md`](plans/local-ai-evals-v0.1.md), [`plans/agent-instructions-local-ai.md`](plans/agent-instructions-local-ai.md)
- Feature Sprint roadmap: [`plans/feature-sprint-roadmap-v0.1.md`](plans/feature-sprint-roadmap-v0.1.md)
- Feature Sprint v2 living spec: [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md)
- Board usability (dogfood / exec-function loop): [`plans/board-usability-v0.1.md`](plans/board-usability-v0.1.md)
- Career hub integration (UX-007 / route unification): [`plans/career-hub-integration-v0.2.md`](plans/career-hub-integration-v0.2.md)
- Agent ergonomics / RTK Query control plane: [`plans/agent-ergonomics-rtk-query-upgrade-plan.md`](plans/agent-ergonomics-rtk-query-upgrade-plan.md)
- Agent token reduction dogfood: [`plans/agent-token-reduction-dogfood-v0.1.md`](plans/agent-token-reduction-dogfood-v0.1.md)
- Cross-repo agent ergonomics: [`STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md`](STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md)
- Cross-repo audit runbook: [`AGENT_CROSS_REPO_AUDIT.md`](AGENT_CROSS_REPO_AUDIT.md)
- [`10_future_roadmap.md`](10_future_roadmap.md)
- Recovery audit: [`plans/stash-recovery-a770-thinking-audit.md`](plans/stash-recovery-a770-thinking-audit.md)

## Agent commands

### Portable contract vs Life Harness extras

Cross-repo goal: same first-five-minutes contract (`life-harness`, `text-adventure`, `ev-tracker`), not identical scripts. Full split: [`STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md`](STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md).

- **Required first moves:** `AGENTS.md` → `npm run agent:preflight` → matching block in `AGENT_CONTEXT_MAP.md`; finish with `agent:auto-check` and `check:boundaries` when relevant.
- **Portable pattern:** entrypoint, context map, preflight, changed-file test routing, no-touch zones, handoff shape (Changed / Tests / Docs / Risks / Did not touch / Next safe step).
- **Life Harness extras (optional):** skills, Codex hooks, review packets, budget-depth checks, and the broader `agent:*` helper suite.

- [`.agents/skills/`](../.agents/skills/) — Codex workflow skills (`life-harness-ticket`, `job-scout-adapter`, `raw-lab-containment`, `ask-harness-threading`, `agent-review`)
- [`AGENT_CONTEXT_MAP.md`](AGENT_CONTEXT_MAP.md) - narrow task router for agents
- [`CODEX_HOOKS.md`](CODEX_HOOKS.md) - optional project-local hook guardrails
- `npm run check:agent-budget` - line/skill/context-map budgets
- `npm run check:agent-commands` - smoke portable agent scripts and scan docs for stale npm script references
- `npm run audit:agent-ergonomics` - portable-contract self-audit (CI); use `-- --all` for manual sibling pass
- `npm run agent:preflight` - compact first-move packet for changed files and likely task areas
- `src/network/` - RTK Query network layer; app UI uses hooks/helpers here for non-streaming requests
- `npm run agent:auto-check` - changed-file-aware compact verification selector
- `npm run check:boundaries` - deterministic import-boundary scanner
- `npm run verify:core` - narrow core Vitest suite
- `npm run verify:app` - app typecheck plus full Vitest suite
- `npm run verify:job-scout` - job scout runner tests
- `npm run verify` - broad verification sequence for app, job scout, and boundaries

## Meta / design artifacts

- [`meta/`](meta/) — theme explorer, compiled context, frontend pass notes (not product authority)

## UX audits

- [`ux/`](ux/) — current UX audits and consolidation notes
- Application card detail: [`ux/career-application-card-detail-v0.15.md`](ux/career-application-card-detail-v0.15.md)
