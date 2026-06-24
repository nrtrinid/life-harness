# Feature Sprint Orchestrator v0.1

For vision, agent roles, gate model, and doc map, see **[`feature-sprint-architecture-v0.1.md`](feature-sprint-architecture-v0.1.md)** (authority doc). For v2 living-spec evolution (partially landed), see [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md).

## What this adds

Feature Sprint Orchestrator is a card-anchored **manual, gated** loop for solo-builder feature work. Life Harness acts as **conductor**: it stores the plan, generates copy/paste packets, validates typed imports, tracks step gates, and logs proof on feature completion.

It does **not** run external agents, mutate the repo, or advance trust automatically. **Codex is optional** — one worker lane among Cursor, ChatGPT, local runner, and manual paste.

```text
Agents may propose.
Runners may execute.
Life Harness records.
Only gates advance trust.
```

There is **no auto-import, no auto-save, no auto-advance, and no backend orchestration** in v0.1/v2-shipped behavior.

## Why it exists

Life Harness already supports agent task packets and session logs. Feature Sprint adds a structured multi-step workflow:

```text
Frontier architect worker → scope + review (ChatGPT, Codex, manual, etc.)
Implementation worker → bounded build slices (Cursor primary; optional runner)
Life Harness → memory, packets, gates, proof
User → approval gate at every trust boundary
```

## Manual workflow

1. Open a build/feature card → **Backroom** → **Feature Sprint**.
2. Optionally paste a **Rough feature spec** (see [feature-spec-intake-v0.1.md](./feature-spec-intake-v0.1.md)).
3. **Copy scoping packet** (recipient-labeled) or **Run scoping** via optional local runner → paste into architect worker if copying manually.
4. Architect worker returns prose + `feature-sprint-plan` fenced JSON.
5. **Import plan** — parses fenced block only; no NL parsing; no auto-import.
6. Per slice — optional **localization** and **prompt audit** (v2 inner loop); then **Copy implementation packet** or **Run implementation in worktree** (optional local runner, isolated git worktree) → send to implementation worker (typically Cursor).
7. Paste or receive agent output → **Save agent output** on the current step (never auto-saved).
8. Optional: **Normalize proof** for review packet input.
9. **Copy review packet** → paste into reviewer worker (separate from implementer).
10. Reviewer returns prose + optional `feature-review-verdict` fenced JSON.
11. **Import review verdict** — does not auto-advance.

Optional **DeepSeek automated review** (when configured): **Run automated review** builds a rich automated review packet, calls DeepSeek mock/live (or mock-only in CI), validates `feature-automated-review-verdict`, and **stages** compatible `feature-review-verdict` text in the import textarea — still manual import. See [feature-sprint-deepseek-reviewer-v0.1.md](feature-sprint-deepseek-reviewer-v0.1.md).

12. Optional (living-spec path): **Import spec update** (`feature-spec-update`) → **Approve revised feature spec** → spec becomes unapproved until approved again.
13. **Advance step** when ready (manual gate), or **Adopt next slice** when no ready predefined step exists but `nextSliceProposal` is present.
14. Repeat steps 6–13 for each slice.
15. **Mark feature complete** — creates one win log + proof (idempotent).

Re-importing a plan on an active sprint **preserves plan ID** and replaces steps after explicit **Import plan** — no silent merge.

### Advance paths (fixed-step vs living-spec)

| Path | When | What happens |
|------|------|--------------|
| **Fixed-step advance** | Imported plan has a next predefined step | Current step → `done`; next planned step → `ready`; `currentStepId` moves |
| **Living-spec adopt** | No ready predefined step; `nextSliceProposal` from spec update | User **Adopt next slice** — creates or activates matching step; clears proposal |

Both paths require explicit user action. Neither auto-advances on import.

### Local runner (optional)

