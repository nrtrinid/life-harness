# Feature Sprint v2: Living Spec Loop / Web Architect Mode

> **Status:** **Mid-v2 — partially shipped.** v0.1 step-based loop remains supported. Living spec, handoffs, localization, prompt audit, proof normalizer, spec update, and next-slice adoption are landed or mostly landed. **Slice B (`currentSlice` + phase machine) and first provider-runner next-job bridge shipped headless.** Next Handoff UI still planned.
> **Purpose:** Define the evolution of card-anchored feature work — frontier architect maintains spec and judgment, Cursor maintains repo truth, Life Harness maintains protocol and proof. **Codex is optional**, not required.
> **Authority:** Product boundaries still follow [`../01_final_design_doc.md`](../01_final_design_doc.md), [`../02_v0_1_scope.md`](../02_v0_1_scope.md), and root [`AGENTS.md`](../../AGENTS.md).

## Core product sentence

> **GPT/frontier architect maintains the spec and judgment. Cursor maintains repo truth. Life Harness maintains the protocol and proof.**

Life Harness should **not** replace ChatGPT web, Codex, or Cursor. It should become the conductor that makes the architect + implementation workflow structured, repeatable, and hard to lose — regardless of which provider fills each worker lane.

```text
Agents may propose.
Runners may execute.
Life Harness records.
Only gates advance trust.
```

---

## Current repo anchors

