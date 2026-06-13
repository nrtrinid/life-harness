# Feature Sprint Implementation Proof — Phase B4 (v0.1)

Phase B4 adds a rules-only **Implementation Proof Normalizer** after saved agent output: click **Normalize for review** to create structured `step.implementationProof` and enrich review packets before manual GPT/Codex review.

## What changed

- **Normalize for review** — Card Backroom button; requires saved `outputSummary` on the current step.
- **Storage** — `implementationProof` on the **current step**, including a `runnerEvidence` snapshot (diff stat, git status, verification summary).
- **Review packet** — `buildFeatureStepReviewPacket` adds:
  - Implementation prompt source
  - Normalized proof sections (capped)
  - Runner evidence (snapshot with history lookup fallback)
  - Raw output excerpt (capped)
- **Phase** — `automationPhase: proof_normalizing` set **only after successful normalize**.

## Manual workflow

1. Run implementation (or paste agent output) → **Save agent output**.
2. **Normalize for review** (optional but recommended).
3. **Run review** / copy review packet → import `feature-review-verdict`.

Proof normalization is optional. Review is **not** gated on proof — dogfood shows a **warning** only.

## Normalizer behavior (rules-only)

- **Raw source** — `step.outputSummary` (saved agent output).
- **Runner metadata** — latest matching implementation run for `planId` + `stepId` (succeeded **or** failed).
- **Manual parse** — best-effort only:
  - `Changed files` bullet list
  - `## Verification` / `Verification:` section with `- command:` lines
- **Safe defaults** — `behaviorChanged` is always `["See raw implementation output."]` in v0.1.
- **Failed runs** — included as evidence; add known risk when latest matching run failed.

## Stale proof guardrail

When saved `outputSummary` **changes**, clear `implementationProof` until the user re-normalizes.

## Review packet caps

- File lists: 20 items
- Bullet sections: 12 items
- Raw output excerpt: 4_000 characters
- No full diff text in the review packet

## automationPhase rules

| Event | Phase |
|-------|--------|
| Save agent output | No change |
| Successful normalize | `proof_normalizing` |
| Advance step (when phase is `proof_normalizing`) | `spec_approved` if approved spec exists, else cleared |

## Boundaries (out of scope)

- Codex review automation
- New runner profiles/endpoints/fences
- Changes to `feature-review-verdict` schema
- Gating review on proof normalization
- Per-field proof editors in UI (re-save raw output + re-normalize instead)

## Verification

```bash
npm test -- --run src/core/featureSprint
npm test -- --run src/core/stateHydration.test.ts
```

Focused:

```bash
npm test -- --run src/core/featureSprintImplementationProof.test.ts
npm test -- --run src/core/featureSprintOrchestrator.test.ts
```

## After B4 loop

```text
Cursor localizes → Codex audits prompt → Cursor implements → LH normalizes proof → GPT/Codex reviews clean evidence
```
