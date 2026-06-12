# Life Harness v0.1

Life Harness is a local, low-friction executive-function board. v0.1 proves the core loop: open the app, see what matters, start one thing, log it, and recover when behind.

State persists locally on web via JSON snapshot (v0.5). No auth, cloud sync, or AI in the core app loop.

## Start (web)

```bash
npm install
npm run web            # starts dev launcher + Expo web (use Start runner in Sources if needed)
```

Or run the runner manually:

```bash
npm run scout:runner   # local Job Scout runner on 127.0.0.1:8122
npm run web            # if not using the combined script above
```

Other targets: `npm run android`, `npm run ios`.

Navigation is grouped into **Primary** (Today, Board, Jobs, Playback), **Career Tools** (Bank), and **Backroom** (Companion, Replay, Raw Signal, Tape Archive, Log, Setup) surfaces. Job discovery and review live on **Jobs** (`/career`) — see [`docs/career-full-pipeline-ux-v0.14.md`](docs/career-full-pipeline-ux-v0.14.md).

The core app loop remains rules-only. Companion, Raw Signal, and Deep Synthesis are optional local ai-gateway surfaces; the board still works without starting ai-gateway.

Job Scout approved-source fetching uses the local runner in v0.4. Without `npm run scout:runner`, **Sources → Run Source** shows a start-runner message (no browser fetch fallback).

Use **Setup** (`/source-setup`) to paste a careers URL, detect the adapter shape, dry-run test, and save — see [`docs/job-scout-source-setup-v0.7.md`](docs/job-scout-source-setup-v0.7.md). GovernmentJobs / NEOGOV `/careers/{agency}` URLs are supported in v0.8 — see [`docs/job-scout-governmentjobs-v0.8.md`](docs/job-scout-governmentjobs-v0.8.md). Workday / MyWorkdayJobs is supported in v0.9 (fixture-first; live page URLs may weak-pass) — see [`docs/job-scout-workday-v0.9.md`](docs/job-scout-workday-v0.9.md). Workday endpoint capture (manual DevTools POST body) is supported in v0.10 — see [`docs/job-scout-workday-endpoint-v0.10.md`](docs/job-scout-workday-endpoint-v0.10.md). v0.11 adds bounded Workday pagination, source health, and endpoint templates — **restart `npm run scout:runner` after upgrading** — see [`docs/job-scout-workday-pagination-health-v0.11.md`](docs/job-scout-workday-pagination-health-v0.11.md). v0.12 adds Career Source Pack paste-import, queue matching, and filters — see [`docs/career-source-pack-import-v0.12.md`](docs/career-source-pack-import-v0.12.md).

## Verify

```bash
npm run typecheck
npm run test
npm run scout:runner:test
npx expo export --platform web
```

## Dogfood loop

1. Open **Today**
2. Click **Pounce** (career pounce)
3. Use **Paste** (Candidate Intake) or **Intake** to add a job (candidate queue or direct application card)
3b. Or open **Setup**, paste a Greenhouse/Lever/Ashby or GovernmentJobs `/careers/{agency}` URL, detect, test, and save (v0.7–v0.8). For offline adapter testing, use the GovernmentJobs Fixture example in Setup.
4. Start **`npm run scout:runner`**, open **Sources**, set a source cadence to **Daily**, and click **Run Due Sources**
5. Review fit in **Queue**, approve to Inbox when ready
6. **Refresh browser** — candidates, source runs, and cards should persist (v0.5)
7. Log one sentence in **Quick Capture** (e.g. `applied to Acme` or `worked on Life Harness`)
8. **Park** one card (capture: `park local llm` or use Board state buttons)
9. Use **Minimum Viable Day** or **Salvage Mode**
10. Check **Progress** (due/runnable stats, Proof Shelf) and export/import JSON under **Local Data**

## v0.1 success metric

Did this make me start, recover, or feel less scattered?

## Manual test checklist

- While You Were Away shows computed briefing (max 5 bullets)
- Pounce / MVD / Salvage show a single top notice with XP feedback
- Quick Capture: empty input warns; success clears input; no-match keeps input with hint
- `new idea: test idea` creates Inbox card
- `worked on rpg` logs a build win
- `park local llm` parks Local LLM Setup
- Board and Today show **Active 4/3** banner when over limit
- Activating a 5th card is blocked with a warning
- Waiting card (Qualcomm Follow-up) shows soft "cooled while waiting" copy in briefing
- Progress: warmth, cold/dormant, proof shelf distinct from Log
- Sources: due badges, Run Due / Run All batch buttons, cadence edit
- Setup: URL detect, dry-run test preview, save registry-only Workday targets without test; GovernmentJobs careers detect + fixture example

## Known limitations

- Web-local JSON persistence only (native requires future adapter)
- No Supabase, auth, or cloud sync
- No AI in core app loop, notifications, or integrations
- Log edit is a placeholder
- Scheduled background fetching is locked (v0.6 adds manual batch due/all only)

## Docs

| Doc | Purpose |
|-----|---------|
| [`docs/README.md`](docs/README.md) | Full documentation index |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Dev setup and verify commands |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution and agent workflow |
| [`CHANGELOG.md`](CHANGELOG.md) | What shipped and when |
| [`AGENTS.md`](AGENTS.md) | Agent rules and product constraints |

**Product:** [`docs/02_v0_1_scope.md`](docs/02_v0_1_scope.md), [`docs/career-command-board-v0.1.md`](docs/career-command-board-v0.1.md), [`docs/career-hub-v0.1.md`](docs/career-hub-v0.1.md).

**AI workflow map:** [`docs/ai-workflows-current.md`](docs/ai-workflows-current.md) records the current Companion, Deep Synthesis, Raw Signal, memory, and provider boundaries.

**Job Scout:** foundation v0.2 through Workday pagination v0.11 — linked from the docs index.

## Dev: Ask Harness (optional)

Read-only bridge from the board to local ai-gateway Chat Harness. Start ai-gateway on port 8111, then open **Companion** in Backroom. See [`docs/ask-harness-v0.1.md`](docs/ask-harness-v0.1.md) and [`docs/ai-workflows-current.md`](docs/ai-workflows-current.md).

## Dev: Raw Lab (optional)

Isolated unrestricted sandbox, labeled **Raw Signal** in the app: no board context, no board persistence, no mutation path. Start ai-gateway, then open **Raw Signal** in Backroom. See [`docs/raw-lab-thread-state.md`](docs/raw-lab-thread-state.md), [`docs/ai-workflows-current.md`](docs/ai-workflows-current.md), and root `AGENTS.md` Raw Lab section.
