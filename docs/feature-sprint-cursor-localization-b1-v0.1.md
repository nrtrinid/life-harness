# Feature Sprint Cursor Localization — Phase B1 (v0.1)

Phase B1 adds the first inner-loop handoff on the current-step model: a read-only Cursor localization packet, manual import, and step-scoped storage. It does not add Codex prompt audit, proof normalization, or runner changes.

## What changed

- **Copy for Cursor localization** — read-only markdown packet (clipboard only; **no state mutation**).
- **Import localization** — paste Cursor output with a `feature-prompt-localization` fenced JSON block.
- **Storage** — `promptLocalization` on the **current step** (not the plan).
- **Phase** — `automationPhase: localizing` set **only after successful import** (not on copy).
- **B1 is storage-only** — localized `revisedImplementationPrompt` is displayed in Backroom only; implementation/review packets are unchanged.

## Manual workflow

1. Import a feature sprint plan (existing flow).
2. Optional inner loop for the current step:
   - **Copy for Cursor localization**
   - Run Cursor read-only against the repo (do not implement).
   - **Import localization** from Cursor output.
3. Continue the existing slice loop: run implementation → save output → review → advance.

Localization is **recommended**, not required. Phase A spec approval gate is unchanged.

## Output fence

```text
```feature-prompt-localization
{
  "likelyFiles": [],
  "existingHelpers": [],
  "testsToRun": [],
  "risks": [],
  "revisedImplementationPrompt": "Bounded prompt for this step only."
}
```
```

Import caps `rawOutput` and `revisedImplementationPrompt` at 12_000 characters (same as rough spec).

## automationPhase rules

| Event | Phase |
|-------|--------|
| Copy localization packet | No change |
| Successful import | `localizing` |
| Advance step (when phase is `localizing`) | `spec_approved` if approved spec exists, else cleared |

Other phase values are not cleared on advance.

## Boundaries (out of scope)

- Codex prompt critique (`prompt_auditing`)
- Injecting localized prompt into implementation/review packets
- Overwriting `step.suggestedPrompt` on import
- Runner profiles/endpoints
- Gating run implementation on localization

## Plan re-import warning

Re-importing a `feature-sprint-plan` regenerates step IDs. Step `promptLocalization` on old steps is lost.

## Verification

```bash
npm test -- --run src/core/featureSprint
npm test -- --run src/core/stateHydration.test.ts
npm run feature-runner:test
```

## Related

- `docs/feature-sprint-web-architect-phase-a-v0.1.md` — feature spec save/approve
- `docs/feature-sprint-flow-guide-v0.3.md` — full mock loop
