# Feature Sprint Runner Setup v0.1

## What this adds

Structured runner setup diagnostics and in-app guidance for the Feature Sprint local runner:

- Richer `GET /health` payload with non-secret `setup` metadata
- Clear failure kinds: unreachable, unauthorized (token mismatch), misconfigured, agent unavailable
- **Runner setup** panel in Start feature step 2 with copy-paste commands
- One-command dev scripts for mock and Cursor modes

Manual import/save/advance gates are unchanged.

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

With runner running:

```bash
npm run feature-runner:setup-check
```

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
| `spawn EINVAL` on Windows | `.cmd` agent binary | Fixed via `buildAgentSpawn`; install CLI with Cursor installer |
| CLI "No version directories" | Windows installer regex | Re-run Cursor CLI install or patch `cursor-agent.ps1` version match |

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
