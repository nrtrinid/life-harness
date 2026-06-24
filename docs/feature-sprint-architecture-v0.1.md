# Feature Sprint Architecture v0.1

**Authority doc** for the Feature Sprint builder loop — vision, agent roles, gate model, and doc map.

For shipped behavior and data model, see [`feature-sprint-orchestrator-v0.1.md`](feature-sprint-orchestrator-v0.1.md). For v2 living-spec evolution (partially landed), see [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md). For future upgrades (trust dashboard, parallel lanes, evals), see [`plans/feature-sprint-roadmap-v0.1.md`](plans/feature-sprint-roadmap-v0.1.md).

**Status (mid-v2):** Living spec, typed handoffs, proof normalization, spec updates, and next-slice adoption are partially or mostly landed. The next architectural jump is **`currentSlice` + phase machine**, then risk-tier routing and UI consolidation around **Next Handoff**.

## What this is

Feature Sprint is Life Harness's **developer-agent control plane** for solo-builder feature work. It is a card-anchored, manual state machine — not one autonomous mega-agent.

Life Harness acts as **conductor**:

```text
store plan and step state
generate copy/paste packets for specialized agents
track manual gates
capture proof and runner artifacts
surface next safe action
```

It does **not** run external agents or tests without explicit user action at each gate. **Codex is optional** — one interchangeable worker/reviewer lane among Cursor, ChatGPT, local runner, and manual paste. Codex access or expiration does not change this architecture.

## Generic pattern alignment

Serious agent teams converge on the same shape:

```text
orchestrator → workers → evaluator → human checkpoint
```

Feature Sprint maps almost directly:

| Generic role | Feature Sprint role | Typical worker (interchangeable) |
|--------------|---------------------|-------------------------------------|
| Human + conversational architect | Spec intake, plan approval | GPT/frontier architect (ChatGPT web, etc.), rough spec textarea |
| Orchestrator / planner | Scope feature, slice plan | Copy scoping packet → any architect worker |
| Worker with repo tools | Bounded slice implementation | Cursor (repo truth), optional Codex/local runner in worktree |
| Evaluator | Review slice output, verdict | Copy review packet → separate reviewer worker |
| Workflow state + human checkpoint | Gates, proof, advance | Life Harness Backroom |

Life Harness depends on **typed packets, gates, proof, and phase state** — not on any single provider.

External references that describe the same primitives:

