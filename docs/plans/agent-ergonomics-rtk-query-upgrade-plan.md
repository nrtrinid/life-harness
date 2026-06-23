# Agent Ergonomics + RTK Query Upgrade Plan

**Status:** Planning plus agent tooling in progress. No runtime app implementation in this ticket.  
**Goal:** Reduce coding-agent token spend and improve repo operability for future work.  
**Important framing:** RTK Query improves network/request ergonomics and future discoverability, but it is not the main token saver by itself. The main token savers are the agent control plane: budgets, bootstrap packets, task maps, bounded search, output diet wrappers, boundary checks, failure summaries, and review packets.

This is not a product feature plan. It must not add app-facing routes, new motivational concepts, RTK dependencies, runtime code, persistence schema changes, Redux app-state migration, or Raw Lab streaming changes until a later explicit implementation ticket.

## Scope Boundaries

- Root app state stays in `src/state/LifeHarnessState.tsx` for this plan.
- RTK Query is network/request ergonomics only.
- No full Redux app-state migration.
- No app-side local model binding.
- No Raw Lab streaming migration in this pass.
- Pure request/parse clients in `src/core/` stay available.
- Agent docs and scripts must reduce default context, not become a second encyclopedia.

## PR 0: Agent Budget + Bootstrap Guardrails

**Status:** Implemented in the PR 0 tooling/docs slice.

Add the repo-token-saving control plane before rewriting agent docs.

Planned files:

- `.agentignore`
- `docs/AGENT_BUDGETS.md`
- `scripts/check-agent-budget.ts`
- `scripts/agent-bootstrap.ts`

Planned package scripts:

```text
check:agent-budget
agent:preflight
```

Default budgets:

- Root `AGENTS.md` should stay short, stable, and router-like. It should not explain the whole product.
- Repo skills should be concise workflow launchers. They should not copy long docs or the full product architecture.
- Generated maps should have default line and token caps, with explicit opt-in flags for larger output.
- Default-read docs should be current, short, status-marked, and linked from the context map.
- Archived, planning, historical, compiled, fixture, and sample-output docs should not be default-read.
- Any default-read doc that grows beyond budget should fail `check:agent-budget` and link to a shorter router/summary.

`.agentignore` should exclude common token traps from default agent tools:

```text
node_modules/
package-lock.json
.expo/
public/fixtures/
services/ai-gateway/docs/sample-outputs/
services/ai-gateway/evals/
docs/meta/Life_Harness_Compiled_Context.md
docs/ux/current_ux_audit.md
```

`agent:preflight` should provide a cheap first move:

- current branch and concise git status
- changed files grouped by area
- task-router pointer: `docs/AGENT_CONTEXT_MAP.md`
- likely commands for the detected task area
- warnings about dirty unrelated files
- what not to read by default
- suggested next script, usually `agent:impact` or `agent:map`

Measurement and observability:

- Budget checker reports current size of root `AGENTS.md`, skills, default-read docs, and generated map defaults.
- Agent helper scripts should print their own output counts: files scanned, files omitted by `.agentignore`, lines printed, and raw log path when relevant.
- Future work can aggregate these into a local-only `.agent-runs/` ledger, but PR 0 should keep measurement deterministic and lightweight.

## PR 1: Agent Context Router

**Status:** Implemented in the PR 1 context-router docs slice.

Rewrite the current broad agent context into a small routing layer.

Root `AGENTS.md`:

- tiny stable prefix
- product non-negotiables and hard forbidden concepts only
- links to `docs/AGENT_CONTEXT_MAP.md`, `docs/AGENT_BUDGETS.md`, and the relevant authority docs
- no long Raw Lab, Ask Harness, or product encyclopedia sections inline

Add `docs/AGENT_CONTEXT_MAP.md` using machine-readable-ish task blocks:

```text
TASK: core-board-product-logic
READ_FIRST:
LIKELY_FILES:
LIKELY_TESTS:
VERIFY:
DO_NOT_READ:
BOUNDARIES:
```

Required task entries:

- `core-board-product-logic`
- `career-job-scout`
- `ask-harness`
- `raw-lab-containment`
- `ai-gateway`
- `docs-planning`
- `network-rtk-query`

Each block should name the narrow first files/tests and any forbidden scope. Example boundaries:

- new ideas go to Inbox, not Active
- maximum 3 Active cards and 1 Main Quest
- rules-first app behavior remains in `src/core/`
- no app-side local model provider binding
- no Raw Lab personality/thread internals entering Ask Harness
- no full Redux app-state migration
- local board state remains in `LifeHarnessProvider`
- RTK Query is network/request ergonomics only

RTK Query note:

