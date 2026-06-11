# Feature Sprint Verification Capture v0.2

## What this adds

After a `codex_implementation` run finishes in an isolated worktree, the local runner can execute **user-configured verification commands** from Project Registry, capture pass/fail output excerpts, store results in runner history, and include a `## Verification` section in the agent output summary.

Goal in one sentence: **capture verification signal without auto-saving, auto-reviewing, or failing the implementation run when checks fail.**

## Trust model

Verification commands are **user-trusted**, not model-trusted.

- Commands come **only** from Project Registry metadata (`project.verificationCommands`) configured in Card Backroom.
- v0.2 does **not** accept verification commands parsed from model output, implementation agent text, or runner fences.
- The allowlist blocks shell chaining, but commands like `node script.js` or `python script.py` can still execute repo code. Treat Project Registry configuration as the trust boundary.

## Read-only expectation

Verification commands are expected to be **read-only checks** such as typecheck, test, or lint.

Life Harness does **not** guarantee arbitrary project scripts are non-mutating. For example, an `npm` script could write files or run git commands. Configure safe commands yourself.

## Safety policy (parser v0.2)

Conservative whitespace split — no quoted arguments (`node -e "..."` is unsupported).

Rejected:

- Shell metacharacters: `|`, `;`, `&`, `&&`, `||`, `>`, `<`, backticks, `$(`, quotes, newlines
- Env assignments (`FOO=bar ...`)
- Blocked bins: `cd`, `git`, `rm`, `del`, `mv`, `cp`, `curl`, `wget`, `ssh`, `scp`

Allowlisted first tokens: `npm`, `npx`, `pnpm`, `yarn`, `node`, `tsc`, `vitest`, `pytest`, `python`, `python3`

Execution uses `spawn(..., { shell: false, cwd: worktreePath })` with per-command timeout. Native executables (`node`, `python`, etc.) spawn directly. On Windows, allowlisted package-manager bins (`npm`, `npx`, `pnpm`, `yarn`) use a fixed `cmd.exe /d /s /c <bin> ...args` shim path so `.cmd` batch wrappers launch safely — this is not arbitrary shell execution; only parser-validated bin tokens and whitespace-split args are passed.

No raw shell command strings are accepted.

## Captured fields

Each verification row stores:

- `command` — original string from Project Registry
- `status` — `passed` | `failed` | `skipped`
- `exitCode`, `stdoutExcerpt`, `stderrExcerpt`, `error`
- `startedAt`, `completedAt`

Runner history stores `verificationResults` on implementation completes. Implementation `response.ok` stays true when verification fails; history `status` follows implementation success only.

## Manual workflow

1. Set **Verification commands** on the card project in Backroom (one per line).
2. Start runner: `npm run feature-runner`
3. **Run implementation in worktree**
4. Inspect agent output textarea — includes `## Verification` when commands ran
5. **Save agent output** manually (unchanged gate)
6. Review / import / advance manually

If verification reports failures, the UI notice says so but still treats the implementation run as succeeded.

## Review packet

When agent output includes `## Verification`, review packets embed it via existing `## Implementation agent output` wiring. Structured runner-run lookup in review packets is future work.

## Non-goals (v0.2)

- Model-generated verification commands
- Auto-save / auto-review / auto-advance on verification pass or fail
- Arbitrary shell runner
- Commit / merge / push gates
- Worktree cleanup automation

## Environment (runner service)

| Variable | Default | Notes |
|----------|---------|-------|
| `FEATURE_SPRINT_VERIFY_TIMEOUT_MS` | `120000` | Per-command timeout |
| `FEATURE_SPRINT_VERIFY_MAX_COMMANDS` | `5` | Max commands per run |
| `FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS` | `12000` | Stdout/stderr excerpt cap |

See [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md) for the Backroom checklist that surfaces verification readiness.

## Future

- Quoted-arg parser for `-e` one-liners
- Structured verification block in review packet builder
- Optional fail-closed gate before advance
- Read-only npm script lint hints