| Area | Anchor | Notes |
|------|--------|-------|
| Orchestrator core | [`../../src/core/featureSprintOrchestrator.ts`](../../src/core/featureSprintOrchestrator.ts) | Plan CRUD, packet builders, fence import, step advance, adopt next slice, completion proof |
| Types | [`../../src/core/types.ts`](../../src/core/types.ts) — `HarnessFeatureSprintPlan`, `HarnessFeatureSprintStep` | Fixed multi-step plan + `featureSpec`, `nextSliceProposal`; **`currentSlice` + phase machine shipped (headless)** |
| Untrusted wrapping | [`../../src/core/untrustedContextBlock.ts`](../../src/core/untrustedContextBlock.ts) | Scoping rough spec + review runner output wrapped as evidence-only |
| Runner bridge | [`../../src/core/featureSprintRunner.ts`](../../src/core/featureSprintRunner.ts), [`../feature-sprint-local-runner-v0.1.md`](../feature-sprint-local-runner-v0.1.md) | Optional localhost runner (Cursor CLI; Codex CLI optional); draft output only |
| Verification capture | [`../feature-sprint-verification-capture-v0.2.md`](../feature-sprint-verification-capture-v0.2.md) | Project Registry commands → runner history |
| Proof normalizer | [`../../src/core/featureSprintImplementationProof.ts`](../../src/core/featureSprintImplementationProof.ts) | `normalizeImplementationProofForStep` — shipped |
| Agent task packets | [`../../src/core/agentTaskPacket.ts`](../../src/core/agentTaskPacket.ts) | Card-scoped copy/paste outside Feature Sprint |
| Primary UI | [`../../app/card/[id].tsx`](../../app/card/[id].tsx) Backroom → Feature Sprint | Plan import, implementation, review, spec update, advance, adopt |
| Start flow | [`../../src/components/featureSprint/FeatureSprintStartFlow.tsx`](../../src/components/featureSprint/FeatureSprintStartFlow.tsx) | Spec intake → scoping; approve revised spec |
| Flow guide | [`../../src/components/featureSprint/FeatureSprintFlowGuide.tsx`](../../src/components/featureSprint/FeatureSprintFlowGuide.tsx), [`../feature-sprint-flow-guide-v0.3.md`](../feature-sprint-flow-guide-v0.3.md) | Trust loop: run → inspect → save → review |
| Workbench | [`../feature-sprint-workbench-v0.1.md`](../feature-sprint-workbench-v0.1.md) | Dashboard; card Backroom remains control surface |
| Orchestrator doc | [`../feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md) | Shipped workflow reference |

### Shipped fence labels (parse today)

| Fence | Builder / importer | Module | Status |
|-------|-------------------|--------|--------|
| `feature-sprint-plan` | `buildFeatureScopingPacket`, `importFeatureSprintPlan` | `featureSprintOrchestrator.ts` | Shipped |
| `feature-review-verdict` | `buildFeatureStepReviewPacket`, review import | `featureSprintOrchestrator.ts` | Shipped |
| `feature-prompt-localization` | localization import | `featureSprintOrchestrator.ts` | Shipped |
| `feature-prompt-critique` | `buildFeaturePromptAuditPacket`, prompt audit import | `featureSprintOrchestrator.ts` | Shipped |
| `feature-spec-update` | spec update import | `featureSprintOrchestrator.ts` | Shipped |

### Shipped packet builders

| Builder | Recipient label (typical) | Function |
|---------|---------------------------|----------|
| `buildFeatureScopingPacket` | Architect worker | Scope feature → `feature-sprint-plan` |
| `buildFeatureStepImplementationPacket` | Implementation worker (Cursor) | Bounded slice implementation |
| `buildFeatureStepReviewPacket` | Reviewer worker | Verdict + optional next prompt |

Persisted `featureSpec` on plan is **shipped** — see [`../feature-sprint-web-architect-phase-a-v0.1.md`](../feature-sprint-web-architect-phase-a-v0.1.md). Rough spec textarea in Start feature may still seed scoping before spec is saved.

---

## Gap: shipped today vs v2 target

| Capability | Shipped today | v2 target |
|------------|---------------|-----------|
| Living feature spec | **Persisted `featureSpec` + approval gate** | Changelog, milestones, deferred ideas, spec progress UI |
| Executable unit | Fixed `steps[]` + `currentStepId`; adopt next slice | **`currentSlice` active workflow lens + phase machine** |
| Repo localization | **Localization packet + import** | Wired to `currentSlice.phase` |
| Prompt audit | **`feature-prompt-critique` import** | Wired to phase + risk-tier skip rules |
| Proof for review | **`normalizeImplementationProofForStep`** + runner excerpts | Phase `proof_pending` → review; richer review packets (partial) |
| Spec evolution | **`feature-spec-update` + `nextSliceProposal` + adopt** | Phase `spec_updating` → `awaiting_spec_approval` → advance |
| Risk tiers | Optional `riskTier` on steps; user judgment | Deterministic recommendation + tiny fast path |
| Handoff UX | **Recipient-labeled copy buttons** | **Next Handoff** — one primary next action panel |
| Architect thread | Not modeled | `ArchitectThread` metadata (URL, name, notes) |

v2 **extends** v0.1; it does not delete the step-based plan path immediately. Legacy `HarnessFeatureSprintPlan.steps[]` remains **plan/history** during migration; **`currentSlice` becomes the active workflow lens**.

---

## Next architectural priority: `currentSlice` + phase machine

**Slice B is the unlock** for everything else still missing in v2:

| Unblocks | Why |
|----------|-----|
| **Next Handoff UI** | One deterministic "copy this packet next" from phase state |
| **Risk-tier routing** | Skip localization/audit on tiny slices; stricter path on risky |
| **Instrumentation** | Trust metrics keyed to phase transitions, not step status alone |
| **Local-runner integration** | Runner fills textareas; phase records which gate is pending import |

Before Slice B, dogfood inferred next action; now `buildNextFeatureSprintJob` is primary with legacy fallback. Legacy plans without persisted slice still infer from step status, imports, and `nextSliceProposal` — workable but harder to reason about.

### Proposed `currentSlice` phase model

Design target — maps to a dedicated `currentSlice` record (or enriched active step) with explicit `phase`:

```text
ready                  — slice scoped; ready for localization or implement (tiny path)
localizing             — localization packet sent; awaiting import
prompt_auditing        — localization imported; awaiting prompt critique import
implementing           — final implementation prompt active; runner/output in flight
proof_pending          — output saved; normalize proof before review
reviewing              — review packet sent; awaiting verdict import
spec_updating          — review accepted; awaiting feature-spec-update import
awaiting_spec_approval — spec update imported; user must approve revised spec
ready_to_advance       — spec approved; user may advance or adopt next slice
done                   — slice closed; feature complete or next slice pending
```

**Migration rule:** `steps[]` keeps imported plan structure, per-step output, review artifacts, and history. `currentSlice` is the **active workflow lens** — title, goal, AC, risk tier, and `phase`. Advancing or adopting updates both where linked; legacy cards without `currentSlice` continue on step status until migrated.

Legacy step `status` (`planned | ready | sent | reviewing | done | …`) remains during migration; phase machine supersedes it for next-action and UI once Slice B lands.

---

## Target workflow

Two loops.

### Outer loop — feature-level spec loop

```text
Architect worker writes/updates the living feature spec
→ Architect worker proposes the next slice
→ Life Harness stores spec, slice, phase, and proof
→ repeat until completion criteria are satisfied
```

### Inner loop — slice-level execution loop

```text
1. Architect worker scopes current slice from the living spec
2. Cursor localizes the slice to the repo (read-only)
3. Architect worker audits the localized implementation prompt
4. Cursor implements
5. Life Harness normalizes proof/output
6. Reviewer worker reviews the implementation
7. Architect worker updates the spec and proposes the next slice
```

Product feel:

```text
Spec → Current Slice → Build → Review → Next Slice
```

Not a giant nine-step ritual on screen. **Next Handoff** surfaces one primary next action.

---

## Risk tiers (default modes)

| Tier | Path | Use when |
|------|------|----------|
| **Tiny** | scope → implement → normalize proof → review → update spec | Copy, one-file fix, obvious test, tiny UI polish — **skip localization + audit** |
| **Normal** (default) | full guarded inner loop | Most meaningful feature work |
| **Risky** | Normal + stricter proof + stricter review | Persistence/migrations, multi-system, vague AC, architecture change, prior `needs_changes` |

Deterministic recommendation signals (Slice I): likely file count, data model touched, tests unclear, AC vague, architecture touched, previous verdict, manual override.

Implementation home (proposed): new module e.g. [`../../src/core/featureSprintRiskTier.ts`](../../src/core/featureSprintRiskTier.ts) — rules-only, no provider calls. **Depends on `currentSlice` + phase machine.**

---

## What Life Harness should own

Persist (on plan or sibling record):

```text
featureSpec              — shipped
currentSlice             — next priority (phase machine)
riskTier
architectThread
localizedRepoNotes
auditedImplementationPrompt
normalizedProof          — shipped (per-step)
reviewVerdict
specUpdateHistory
nextSliceProposal        — shipped
```

Plain English:

```text
- what feature we are building
- what the current slice is
- where we are in the workflow
- what packet should be copied next (Next Handoff)
- what came back from workers
- what passed, failed, or needs changes
- what the next slice is
```

Life Harness does **not** own:

```text
- the ChatGPT/Codex thread itself
- autonomous spec decisions
- autonomous advancement
- browser automation
- replacing Cursor or any provider
- replacing user judgment
```

All manual gates remain: import, save, approve, advance, adopt, mark complete require explicit user action.

---

## Proposed data model

Types below are **design targets**. Map to extensions of `HarnessFeatureSprintPlan` — decision deferred per slice.

### Feature spec

```ts
type FeatureSpec = {
  body: string;
  goal: string;
  nonGoals: string[];
  completionCriteria: string[];
  milestones: string[];
  completedWork: string[];
  deferredIdeas: string[];
  knownRisks: string[];
  changelog: string[];
  currentSliceId?: string;
};
```

**Shipped partial:** `HarnessFeatureSpec` on plan with approval gate. Full changelog/milestones UI remains planned.

### Current slice

```ts
type FeatureSlice = {
  id: string;
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  riskTier: "tiny" | "normal" | "risky";
  phase:
    | "ready"
    | "localizing"
    | "prompt_auditing"
    | "implementing"
    | "proof_pending"
    | "reviewing"
    | "spec_updating"
    | "awaiting_spec_approval"
    | "ready_to_advance"
    | "done";
  suggestedPrompt?: string;
  localizedPrompt?: string;
  finalImplementationPrompt?: string;
  reviewFocus?: string[];
};
```

**Today:** `HarnessFeatureSprintStep` + `currentStepId` approximate slice identity; step `status` is not the v2 phase machine.

### Architect thread

```ts
type ArchitectThread = {
  project?: string;
  threadName?: string;
  url?: string;
  notes?: string;
};
```

New — makes persistent architect thread first-class in Backroom UI.

### Normalized proof

```ts
type NormalizedImplementationProof = {
  filesChanged: string[];
  behaviorChanged: string[];
  testsRun: string[];
  testsNotRun: string[];
  verificationResult: "pass" | "partial" | "fail" | "not_run";
  knownRisks: string[];
  manualNotes: string;
  suggestedReviewFocus: string[];
};
```

**Shipped:** `normalizeImplementationProofForStep` composes runner run + manual notes. Phase transition to `proof_pending` → `reviewing` awaits Slice B.

---

## Fence / import contracts

### Shipped

| Fence | Purpose |
|-------|---------|
| `feature-sprint-plan` | Initial or replacement multi-step plan |
| `feature-review-verdict` | Review status + optional next prompt |
| `feature-prompt-localization` | Repo localization output |
| `feature-prompt-critique` | Prompt audit after localization |
| `feature-spec-update` | Revised spec + changelog + next slice proposal |

### Planned (not yet parsed)

| Fence | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `feature-spec` | Architect worker | LH import | Initial living spec + first slice proposal |
| `feature-slice-scope` | Architect worker | LH import | One executable slice from living spec |

Normalized implementation proof is composed by Life Harness (not always a separate import fence).

Parse/import logic lives in [`featureSprintOrchestrator.ts`](../../src/core/featureSprintOrchestrator.ts).

### `feature-spec-update` (key outer-loop fence)

```ts
{
  revisedSpec: string;
  changelog: string[];
  completedSliceSummary: string;
  remainingWork: string[];
  nextSlice?: {
    title: string;
    goal: string;
    acceptanceCriteria: string[];
    nonGoals: string[];
    riskTier: "tiny" | "normal" | "risky";
  };
  featureComplete: boolean;
}
```

User **Adopt next slice** or marks feature complete — **no auto-advance** on import.

---

## Target UI (Backroom)

Five sections — hide protocol complexity:

```text
1. Feature Spec
2. Current Slice
3. Next Handoff
4. Proof / Review
5. Spec Progress
```

### Main buttons

```text
Copy next handoff
Import result
Normalize proof
Mark slice reviewed
Adopt next slice / Accept next slice
Mark feature complete
```

### Optional buttons

```text
Skip localization/audit for tiny slice
Force guarded path
Edit architect thread
View spec changelog
View packet history
```

**UX rule:** LH always tells the user what to paste next and where — **Next Handoff** is the single primary next action.

Examples:

```text
Next: Copy localization packet for Cursor (read-only repo inspect).
Next: Paste localization result for architect worker prompt audit.
Next: Copy final implementation packet for Cursor.
Next: Copy review packet for reviewer worker.
```

**UI today:** Card Detail Backroom mixes Start feature panel, plan steps, runner rows, import textareas, and action guide — see [`FeatureSprintActionGuide.tsx`](../../src/components/featureSprint/FeatureSprintActionGuide.tsx). v2 consolidates around **Next Handoff** without removing inspect-before-save trust boundaries from [`feature-sprint-flow-guide-v0.3.md`](../feature-sprint-flow-guide-v0.3.md).

---

## Implementation roadmap

Each slice is independently shippable. Status as of mid-v2:

### Slice A — Living feature spec — **shipped**

- Persisted `featureSpec` on plan with approval gate

### Slice B — Current slice model — **next priority**

- **Add:** `currentSlice` + phase field separate from legacy `steps[]`
- **Touch:** `types.ts`, orchestrator advance/adopt logic, dogfood next-action, Backroom Current Slice + Next Handoff panels
- **Accept:** slice has title, goal, AC, non-goals, risk tier, phase; legacy plans still work; `steps[]` remains plan/history

### Slice C — Recipient-labeled handoff buttons — **shipped**

### Slice D — Cursor localization packet — **shipped**

### Slice E — Prompt audit packet/import — **shipped**

### Slice F — Proof normalizer — **shipped**

### Slice G — Review packet enrichment — **partial**

- Richer review input from spec, slice, final prompt, normalized proof — ongoing

### Slice H — Spec update import + adopt next slice — **shipped**

### Slice I — Risk tier recommendation — **planned** (after Slice B)

- Deterministic `recommendFeatureSprintRiskTier()`; tiny skips localization/audit

### Slice J — Dogfood polish — **in progress**

- Next handoff always populated; thread metadata; packet history; spec progress; no dead-end phases; mock-loop E2E

---

## Remaining build order

```text
1. Current slice + phase machine     (Slice B)  ← next
2. Risk tier recommendation          (Slice I)
3. Next Handoff UI consolidation     (Slice J)
4. Review packet enrichment finish   (Slice G)
5. Architect thread metadata         (Slice J)
```

Slices A, C, D, E, F, H are landed. Instrumentation and parallel lanes wait on Slice B — see [`feature-sprint-roadmap-v0.1.md`](feature-sprint-roadmap-v0.1.md).

---

## Example session (target behavior)

```text
User opens Feature Sprint card.

LH: Current feature: Web Architect Mode
    Current slice: Add architect thread metadata
    Phase: localizing
    Next Handoff: Copy localization packet for Cursor

User copies packet → Cursor returns likely files, risks, revised prompt
User imports → LH: Phase: prompt_auditing
    Next Handoff: Copy prompt audit packet for architect worker

Architect worker returns final implementation prompt → User imports
LH: Phase: implementing
    Next Handoff: Copy implementation packet for Cursor

Cursor implements → User saves output → LH normalizes proof
LH: Phase: reviewing
    Next Handoff: Copy review packet for reviewer worker

Reviewer: pass + feature-spec-update with next slice
User imports → LH: Phase: awaiting_spec_approval
User approves spec → LH: Phase: ready_to_advance
User advances or adopts next slice
```

---

## Non-goals (v2)

Do **not** build in this track:

```text
- browser automation for ChatGPT or any architect surface
- autonomous Cursor execution without review
- requiring Codex or any specific provider
- replacing frontier architect with local model for scoping
- deleting v0.1 step-based Feature Sprint immediately
- overbuilding a huge spec editor
- forcing every task through the full guarded loop
- ai-gateway / Raw Lab changes
- new assistant action types without explicit ticket
- auto-import / auto-save / auto-advance
```

Priority is **protocol and proof**, not autonomy — consistent with [`AGENTS.md`](../../AGENTS.md) manual-before-automation rule.

---

## Verify (when slices land)

```powershell
npm test -- src/core/featureSprintOrchestrator.test.ts
npm run typecheck
```

Add slice-specific tests beside existing [`featureSprintOrchestrator.test.ts`](../../src/core/featureSprintOrchestrator.test.ts), [`featureSprintDogfood.test.ts`](../../src/core/featureSprintDogfood.test.ts), and UI smoke via [`feature-sprint-dogfood-checklist-v0.1.md`](../feature-sprint-dogfood-checklist-v0.1.md).

---

## Related docs

- Authority: [`../feature-sprint-architecture-v0.1.md`](../feature-sprint-architecture-v0.1.md)
- Shipped orchestrator: [`../feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md)
- Roadmap: [`feature-sprint-roadmap-v0.1.md`](feature-sprint-roadmap-v0.1.md)
- Trust loop UI: [`../feature-sprint-flow-guide-v0.3.md`](../feature-sprint-flow-guide-v0.3.md)
- Rough spec intake: [`../feature-spec-intake-v0.1.md`](../feature-spec-intake-v0.1.md)
- Runner + verification: [`../feature-sprint-local-runner-v0.1.md`](../feature-sprint-local-runner-v0.1.md), [`../feature-sprint-verification-capture-v0.2.md`](../feature-sprint-verification-capture-v0.2.md)
- Untrusted context in packets: [`../feature-sprint-untrusted-context-v0.1.md`](../feature-sprint-untrusted-context-v0.1.md)
- Pattern inspiration map: [`./odysseus-patterns-repo-map-v0.1.md`](./odysseus-patterns-repo-map-v0.1.md)
- AI surface boundaries: [`../ai-workflows-current.md`](../ai-workflows-current.md)