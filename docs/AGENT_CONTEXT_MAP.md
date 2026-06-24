# Agent Context Map

Use this file after reading root `AGENTS.md` and running or consulting `npm run agent:preflight`.

Agent prompts: [`../prompts/agent_task_prompt_template.md`](../prompts/agent_task_prompt_template.md) (default implementation; context scout for uncertain work).

Router only — read the matching task block; respect `.agentignore`. Portable contract: [`STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md`](STANDARDIZED_AGENT_ERGONOMICS_ROADMAP.md). Task block shape: `Use when:` → `READ_FIRST:` → `LIKELY_FILES:` → `LIKELY_TESTS:` → `VERIFY:` → `DO_NOT_READ:` → `BOUNDARIES:` → `NOTES:`.

Required: `agent:preflight`, `agent:auto-check` (when changed), `check:boundaries` (boundary work). Optional: `agent:map`, `agent:impact`, `agent:tests-for`, `agent:grep`, `agent:review-packet`, `.agents/skills/`, `docs/CODEX_HOOKS.md`.

## Skills (Codex)

`.agents/skills/`: `life-harness-ticket` → `core-board-product-logic`; `job-scout-adapter` → `career-job-scout`; `raw-lab-containment` → `raw-lab-containment`; `ask-harness-threading` → `ask-harness`; `agent-review` → `docs-planning`.

## Task: core-board-product-logic

Use when:
- Board/core/state/data product rules: actions, guards, parsing, briefing, warmth, recovery, seed state (default core ticket).

READ_FIRST:
- `AGENTS.md`
- `docs/01_final_design_doc.md`
- `docs/02_v0_1_scope.md`
- `docs/05_product_rules.md`

LIKELY_FILES:
- `src/core/` (actions, guards, parsing, briefing, proof, warmth, recovery, types)
- `src/data/seed.ts`
- `src/state/LifeHarnessState.tsx`

LIKELY_TESTS:
- nearest `src/core/*.test.ts` for touched modules

VERIFY:
- `npm run agent:typecheck`
- `npm run agent:test -- -- src/core/<nearest>.test.ts`
- `npm run agent:tests-for -- src/core/<file>.ts`
- `npm run check:boundaries`
- `npm run verify:core` for broad core behavior changes
- `npm run test` for broad core behavior changes

DO_NOT_READ:
- `docs/meta/Life_Harness_Compiled_Context.md`
- large `docs/plans/*.md` unless the ticket names one
- fixtures/sample outputs unless parser behavior depends on them

BOUNDARIES:
- new ideas go to Inbox, not Active
- max 3 Active cards and max 1 Main Quest
- product rules belong in `src/core/`, not scattered in UI
- core logic must stay UI-independent

NOTES: Keep changes narrow, preserve local seed/state behavior, and test core logic changes.

## Task: core-board-usability

Use when:
- Board/home/progress UX, labels, usability rules, Active/Main Quest presentation.

READ_FIRST:
- `AGENTS.md`
- `docs/plans/board-usability-v0.1.md`
- `docs/05_product_rules.md`

LIKELY_FILES:
- `src/core/boardUsability.ts`, `actions.ts`, `briefing.ts`, `guards.ts`, `labels.ts`
- `src/data/createSeedState.ts`
- `app/board.tsx`, `app/index.tsx`, `app/progress.tsx`

LIKELY_TESTS:
- `src/core/boardUsability.test.ts`
- `src/core/actions.test.ts`
- `src/state/lifeHarness/persistence.test.ts`

VERIFY:
- `npm run agent:typecheck`
- `npm run agent:test -- -- src/core/boardUsability.test.ts src/core/actions.test.ts`

DO_NOT_READ:
- compiled context doc
- unrelated large plans
- fixtures unless the ticket names them

BOUNDARIES:
- product rules stay in `src/core/`
- preserve Active cap and Inbox rules
- no new product concepts

NOTES: Narrow UX/usability diff; test `boardUsability` and nearest core tests.

## Task: core-career-hub

Use when:
- Career hub routes, pipeline, morning loop, today shortcuts, Job Board shell (not adapter/runner internals).

READ_FIRST:
- `AGENTS.md`
- `docs/plans/career-hub-integration-v0.2.md`
- `docs/career-unified-workflow-v0.16.md`
- `docs/career-hub-v0.1.md`

LIKELY_FILES:
- `src/core/careerHub.ts`, `careerPipeline.ts`, `todayCareerShortcuts.ts`, `careerMorningLoop.ts`, `primaryAction.ts`
- `src/components/career/jobBoard/JobBoardScreen.tsx`, `JobBoardApplyTab.tsx`
- `app/career.tsx`, `app/index.tsx`

LIKELY_TESTS:
- `src/core/careerHub.test.ts`
- `src/core/todayCareerShortcuts.test.ts`
- `src/core/careerMorningLoop.test.ts`
- `src/core/primaryAction.test.ts`
- `src/components/navRoutes.test.ts`

