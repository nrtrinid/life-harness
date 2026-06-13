# Feature Sprint v2: Living Spec Loop / Web Architect Mode

> **Status:** Repo-aware design doc. **Not implemented.** v0.1 Feature Sprint remains the shipped path.
> **Purpose:** Define the next evolution of card-anchored feature work — GPT maintains spec and judgment, Cursor maintains repo truth, Life Harness maintains protocol and proof.
> **Authority:** Product boundaries still follow [`../01_final_design_doc.md`](../01_final_design_doc.md), [`../02_v0_1_scope.md`](../02_v0_1_scope.md), and root [`AGENTS.md`](../../AGENTS.md).

## Core product sentence

> **GPT maintains the spec and judgment. Cursor maintains repo truth. Life Harness maintains the protocol and proof.**

Life Harness should **not** replace ChatGPT web or Cursor. It should become the conductor that makes the ChatGPT + Cursor workflow structured, repeatable, and hard to lose.

---

## Current repo anchors (v0.1 shipped)

| Area | Anchor | Notes |
|------|--------|-------|
| Orchestrator core | [`../../src/core/featureSprintOrchestrator.ts`](../../src/core/featureSprintOrchestrator.ts) | Plan CRUD, packet builders, fence import, step advance, completion proof |
| Types | [`../../src/core/types.ts`](../../src/core/types.ts) — `HarnessFeatureSprintPlan`, `HarnessFeatureSprintStep` | Fixed multi-step plan; no living spec or slice phases |
| Untrusted wrapping | [`../../src/core/untrustedContextBlock.ts`](../../src/core/untrustedContextBlock.ts) | Scoping rough spec + review runner output wrapped as evidence-only |
| Runner bridge | [`../../src/core/featureSprintRunner.ts`](../../src/core/featureSprintRunner.ts), [`../feature-sprint-local-runner-v0.1.md`](../feature-sprint-local-runner-v0.1.md) | Optional localhost Codex/Cursor CLI; draft output only |
| Verification capture | [`../feature-sprint-verification-capture-v0.2.md`](../feature-sprint-verification-capture-v0.2.md) | Project Registry commands → runner history; not yet a normalized proof model |
| Agent task packets | [`../../src/core/agentTaskPacket.ts`](../../src/core/agentTaskPacket.ts) | Card-scoped copy/paste for Codex/Cursor outside Feature Sprint |
| Primary UI | [`../../app/card/[id].tsx`](../../app/card/[id].tsx) Backroom → Feature Sprint | Plan import, implementation, review, advance |
| Start flow | [`../../src/components/featureSprint/FeatureSprintStartFlow.tsx`](../../src/components/featureSprint/FeatureSprintStartFlow.tsx) | Rough spec intake (local only) → scoping |
| Flow guide | [`../../src/components/featureSprint/FeatureSprintFlowGuide.tsx`](../../src/components/featureSprint/FeatureSprintFlowGuide.tsx), [`../feature-sprint-flow-guide-v0.3.md`](../feature-sprint-flow-guide-v0.3.md) | Trust loop: run → inspect → save → review |
| Workbench | [`../feature-sprint-workbench-v0.1.md`](../feature-sprint-workbench-v0.1.md) | Dashboard; card Backroom remains control surface |
| Orchestrator doc | [`../feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md) | Shipped workflow reference |

### Shipped fence labels (parse today)

| Fence | Builder / importer | Module |
|-------|-------------------|--------|
| `feature-sprint-plan` | `buildFeatureScopingPacket`, `importFeatureSprintPlan` | `featureSprintOrchestrator.ts` |
| `feature-review-verdict` | `buildFeatureStepReviewPacket`, review import | `featureSprintOrchestrator.ts` |

### Shipped packet builders

| Builder | Audience today | Function |
|---------|----------------|----------|
| `buildFeatureScopingPacket` | ChatGPT / Codex architect | Scope feature → `feature-sprint-plan` |
| `buildFeatureStepImplementationPacket` | Cursor / Codex builder | Bounded slice implementation |
| `buildFeatureStepReviewPacket` | ChatGPT / Codex reviewer | Verdict + optional next prompt |

Rough spec intake is **local UI state only** — see [`../feature-spec-intake-v0.1.md`](../feature-spec-intake-v0.1.md). It is not persisted on the plan.

---

## Gap: v0.1 vs v2 target

| Capability | v0.1 today | v2 target |
|------------|------------|-----------|
| Living feature spec | Rough spec textarea (ephemeral); plan fields on import | Persisted `featureSpec` with changelog, milestones, deferred ideas |
| Executable unit | Fixed `steps[]` from imported plan | `currentSlice` with phase machine + optional next-slice proposal |
| Repo localization | None — implementation packet goes straight to Cursor | Read-only Cursor localization step before Auto implement |
| Prompt audit | None | GPT `feature-prompt-critique` after localization |
| Proof for review | Raw agent output + runner verification excerpts | `NormalizedImplementationProof` owned by LH |
| Spec evolution | Re-import plan replaces steps; no spec-update fence | `feature-spec-update` after review closes outer loop |
| Risk tiers | Implicit (user judgment) | Tiny / Normal / Risky with skip rules for tiny |
| Handoff UX | Generic copy buttons | Recipient-labeled: Copy for ChatGPT / Copy for Cursor |
| Architect thread | Not modeled | `ArchitectThread` metadata (URL, name, notes) |

v2 **extends** v0.1; it does not delete the step-based plan path immediately. Legacy `HarnessFeatureSprintPlan.steps[]` remains supported during migration.

---

## Target workflow

Two loops.

### Outer loop — feature-level spec loop

```text
GPT writes/updates the living feature spec
→ GPT proposes the next slice
→ Life Harness stores spec, slice, phase, and proof
→ repeat until completion criteria are satisfied
```

### Inner loop — slice-level execution loop

```text
1. GPT scopes current slice from the living spec
2. Cursor localizes the slice to the repo (read-only)
3. GPT audits the localized implementation prompt
4. Cursor Auto implements
5. Life Harness normalizes proof/output
6. GPT reviews the implementation
7. GPT updates the spec and proposes the next slice
```

Product feel:

```text
Spec → Current Slice → Build → Review → Next Slice
```

Not a giant nine-step ritual on screen.

---

## Risk tiers (default modes)

| Tier | Path | Use when |
|------|------|----------|
| **Tiny** | scope → implement → normalize proof → review → update spec | Copy, one-file fix, obvious test, tiny UI polish — **skip localization + audit** |
| **Normal** (default) | full guarded inner loop | Most meaningful feature work |
| **Risky** | Normal + stricter proof + stricter review | Persistence/migrations, multi-system, vague AC, architecture change, prior `needs_changes` |

Deterministic recommendation signals (Slice I): likely file count, data model touched, tests unclear, AC vague, architecture touched, previous verdict, manual override.

Implementation home (proposed): new module e.g. [`../../src/core/featureSprintRiskTier.ts`](../../src/core/featureSprintRiskTier.ts) — rules-only, no provider calls.

---

## What Life Harness should own

Persist (proposed fields on plan or sibling record):

```text
featureSpec
currentSlice
riskTier
phase
architectThread
localizedRepoNotes
auditedImplementationPrompt
normalizedProof
reviewVerdict
specUpdateHistory
nextSliceProposal
```

Plain English:

```text
- what feature we are building
- what the current slice is
- where we are in the workflow
- what packet should be copied next
- what came back from ChatGPT or Cursor
- what passed, failed, or needs changes
- what the next slice is
```

Life Harness does **not** own:

```text
- the ChatGPT thread itself
- autonomous spec decisions
- autonomous advancement
- browser automation
- replacing Cursor
- replacing user judgment
```

All v0.1 manual gates remain: import, save, advance, mark complete require explicit user action.

---

## Proposed data model

Types below are **design targets**. Map to extensions of `HarnessFeatureSprintPlan` or a new `HarnessFeatureSprintV2State` collection — decision deferred per slice.

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

**v0.1 partial overlap:** `HarnessFeatureSprintPlan` already has `goal`, `acceptanceCriteria`, `nonGoals`, `constraints` — but no living body, changelog, milestones, or spec-update history.

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
    | "scoped"
    | "localized"
    | "audited"
    | "implemented"
    | "proof_normalized"
    | "reviewed"
    | "spec_updated";
  suggestedPrompt?: string;
  localizedPrompt?: string;
  finalImplementationPrompt?: string;
  reviewFocus?: string[];
};
```

**v0.1 partial overlap:** `HarnessFeatureSprintStep` has `title`, `goal`, `acceptanceCriteria`, `suggestedPrompt`, `status` — but status is `planned | ready | sent | reviewing | done | …`, not the v2 phase machine.

### Architect thread

```ts
type ArchitectThread = {
  project?: string;
  threadName?: string;
  url?: string;
  notes?: string;
};
```

New — makes persistent ChatGPT web thread first-class in Backroom UI.

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

**v0.1 partial overlap:** `HarnessFeatureSprintRunnerRun` already captures `changedFiles`, `diffStat`, `verificationResults` — normalization would compose these + manual notes into a fixed review-facing shape (Slice F).

---

## Fence / import contracts

### Shipped (v0.1)

| Fence | Purpose |
|-------|---------|
| `feature-sprint-plan` | Initial or replacement multi-step plan |
| `feature-review-verdict` | Review status + optional next prompt |

### New (v2)

| Fence | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `feature-spec` | GPT | LH import | Initial living spec + first slice proposal |
| `feature-slice-scope` | GPT | LH import | One executable slice from living spec |
| `feature-prompt-critique` | GPT | LH import | Prompt audit after Cursor localization |
| `normalized-implementation-proof` | LH (usually) | Review packet input | Fixed proof sections — may be LH-generated markdown, not always a GPT fence |
| `feature-spec-update` | GPT | LH import | Revised spec + changelog + next slice proposal |

Parse/import logic should live alongside existing fences in [`featureSprintOrchestrator.ts`](../../src/core/featureSprintOrchestrator.ts) or a dedicated `featureSprintV2Import.ts` if the file grows too large.

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

Replaces blind advance through a fixed step list when the living spec loop is active.

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
Accept next slice
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

**UX rule:** LH always tells the user what to paste next and where.

Examples:

```text
Next: Paste this into Cursor for read-only repo localization.
Next: Paste Cursor's localization result into ChatGPT for prompt audit.
Next: Paste this final prompt into Cursor Auto.
```

**v0.1 UI today:** Card Detail Backroom mixes Start feature panel, plan steps, runner rows, import textareas, and action guide — see [`FeatureSprintActionGuide.tsx`](../../src/components/featureSprint/FeatureSprintActionGuide.tsx). v2 consolidates around **Next handoff** without removing inspect-before-save trust boundaries from [`feature-sprint-flow-guide-v0.3.md`](../feature-sprint-flow-guide-v0.3.md).

---

## Implementation roadmap

Each slice is independently shippable. Suggested module/UI touchpoints included.

### Slice A — Living feature spec

- **Add:** persisted `featureSpec` on plan (or parallel record)
- **Touch:** `types.ts`, persistence/hydration, `featureSprintOrchestrator.ts`, `app/card/[id].tsx`, Backroom spec panel
- **Accept:** spec survives reload; included in scoping/review packets; existing sprint works without spec

### Slice B — Current slice model

- **Add:** `currentSlice` + phase field separate from legacy `steps[]`
- **Touch:** `types.ts`, orchestrator step advance logic, Backroom “Current Slice” panel
- **Accept:** slice has title, goal, AC, non-goals, risk tier, phase; legacy plans still work

### Slice C — Recipient-labeled handoff buttons

- **Add:** button copy “Copy for ChatGPT” / “Copy for Cursor”
- **Touch:** `app/card/[id].tsx`, packet builder headers in orchestrator
- **Accept:** low code, high clarity; no inference about tool destination

### Slice D — Cursor localization packet

- **Add:** `buildFeatureSliceLocalizationPacket` (read-only repo inspect)
- **Touch:** new builder in orchestrator; save output as `localizedRepoNotes`; phase `scoped → localized`
- **Accept:** likely files, helpers, tests, risks, revised implementation prompt; no implementation in packet

### Slice E — GPT prompt audit packet/import

- **Add:** `feature-prompt-critique` fence + `buildFeaturePromptAuditPacket`
- **Touch:** orchestrator import; sets `finalImplementationPrompt`; phase `localized → audited`
- **Accept:** audit capped to risk-reducing changes, not wording polish

### Slice F — Proof normalizer

- **Add:** `normalizeImplementationProof()` composing runner run + manual notes
- **Touch:** new core helper; review packet consumes normalized proof; phase `implemented → proof_normalized`
- **Accept:** highlights tests not run and known risks; runner path auto-normalizes where possible

### Slice G — Review packet enrichment

- **Extend:** `buildFeatureStepReviewPacket` with spec, slice, final prompt, normalized proof
- **Accept:** richer GPT review input; `needs_changes` can set next implementation prompt

### Slice H — Spec update import

- **Add:** `feature-spec-update` fence + import handler
- **Touch:** orchestrator; user accepts next slice or marks feature complete — **no auto-advance**
- **Accept:** changelog + completed slice summary persisted

### Slice I — Risk tier recommendation

- **Add:** deterministic `recommendFeatureSprintRiskTier()` 
- **Touch:** slice scope import + UI badge; tiny skips localization/audit
- **Accept:** reasons visible; normal defaults to guarded path

### Slice J — Dogfood polish

- **Add:** Next handoff always populated; thread metadata; packet history; spec progress; no dead-end phases
- **Touch:** `FeatureSprintActionGuide`, flow guide, workbench cross-links

---

## Smallest coherent v1 (build first)

```text
1. Living feature spec          (Slice A)
2. Current slice model          (Slice B)
3. Recipient-labeled buttons    (Slice C)
4. Cursor localization packet   (Slice D)
5. GPT prompt audit import      (Slice E)
6. Proof normalizer             (Slice F)
7. Spec update import           (Slice H)
```

Risk tiering (I) and polish (J) follow once the loop closes.

---

## Example session (target behavior)

```text
User opens Feature Sprint card.

LH: Current feature: Web Architect Mode
    Current slice: Add architect thread metadata
    Next: Copy for Cursor localization

User copies packet → Cursor returns likely files, risks, revised prompt
User imports → LH: Next: Copy for ChatGPT prompt audit

GPT returns final implementation prompt → User imports
LH: Next: Copy final prompt for Cursor Auto

Cursor implements → User saves output → LH normalizes proof
LH: Next: Copy review packet for ChatGPT

GPT: pass + feature-spec-update with next slice
User imports → LH: Slice complete. Accept next slice?
```

---

## Non-goals (v2)

Do **not** build in this track:

```text
- browser automation for ChatGPT
- autonomous Cursor execution without review
- replacing ChatGPT web with local Codex xhigh as default architect
- deleting v0.1 step-based Feature Sprint immediately
- overbuilding a huge spec editor
- forcing every task through the full guarded loop
- ai-gateway / Raw Lab changes
- new assistant action types without explicit ticket
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

- Shipped orchestrator: [`../feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md)
- Trust loop UI: [`../feature-sprint-flow-guide-v0.3.md`](../feature-sprint-flow-guide-v0.3.md)
- Rough spec intake (ephemeral today): [`../feature-spec-intake-v0.1.md`](../feature-spec-intake-v0.1.md)
- Runner + verification: [`../feature-sprint-local-runner-v0.1.md`](../feature-sprint-local-runner-v0.1.md), [`../feature-sprint-verification-capture-v0.2.md`](../feature-sprint-verification-capture-v0.2.md)
- Untrusted context in packets: [`../feature-sprint-untrusted-context-v0.1.md`](../feature-sprint-untrusted-context-v0.1.md)
- Pattern inspiration map: [`./odysseus-patterns-repo-map-v0.1.md`](./odysseus-patterns-repo-map-v0.1.md)
- AI surface boundaries: [`../ai-workflows-current.md`](../ai-workflows-current.md)
