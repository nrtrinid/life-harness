# Feature Sprint Cursor Runner v0.1

## What this adds

Parallel **Cursor CLI** profiles for the Feature Sprint local runner:

- `cursor_scoping`
- `cursor_review`
- `cursor_implementation` (isolated git worktree)

Card Detail Backroom includes a **Runner agent** toggle (Codex | Cursor) that applies to scoping, review, and implementation runs.

Manual gates are unchanged: import, save, advance, complete, and worktree cleanup still require explicit clicks.

## Setup

### Mock mode (default — CI and dogfood)

```bash
npm run feature-runner
```

All `cursor_*` profiles return the same mock fences and worktree metadata as Codex mock mode.

### Real Cursor mode (experimental / opt-in)

Requires **all** of:

```bash
export FEATURE_SPRINT_RUNNER_MODE=cursor
export FEATURE_SPRINT_RUNNER_ENABLE_CURSOR=1
export FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1   # for cursor_implementation only
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
export CURSOR_API_KEY=your-cursor-api-key
npm run feature-runner
```

Pair app token: `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token`

Optional:

```bash
export FEATURE_SPRINT_CURSOR_BIN=agent
export FEATURE_SPRINT_CURSOR_MODEL=composer-2.5
```

`CURSOR_API_KEY` is server-side only — never use `EXPO_PUBLIC_*` for it.

## How prompts are delivered

Codex uses `codex exec --file <path>`. Cursor CLI takes an inline prompt; the runner writes the packet to a temp file and invokes:

```bash
agent -p --force --output-format text "Execute the feature sprint task documented in <path>..."
```

The agent reads the file via tool calls. Prompt contents are never shell-interpolated.

## Profile gating

| `FEATURE_SPRINT_RUNNER_MODE` | Profiles that run real |
|------------------------------|------------------------|
| unset / `mock` | All profiles use mock output |
| `codex` | `codex_*` only (requires `ENABLE_CODEX=1`) |
| `cursor` | `cursor_*` only (requires `ENABLE_CURSOR=1` + `CURSOR_API_KEY`) |
| `real` | Dispatch by profile — Codex and/or Cursor when each provider is enabled |

`GET /health` returns `{ ok, mode, codexAvailable, cursorAvailable, port }`.

## Manual workflow

1. Start runner: `npm run feature-runner`.
2. Open card → **Backroom** → **Feature Sprint**.
3. In **Start feature**, pick **Codex** or **Cursor** under step 3.
4. **Run scoping with Cursor** (or Codex) → inspect → **Import plan**.
5. **Run implementation with Cursor** → **View details** → **Save agent output**.
6. **Run review with Cursor** → **Import review verdict** → **Advance step**.
7. **Clean worktree** when done.

## Safety boundaries

- Localhost bind only (`127.0.0.1`)
- Implementation only in isolated worktrees
- No git commit/push from runner
- No auto-import, auto-save, or auto-advance
- Fail-closed without explicit enable flags

## Related docs

- [feature-sprint-local-runner-v0.1.md](./feature-sprint-local-runner-v0.1.md)
- [feature-sprint-implementation-runner-v0.1.md](./feature-sprint-implementation-runner-v0.1.md)
- [feature-sprint-flow-guide-v0.3.md](./feature-sprint-flow-guide-v0.3.md)
- [services/feature-sprint-runner/README.md](../services/feature-sprint-runner/README.md)

## Manual smoke (not CI)

On Windows, verify `agent -p --force` works from a subprocess before relying on real mode.

```powershell
# Terminal 1
npm run feature-runner

# Terminal 2 (set env vars first)
.\services\feature-sprint-runner\scripts\smoke_cursor_real.ps1
```

Record results below when validating real mode on your machine.

### Smoke results template

| Date | OS | Runner mode | Agent `-p` | Scoping ok | Notes |
|------|----|-------------|--------------|------------|-------|
| YYYY-MM-DD | Windows | cursor | yes/no | yes/no | exit code, duration, hang/TTY issues |
