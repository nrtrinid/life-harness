# Feature Sprint Roadmap v0.1

**Status:** Planning only — no runtime wiring in this doc.

**Authority:** Vision and principles live in [`../feature-sprint-architecture-v0.1.md`](../feature-sprint-architecture-v0.1.md). Shipped behavior lives in [`../feature-sprint-orchestrator-v0.1.md`](../feature-sprint-orchestrator-v0.1.md) and slice docs. v2 evolution: [`feature-sprint-v2-living-spec-loop-v0.1.md`](feature-sprint-v2-living-spec-loop-v0.1.md).

This doc captures **future upgrades** stolen from mature agent workflows. The next level is not more autonomy — it is more **instrumentation**: measure the loop, score the loop, gradually relax gates when the loop proves itself.

**Codex is optional.** Feature Sprint depends on typed packets, gates, proof, and phase state — not on Codex, Cursor, ChatGPT, or any single provider. Provider access changes must not require architecture changes.

---

## Near-term v2 (before instrumentation)

Finish the living-spec loop shape before trust dashboard or parallel lanes:

| Priority | Work | Doc |
|----------|------|-----|
| 1 | **`currentSlice` + phase machine** — active workflow lens; `steps[]` remains plan/history | [`feature-sprint-v2-living-spec-loop-v0.1.md`](feature-sprint-v2-living-spec-loop-v0.1.md) Slice B |
| 2 | **Risk-tier routing** — tiny/normal/risky paths; skip rules | Slice I |
| 3 | **Next Handoff UI** — one primary next action | Slice J |
| 4 | Review packet enrichment finish | Slice G |

**Mid-v2 status:** Living spec, handoffs, localization, prompt audit, proof normalizer, spec update, and next-slice adoption are partially or mostly landed. **`currentSlice` + phase machine is the next architectural jump.**

---

## Provider-agnostic worker model

Life Harness is the **conductor**. External tools are **interchangeable workers**:

| Role | Typical worker | Required? |
|------|----------------|-----------|
| Architect (spec + judgment) | ChatGPT web, frontier model, manual | No single provider |
| Implementation (repo truth) | Cursor, optional local runner | Cursor preferred; not exclusive |
| Reviewer (verdict) | Separate worker from implementer | No single provider |
| Optional localhost runner | Cursor CLI, Codex CLI, future local bridge | Optional |

Protocol copy says **Copy scoping / implementation / review packet** with recipient labels (e.g. "Copy for ChatGPT", "Copy for Cursor") — not "run Codex" as a structural requirement.

**Runner abstraction (roadmap clarification):** Local runner profiles fill import textareas; they do not advance gates. Future work may add a thin provider slot registry (which CLI/profile ran) without binding Feature Sprint to ai-gateway as a v0.1 app dependency.

---

## Local model helper lane (future, not primary architect)

Local models may **later** assist cheap, structured, rules-adjacent tasks. They are **helper lanes**, not replacements for frontier architect scoping or auto-advance gates:

```text
prompt critique pre-check
proof normalization assist
review pre-check / lint
packet linting (fence/schema validation hints)
friction summary after dogfood
risk-tier recommendation (rules + local assist)
```

**Not in scope until explicit ticket:** replacing ChatGPT/frontier architect for scoping, auto-import, auto-save, auto-advance, or binding Feature Sprint to local gateway as a v0.1 dependency.

---

## A. Trust dashboard

Track whether the loop is earning autonomy.

```text
% of slices passing review first try
% of implementation runs touching unexpected files
% of prompt audits that found meaningful issues
% of reviews you disagreed with
average tests run per slice
average files changed per slice
rollback / needs_changes rate
```

**Why:** Gates can loosen only when metrics support it. Today runner history and verification capture are partial inputs; a dashboard aggregates them over time.

**Depends on:** [`feature-sprint-runner-history-v0.2.md`](../feature-sprint-runner-history-v0.2.md), [`feature-sprint-verification-capture-v0.2.md`](../feature-sprint-verification-capture-v0.2.md), and **`currentSlice` phase transitions** (Slice B).

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

**Shipped fences:**

```text
feature-sprint-plan
feature-review-verdict
feature-prompt-localization
feature-prompt-critique
feature-spec-update
```

**Planned additions:**

```text
feature-slice-scope       — pre-implementation slice boundary confirmation
feature-spec              — initial living spec + first slice proposal
normalized-proof          — optional explicit fence; today LH composes proof internally
```

No "here's a long paragraph, good luck parsing it."

---

## D. Risk-tier routing

Route slices by risk, not one-size-fits-all gates.

```text
Tiny   → cheap/fast path; lighter audit; skip localization + audit
Normal → guarded path (current default)
Risky  → stricter audit/review + human glance before implementation + richer proof
```

Signals: files touched, shared types, persistence schema, S3-adjacent paths, LOC budget, prior `needs_changes` on same card.

**Depends on:** `currentSlice` + phase machine (Slice B). Local model may assist recommendation later; rules-only v1 first.

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
Packet history in Backroom
```

---

## G. Start-flow future items

From [`start-feature-flow-v0.2.md`](../start-feature-flow-v0.2.md):

```text
Mock loop shortcut for dogfood (partial — Playwright dogfood E2E exists)
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
Parallel agents without conflict detection
Requiring Codex or any specific LLM provider
```

---

## Reader checklist

After reading Feature Sprint docs, you should be able to answer:

1. **What changed?** — Typed imports, living spec, proof normalization, spec updates, next-slice adoption (mid-v2).
2. **What matters?** — Manual gates, separate worker roles, instrumentation over autonomy, provider interchangeability.
3. **What is the move?** — Ship **`currentSlice` + phase machine**, then risk routing and **Next Handoff** UI.