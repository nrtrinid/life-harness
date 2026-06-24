# Feature Sprint DeepSeek Reviewer v0.1

## What this adds

An optional **read-only automated evaluator lane** for Feature Sprint:

- **Post-implementation review** (`copy_review`) → stages `feature-review-verdict`
- **Pre-implementation prompt audit** (`copy_prompt_audit`) → stages `feature-prompt-critique`

DeepSeek is separate from the localhost `feature-runner` bridge. Life Harness builds rich packets, calls DeepSeek (mock or live), validates responses, and **stages** import-compatible fenced text. Humans still click import/approve/advance gates manually.

North star preserved:

```text
Cursor prompt/plan → DeepSeek prompt audit (read-only) → human import
Cursor implements → Life Harness conducts/proofs → DeepSeek post-review (read-only) → humans import/advance
```

## When it appears

| State | Post-review UI | Prompt-audit UI |
|-------|----------------|-----------------|
| Unconfigured | **Run automated review** hidden | **Run automated prompt audit** hidden |
| Mock | **Run automated review (mock)** | **Run automated prompt audit (mock)** |
| Live (Node/test only) | **Run automated review** | **Run automated prompt audit** |

Codex/Cursor manual review and prompt-audit paths are unchanged. DeepSeek is **never** the implicit default provider — use the explicit automated buttons (or `preferredProvider: "deepseek"`).

## Config and key security

Core module: `src/core/featureSprintDeepSeekConfig.ts`

| Env | Effect |
|-----|--------|
| `DEEPSEEK_MOCK=1` or `FEATURE_SPRINT_DEEPSEEK_MODE=mock` | Mock reviewer — no network, no API key |
| `DEEPSEEK_API_KEY` | Live mode in Node/server/test only (not browser client) |
| `EXPO_PUBLIC_DEEPSEEK_API_KEY` | **Ignored** unless `FEATURE_SPRINT_DEEPSEEK_ALLOW_PUBLIC_DEV_KEY=1` (dev-only; bundle-exposed) |
| `DEEPSEEK_BASE_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_REVIEW_MODEL` | Post-review model (fallback chain entry) |
| `DEEPSEEK_PROMPT_AUDIT_MODEL` | Prompt-audit model — **defaults to Pro** (`deepseek-v4-pro`); do **not** default to Flash in v0.1 |
| `DEEPSEEK_MODEL` | Legacy fallback for review/prompt-audit model chains |

**Prompt audit uses Pro by default** — it is a gate before repo mutation. Flash routing is deferred until evals prove parity.

**Non-negotiable:**

- Never log API keys or include them in error messages (errors redact keys).
- Browser/client without a server proxy → live unavailable (structured failure, no network call).
- Production must not rely on `EXPO_PUBLIC_*` keys for live review.

## Fences

### Post-implementation review

| Fence | Purpose |
|-------|---------|
| `feature-automated-review-verdict` | DeepSeek/mock raw automated verdict |
| `feature-review-verdict` | Existing import fence — staging mapper produces this |

### Pre-implementation prompt audit

| Fence | Purpose |
|-------|---------|
| `feature-automated-prompt-critique` | DeepSeek/mock raw automated critique |
| `feature-prompt-critique` | Existing import fence — staging mapper produces this |

Automated critique maps `approved` → import `ready`, `needs_changes`/`blocked` → `tighten_first`. Staged revised Cursor prompt is **advisory only** until **Import prompt audit**.

## Staging behavior

### Post-review

1. `buildFeatureSprintAutomatedReviewPacket` → `runFeatureSprintDeepSeekReview` → validate → `formatAutomatedReviewForImportStaging`
2. Fill **Import review verdict** textarea; optional read-only **Staged next Cursor prompt**

Automated review packets include structured worker output evidence (best-effort parse of saved agent output) and **redact potential secret-like text** before sending the packet to DeepSeek/mock.

### Prompt audit

1. `buildFeatureSprintAutomatedPromptAuditPacket` → `runFeatureSprintDeepSeekPromptAudit` → validate → `formatAutomatedPromptCritiqueForImportStaging`
2. Fill **Import prompt audit** textarea; optional read-only **Staged revised Cursor prompt** (`testID`: `feature-sprint-staged-revised-cursor-prompt`)
3. Staged textarea does **not** count as imported state — `hasStepPromptAudit` only after manual import

Does **not** auto-import, save, advance, approve, overwrite implementation packet, or auto-run revised prompts.

## Provider guardrails

`deepseek` provider resolves **only** for `copy_review` and `copy_prompt_audit` when explicitly preferred. Never for implementation, localization, scoping, import, save, approve, or advance. No `runnerProfile`.

## Core modules

| File | Role |
|------|------|
| `featureSprintDeepSeekConfig.ts` | Safe config resolution |
| `featureSprintReviewerAdapter.ts` | Post-review packet, validation, staging |
| `featureSprintPromptAuditAdapter.ts` | Prompt-audit packet, validation, staging |
| `featureSprintAutomatedStopSignals.ts` | Shared stop/risk path scans |
| `featureSprintDeepSeekReviewer.ts` | Mock + live dispatchers |
| `featureSprintRunnerJob.ts` | `automated_review` + `automated_prompt_audit` modes |

## Manual verification

```bash
# Mock mode (no API key)
DEEPSEEK_MOCK=1 npm test -- src/core/featureSprintDeepSeekConfig.test.ts src/core/featureSprintReviewerAdapter.test.ts src/core/featureSprintDeepSeekReviewer.test.ts src/core/featureSprintRunnerJob.test.ts
```

Card Detail → Backroom → Feature Sprint → after proof normalization, use **Run automated review (mock)** when mock env is set in the test/dev shell.

## Follow-up (out of scope)

- Server-side proxy for safe browser live usage
- User preference for default reviewer provider
- Wire staged next Cursor prompt into implementation packet prefill
- Eval fixtures for automated review quality
