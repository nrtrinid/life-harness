# Feature Sprint Runner (v0.1)

Local optional bridge for running Feature Sprint **scoping**, **review**, and **implementation** packets. Binds to **127.0.0.1:8127** only.

The Expo app never spawns CLI processes. Card Detail Backroom calls this service when the user explicitly clicks a runner button.

## Quickstart (mock mode — default)

From repo root:

```bash
npm run feature-runner:mock
```

See [docs/feature-sprint-runner-setup-v0.1.md](../../docs/feature-sprint-runner-setup-v0.1.md) for mock vs Cursor setup, token pairing, and in-app **Runner setup** panel.

Copy `services/feature-sprint-runner/.env.local.example` → `.env.local` for real Cursor mode, then:

```bash
npm run feature-runner:cursor
```

Verify with runner running (or to diagnose env before start):

```bash
npm run feature-runner:setup-check
```

Opt-in real smokes (Windows; not CI):

```powershell
npm run feature-runner:smoke:cursor
npm run feature-runner:smoke:codex
.\services\feature-sprint-runner\scripts\smoke_real_profiles.ps1 -Profile cursor_implementation
```

In the app: open a card → **Backroom** → **Feature Sprint** → pick **Codex** or **Cursor** → **Check runner** → run scoping/review/implementation.

Mock mode fills the existing import textareas with valid fenced blocks. You still click **Import plan** / **Import review verdict** / **Save agent output** manually.

## Endpoints

- `GET /health` — `{ ok, mode, port, codexAvailable, cursorAvailable, setup }`
- `POST /feature-sprint/run` — body: `FeatureSprintRunnerRequest`; response: `FeatureSprintRunnerResponse`
- `POST /feature-sprint/cleanup-worktree` — body: `FeatureSprintWorktreeCleanupRequest`; response: `FeatureSprintWorktreeCleanupResponse` (see [docs/feature-sprint-worktree-cleanup-v0.1.md](../../docs/feature-sprint-worktree-cleanup-v0.1.md))

## Profiles

| Profile | Agent | Purpose |
|---------|-------|---------|
| `codex_scoping` | Codex | Scope feature → `feature-sprint-plan` fence |
| `codex_review` | Codex | Review slice → `feature-review-verdict` fence |
| `codex_implementation` | Codex | Worktree-isolated implementation |
| `cursor_scoping` | Cursor CLI | Same as codex scoping |
| `cursor_review` | Cursor CLI | Same as codex review |
| `cursor_implementation` | Cursor CLI | Worktree-isolated implementation |

See [docs/feature-sprint-cursor-runner-v0.1.md](../../docs/feature-sprint-cursor-runner-v0.1.md) for Cursor setup.

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `FEATURE_SPRINT_RUNNER_PORT` | `8127` | Listen port |
| `FEATURE_SPRINT_RUNNER_MODE` | `mock` when unset | `mock`, `codex`, `cursor`, or `real` |
| `FEATURE_SPRINT_RUNNER_TOKEN` | unset | When set, requires `Authorization: Bearer <token>` |
| `FEATURE_SPRINT_RUNNER_ENABLE_CODEX` | unset | Must be `1` for real `codex_*` profiles |
| `FEATURE_SPRINT_RUNNER_ENABLE_CURSOR` | unset | Must be `1` for real `cursor_*` profiles |
| `FEATURE_SPRINT_CODEX_BIN` | `codex` | Experimental real Codex mode only |
| `FEATURE_SPRINT_CODEX_MODEL` | optional | Experimental |
| `FEATURE_SPRINT_CODEX_REASONING_EFFORT` | optional | Passed via `-c model_reasoning_effort=...` if set |
| `FEATURE_SPRINT_CURSOR_BIN` | `agent` | Experimental real Cursor mode only |
| `FEATURE_SPRINT_CURSOR_MODEL` | optional | e.g. `composer-2.5` |
| `CURSOR_API_KEY` | unset | Required for real Cursor mode (server-side only) |
| `FEATURE_SPRINT_RUNNER_TIMEOUT_MS` | `600000` | Run timeout |
| `FEATURE_SPRINT_RUNNER_MAX_OUTPUT_CHARS` | `500000` | Response cap |
| `FEATURE_SPRINT_WORKTREE_ROOT` | temp `life-harness-feature-worktrees` | Implementation worktree parent dir |
| `FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION` | unset | Must be `1` for real implementation profiles |
| `FEATURE_SPRINT_VERIFY_TIMEOUT_MS` | `120000` | Per verification command timeout |
| `FEATURE_SPRINT_VERIFY_MAX_COMMANDS` | `5` | Max verification commands per run |
| `FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS` | `12000` | Stdout/stderr excerpt cap per command |