- [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents) — prompt chaining, orchestrator-workers, evaluator-optimizer loops, human checkpoints, stopping conditions; start with simple composable workflows, not maximum autonomy.
- [Microsoft Agent Framework overview](https://learn.microsoft.com/en-us/agent-framework/overview/) — use agents for open-ended work; use **workflows** when steps are well-defined and execution order must be explicit.
- [LangGraph](https://www.langchain.com/langgraph) — human-in-the-loop controls and durable state for long-running agent processes.
- [OpenHands](https://openhands.dev/) — isolated execution, auditability, reviewable artifacts, parallel runs with coordination.

This is a known good shape. The LH bet is **instrumentation over autonomy**: measure the loop, score the loop, relax gates only when the loop proves itself.

## Design principles

### 1. Explicit workflow, not agent vibes

```text
Do not build: "AI, go finish feature."
Build:     "Run approved slice through localize → implement → review → stop."
```

The loop is a **deterministic state machine** with named gates. UI copy, dogfood checklist, and action guide exist to make the machine visible — see [`feature-sprint-flow-guide-v0.3.md`](feature-sprint-flow-guide-v0.3.md).

### 2. Humans at important gates — not every tool call

Gate sequence:

```text
approve spec        → import feature-sprint-plan
approve slice       → save agent output after inspect
auto-run inner loop → runner may fill textareas; user still imports/saves
approve verdict     → import feature-review-verdict; advance manually
approve complete    → mark feature complete + proof
```

Approval is **not** required on every tiny tool call forever. It **is** required at trust boundaries: plan acceptance, post-implementation save, review verdict, step advance, feature complete.

### 3. Separate planner, worker, and reviewer

```text
Frontier architect maintains spec + judgment.
Cursor maintains repo truth (implementation worker).
Life Harness maintains protocol + proof.
You approve at trust boundaries.
```

The implementer must **not** grade itself. Scoping and review packets go to a **separate worker role** from the implementation runner — see packet builders in [`feature-sprint-orchestrator-v0.1.md`](feature-sprint-orchestrator-v0.1.md). UI labels say **Copy scoping/review/implementation packet** with recipient hints (e.g. "Copy for ChatGPT", "Copy for Cursor"); no provider is structurally required.

### 3b. Agents propose; gates advance trust

```text
Agents may propose.
Runners may execute.
Life Harness records.
Only gates advance trust.
```

External workers may fill import textareas or return fenced JSON. Life Harness validates imports and stores proof. **Import, save, approve, advance, and complete stay manual** until instrumentation earns a gate change.

### 4. Sandboxes, audit logs, replayable artifacts

Every runner attempt should leave behind inspectable evidence:

```text
input packet
model / profile used
branch / worktree
files changed
diff stat
verification commands run (and not run)
verdict
next prompt
```

Implemented today via runner history, diff viewer, verification capture, and worktree cleanup — see slice docs below. Future: trust metrics and replay fixtures in [`plans/feature-sprint-roadmap-v0.1.md`](plans/feature-sprint-roadmap-v0.1.md).

### 5. Provider neutrality

Feature Sprint generates markdown packets and accepts fenced JSON imports. It does **not** bind the app to a specific LLM provider. **Codex is not required** — Cursor, ChatGPT, Codex, local runner, and manual paste are interchangeable worker lanes.

| Layer | What LH owns | What providers do |
|-------|--------------|-------------------|
| Protocol | Typed fences, gate sequence, phase/next-action surfacing | — |
| Proof | Runner history, normalized proof, verification excerpts | Return inspectable output |
| Workers | Copy/paste packet builders only | Scope, localize, implement, review |

Local runner bridges (Cursor CLI, optional Codex CLI) are **optional localhost helpers** — see [`feature-sprint-local-runner-v0.1.md`](feature-sprint-local-runner-v0.1.md). Local models may **later** assist cheap structured tasks (prompt critique, proof normalization, review pre-check, packet linting, friction summaries, risk-tier recommendation) without replacing frontier architect scoping or auto-advance gates — see [`plans/feature-sprint-roadmap-v0.1.md`](plans/feature-sprint-roadmap-v0.1.md).

## End-to-end loop

### Before plan

Card Detail → **Backroom** → **Feature Sprint** → **Start feature** panel ([`start-feature-flow-v0.2.md`](start-feature-flow-v0.2.md)):

```text
Describe the feature (rough spec, local only)
  → Check setup (project metadata, repo path, runner)
  → Scope it (copy scoping packet or optional runner — paste into architect worker)
  → Import plan (manual; parses feature-sprint-plan fence only)
```

Rough spec intake: [`feature-spec-intake-v0.1.md`](feature-spec-intake-v0.1.md).

### After plan — trust loop

Per slice, on Card Detail Backroom ([`feature-sprint-flow-guide-v0.3.md`](feature-sprint-flow-guide-v0.3.md)):

```text
Run implementation in worktree
  → View details (Recent runner runs)
  → Inspect output, changed files, diff, verification
  → Save agent output (manual)
  → Optional: localize → prompt audit (v2 inner loop)
  → Run review / copy review packet
  → Import review verdict (manual)
  → Optional: import spec update → approve revised spec
  → Advance step or adopt next slice (living-spec path)
  → … repeat …
  → Mark feature complete
  → Clean worktree
```

### Dashboard vs control surface

| Surface | Role |
|---------|------|
| **Feature Sprints Workbench** | Read-only pipeline dashboard — what needs attention ([`feature-sprint-workbench-v0.1.md`](feature-sprint-workbench-v0.1.md)) |
| **Card Detail Backroom** | Mutation-heavy control surface — run, import, save, advance, complete |
| **Builder readiness checklist** | Next safe manual action ([`feature-sprint-dogfood-checklist-v0.1.md`](feature-sprint-dogfood-checklist-v0.1.md)) |

Feature Sprint UI is **Backroom-only** — not shown in Act mode.

## Typed packet contracts (v0.1)

Agent outputs that mutate LH state must be **importable and validatable** — no "long paragraph, good luck parsing."

| Fence label | Role | Parsed by | Status |
|-------------|------|-----------|--------|
| `feature-sprint-plan` | Architect scope output | Import plan | Shipped |
| `feature-review-verdict` | Reviewer verdict | Import review verdict | Shipped |
| `feature-prompt-localization` | Repo localization output | Import localization | Shipped |
| `feature-prompt-critique` | Prompt audit output | Import prompt audit | Shipped |
| `feature-spec-update` | Living spec revision + next slice | Import spec update | Shipped |

Packet builders (markdown out, fences in):

| Builder | Recipient label (typical) | Purpose |
|---------|---------------------------|---------|
| `buildFeatureScopingPacket` | Architect worker | Scope feature → plan JSON |
| `buildFeatureStepImplementationPacket` | Implementation worker (Cursor) | Bounded slice implementation |
| `buildFeatureStepReviewPacket` | Reviewer worker | Verdict + optional next prompt |

Core module: [`src/core/featureSprintOrchestrator.ts`](../src/core/featureSprintOrchestrator.ts).

Additional contracts (`feature-slice-scope`, `feature-spec`, replay fixtures) remain on the roadmap — [`plans/feature-sprint-roadmap-v0.1.md`](plans/feature-sprint-roadmap-v0.1.md).

## Relationship to other LH systems

| System | Relationship |
|--------|--------------|
| **Agent Task Packet** | Precursor primitive — single-card paste target ([`agent-task-packet-v0.1.md`](agent-task-packet-v0.1.md)) |
| **Agent Session Log** | Parallel evidence path; Feature Sprint adds multi-step plan + gates |
| **Unified Proof Ledger** | Feature complete → win log + proof on card |
| **Ask Harness / Companion** | Board-grounded chat — **not** the feature builder loop |
| **Raw Lab** | Unrestricted sandbox — **no** board context, **no** Feature Sprint mutation |
| **Local coding agent loop** | Gateway-side implementer for narrow tickets — related but separate ([`plans/local-coding-agent-loop-v0.1.md`](plans/local-coding-agent-loop-v0.1.md)) |

Do not weaken S3 routing, board mutation guardrails, or Raw Lab containment when extending Feature Sprint.

## Intentional v0.1 limits

These are product boundaries, not missing polish:

```text
No PC/browser automation beyond optional localhost runner
No autonomous plan acceptance or state mutation
No parallel agent execution (future: conflict-aware lanes only)
No ChatGPT web control from LH
No ai-gateway / Raw Lab changes for Feature Sprint
No GitHub integration
```

Full list: [`feature-sprint-orchestrator-v0.1.md`](feature-sprint-orchestrator-v0.1.md) — Intentionally not added.

## Slice doc index

| Doc | Topic |
|-----|-------|
| [`feature-sprint-orchestrator-v0.1.md`](feature-sprint-orchestrator-v0.1.md) | Data model, gates, fences, shipped workflow |
| [`feature-sprint-flow-guide-v0.3.md`](feature-sprint-flow-guide-v0.3.md) | Trust loop UX, action guide |
| [`start-feature-flow-v0.2.md`](start-feature-flow-v0.2.md) | Start feature panel (pre-plan) |
| [`feature-spec-intake-v0.1.md`](feature-spec-intake-v0.1.md) | Rough spec → scoping packet |
| [`feature-sprint-workbench-v0.1.md`](feature-sprint-workbench-v0.1.md) | Pipeline dashboard |
| [`feature-sprint-dogfood-checklist-v0.1.md`](feature-sprint-dogfood-checklist-v0.1.md) | Readiness + next action |
| [`feature-sprint-local-runner-v0.1.md`](feature-sprint-local-runner-v0.1.md) | Localhost runner bridge |
| [`feature-sprint-cursor-runner-v0.1.md`](feature-sprint-cursor-runner-v0.1.md) | Cursor CLI profiles |
| [`feature-sprint-implementation-runner-v0.1.md`](feature-sprint-implementation-runner-v0.1.md) | Worktree implementation runs |
| [`feature-runner-output-diff-viewer-v0.1.md`](feature-runner-output-diff-viewer-v0.1.md) | Pre-save inspection |
| [`feature-sprint-runner-history-v0.2.md`](feature-sprint-runner-history-v0.2.md) | Persistent run history |
| [`feature-sprint-verification-capture-v0.2.md`](feature-sprint-verification-capture-v0.2.md) | Verification excerpts on runs |
| [`feature-sprint-worktree-cleanup-v0.1.md`](feature-sprint-worktree-cleanup-v0.1.md) | Post-review worktree cleanup |
| [`feature-sprint-web-architect-phase-a-v0.1.md`](feature-sprint-web-architect-phase-a-v0.1.md) | Persisted spec + approval gate |
| [`feature-sprint-cursor-localization-b1-v0.1.md`](feature-sprint-cursor-localization-b1-v0.1.md) | Cursor localization phase |
| [`feature-sprint-prompt-audit-b2-v0.1.md`](feature-sprint-prompt-audit-b2-v0.1.md) | Prompt audit phase |
| [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md) | v2 living spec loop (mid-v2; partially shipped) |

## Core files

| Path | Role |
|------|------|
| [`src/core/featureSprintOrchestrator.ts`](../src/core/featureSprintOrchestrator.ts) | Plan model, packet builders, import parsers, mutations |
| [`src/core/featureSprintDogfood.ts`](../src/core/featureSprintDogfood.ts) | Readiness checklist + next action |
| [`src/core/featureSprintActionGuide.ts`](../src/core/featureSprintActionGuide.ts) | Current-step checklist |
| [`src/components/featureSprint/`](../src/components/featureSprint/) | Flow guide, start panel, runner output UI |
| [`app/feature-sprints.tsx`](../app/feature-sprints.tsx) | Workbench route |

Tests: `src/core/featureSprint*.test.ts`.