VERIFY:
- `npm run agent:typecheck`
- `npm run agent:test -- -- src/core/careerHub.test.ts src/core/todayCareerShortcuts.test.ts src/core/careerMorningLoop.test.ts`

DO_NOT_READ:
- job-scout adapter/runner docs unless the ticket crosses into scout
- large unrelated plans

BOUNDARIES:
- no GitHub, calendar, or sync integrations unless explicit
- career hub UX stays separate from runner internals

NOTES: Prefer core career tests; use `career-job-scout` for adapter/runner work.

## Task: career-job-scout

Use when:
- Job Scout adapters, sources, schedules, runner client, or `services/job-scout-runner/`.

READ_FIRST:
- `AGENTS.md`
- `docs/AGENT_BUDGETS.md`
- `docs/career-hub-v0.1.md`
- latest relevant `docs/job-scout-*.md`
- `services/job-scout-runner/README.md` for runner-only work

LIKELY_FILES:
- `src/core/jobScout.ts`, `jobSource*.ts`, `jobScoutRunnerClient.ts`, `career.ts`
- `src/data/seedJobScout.ts`
- `services/job-scout-runner/src/`

LIKELY_TESTS:
- nearest `src/core/job*.test.ts`, `src/core/career*.test.ts`
- `services/job-scout-runner/tests/runner.test.ts`

VERIFY:
- `npm run agent:typecheck`
- `npm run test -- src/core/<nearest>.test.ts`
- `npm run agent:tests-for -- --changed`
- `npm run verify:job-scout` for runner changes
- `npm run check:boundaries`

DO_NOT_READ:
- `public/fixtures/` unless working on fixture-backed adapters
- `fixtures/` unless the ticket names it
- large planning docs unless the ticket names one

BOUNDARIES:
- no GitHub, bank, calendar, notification, or cloud sync integration unless explicit
- app/src must not import from `services/`
- runner stays local and bounded

NOTES: Prefer fixture-first adapter tests and keep candidate approval/manual review in the user-approved flow.

## Task: ask-harness

Use when:
- Ask/Chat Harness UI, harness context, thread state, synthesis, containment boundaries.

READ_FIRST:
- `AGENTS.md`
- `docs/ai-workflows-current.md`
- `docs/ask-harness-v0.1.md`
- `docs/conversation-thread-intelligence.md`

LIKELY_FILES:
- `app/ask-harness.tsx`
- `src/core/harnessContext.ts`, `chatThreadState.ts`, `chatHarness*.ts`, `contextPacket*.ts`, `askHarnessSynthesis.ts`
- `src/components/askHarness/`

LIKELY_TESTS:
- `src/core/askHarness.containment.test.ts`
- nearest `src/core/*Harness*.test.ts`, `src/core/contextPacket*.test.ts`
- nearest `src/components/askHarness/*.test.ts`

VERIFY:
- `npm run agent:typecheck`
- `npm run test -- src/core/askHarness.containment.test.ts`
- `npm run agent:tests-for -- --changed`
- `npm run check:boundaries`
- `npm run test -- src/core/<nearest>.test.ts`

DO_NOT_READ:
- Raw Lab planning docs unless the task is a containment boundary
- `services/ai-gateway/docs/sample-outputs/`
- compiled context doc

BOUNDARIES:
- Ask Harness runtime must not import Raw Lab personality/thread internals
- board context remains source of truth
- S3 routing and board mutation guardrails must not weaken
- app/src must not import from `services/`

NOTES: Ask can suggest; the user approves mutations. Keep shared thread logic in `src/core/chatThreadState.ts`.

## Task: raw-lab-containment

Use when:
- Raw Lab sandbox UI/clients, thread/personality state, reflection clients, containment tests.

READ_FIRST:
- `AGENTS.md`
- `docs/ai-workflows-current.md`
- `docs/raw-lab-architecture.md`
- `docs/raw-lab-thread-state.md`
- `docs/raw-lab-deep.md` only for deep-mode work

LIKELY_FILES:
- `app/raw-lab.tsx`
- `src/core/rawLab*.ts`
- `src/components/rawLab/`

LIKELY_TESTS:
- `src/core/rawLabScreen.containment.test.ts`
- nearest `src/core/rawLab*.test.ts`
- gateway Raw Lab contract tests when touching `services/ai-gateway/`

VERIFY:
- `npm run agent:typecheck`
- `npm run test -- src/core/rawLabScreen.containment.test.ts`
- `npm run agent:tests-for -- --changed`
- `npm run check:boundaries`
- `npm run test -- src/core/rawLab*.test.ts`
- gateway pytest commands for gateway changes

DO_NOT_READ:
- board seed/export data unless the ticket explicitly involves handoff
- services sample outputs unless debugging provider output
- large planning docs not named by the ticket

