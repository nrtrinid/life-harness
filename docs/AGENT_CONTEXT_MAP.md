# Agent Context Map

Use this file after reading root `AGENTS.md` and, when useful, running `npm run agent:bootstrap`.

This is a router, not a full architecture doc. Read only the task block that matches the ticket, then inspect the listed files directly. Respect `.agentignore` and avoid archived/planning/historical docs unless a task explicitly asks for them.

Useful first commands: `npm run agent:map`, `npm run agent:impact -- --changed`, `npm run agent:tests-for -- --changed`, and `npm run agent:grep -- "<query>"`. Use `npm run check:boundaries` before boundary-sensitive changes. Use `npm run agent:typecheck`, `npm run agent:test`, or `npm run agent:verify` when you need compact terminal output with full logs under `tmp/agent-logs/`; use `npm run agent:failures` to summarize the latest log and `npm run agent:review-packet` before review.

## Task: core-board-product-logic

READ_FIRST:
- `AGENTS.md`
- `docs/01_final_design_doc.md`
- `docs/02_v0_1_scope.md`
- `docs/05_product_rules.md`

LIKELY_FILES:
- `src/core/types.ts`
- `src/core/actions.ts`
- `src/core/guards.ts`
- `src/core/parsing.ts`
- `src/core/briefing.ts`
- `src/core/proof.ts`
- `src/core/warmth.ts`
- `src/core/recovery.ts`
- `src/data/seed.ts`
- `src/state/LifeHarnessState.tsx`

LIKELY_TESTS:
- `src/core/actions.test.ts`
- `src/core/guards.test.ts`
- `src/core/parsing.test.ts`
- `src/core/briefing.test.ts`
- `src/core/proof.test.ts`
- `src/core/warmth.test.ts`
- nearest `src/core/*.test.ts`

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

NOTES:
- Keep changes narrow and preserve local seed/state behavior.
- Add or update tests when core logic changes.

## Task: career-job-scout

READ_FIRST:
- `AGENTS.md`
- `docs/AGENT_BUDGETS.md`
- `docs/career-hub-v0.1.md`
- latest relevant `docs/job-scout-*.md`
- `services/job-scout-runner/README.md` for runner-only work

LIKELY_FILES:
- `src/core/jobScout.ts`
- `src/core/jobSourceAdapters.ts`
- `src/core/jobSourceRunner.ts`
- `src/core/jobSourceSchedule.ts`
- `src/core/jobScoutRunnerClient.ts`
- `src/core/career.ts`
- `src/core/careerHub.ts`
- `src/data/seedJobScout.ts`
- `services/job-scout-runner/src/server.ts`
- `services/job-scout-runner/src/fetchSource.ts`

LIKELY_TESTS:
- `src/core/jobScout.test.ts`
- `src/core/jobSourceAdapters.test.ts`
- `src/core/jobSourceRunner.test.ts`
- `src/core/jobSourceSchedule.test.ts`
- `src/core/jobScoutRunnerClient.test.ts`
- `src/core/career.test.ts`
- `src/core/careerHub.test.ts`
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

NOTES:
- For source adapters, prefer fixture-first tests before live fetch assumptions.
- Keep candidate approval/manual review in the user-approved flow.

## Task: ask-harness

READ_FIRST:
- `AGENTS.md`
- `docs/ai-workflows-current.md`
- `docs/ask-harness-v0.1.md`
- `docs/conversation-thread-intelligence.md`

LIKELY_FILES:
- `app/ask-harness.tsx`
- `src/core/harnessContext.ts`
- `src/core/chatThreadState.ts`
- `src/core/chatHarnessClient.ts`
- `src/core/chatHarnessSendBudget.ts`
- `src/core/contextPacket*.ts`
- `src/core/askHarnessSynthesis.ts`
- `src/components/askHarness/`

LIKELY_TESTS:
- `src/core/askHarness.containment.test.ts`
- `src/core/chatThreadState.test.ts`
- `src/core/chatHarnessClient.test.ts`
- `src/core/chatHarnessSendBudget.test.ts`
- `src/core/contextPacket*.test.ts`
- `src/core/askHarnessSynthesis.test.ts`
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

NOTES:
- Ask can suggest; the user approves mutations.
- Keep shared thread logic in `src/core/chatThreadState.ts`.

## Task: raw-lab-containment

READ_FIRST:
- `AGENTS.md`
- `docs/ai-workflows-current.md`
- `docs/raw-lab-architecture.md`
- `docs/raw-lab-thread-state.md`
- `docs/raw-lab-deep.md` only for deep-mode work

LIKELY_FILES:
- `app/raw-lab.tsx`
- `src/core/rawLabClient.ts`
- `src/core/rawLabThreadState.ts`
- `src/core/rawLabContextBudget.ts`
- `src/core/rawLabSelfReflectionClient.ts`
- `src/core/rawLabThreadReflectionClient.ts`
- `src/components/rawLab/`

LIKELY_TESTS:
- `src/core/rawLabClient.test.ts`
- `src/core/rawLabThreadState.test.ts`
- `src/core/rawLabContextBudget.test.ts`
- `src/core/rawLabScreen.containment.test.ts`
- `src/core/rawLabThreadReflectionClient.test.ts`
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

NOTES:
- Keep Raw Lab containment tests close to any boundary change.
- Do not export Raw Lab jailbreak/framing behavior to other modes.

## Task: ai-gateway

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

NOTES:
- Keep schemas strict and mock-first.
- Do not expose provider/model details through app core behavior.

## Task: docs-planning

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
- `npm run agent:bootstrap`
- `npm run agent:impact -- --changed`
- `npm run agent:review-packet`
- scoped `git diff -- <docs touched>`
- `git status --short`

DO_NOT_READ:
- compiled context doc
- unrelated large planning docs
- fixtures/sample outputs

BOUNDARIES:
- docs-only changes must not touch runtime app code
- do not add product concepts while editing process docs
- keep root `AGENTS.md` short and stable

NOTES:
- Prefer links and task routers over copied context.
- Mark planned scripts as planned if they do not exist yet.

## Task: rtk-query-network-layer

READ_FIRST:
- `AGENTS.md`
- `docs/plans/agent-ergonomics-rtk-query-upgrade-plan.md`
- `docs/AGENT_BUDGETS.md`
- this task block

LIKELY_FILES:
- planned `src/network/`
- `app/_layout.tsx`
- `src/core/jobScoutRunnerClient.ts`
- `src/core/chatHarnessClient.ts`
- `src/core/gatewayHealthClient.ts`
- `src/core/deepSynthesisClient.ts`
- `src/core/aiJobClient.ts`
- `src/core/rawLabClient.ts`
- `src/core/rawLabSelfReflectionClient.ts`
- `src/core/rawLabThreadReflectionClient.ts`
- `src/state/LifeHarnessState.tsx`

LIKELY_TESTS:
- nearest client tests in `src/core/*Client.test.ts`
- `src/core/askHarness.containment.test.ts`
- future `src/network/*.test.ts` once PR 4 adds the layer

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

NOTES:
- RTK Query helps future agents find network calls; it is not the main token saver.
- Do not add RTK dependencies until the explicit PR 4 implementation ticket.