Implementation runs accept optional `verificationCommands` + `runVerification` (user-configured in app). See [docs/feature-sprint-verification-capture-v0.2.md](../../docs/feature-sprint-verification-capture-v0.2.md).

On Windows, package-manager verification commands (`npm`, `npx`, `pnpm`, `yarn`) spawn through a fixed `cmd.exe /d /s /c` shim with parsed args only — not raw shell strings.

Codex/Cursor agent binaries ending in `.cmd`, `.bat`, or `.ps1` (including npm global `codex.cmd` and `cursor-agent-wrapper.cmd`) use the same `cmd.exe` shim — Node cannot spawn script wrappers with `shell: false` on Windows.

App token (optional, pair with server): `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN`

## Real Codex mode (experimental)

Requires **all** of:

```bash
export FEATURE_SPRINT_RUNNER_MODE=codex
export FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
```

Also set `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token` for the app.

## Real Cursor mode (experimental)

Requires **all** of:

```bash
export FEATURE_SPRINT_RUNNER_MODE=cursor
export FEATURE_SPRINT_RUNNER_ENABLE_CURSOR=1
export FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
export CURSOR_API_KEY=your-cursor-api-key
```

## Real mixed mode (experimental)

Run both providers without flipping `MODE` between cards:

```bash
export FEATURE_SPRINT_RUNNER_MODE=real
export FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1
export FEATURE_SPRINT_RUNNER_ENABLE_CURSOR=1
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
export CURSOR_API_KEY=your-cursor-api-key
```

Profiles dispatch by prefix (`codex_*` vs `cursor_*`).

Windows smoke scripts (manual, not CI):

- `services/feature-sprint-runner/scripts/smoke_cursor_real.ps1`
- `services/feature-sprint-runner/scripts/smoke_codex_real.ps1`
- `services/feature-sprint-runner/scripts/smoke_real_profiles.ps1 -Profile <name>`

Real modes are adapter-only. Verify `codex exec --help` / `agent --help` on your machine before relying on flags. v0.1 CI and dogfood use mock mode only.

### Phase flags (confirmed against installed CLIs)

| Phase | Cursor | Codex |
|-------|--------|-------|
| Scoping / review | `-p --mode ask --trust --output-format text` | `exec -s read-only -` (stdin prompt) |
| Implementation | `-p --force --trust --output-format text` | `exec -s workspace-write -` |

`--mode ask` is used for read-only phases because installed CLI help marks both `ask` and `plan` as read-only, and real `plan` smokes exited 0 with empty stdout capture.

Implementation workspaces must live under `FEATURE_SPRINT_WORKTREE_ROOT`. Root-checkout implementation is rejected.

### Empty-output policy

Process exit `0` is not the same as a usable Feature Sprint result:

| Profile | Usable when |
|---------|-------------|
| Scoping / review / prompt_audit | Nonempty normalized stdout/stderr text |
| Implementation | Nonempty text **or** worktree `changedFiles` |

Empty/whitespace-only results keep `terminationReason=completed` but set `ok=false`, `failureClass=empty_output`, `resultUsability=empty_output`. Nothing is imported/saved/advanced.

Changed-file capture uses `git diff … HEAD` (staged + unstaged) plus untracked files. Real implementation runs subtract a pre-run snapshot so preexisting dirty paths are not credited as new agent work. That is still not exact per-run authorship for content-only edits to already-dirty paths.

### Opaque execution context seam (Sprint Map)

Request may include optional `executionContext` (any JSON). The runner echoes it on the response and must not interpret sprint/story/task/phase relationships. Later Track A integration can stash this into runner history without changing runner semantics.

### Opt-in smokes

```powershell
npm run feature-runner:smoke:cursor-content   # requires nonce in captured output
npm run feature-runner:smoke:process-tree     # local fixture; no paid agents
npm run feature-runner:smoke:codex            # exits 2 when blocked (not installed/enabled)
```

## Safety

- Profiles listed above; implementation is worktree-isolated only
- No arbitrary shell commands from the app
- No git/commit/push
- No auto-import in the app
- Real mode without enable flags is rejected (fail-closed)

## Tests

```bash
npm run feature-runner:test
```
