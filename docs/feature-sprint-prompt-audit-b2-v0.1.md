# Feature Sprint Prompt Audit — Phase B2 (v0.1)

Phase B2 adds GPT/Codex prompt audit on the current step: copy audit packet, manual import of `feature-prompt-critique`, and promotion of `finalImplementationPrompt` into implementation packets.

## What changed

- **Copy for GPT/Codex prompt audit** — clipboard only; no state mutation.
- **Import prompt audit** — paste output with a `feature-prompt-critique` fenced JSON block.
- **Storage** — `promptAudit` on the **current step** (parallel to B1 `promptLocalization`).
- **Promotion** — `buildFeatureStepImplementationPacket` uses `resolveStepImplementationPrompt`:
  1. `promptAudit.finalImplementationPrompt`
  2. `step.suggestedPrompt`
  3. `step.goal`
- **Phase** — `automationPhase: prompt_auditing` set **only after successful audit import**.

## Manual workflow

1. Optional B1: import Cursor localization.
2. **Copy for GPT/Codex prompt audit** → run GPT/Codex → **Import prompt audit**.
3. Run implementation (uses audited prompt when audit exists).

Audit and localization are optional. Phase A spec approval gate unchanged.

## Output fence

```text
```feature-prompt-critique
{
  "verdict": "ready",
  "risks": [],
  "requiredPromptChanges": [],
  "finalImplementationPrompt": "Bounded final prompt for this step.",
  "mustCheckFiles": [],
  "verificationCommands": []
}
```
```

Verdict values: `ready` | `tighten_first`

- **`tighten_first`** means review needed — the audit found risks and produced a safer prompt. It shows a warning label in UI/dogfood but **does not block** implementation in B2.

Import caps `rawOutput` and `finalImplementationPrompt` at 12_000 characters.

## Stale audit guardrail

When re-importing localization for a step that already has `promptAudit`:

- If capped `rawOutput` **changed** → clear `promptAudit`.
- If `rawOutput` **unchanged** → keep `promptAudit`.

## Verification commands (packet only)

When audit includes `verificationCommands`, they appear **first** in the implementation packet's `## Verification commands` markdown section (merged with project defaults, deduped). This does **not** change runner config, project metadata, or command execution.

## automationPhase rules

| Event | Phase |
|-------|--------|
| Copy audit packet | No change |
| Successful audit import | `prompt_auditing` |
| Advance step (when phase is `prompt_auditing`) | `spec_approved` if approved spec exists, else cleared |

## Boundaries (out of scope)

- Codex/Cursor runner automation for prompt audit
- Using `promptLocalization.revisedImplementationPrompt` directly in implementation packets
- Overwriting `step.suggestedPrompt` on audit import
- Gating run implementation on audit or `tighten_first`
- Proof normalizer, spec update, slice scoping

## Plan re-import warning

Re-importing `feature-sprint-plan` regenerates step IDs. Both `promptLocalization` and `promptAudit` on old steps are lost.

## Verification

```bash
npm test -- --run src/core/featureSprint
npm test -- --run src/core/stateHydration.test.ts
npm run feature-runner:test
```

## Related

- `docs/feature-sprint-cursor-localization-b1-v0.1.md`
- `docs/feature-sprint-web-architect-phase-a-v0.1.md`
