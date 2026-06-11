# Feature Sprint Runner (v0.1)

Local optional bridge for running Feature Sprint **scoping** and **review** packets. Binds to **127.0.0.1:8127** only.

The Expo app never spawns CLI processes. Card Detail Backroom calls this service when the user explicitly clicks a runner button.

## Quickstart (mock mode — default)

From repo root:

```bash
npm run feature-runner
```

In the app: open a card → **Backroom** → **Feature Sprint** → **Check runner** → **Run scoping with Codex** or **Run review with Codex**.

Mock mode fills the existing import textareas with valid fenced blocks. You still click **Import plan** / **Import review verdict** manually.

## Endpoints

- `GET /health` — `{ ok, mode, port }`
- `POST /feature-sprint/run` — body: `FeatureSprintRunnerRequest`; response: `FeatureSprintRunnerResponse`

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `FEATURE_SPRINT_RUNNER_PORT` | `8127` | Listen port |
| `FEATURE_SPRINT_RUNNER_MODE` | `mock` when unset | `mock` or `codex` |
| `FEATURE_SPRINT_RUNNER_TOKEN` | unset | When set, requires `Authorization: Bearer <token>` |
| `FEATURE_SPRINT_RUNNER_ENABLE_CODEX` | unset | Must be `1` for real Codex mode |
| `FEATURE_SPRINT_CODEX_BIN` | `codex` | Experimental real mode only |
| `FEATURE_SPRINT_CODEX_MODEL` | optional | Experimental |
| `FEATURE_SPRINT_CODEX_REASONING_EFFORT` | optional | e.g. `high` / `xhigh` if supported |
| `FEATURE_SPRINT_RUNNER_TIMEOUT_MS` | `600000` | Run timeout |
| `FEATURE_SPRINT_RUNNER_MAX_OUTPUT_CHARS` | `500000` | Response cap |
| `FEATURE_SPRINT_WORKTREE_ROOT` | temp `life-harness-feature-worktrees` | Implementation worktree parent dir |
| `FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION` | unset | Must be `1` for real `codex_implementation` |

App token (optional, pair with server): `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN`

## Real Codex mode (experimental)

Requires **all** of:

```bash
export FEATURE_SPRINT_RUNNER_MODE=codex
export FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1
export FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token
```

Also set `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=your-dev-token` for the app.

Real mode is adapter-only. Verify `codex --help` on your machine before relying on flags. v0.1 CI and dogfood use mock mode only.

## Safety

- Profiles: `codex_scoping`, `codex_review`, `codex_implementation` (worktree-isolated only)
- No arbitrary shell commands from the app
- No git/commit/push
- No auto-import in the app
- `MODE=codex` without `ENABLE_CODEX=1` is rejected

## Tests

```bash
npm run feature-runner:test
```
