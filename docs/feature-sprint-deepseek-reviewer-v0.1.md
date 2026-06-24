# Feature Sprint DeepSeek Reviewer v0.1

## What this adds

An optional **read-only automated review lane** for Feature Sprint `copy_review` jobs. DeepSeek is separate from the localhost `feature-runner` bridge. Life Harness builds a rich review packet, calls DeepSeek (mock or live), validates the response, and **stages** import-compatible `feature-review-verdict` text. Humans still click **Import review verdict**, **Advance step**, and all other gates manually.

North star preserved:

```text
Cursor implements → Life Harness conducts/proofs → DeepSeek reviews (read-only) → humans import/advance
```

## When it appears

| State | UI |
|-------|-----|
| Unconfigured | **Run automated review** hidden/disabled — no error spam |
| Mock (`DEEPSEEK_MOCK=1` or `FEATURE_SPRINT_DEEPSEEK_MODE=mock`) | Button labeled **Run automated review (mock)** |
| Live (Node/test only, safe key) | Button labeled **Run automated review** |

Codex/Cursor **Run review with …** is unchanged.

## Config and key security

Core module: `src/core/featureSprintDeepSeekConfig.ts`

| Env | Effect |
|-----|--------|
| `DEEPSEEK_MOCK=1` or `FEATURE_SPRINT_DEEPSEEK_MODE=mock` | Mock reviewer — no network, no API key |
| `DEEPSEEK_API_KEY` | Live mode in Node/server/test only (not browser client) |
| `EXPO_PUBLIC_DEEPSEEK_API_KEY` | **Ignored** unless `FEATURE_SPRINT_DEEPSEEK_ALLOW_PUBLIC_DEV_KEY=1` (dev-only; bundle-exposed) |
| `DEEPSEEK_BASE_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Default `deepseek-v4-pro` for automated review (not deprecated `deepseek-chat`) |

**Non-negotiable:**

- Never log API keys or include them in error messages (errors redact keys).
- Browser/client without a server proxy → live unavailable (structured failure, no network call).
- Production must not rely on `EXPO_PUBLIC_*` keys for live review.

## Fences

| Fence | Purpose |
|-------|---------|
| `feature-automated-review-verdict` | DeepSeek/mock raw automated verdict (additive schema) |
| `feature-review-verdict` | Existing import fence — staging mapper produces this |

Automated verdict fields: `verdict`, `confidence`, `summary`, `scopeDrift`, `missingTests`, `riskyChanges`, `requiredChanges`, `completedSliceItems`, `remainingSpecItems`, optional `nextCursorPrompt` (accepted only), optional `stopReason`.

Import status mapping:

- `accepted` → `accepted`
- `needs_changes` / `rejected` → `needs_changes`
- `stop` → `blocked`

Staged output is validated against `parseFeatureReviewVerdictBlock` before UI staging.

## Staging behavior

1. Build automated review packet (`buildFeatureSprintAutomatedReviewPacket`).
2. Run mock or live DeepSeek (`runFeatureSprintDeepSeekReview`).
3. Validate verdict (`validateFeatureSprintAutomatedReviewVerdict`).
4. Map to import staging (`formatAutomatedReviewForImportStaging`).
5. Fill **Import review verdict** textarea only.
6. If accepted with `nextCursorPrompt`, show read-only **Staged next Cursor prompt** (`testID`: `feature-sprint-staged-next-cursor-prompt`).

Does **not** auto-import, save, advance, approve, or run the next Cursor prompt.

## Provider guardrails

`deepseek` provider resolves **only** for `copy_review` (`DEEPSEEK_ELIGIBLE_ACTIONS`). Never for implementation, localization, scoping, import, save, approve, or advance actions. No `runnerProfile` — not a localhost runner.

## Core modules

| File | Role |
|------|------|
| `featureSprintDeepSeekConfig.ts` | Safe config resolution |
| `featureSprintReviewerAdapter.ts` | Packet, stop signals, parse/validate, import staging |
| `featureSprintDeepSeekReviewer.ts` | Mock + live dispatcher (injectable `fetch`) |
| `featureSprintRunnerJob.ts` | Provider union, `automated_review` button mode |

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
