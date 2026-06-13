# Feature Sprint Roadmap v0.1

**Status:** Planning only — no runtime wiring in this doc.

**Authority:** Vision and principles live in [`../feature-sprint-architecture-v0.1.md`](../feature-sprint-architecture-v0.1.md). Shipped behavior lives in [`../feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md) and slice docs.

This doc captures **future upgrades** stolen from mature agent workflows. The next level is not more autonomy — it is more **instrumentation**: measure the loop, score the loop, gradually relax gates when the loop proves itself.

---

## A. Trust dashboard

Track whether the loop is earning autonomy.

```text
% of slices passing review first try
% of Cursor runs touching unexpected files
% of prompt audits that found meaningful issues
% of reviews you disagreed with
average tests run per slice
average files changed per slice
rollback / needs_changes rate
```

**Why:** Gates can loosen only when metrics support it. Today runner history and verification capture are partial inputs; a dashboard aggregates them over time.

**Depends on:** [`feature-sprint-runner-history-v0.2.md`](../feature-sprint-runner-history-v0.2.md), [`feature-sprint-verification-capture-v0.2.md`](../feature-sprint-verification-capture-v0.2.md).

---

## B. Conflict-aware parallel lanes

Do not parallelize by vibes. Parallelize only when likely files do not overlap.

```text
Lane A likely files: app/card/[id].tsx
Lane B likely files: src/core/featureSprintOrchestrator.ts
→ Safe-ish

Lane A likely files: src/core/types.ts
Lane B likely files: src/core/types.ts
→ Serialize
```

**Why:** Multi-feature velocity without chaos. Explicitly deferred in orchestrator v0.1 ("Parallel agent execution").

**Requires:** Per-slice file hints from plan JSON, overlap detection, lane state in conductor — not autonomous merge.

---

## C. Expanded typed packet contracts

Every agent output should be importable and validatable.

**v0.1 fences:**

```text
feature-sprint-plan
feature-review-verdict
```

**Planned additions:**

```text
feature-slice-scope       — pre-implementation slice boundary confirmation
feature-prompt-critique   — audited implementation prompt before run
normalized-proof          — structured test/file/diff summary for save step
feature-spec-update       — architect revision without full re-scope
```

No "here's a long paragraph, good luck parsing it."

---

## D. Risk-tier routing

Route slices by risk, not one-size-fits-all gates.

```text
Tiny   → cheap/fast path; lighter audit
Normal → guarded path (current default)
Risky  → full xhigh audit/review + human glance before implementation + richer proof
```

Signals: files touched, shared types, persistence schema, S3-adjacent paths, LOC budget, prior `needs_changes` on same card.

Aligns with Anthropic's routing pattern: easy/common → cheaper path; hard/unusual → stronger model + more gates.

---

## E. Replay / workflow evals

Test the **workflow itself**, not just code output.

Save old slices as fixtures:

```text
input spec
localization output
audited prompt
implementation proof
review verdict
human final judgment
```

Then ask:

```text
Would the new loop make the same or better decision?
Would it catch the same risks?
Would it over-scope less?
```

**Related:** [`local-ai-evals-v0.1.md`](local-ai-evals-v0.1.md) (gateway coding evals), [`../feature-sprint-prompt-audit-b2-v0.1.md`](../feature-sprint-prompt-audit-b2-v0.1.md) (prompt audit phase).

---

## F. Orchestrator doc future items

Carried from [`feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md):

```text
Streaming partial runner output to UI
Worktree/branch isolation per slice (partially shipped)
Copy implementation prompt + log sent
Feature-step Next Move collector
Assistant Action integration for import/approve flows
Agent Workbench row hints when agentSessionId links a step
```

---

## G. Start-flow future items

From [`start-feature-flow-v0.2.md`](../start-feature-flow-v0.2.md):

```text
Mock loop shortcut for dogfood
Ask Companion to draft spec from card context
Persistent spec drafts per card
Start feature flow from Workbench or Project Hub
Project Hub aggregation for feature-building cards
```

---

## Non-goals (remain out of scope until explicit ticket)

```text
Autonomous plan acceptance
Auto-import / auto-save / auto-advance / auto-cleanup
ChatGPT web control from LH
GitHub integration
Binding Feature Sprint to local gateway as v0.1 app dependency
Replacing frontier architect with local model for scoping
```