- RTK Query centralizes network calls so future agents can find gateway/runner behavior faster.
- It is useful for discoverability, request status, error handling, and cache invalidation.
- It is not the primary token saver without the budget, map, grep, output diet, and failure-summary tools.

## PR 2: Repo Tooling

**Status:** Implemented across PR 2A, PR 2.5, and PR 2B. PR 2A added `agent:map`, `agent:grep`, `agent:symbols`, `agent:exports`, `agent:tests-for`, and `agent:impact`; PR 2.5 added `agent:failures`, `agent:review-packet`, and compact output wrappers; PR 2B added `verify`, `verify:app`, `verify:core`, `verify:job-scout`, `check:boundaries`, `scripts/check-boundaries.ts`, and the agent context map command references.

Add deterministic scripts that agents can run before reading large files or asking broad questions.

Keep these planned scripts:

```text
verify
verify:app
verify:core
verify:job-scout
check:boundaries
agent:map
```

Add these planned scripts:

```text
agent:grep
agent:symbols
agent:exports
agent:tests-for
agent:impact
agent:failures
agent:review-packet
```

Tool behavior:

- `agent:map`: bounded repo map with package scripts, AGENTS chain, doc statuses, route inventory, major modules, tests, and network clients. Respects `.agentignore`.
- `agent:grep`: agent-safe search. Lists matching files first, prints bounded match snippets, avoids huge context dumps, and respects `.agentignore`.
- `agent:symbols`: for target files, prints imports, exports, top-level functions, types, components, constants, and test names. Does not print full file contents.
- `agent:exports`: summarizes public exports for a directory or module. Useful before touching shared core files.
- `agent:tests-for`: maps source files to nearest tests. Supports explicit files and changed-file mode.
- `agent:impact`: given changed files, prints likely affected tests, docs, routes, boundary risks, and recommended narrow checks.
- `agent:failures`: summarizes recent failing test/typecheck/lint output if available. Shows first failure, likely file, and narrow rerun command.
- `agent:review-packet`: summarizes diff, touched areas, tests run, known failures, risk areas, and review focus.
- `check:boundaries`: deterministic import and dependency guardrails. No app/core importing services, no Raw Lab containment leaks, no unexpected dependency or persistence schema changes.

Generated impact maps:

- `agent:impact` should combine changed files, import adjacency, route ownership, nearest tests, and context-map task blocks.
- It should produce recommendations like: "run `npm run verify:core` and `npm run agent:tests-for -- src/core/parsing.ts`."
- It should warn when a change touches high-risk boundaries such as persistence, Raw Lab containment, Ask Harness context export, or package dependencies.

Nearest-test maps:

- Start with naming conventions: `foo.ts` -> `foo.test.ts`, component tests, and runner test directories.
- Add static references from existing test imports.
- Support changed-file mode so agents do not scan the whole repo manually.

Symbol/export summaries:

- Prefer TypeScript AST parsing when feasible; otherwise use conservative regex summaries.
- Output should be bounded and should never replace reading the relevant file before editing.
- The purpose is file selection, not implementation without inspection.

## PR 2.5: Agent Output Diet + Failure Summaries

**Status:** Implemented in the PR 2.5 tooling slice. Added compact-output wrappers for test/typecheck/verify, latest failure summaries, and bounded review packets. No lint wrapper was added because the repo has no lint package script.

Add agent-facing wrappers that keep terminals readable while preserving full logs on disk.

Candidate scripts:

```text
agent:test
agent:typecheck
agent:verify
agent:lint
agent:failures
```

Only add `agent:lint` if a lint command exists in the repo or a later ticket adds one. Do not invent a lint gate in this plan.

Wrapper behavior:

- Run the underlying command without changing normal human commands.
- Write full raw logs to a local ignored log directory.
- Print compact summaries to the terminal.
- Never hide the raw log path.

Summary output should include:

- command run
- pass/fail
- number of failing tests or errors
- first relevant failure
- file/test name
- likely touched files
- suggested narrow rerun
- path to full raw log

Failure summaries:

- TypeScript parser should extract first `TS####` error, file, line, and command rerun.
- Vitest parser should extract first failing suite/test, assertion summary, and scoped rerun.
- Pytest parser should extract first `FAILED ...` line and scoped pytest rerun.
- Unknown formats should still show command, pass/fail, raw log path, and first non-empty error block.

## PR 3: Repo-Local Codex Skills

Add a small set of repo skills after the deterministic scripts exist.

Required skills:

- `life-harness-ticket`
- `job-scout-adapter`
- `raw-lab-containment`
- `ask-harness-threading`
- `agent-review`

Optional skills, only if they stay short:

- `network-rtk-query`
- `docs-plan-update`

Skill rules:

- Skills are short workflow launchers.
- Skills call `agent:preflight`, `agent:map`, `agent:impact`, `agent:tests-for`, and relevant verify commands.
- Skills read docs through `docs/AGENT_CONTEXT_MAP.md`.
- Skills do not duplicate long docs.
- Skills do not contain the full product architecture.

Each skill must include:

- when to use
- first command to run
- docs to read through the context map
- forbidden scope
- verification command
- final response checklist

## PR 3.5: Optional Codex Hooks / Local Agent Config

**Status:** Implemented in the PR 3.5 hook/docs slice. Added project-local `PreToolUse` and `Stop` hooks, smoke tests, and hook documentation without runtime app changes.

This PR is optional and should happen only after PR 0 through PR 3 are working.

Possible hooks/checks:

- warn or block reading huge archived docs by default
- block dependency additions unless the task explicitly allows them
- block package-lock noise unless dependency work is in scope
- warn on persistence schema changes
- warn on `app/` or `src/core/` importing `services/`
- run `check:agent-budget` before finishing docs/agent changes
- generate a stop summary requiring changed files, tests/checks run, known failures, and out-of-scope changes avoided

Hook policy:

- Hooks should call deterministic repo scripts.
- Hooks should not embed long policy text.
- Hooks should be warnings first unless the rule protects secrets, dependencies, generated lockfile noise, or known containment boundaries.

## Agent Autopilot v0.1: Automatic Preflight + Auto-Check

**Status:** Implemented as a follow-up agent-tooling extension. Added `agent:preflight` for compact first-move packets and `agent:auto-check` for changed-file-aware verification selection. These commands compose existing agent scripts only; they do not add runtime app behavior, dependencies, RTK Query, subagents, or gateway/UI/state wiring.

Autopilot behavior:

- `agent:preflight` summarizes branch, bounded changed files, likely task areas, matching context-map blocks, likely tests, first commands, boundary risks, and do-not-read reminders.
- `agent:auto-check` classifies changed files and runs a compact existing-script sequence for docs, tooling/hooks, core TypeScript, app/UI TypeScript, Job Scout, Raw Lab/ai-gateway, package/dependency, or mixed work.
- `agent:auto-check -- --dry-run` prints selected checks without running them.
- `agent:auto-check -- --full` may delegate to `agent:verify` when broader verification is explicitly requested.

## Subagent Guidance

Subagents can help when parallel exploration is genuinely cheaper than one agent reading everything.

Use subagents for:

- independent review of a risky diff
- code mapping across separate subsystems
- checking a narrow hypothesis in parallel
- comparing two implementation options with bounded file sets

Do not use subagents by default for:

- small implementation tickets
- docs-only edits
- tasks where `agent:map`, `agent:grep`, `agent:impact`, or `agent:tests-for` can answer the question deterministically

Every subagent request should include:

- exact task
- files or directories allowed to inspect
- max output size
- forbidden areas
- desired final shape

## PR 4: RTK Query Foundation

**Status:** PR 4A implemented as a network-only foundation. Added `src/network/` store/API exports and root provider wiring while keeping `LifeHarnessProvider` as owner of local board/product state. No call sites are migrated yet.

Add RTK Query as a network/request ergonomics layer only.

Planned scope:

- Add a network-only Redux store under `src/network/`.
- Wrap the Expo root with React Redux provider.
- Create one RTK Query API slice using endpoint `queryFn`s or an equivalent base-query strategy that preserves existing client parsing.
- Keep existing pure request/parse clients in `src/core/`.
- Do not move `LifeHarnessData`, local persistence, board reducer, or product mutations into Redux.

Initial endpoints:

- gateway health budget
- Job Scout runner source run
- Chat Harness request
- deep synthesis request
- AI job poll request
- non-streaming Raw Lab fallback
- Raw Lab self-reflection
- Raw Lab thread-reflection

RTK Query value:

- centralizes network call discovery
- standardizes loading/error state
- makes request endpoints easy for future agents to find
- reduces duplicated fetch/error boilerplate over time

RTK Query non-goals:

- no full Redux migration
- no app-side provider/model binding
- no Raw Lab streaming migration
- no persistence schema change
- no product behavior change

## PR 5: RTK Query Migration

Migrate non-streaming request flows gradually, keeping local board state in `LifeHarnessProvider`.

Job Scout:

- Replace direct runner fetch calls with the RTK Query mutation trigger.
- Preserve current batch progress, runner-unreachable behavior, and `applyRunJobSourceResult` state updates.

Ask Harness:

- Replace manual health fetch with a query hook.
- Replace direct Chat Harness request with a mutation hook.
- Keep local thread state, send-budget logic, and board context construction outside RTK.

Deep Synthesis:

- Keep `useDeepSynthesisJob` as the public hook/state machine.
- Use RTK Query triggers internally for request and job polling.
- Preserve stale-result detection and cancellation generation guards.

Raw Lab:

- Keep `streamRawLab` manual.
- Move self-reflection and thread-reflection to mutations.
- Keep Raw Lab in-session thread/personality state local to the screen/session.

## Public Interfaces And Commands

Planned commands:

```text
npm run check:agent-budget
npm run agent:preflight
npm run agent:map
npm run agent:grep
npm run agent:symbols
npm run agent:exports
npm run agent:tests-for
npm run agent:impact
npm run agent:failures
npm run agent:review-packet
npm run agent:test
npm run agent:typecheck
npm run agent:verify
npm run verify
npm run verify:app
npm run verify:core
npm run verify:job-scout
npm run check:boundaries
```

Planned RTK Query hooks, once PR 4 is implemented:

```text
useGetGatewayHealthBudgetQuery
useRunJobSourceMutation
useAskChatHarnessMutation
useRequestDeepSynthesisMutation
useLazyGetAiJobQuery
useAskRawLabMutation
useReflectRawLabThreadMutation
useReflectRawLabSelfMutation
```

No app-facing route changes are part of this plan.

## Test Plan

PR 0:

- budget checker fixture cases for too-large `AGENTS.md`, oversized skill, missing status, and allowed short docs
- `.agentignore` respected by `agent:preflight` and future agent scripts
- `agent:preflight` handles clean and dirty worktrees without dumping full diffs

PR 1:

- context map contains required task blocks and required fields
- default-read docs are status-marked and under budget
- archived/planning/historical docs are not default-read

PR 2:

- `agent:map` default output stays bounded
- `agent:grep` lists files first and does not dump huge output
- `agent:symbols` reports imports/exports/top-level declarations without full file contents
- `agent:exports` summarizes module exports
- `agent:tests-for` maps known source/test pairs
- `agent:impact` gives expected recommendations for sample changed files
- `check:boundaries` still passes

PR 2.5:

- `agent:test`, `agent:typecheck`, and `agent:verify` write raw logs and print compact summaries
- `agent:failures` summarizes mocked Vitest, TypeScript, and pytest failures
- summaries include first failure, likely file/test, narrow rerun, touched files, and raw log path

PR 3:

- skills stay short and workflow-focused
- each skill points to context map and deterministic scripts
- no skill duplicates long docs or full architecture

PR 3.5:

- optional hooks call repo scripts
- dependency, lockfile, persistence, and import-boundary warnings are deterministic
- stop summary includes changed files, tests/checks run, known failures, and avoided scope

PR 4 and PR 5:

- RTK Query API tests use mocked fetch
- provider wiring typechecks
- runner success, rejection, and unreachable paths remain covered
- gateway health fallback remains covered
- Chat Harness success/error paths remain covered
- deep synthesis completed, queued/polling, failed, cancelled, and stale-result paths remain covered
- Raw Lab reflection success/error paths remain covered
- Raw Lab streaming remains manual
- containment tests still pass

Docs-only verification:

- docs-only plan edits do not require app migrations
- if only this plan doc and docs index are touched, run `git diff -- docs/plans/agent-ergonomics-rtk-query-upgrade-plan.md docs/README.md` and `git status --short`
- do not run full app tests for a docs-only planning change unless repo policy changes

## Acceptance Criteria

- A future coding agent can start with `npm run agent:preflight`.
- A future coding agent can identify relevant files and tests without broad repo reading.
- A future coding agent gets short failure summaries instead of giant terminal dumps.
- Root `AGENTS.md` stays small and stable.
- Skills stay short and workflow-focused.
- Generated maps, search, symbol summaries, impact reports, and review packets are bounded by default.
- `.agentignore` prevents default tools from walking known token traps.
- RTK Query scope remains network-only.
- Local board state remains in `LifeHarnessProvider`.
- Raw Lab streaming remains manual.
- The plan introduces no new product concepts and no app-facing route changes.

## Implementation Order

1. PR 0: budgets, `.agentignore`, and bootstrap.
2. PR 1: root agent router and context map.
3. PR 2: repo map, search, symbols, exports, tests, impact, failures, review packet, boundaries.
4. PR 2.5: output diet wrappers and failure summaries.
5. PR 3: repo-local skills.
6. PR 3.5: optional hooks/local config.
7. PR 4: RTK Query foundation.
8. PR 5: non-streaming request migration.

Each PR should be reviewable on its own and should avoid unrelated refactors.
