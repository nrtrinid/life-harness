# Feature Sprint Orchestrator v0.1

## What this adds

Feature Sprint Orchestrator is a card-anchored manual loop for solo-builder feature work. Life Harness acts as **conductor**: it stores the plan, generates copy/paste packets, tracks step gates, and logs proof on feature completion.

It does **not** run Codex, Cursor, ChatGPT, or tests automatically.

## Why it exists

Life Harness already supports agent task packets and session logs. Feature Sprint adds a structured multi-step workflow:

```text
ChatGPT/Codex high/xhigh → scope + review
Cursor/Codex implementation agent → bounded build slices
Life Harness → memory, packets, gates, proof
User → approval gate
```

## Manual workflow

1. Open a build/feature card → **Backroom** → **Feature Sprint**.
2. Optionally paste a **Rough feature spec** (see [feature-spec-intake-v0.1.md](./feature-spec-intake-v0.1.md)).
3. **Copy scoping packet** or **Run scoping with Codex** → paste into ChatGPT or Codex (high/xhigh) if copying manually.
4. Architect returns prose + `feature-sprint-plan` fenced JSON.
5. **Import plan** — parses fenced block only; no NL parsing.
6. **Copy implementation prompt** or **Run implementation in worktree** (local runner, isolated git worktree) → send to Cursor/Codex implementation agent.
7. Paste or receive agent output → **Save agent output** on the current step (never auto-saved).
8. **Copy review packet** → paste into ChatGPT/Codex reviewer.
9. Reviewer returns prose + optional `feature-review-verdict` fenced JSON.
10. **Import review verdict** — does not auto-advance.
11. **Advance step** when ready (manual gate).
12. Repeat steps 6–11 for each slice.
13. **Mark feature complete** — creates one win log + proof (idempotent).

Re-importing a plan on an active sprint **preserves plan ID** and replaces steps after explicit **Import plan** — no silent merge.

### Local runner (v0.1)

[Feature Sprint Local Runner](feature-sprint-local-runner-v0.1.md) can execute scoping/review packets via an optional localhost bridge and fill the import textareas. **Import plan**, **Import review verdict**, advance, and complete gates are unchanged — runner output is draft text until you import.

## Data model

Collection: `featureSprintPlans: HarnessFeatureSprintPlan[]`

- Anchored to `LifeCard.id` via `cardId`
- Optional `projectId` from Project Registry
- `steps[]` with per-step status, output, review fields
- `currentStepId` highlights active slice
- `evidenceLogId` / `evidenceProofItemId` for idempotent completion proof

`LifeCard` status is unchanged — plans are parallel metadata.

## Packet builders

| Builder | Audience | Purpose |
|---------|----------|---------|
| `buildFeatureScopingPacket` | ChatGPT/Codex architect | Scope feature, return plan JSON |
| `buildFeatureStepImplementationPacket` | Cursor/Codex builder | Bounded slice implementation |
| `buildFeatureStepReviewPacket` | ChatGPT/Codex reviewer | Verdict + optional next prompt |

Scoping rough specs and review implementation output are wrapped as untrusted context blocks — see [feature-sprint-untrusted-context-v0.1.md](./feature-sprint-untrusted-context-v0.1.md).

## Fence labels

Only these exact fence labels are parsed:

```text
feature-sprint-plan
feature-review-verdict
```

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

Local runner profiles (Codex and Cursor CLI) ship separately — see [feature-sprint-local-runner-v0.1.md](./feature-sprint-local-runner-v0.1.md) and [feature-sprint-cursor-runner-v0.1.md](./feature-sprint-cursor-runner-v0.1.md).

## Future path

- **Feature Sprint v2 — Living Spec Loop:** [`plans/feature-sprint-v2-living-spec-loop-v0.1.md`](plans/feature-sprint-v2-living-spec-loop-v0.1.md) — persisted living spec, slice phases, Cursor localization, prompt audit, proof normalizer, spec-update import
- Streaming partial runner output to UI
- Worktree/branch isolation per slice
- `Copy implementation prompt + log sent` if trivial atop agent session helpers
- Feature-step Next Move collector
- Assistant Action integration for import/approve flows
- Agent Workbench row hints when `agentSessionId` links a step

## Core module

Logic lives in [`src/core/featureSprintOrchestrator.ts`](../src/core/featureSprintOrchestrator.ts).

Tests: [`src/core/featureSprintOrchestrator.test.ts`](../src/core/featureSprintOrchestrator.test.ts).
