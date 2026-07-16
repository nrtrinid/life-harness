# Feature Sprint Runner Setup v0.1

## What this adds

Structured runner setup diagnostics and in-app guidance for the Feature Sprint local runner:

- Richer `GET /health` payload with non-secret `setup` metadata
- Local `npm run feature-runner:setup-check` report (no top-level await; works on Windows Node/tsx)
- Clear failure kinds: unreachable, unauthorized (token mismatch), misconfigured, agent unavailable
- **Runner setup** panel in Start feature step 2 with copy-paste commands
- One-command dev scripts for mock and Cursor modes
- Opt-in real Cursor/Codex smoke scripts

Manual import/save/advance gates are unchanged.

## Windows developer sequence

```powershell
# 1) Configure environment (no real secrets in examples)
Copy-Item services\feature-sprint-runner\.env.local.example services\feature-sprint-runner\.env.local
# Edit .env.local: set FEATURE_SPRINT_RUNNER_TOKEN and, for Cursor, CURSOR_API_KEY
# Pair app token in repo-root .env:
#   EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=<same token>

# 2) Setup check (fail-closed; never prints secret values)
npm run feature-runner:setup-check

# 3) Start local runner
npm run feature-runner:mock
# or real Cursor:
npm run feature-runner:cursor
# or mixed real:
npm run feature-runner:real

# 4) Verify health/auth (setup-check again while runner is up)
npm run feature-runner:setup-check

# 5) Optional opt-in smokes (requires CLIs + credentials; not CI)
npm run feature-runner:smoke:cursor-content   # fails unless nonce is captured
npm run feature-runner:smoke:process-tree     # Windows tree kill fixture (no paid agent)
npm run feature-runner:smoke:codex            # exit 2 = blocked (missing enable/CLI)
# or per profile:
# .\services\feature-sprint-runner\scripts\smoke_real_profiles.ps1 -Profile cursor_review

# 6) Open Life Harness → card → Backroom → Feature Sprint → Check runner → launch a real phase
```

Smoke exit codes: `0` passed, `1` failed, `2` blocked/not-run (missing credentials or CLI).

## Quick start

### Mock mode (safest dogfood)

```bash
npm run feature-runner:mock
```

No API keys. Pair app token in repo root `.env`:

```bash
EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN=life-harness-dev
```

### Real Cursor mode

1. Copy `services/feature-sprint-runner/.env.local.example` → `.env.local`
2. Set `CURSOR_API_KEY` (User API key from Cursor dashboard)
3. Start runner:

```bash
npm run feature-runner:cursor
```

Windows shortcut:

```powershell
.\services\feature-sprint-runner\scripts\start-cursor-runner.ps1
```

4. Ensure `.env` has matching `EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN`

### Verify setup

```bash
npm run feature-runner:setup-check
```

The setup check reports Node compatibility, mode/flags, token presence (not values), Cursor/Codex CLI detection, worktree root, Windows shell resolution, and whether port `8127` is free or in use. Exit code is nonzero when the configured real mode cannot work.

In app: Card → Backroom → Feature Sprint → **Check runner** (step 2).

## Health payload

`GET /health` returns:

```json
{
  "ok": true,
  "mode": "cursor",
  "codexAvailable": false,
  "cursorAvailable": true,
  "setup": {
    "serverTokenRequired": true,
    "serverTokenConfigured": true,
    "missingEnv": [],
    "cli": { "detected": true, "bin": "agent", "version": "2026.06.12" },
    "platform": "win32",
    "recommendedScript": "cursor"
  },
  "port": 8127
}
```

No secrets are included in `setup`.

## Common failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Runner not running" but terminal shows listening | App token mismatch (401) | Match `EXPO_PUBLIC_*` and `FEATURE_SPRINT_RUNNER_TOKEN` |
| `cursorAvailable: false` | Missing `.env.local` keys | Use Runner setup panel or `.env.local.example` |
| `spawn EINVAL` on Windows | `.cmd` / `.ps1` agent binary | Fixed via `buildAgentSpawnSpec`; prefer `agent.cmd` |
| CLI "No version directories" | Windows installer regex | Re-run Cursor CLI install or patch `cursor-agent.ps1` version match |
| Codex smoke blocked | `codex` not on PATH | `npm install -g @openai/codex` or set `FEATURE_SPRINT_CODEX_BIN` |

## App UX

**Start feature → step 2** shows:

- Project metadata / repo path / runner status rows
- **Check runner** button
- **Runner setup** panel (auto-expanded when unhealthy)

The dogfood checklist points here when runner checks fail.

## Related docs

- [feature-sprint-local-runner-v0.1.md](./feature-sprint-local-runner-v0.1.md)
- [feature-sprint-cursor-runner-v0.1.md](./feature-sprint-cursor-runner-v0.1.md)
- [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md)
- [services/feature-sprint-runner/README.md](../services/feature-sprint-runner/README.md)
