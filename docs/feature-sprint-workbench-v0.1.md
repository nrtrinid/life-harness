# Feature Sprint Workbench v0.1

## What this adds

Feature Sprint Workbench is a Backroom dashboard over the Feature Sprint Orchestrator v0.1 data model. It answers:

**What feature-building work is currently in motion, and what needs my attention next?**

The screen classifies existing `HarnessFeatureSprintPlan` rows and project-backed cards into six sections:

- **Needs planning** — project-backed build/career cards with no active feature sprint plan (cap 8)
- **Ready to implement** — active plan with a current step `ready` or `planned`, no saved output (cap 8)
- **Awaiting agent output** — current step `sent`, no saved output (cap 8)
- **Needs review** — current step has output awaiting review (cap 8)
- **Ready to advance** — current step review `accepted`, step not yet `done` (cap 8)
- **Recently completed** — `done` plans, newest first (cap 8)

`LifeCard` remains the anchor. Project Registry and Feature Sprint Orchestrator remain the sources of truth.

## Why it comes after Feature Sprint Orchestrator

Orchestrator v0.1 added card-anchored plans, step state, packet builders, and mutation controls on Card Detail Backroom. Workbench v0.1 adds a read/classify dashboard so you can see the whole pipeline without opening every card.

Local runner controls (Run scoping/review with Codex) live on **Card Detail Backroom**, not on Workbench.

## Classification rules

Active plans (`planning`, `in_progress`, `reviewing`) land in exactly one active bucket (first match wins):

1. `readyToAdvance` — step `reviewStatus === "accepted"` and step status is not `done`
2. `needsReview` — step has `outputSummary` with no review or `pending` review, or plan status is `reviewing` with unresolved current step
3. `awaitingAgentOutput` — step `sent`, no `outputSummary`
4. `readyToImplement` — step `ready` or `planned`, no `outputSummary`

`needsPlanning` includes a card only when `getActiveFeatureSprintPlanForCard` is `undefined`. Done/parked plans do not count as active, so a card may appear again when ready for a new sprint.

## Manual workflow

1. Open **Feature Sprints** from Backroom.
2. Pick a **Needs planning** card (project metadata required).
3. **Open card** to paste a rough spec, then copy/run scoping on Card Detail Backroom — or **Copy scoping packet** from Workbench (card context only).
4. **Import plan** on Card Detail after scoping output is ready.
4. When a step is **Ready to implement**, copy the implementation prompt and paste into Codex/Cursor.
5. Save agent output on Card Detail; work moves to **Awaiting agent output** → **Needs review**.
6. **Copy review packet** for ChatGPT/Codex review; import verdict on Card Detail.
7. When a step is **Ready to advance**, open the card and **Advance step** on Card Detail.
8. **Mark complete** on Card Detail when the sprint is done; proof may appear in **Recently completed** with a ledger link.

## Boundaries

- Copy scoping / implementation / review packets from Workbench are **clipboard only** — no state mutation, no session creation, no step status updates, no “copy + log sent”.
- Workbench does **not** expose import forms, advance, complete, or delete — those stay on Card Detail Backroom.
- S3 cards and their plans are excluded from Workbench rows.

## What intentionally remains on Card Detail

- Import plan / import review verdict
- Save agent output
- Advance step / mark complete / delete plan
- All mutation-heavy feature sprint controls

## Intentionally not added

- Next Move collector for feature sprint states
- Inline advance / complete / import on Workbench
- Codex/Cursor CLI runner or execution bridge
- PC or browser automation
- Project Hub aggregation route
- new feature sprint data model
- ai-gateway, Raw Lab, auth, or cloud sync changes
- autonomous AI actions

## Future path

- Next Move collector for: output needs review, accepted step ready to advance, step ready to implement
- Inline advance/complete after dogfood if clearly safe
- Codex CLI runner / Cursor CLI runner
- stdout/diff/test capture
- Project Hub aggregation
