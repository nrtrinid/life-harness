# Feature Sprint Inner Loop Dogfood — Phase B6 (v0.1)

Phase B6 is a stabilization pass after B1–B5: fix inner-loop friction so one step can be dogfooded end-to-end without stale text, misleading phase labels, or action-guide gaps. No new features, fences, or automation.

## What changed

### Textarea / selection hygiene (`app/card/[id].tsx`)

- On **`currentStepId` change only**: hydrate **Agent output** from saved `outputSummary`.
- On step change: **clear** `reviewImportText` (never preload old review runner output).
- On step change: reset `selectedRunnerRunId`.
- Effect dependency is step identity (`planId` + `currentStepId`), not the whole step object — normal state refreshes do not overwrite unsaved manual edits.

### Stale automation phase (`featureSprintOrchestrator.ts`)

- On successful **Import review verdict**, clear stale `automationPhase` (`null` → stored as cleared).
- Step `reviewStatus` + `resolveAutomationPhaseDisplay` infer post-import display; avoids misleading `proof_normalizing` / long-lived `reviewing` labels.

### UI sequencing (`app/card/[id].tsx`)

- Minimal reorder/group: **localization → prompt audit → implementation → review**.
- Section labels: **Current step — optional prep** and **Current step — implement & review**.
- Localization and audit import textareas sit adjacent to their copy/run controls (above checklist).

### Action guide (`featureSprintActionGuide.ts`)

- `run_implementation` shows full inner-loop checklist (no `.slice(0, 2)` truncation).
- Prompt audit: copy/paste and Codex-run paths both valid; **`stepPromptAuditSaved` completes audit**; runner success optional.
- `reviewVerdictImported` true for any `reviewStatus`; **Advance step** current only when `accepted`.

### Dogfood + flow guide

- Fresh step `run_implementation` detail nudges optional localization/audit prep.
- Flow guide step 7: Codex/Cursor review wording.

## Manual dogfood script (one step)

1. **Start feature** — save + approve spec, check runner, run scoping, import plan.
2. **Optional prep** (current step section):
   - Copy for Cursor localization → paste → Import localization.
   - Copy for GPT/Codex prompt audit (or Run prompt audit with Codex) → paste → Import prompt audit.
3. **Implement & review**:
   - Run implementation with Codex/Cursor (or copy prompt).
   - View details on run → Save agent output.
   - Optional: Normalize for review.
   - Run review (or copy review packet) → Import review verdict.
4. **Advance step** (accepted only) or revise per `needs_changes` verdict.

## Trust boundaries (unchanged)

| Event | Effect |
|-------|--------|
| Run review / implementation | Fills textarea + runner history only |
| Import review verdict | Persists verdict; clears stale automation phase |
| Advance step | Manual only after accepted review |

B5 run-aware review import marking is unchanged.

## Verification

```bash
npm test -- --run src/core/featureSprint
npm test -- --run src/core/stateHydration.test.ts
```

Manual (mock runner):

```bash
npm run feature-runner:mock
# Expo app → Card Backroom → one full inner-loop step
```