BOUNDARIES:
- Raw Lab runtime must not import board state/actions
- Raw Lab has no board context, tools, Memory Bank authority, or mutation path
- Raw Lab streaming remains manual in the RTK Query pass
- Raw Lab state is in-memory unless the user explicitly saves approved Companion Self-Memories
- do not weaken Ask Harness or S3 containment

NOTES: Keep containment tests close to boundary changes and do not export Raw Lab jailbreak/framing behavior to other modes.

## Task: ai-gateway

Use when:
- `services/ai-gateway/` endpoints, prompts, providers, verifiers, pytest evals.

READ_FIRST:
- `AGENTS.md`
- `services/ai-gateway/AGENTS.md`
- `services/ai-gateway/README.md`
- `docs/local-ai-agent-guide.md`
- relevant `services/ai-gateway/docs/*.md`

LIKELY_FILES:
- `services/ai-gateway/app/main.py`
- `services/ai-gateway/app/models.py`
- `services/ai-gateway/app/providers/`
- `services/ai-gateway/app/prompts/`
- `services/ai-gateway/app/*`
- `services/ai-gateway/tests/`

LIKELY_TESTS:
- nearest `services/ai-gateway/tests/test_*.py`
- contract tests for touched endpoints
- eval fixture tests only when the ticket names eval behavior

VERIFY:
- `cd services/ai-gateway; $env:SCOUT_PROVIDER="mock"; pytest -q`
- targeted `pytest tests/<nearest>.py -q`
- `npm run agent:impact -- --changed`
- `npm run check:boundaries`
- `npm run agent:typecheck` only when app-facing TypeScript contracts change

DO_NOT_READ:
- model weights or model directories
- sample outputs unless needed for a failing fixture
- full eval suites unless the ticket names them

BOUNDARIES:
- app/src must not import from `services/`
- gateway is optional; Expo app core loop remains rules-only
- S3 must be rejected before provider calls
- no app-side provider/model binding

NOTES: Keep schemas strict and mock-first. Do not expose provider/model details through app core behavior.

## Task: docs-planning

Use when:
- Agent docs, plans, prompts, tickets, ergonomics/process edits (docs-only).

READ_FIRST:
- `AGENTS.md`
- `docs/AGENT_BUDGETS.md`
- target doc named by the ticket
- `docs/README.md` only when adding/removing docs

LIKELY_FILES:
- `docs/*.md`
- `docs/plans/*.md`
- `prompts/*.md`
- `tickets/*.md`
- `AGENTS.md`

LIKELY_TESTS:
- usually none
- budget check when agent docs change

VERIFY:
- `npm run check:agent-budget`
- `npm run check:boundaries`
- `npm run agent:preflight`
- `npm run agent:impact -- --changed`
- `npm run agent:review-packet`
- `npm run codex:hooks:smoke` for hook changes
- scoped `git diff -- <docs touched>`

DO_NOT_READ:
- compiled context doc
- unrelated large planning docs
- fixtures/sample outputs

BOUNDARIES:
- docs-only changes must not touch runtime app code
- do not add product concepts while editing process docs
- keep root `AGENTS.md` short and stable

NOTES: Prefer links and task routers over copied context. Token-reduction dogfood: `docs/plans/agent-token-reduction-dogfood-v0.1.md` (docs-only).

## Task: rtk-query-network-layer

Use when:
- `src/network/` RTK hooks/mutations and core `*Client.ts` wire-up (non-streaming).

READ_FIRST:
- `AGENTS.md`
- `docs/plans/agent-ergonomics-rtk-query-upgrade-plan.md`
- `docs/AGENT_BUDGETS.md`
- this task block

LIKELY_FILES:
- `src/network/`
- `app/_layout.tsx`
- `src/state/LifeHarnessState.tsx`
- nearest `src/core/*Client.ts`

LIKELY_TESTS:
- nearest `src/core/*Client.test.ts`
- `src/core/askHarness.containment.test.ts`
- `src/network/*.test.ts` when present

VERIFY:
- `npm run agent:typecheck`
- `npm run test -- src/core/<nearest>.test.ts`
- `npm run agent:symbols -- src/core/<client>.ts`
- `npm run check:boundaries`
- `npm run test -- src/core/askHarness.containment.test.ts`

DO_NOT_READ:
- Redux/RTK migration tutorials unless the ticket explicitly asks for research
- Raw Lab deep planning docs unless touching Raw Lab request behavior
- gateway sample outputs

BOUNDARIES:
- no full Redux app-state migration
- local board state remains in `LifeHarnessProvider`
- RTK Query is network/request ergonomics only
- Raw Lab streaming remains manual
- existing pure request/parse clients stay available
- app/src must not import from `services/`

NOTES: Non-streaming app requests go through `src/network/` hooks/helpers; core `*Client.ts` files remain parse/fetch implementations.
