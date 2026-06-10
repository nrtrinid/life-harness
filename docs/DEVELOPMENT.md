# Development Guide

Technical setup and day-to-day commands for Life Harness / Momentum Board.

**Product context:** [`README.md`](../README.md) · **Agent rules:** [`AGENTS.md`](../AGENTS.md) · **Doc index:** [`README.md`](./README.md)

## Prerequisites

| Tool | Version (approx.) | Used for |
|------|-------------------|----------|
| Node.js | 20+ | Expo app, Job Scout runner |
| npm | 10+ | Package management |
| Python | 3.11+ | `services/ai-gateway` (optional) |
| Git | any | Version control |

Optional for local AI on Intel Arc A770: OpenVINO GenAI, GPU drivers, ~5GB model download — see [`local-a770-plan.md`](./local-a770-plan.md).

## Quick start (web dogfood)

**Terminal 1 — Job Scout runner** (required for Sources / Fit Finder):

```bash
npm install
npm run scout:runner
```

**Terminal 2 — Expo web:**

```bash
npm run web
```

Open the URL Expo prints (usually `http://localhost:8081`).

## Optional: local AI gateway

**Terminal 3 — ai-gateway** (only for Ask / Raw Lab):

```powershell
cd services/ai-gateway
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
$env:SCOUT_PROVIDER="mock"     # or openvino with model path
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

Then open **Ask** or **Raw Lab** in the app. Default gateway URL: `http://127.0.0.1:8111`.

## Verify (run before finishing a task)

```bash
npm run typecheck
npm run test
npm run scout:runner:test
```

Gateway (from `services/ai-gateway`):

```bash
SCOUT_PROVIDER=mock pytest
pytest tests/test_thread_eval_fixtures.py -q
```

Web build smoke:

```bash
npx expo export --platform web
```

## Project layout

```text
app/                    Expo Router screens
src/
  components/           UI (Nav, CardTile, askHarness/*, rawLab/*)
  core/                 Product logic — keep UI-independent
  data/                 Seed data
  state/                LifeHarnessProvider reducer
  storage/              JSON persistence (web localStorage)
services/
  ai-gateway/           Optional local LLM gateway (Python)
  job-scout-runner/     Approved-source fetch runner (Node)
docs/                   Product + slice documentation
tickets/                Completed v0.1 implementation tickets
```

Core rule: **board logic lives in `src/core/`**, not in React components.

## Common tasks

### Reset local state

Use **Progress → Local Data → Reset to seed** in the app, or clear browser `localStorage` for the Expo web origin.

### Export / import board JSON

**Progress → Local Data** — exports versioned `LifeHarnessData` envelope (`schemaVersion: 1`, 10 slices). See [`persistence-audit-v0.5.md`](./persistence-audit-v0.5.md).

### Add a Job Scout adapter

1. Read latest job-scout slice doc in [`docs/README.md`](./README.md).
2. Implement adapter in `src/core/jobSourceAdapters.ts` + runner mirror if needed.
3. Add tests in `src/core/jobSourceAdapters.test.ts` / runner tests.
4. Document in new `docs/job-scout-*-v0.N.md` slice.

### Extend Ask / Chat Harness

1. Read [`ask-harness-v0.1.md`](./ask-harness-v0.1.md) and [`conversation-thread-intelligence.md`](./conversation-thread-intelligence.md).
2. App changes: `src/core/harnessContext.ts`, `chatHarnessClient.ts`, `chatThreadState.ts`.
3. Gateway changes: `services/ai-gateway/app/` + pytest contracts.
4. Never weaken S3 routing or Raw Lab containment (root `AGENTS.md`).

## Environment notes

| Surface | Default port | Notes |
|---------|--------------|-------|
| Expo web | 8081 | Metro bundler |
| Job Scout runner | 8122 | `127.0.0.1` only |
| ai-gateway | 8111 | `127.0.0.1` only |
| Android emulator → gateway | 8111 via `10.0.2.2` | Ask advanced panel |

## Debugging tips

- **Sources show runner error:** start `npm run scout:runner` in a separate terminal.
- **Ask shows connection error:** confirm gateway health at `http://127.0.0.1:8111/health`.
- **Persistence lost on refresh:** check browser localStorage; native persistence not implemented yet.
- **Active 4/3 banner:** intentional seed demo — park a card to get under limit.

## Related

- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — workflow and guardrails
- [`CHANGELOG.md`](../CHANGELOG.md) — release history
- [`07_tech_stack_and_architecture.md`](./07_tech_stack_and_architecture.md) — routes and module inventory