[Feature Sprint Local Runner](feature-sprint-local-runner-v0.1.md) can execute scoping/review/implementation packets via an optional localhost bridge and **fill import textareas**. **Import plan**, **Import review verdict**, save, advance, adopt, and complete gates are unchanged — runner output is draft text until you import, save, and approve manually.

## Data model

Collection: `featureSprintPlans: HarnessFeatureSprintPlan[]`

- Anchored to `LifeCard.id` via `cardId`
- Optional `projectId` from Project Registry
- `steps[]` with per-step status, output, review fields (legacy plan/history lens during v2 migration)
- `currentStepId` highlights active step (legacy lens; kept for migration)
- `currentSlice` — persisted slice-scoped workflow lens with `phase` enum (v2 Slice B, shipped headless)
- `automationPhase` — parallel legacy hint field; display prefers `currentSlice.phase` when present
- `featureSpec` — persisted living spec with approval gate (v2, shipped)
- `nextSliceProposal` — preview-only next slice from spec update until adopted (v2, shipped)
- `evidenceLogId` / `evidenceProofItemId` for idempotent completion proof

`LifeCard` status is unchanged — plans are parallel metadata.

## Packet builders

| Builder | Recipient label (typical) | Purpose |
|---------|---------------------------|---------|
| `buildFeatureScopingPacket` | Architect worker | Scope feature, return plan JSON |
| `buildFeatureStepImplementationPacket` | Implementation worker (Cursor) | Bounded slice implementation |
| `buildFeatureStepReviewPacket` | Reviewer worker | Verdict + optional next prompt |

Scoping rough specs and review implementation output are wrapped as untrusted context blocks — see [feature-sprint-untrusted-context-v0.1.md](./feature-sprint-untrusted-context-v0.1.md).

## Fence labels

Parsed fence labels (exact match):

```text
feature-sprint-plan
feature-review-verdict
feature-prompt-localization
feature-prompt-critique
feature-spec-update
```

Normalized implementation proof is composed by Life Harness (not always a separate import fence) — see `normalizeImplementationProofForStep` in orchestrator core.

### `feature-sprint-plan` (required fields)

```json
{
  "title": "...",
  "goal": "...",
  "whyNow": "...",
  "acceptanceCriteria": ["..."],
  "nonGoals": ["..."],
  "constraints": ["..."],
  "steps": [
    {
      "title": "...",
      "goal": "...",
      "acceptanceCriteria": ["..."],
      "suggestedPrompt": "..."
    }
  ]
}
```

### `feature-review-verdict` (required fields)

```json
{
  "status": "accepted",
  "verdict": "...",
  "nextPrompt": "...",
  "followUps": ["..."]
}
```

`status` must be `accepted`, `needs_changes`, or `blocked`.

## Gate mental model

```text
Plan accepted        → import valid feature-sprint-plan
Slice implemented  → save agent output
Tests pass           → recorded in agent output prose (manual)
Review accepted      → import review verdict; user advances manually
Feature AC complete  → mark feature complete + proof
```

## Surfaces

| Surface | Role |
|---------|------|
| Card Detail → Backroom → Feature Sprint | Primary workflow UI |
| Unified Proof Ledger | Picks up completion proof via existing log/proof paths |

Feature Sprint UI is **Backroom-only** — not shown in Act mode.

## Intentionally not added (v0.1)

- PC/browser automation
- ChatGPT web control
- Parallel agent execution
- Autonomous plan acceptance or state mutation
- New assistant action types
- Sprint burndown / calendar
- GitHub integration
- ai-gateway / Raw Lab changes
- Agent Workbench feature-step display (deferred)
- Next Move feature-sprint collector (deferred)

Local runner profiles (Cursor CLI; optional Codex CLI) ship separately — see [feature-sprint-local-runner-v0.1.md](./feature-sprint-local-runner-v0.1.md) and [feature-sprint-cursor-runner-v0.1.md](./feature-sprint-cursor-runner-v0.1.md). **Neither runner profile is required** for Feature Sprint.

## Future path

