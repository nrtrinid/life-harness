# Feature Sprint Prompt Audit Runner — Phase B3 (v0.1)

Phase B3 automates the B2 prompt audit handoff via the local Feature Sprint runner. The user clicks **Run prompt audit with Codex**, output lands in the import textarea, and **Import prompt audit** remains manual.

## What changed

- **`codex_prompt_audit` runner profile** — non-implementation; same execution path as scoping/review (no worktree)
- **Run prompt audit with Codex** — Card Backroom button; hardcoded Codex profile (unaffected by Cursor/Codex implementation toggle)
- **Output routing** — successful runs fill `promptAuditImportText`; missing fence shows import-readiness warning, not runner failure
- **History** — runner runs stored with `planId` + `stepId`; marked imported only after successful manual import
- **Copy fallback** — **Copy for GPT/Codex prompt audit** unchanged

## Manual workflow

1. Optional B1: import Cursor localization.
2. **Run prompt audit with Codex** (or copy packet manually) → inspect output in import textarea.
3. **Import prompt audit** — only path to persisted `promptAudit`.
4. Run implementation (uses audited prompt when audit exists).

## Read-only intent and repo context

Codex prompt audit is **intended** to be read-only judgment on the packet. The runner does **not** create an implementation worktree.

Real Codex CLI execution still happens in the repo context (same caveat as scoping/review). The agent may edit files if it ignores the prompt. Check `git status` if concerned.

Future work (out of scope): a safer judgment-only sandbox for scoping/review/audit passes.

## Malformed output

If Codex returns text without a valid `feature-prompt-critique` fence:

- The textarea is still filled with raw output
- UI shows: **Output needs manual cleanup before import.**
- This is an import-readiness warning, not a runner crash

## Trust boundaries

| Event | Effect |
|-------|--------|
| Run prompt audit with Codex | Fills textarea + history only |
| Runner output alone | Does **not** persist `step.promptAudit` |
| Import prompt audit | Persists `promptAudit`; sets `automationPhase: prompt_auditing` (B2) |
| Mark run imported | Only after successful import |

## Boundaries (out of scope)

- Auto-import of `feature-prompt-critique`
- `cursor_prompt_audit`
- Worktree or verification on prompt audit profile
- Proof normalizer, spec update, slice scoping
- Codex review/implementation automation changes

## Verification

```bash
npm test -- --run src/core/featureSprint
npm test -- --run src/core/stateHydration.test.ts
npm run feature-runner:test
```

## Related

- [feature-sprint-prompt-audit-b2-v0.1.md](./feature-sprint-prompt-audit-b2-v0.1.md)
- [feature-sprint-cursor-localization-b1-v0.1.md](./feature-sprint-cursor-localization-b1-v0.1.md)
