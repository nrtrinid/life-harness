# Feature Sprint Web Architect — Phase A (v0.1)

Phase A adds a **persisted feature spec** on the active `HarnessFeatureSprintPlan` and a **manual approval gate** before **Run implementation in worktree**. It does not add browser automation, inner-loop agents, or runner service changes.

## What changed

- **Feature spec lives on the plan**, not on the Life card.
- **Save feature spec** writes `plan.featureSpec` (creates a `planning` shell if no active plan exists).
- **Approve feature spec** sets `approvedAt` / `approvedBy` and `automationPhase: spec_approved`.
- **Run implementation in worktree** is disabled when a persisted spec exists but is not approved.
- **Scoping / plan import** are unchanged — you can still scope and import without approving first.
- **Packets:**
  - Scoping: draft spec section when saved but unapproved; approved section when approved.
  - Implementation / review: approved spec section **only** when `approvedAt` is set.

## Manual workflow

1. Open the card **Backroom** → **Start feature**.
2. Paste the ChatGPT web (or manual) spec. Choose **Spec source**.
3. Click **Save feature spec** (persists to the plan).
4. Click **Approve feature spec** when the text is final.
5. Run scoping or copy the scoping packet → import plan (existing flow).
6. **Run implementation in worktree** (enabled after approval when a spec exists).
7. Continue the existing slice loop: view details → save output → review → import verdict → advance → complete.

## Approval clearing rules

Re-saving clears approval when:

- The spec **body** changes (after trim), or
- The **source** changes (`chatgpt_web` / `manual` / `other`).

Identical re-save preserves approval.

Plan import **preserves** `featureSpec` and `automationPhase` on the active plan.

## Dogfood vs UI

| Signal | Where |
|--------|--------|
| `approve_feature_spec` next action | Core dogfood (persisted, unapproved spec) |
| Save feature spec step / enabled Save button | UI only (`featureSpecDirty` in card Backroom) |

Core dogfood cannot see unsaved textarea drafts.

## Out of scope (Phase A)

- ChatGPT web browser automation
- Prompt critique / localization
- Replacing `feature-sprint-plan` or `feature-review-verdict` fences
- Changes to `services/feature-sprint-runner/`
- Proof normalizer or full `automationPhase` state machine (only save/approve transitions)

## Verification

```bash
npm run typecheck
npm test -- --run src/core/featureSprint
npm run feature-runner:test
```

## Related docs

- `docs/feature-sprint-flow-guide-v0.3.md` — full mock loop
- `docs/feature-spec-intake-v0.1.md` — pre-Phase-A rough spec (session-only; superseded for persistence by this slice)