See [`plans/feature-sprint-roadmap-v0.1.md`](plans/feature-sprint-roadmap-v0.1.md) for trust dashboard, parallel lanes, expanded contracts, risk routing, replay evals, and provider-agnostic runner abstraction.

**Next architectural jump (v2):** [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md) — **`currentSlice` + phase machine** (Slice B shipped headless) unlocks Next Handoff UI, risk-tier routing, instrumentation, and future local-runner integration. Also landed: living spec, handoffs, localization, prompt audit, proof normalizer, spec update, next-slice adoption.

### `currentSlice` phase machine (Slice B)

Persisted on `HarnessFeatureSprintPlan.currentSlice` with slice-scoped phases:

```text
ready → localizing → prompt_auditing → implementing → proof_pending → reviewing
  → spec_updating → awaiting_spec_approval → ready_to_advance → done
```

- **`localizing`** means a localization **runner** job started (`syncFeatureSprintPhaseOnRunnerJobStarted` on `copy_localization` runner path). Manual **Prepare next job** / copy does **not** mutate phase.
- **Failed localization:** phase stays `localizing`; `buildNextFeatureSprintJob` retries `copy_localization` until staged output exists — never `import_localization` with nothing to import.
- **`ready`** job order (headless `buildNextFeatureSprintJob` in `featureSprintCurrentSlice.ts`): approve initial spec first, then optional localization copy, then implementation handoff.
- Orchestrator mutations sync `currentSlice.phase`; `automationPhase` stays for backward compat. Advance/adopt remain manual gates.
- Dogfood `buildNextAction` delegates to the job selector with legacy fallback.

### Provider-runner next-job bridge

[`src/core/featureSprintRunnerJob.ts`](../src/core/featureSprintRunnerJob.ts) connects `buildNextFeatureSprintJob` to optional localhost runner execution and packet preparation:

- `prepareFeatureSprintRunnerJob` — resolves next job, builds provider-ready `inputPacket`, maps role/fence/gates
- `executeFeatureSprintRunnerJob` — narrow executor with `onStarted` / `onCompleted` / `onFailed` hooks; **no UI staging or state mutations** inside core
- Shallow next-job lifecycle on runner runs: `nextJobAction`, `nextJobRole`, `nextJobProvider`, `nextJobLifecycleStatus`, `expectedOutputFence`, `stagedAt` (no separate job-history dashboard)
- UI debug line `testID`: `feature-sprint-next-job-lifecycle` — shows `prepared` / `started` / `completed` / `failed` / `staged` / `human_required`
- UI **Builder readiness** button (mode-aware): **Run next job** / **Prepare next job** / **Show next gate**
- Provider-agnostic (`manual`, `cursor`, `chatgpt`, `codex`, `local`); **Codex is optional**
- `import_spec_update` prepares a `feature-spec-update` architect packet only — the action name reflects the downstream human import gate, not runner import behavior
- Manual import, save, approve, and advance gates remain mandatory

Later items:

- Streaming partial runner output to UI
- Worktree/branch isolation per slice
- `Copy implementation prompt + log sent` if trivial atop agent session helpers
- Feature-step Next Move collector
- Assistant Action integration for import/approve flows
- Agent Workbench row hints when `agentSessionId` links a step

## Core module

Logic lives in [`src/core/featureSprintOrchestrator.ts`](../src/core/featureSprintOrchestrator.ts), [`src/core/featureSprintCurrentSlice.ts`](../src/core/featureSprintCurrentSlice.ts), and [`src/core/featureSprintRunnerJob.ts`](../src/core/featureSprintRunnerJob.ts).

Tests: [`src/core/featureSprintOrchestrator.test.ts`](../src/core/featureSprintOrchestrator.test.ts), [`src/core/featureSprintCurrentSlice.test.ts`](../src/core/featureSprintCurrentSlice.test.ts), [`src/core/featureSprintRunnerJob.test.ts`](../src/core/featureSprintRunnerJob.test.ts).
