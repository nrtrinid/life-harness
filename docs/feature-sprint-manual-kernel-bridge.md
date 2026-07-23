# Feature Sprint manual kernel bridge

Supervised UI bridge between persisted Feature Sprint plan state and the
[next-legal-action kernel](./feature-sprint-next-legal-action-kernel.md).

## Authority boundary

```text
plan has clarifiedSpec
→ kernel-managed
→ mutating/worker actions go through Next Legal Action panel + applyFeatureSprintLegalAction

plan lacks clarifiedSpec
→ legacy/manual
→ existing Feature Sprint controls remain available
```

Kernel-managed plans **do not** use legacy Run implementation/review, advance,
complete, or Sprint Map mutation controls. Those controls are disabled (with an
explanation) and handler-guarded. Legacy plans are unchanged.

Kernel-managed legacy controls disabled in the UI include:

- Run implementation / Run review
- Advance step / Mark feature complete / Adopt next slice
- Approve feature spec
- Sprint Map adopt / revert / seed / task and phase selection
- Run prompt audit (legacy ancillary worker only)

## What this slice does

- **Read-only recommendation** — `presentFeatureSprintNextLegalAction` calls
  `getNextFeatureSprintLegalAction` and surfaces a typed envelope in the Backroom
  card UI (`FeatureSprintNextLegalActionPanel`).
- **Explicit clarified-draft adopt** — `Adopt saved spec as clarified draft` lifts the
  persisted `featureSpec.body` into a draft `clarifiedSpec` via `upsertDraftClarifiedSpec`
  (identity mapping into objective / userIntent / acceptanceCriteria). Explicit only;
  never auto-approves, freezes, or launches workers.
- **Explicit clarification answers** — when the next legal action is
  `request_clarification`, Backroom shows open questions and an explicit
  **Apply clarification answers** control. Answers build the typed
  `clarification_answers` artifact and apply through the kernel after envelope
  re-validation. Incomplete or stale submissions do not mutate state and never
  auto-approve, freeze, or launch workers.
- **Explicit manual triggering** — panel triggers re-read state, validate
  `actionId` / `stateRevision`, then apply or delegate to existing runner handlers.
- **Kernel-backed apply** — state-only actions and proof/verdict/localization
  artifacts go through `applyFeatureSprintLegalAction` and persist via
  `LifeHarnessState`.
- **Worker delegation** — after legal launch intent is recorded, implementation/review
  use existing runner handlers with `kernelDelegatedLaunch: true`.
- **Legacy compatibility** — plans without `clarifiedSpec` keep all prior controls.

## What remains manual

- No background execution loop or serial autopilot.
- No automatic provider launches on render or state change.
- No automatic proof save, verdict import, task advance, or sprint completion.
- **Durable claim-before-launch** applies to `launch_implementation` only (app attempt + runner journal). Review/correction/localization remain non-durable in this slice.
- Runner duration is not inferred when the runner cannot measure it accurately.

## Telemetry

Telemetry is **trigger-only** in this slice:

- Opening a card or recalculating the next action does **not** persist audit events.
- Kernel `applyFeatureSprintLegalAction` records `applied` / `rejected` on explicit triggers.
- There is no automatic recommendation-impression analytics.

## Launch intent vs provider success

For worker launches the panel:

1. Applies the legal `launch_*` action (records launch intent; audit `applied`).
2. Invokes the existing runner handler once.

If the runner fails afterward, the UI states that launch intent was recorded but
provider execution did not succeed. **Applied means the legal launch transition
was recorded, not that the provider finished successfully.**

Exactly-once execution and restart reconciliation remain deferred.

## Artifact actions

| Action | Panel trigger | Dedicated control |
| --- | --- | --- |
| `request_clarification` | Not triggerable | Apply clarification answers form |
| `save_localization` | Not triggerable | Import localization (kernel-applied on kernel-managed plans) |
| `save_implementation_proof` / `save_correction_proof` | Not triggerable | Normalize for review |
| `import_review_verdict` | Not triggerable | Import review verdict |

Failed verification cannot be saved as authoritative proof.

On kernel-managed plans, localization import re-reads state, requires
`save_localization`, builds a typed localization artifact, and applies through the
kernel. Legacy plans keep the direct localization importer.

## Prompt audit (legacy ancillary worker)

Prompt audit is **not** a kernel legal action. On kernel-managed plans the legacy
Run prompt audit control is disabled and handler-blocked. Read-only copy/packet
helpers remain available. Legacy plans retain prompt-audit runner behavior.

## Staleness

Before apply or delegated worker launch, the bridge re-reads persisted state and
rejects stale `actionId` / `stateRevision` pairs. Legacy controls cannot bypass
this on kernel-managed plans because they are disabled and handler-guarded.

## Durability limitation (unchanged)

```text
apply succeeds → returned state is lost before persistence → caller retries old snapshot
```

Persisted-state exactly-once semantics are prerequisites for serial autopilot.

## Key files

| File | Role |
| --- | --- |
| `src/core/featureSprintManualKernelBridge.ts` | Adapter, gating, validation, artifacts, clarified-draft adopt |
| `src/components/featureSprint/FeatureSprintClarificationAnswersForm.tsx` | Clarification answer form |
| `src/components/featureSprint/FeatureSprintNextLegalActionPanel.tsx` | Panel UI |
| `src/components/featureSprint/FeatureSprintStartFlow.tsx` | Adopt saved spec as clarified draft control |
| `src/components/featureSprint/FeatureSprintMapPanel.tsx` | Read-only map when kernel-managed |
| `src/state/LifeHarnessState.tsx` | `applyFeatureSprintLegalActionForPlan`, `adoptSavedFeatureSpecAsClarifiedDraftForPlan` |
| `app/card/[id].tsx` | Guards, panel trigger, delegated runner launches, adopt handler |

## Default autonomy

Kernel-managed plans inherit `autonomyPolicy.mode: "manual"`. The bridge does not
override this and does not execute supervised-only types automatically.
