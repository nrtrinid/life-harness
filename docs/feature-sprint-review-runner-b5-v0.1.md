# Feature Sprint Review Runner — Phase B5 (v0.1)

Phase B5 verifies and hardens the existing **Codex/Cursor review runner** path so **Run review** uses the B4-enriched `buildFeatureStepReviewPacket` cleanly. No new review system, runner profile, or import fence.

## What changed

- **Run-aware import marking** — after **Import review verdict**, the correct review run is marked imported using run context (not the agent toggle alone).
- **UI helper text** — Run review / Import review sections note enriched packet + manual import + fence cleanup warnings.
- **Tests** — explicit coverage for enriched packet, no auto-persist verdict, toggle-safe import marking.

## Manual workflow

1. Save agent output.
2. Optional: **Normalize for review** (recommended; warning-only if skipped).
3. **Run review with Codex** or **Run review with Cursor** (respects agent toggle).
4. Inspect output in **Import review verdict** textarea.
5. **Import review verdict** manually.
6. **Advance step** manually after accepted review.

Unlike B3 prompt audit (Codex-only), review stays **agent-aware** — both `codex_review` and `cursor_review` profiles are supported.

## Review packet (B4 enrichment)

`handleRunReview` calls `buildFeatureStepReviewPacket` with full board state. When proof is normalized, the packet includes:

- Normalized implementation proof (capped)
- Implementation prompt source (audited / suggested / goal)
- Runner evidence snapshot
- Raw output excerpt (capped)
- `feature-review-verdict` template fence

When proof is absent, packet states `Normalized proof: not generated` and still works.

## Run-aware import marking

Resolution order when marking a review run imported:

1. **`selectedRunnerRunId`** — run that produced the current review output (set by Run review).
2. **Output match** — review run whose stored `outputText` matches `reviewImportText` for current plan/step (`codex_review` or `cursor_review`).
3. **Latest matching review run** — newest succeeded, unimported review run for plan/step.
4. **Fallback** — `buildRunnerProfile(runnerAgent, "review")` only when no run context exists.

This avoids marking the wrong profile if the user switches Codex/Cursor toggle between run and import.

## Malformed output

If review output lacks a valid `feature-review-verdict` fence:

- Textarea is still filled with raw output
- UI shows: *Output loaded but no feature-review-verdict fence found. Inspect before Import review verdict.*
- Cleanup-needed warning, not a runner crash

## Trust boundaries

| Event | Effect |
|-------|--------|
| Run review | Fills import textarea + runner history only |
| Import review verdict | Persists `reviewVerdict` / `reviewStatus` on step |
| Advance step | Manual only after accepted review |

No auto-import, no auto-advance, no `feature-review-verdict` schema change.

## Repo context caveat

Review runs use the scoping/review execution path (repo cwd, no implementation worktree). Real CLI agents may still edit files if they ignore the prompt — same caveat as B3 scoping/audit.

## Verification

```bash
npm test -- --run src/core/featureSprint
npm test -- --run src/core/stateHydration.test.ts
```

Focused:

```bash
npm test -- --run src/core/featureSprintOrchestrator.test.ts
npm test -- --run src/core/featureSprintRunnerHistory.test.ts
npm test -- --run src/core/featureSprintRunnerOutputFence.test.ts
```
