# Life Harness v0.1

Life Harness is a local, low-friction executive-function board. v0.1 proves the core loop: open the app, see what matters, start one thing, log it, see progress, and recover when behind.

Everything runs in memory with seed data. No auth, cloud sync, or AI.

## Start (web)

```bash
npm install
npm run scout:runner   # terminal 1 — local Job Scout runner on 127.0.0.1:8122
npm run web            # terminal 2
```

Other targets: `npm run android`, `npm run ios`.

Job Scout approved-source fetching uses the local runner in v0.4. Without `npm run scout:runner`, **Sources → Run Source** shows a start-runner message (no browser fetch fallback).

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
4. Start **`npm run scout:runner`**, open **Sources**, and **Run Source** on Local Fixture Source
5. Review fit in **Queue**, approve to Inbox when ready
6. Log one sentence in **Quick Capture** (e.g. `applied to Acme` or `worked on Life Harness`)
7. **Park** one card (capture: `park local llm` or use Board state buttons)
8. Use **Minimum Viable Day** or **Salvage Mode**
9. Check **Progress** and **Proof Shelf**

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

## Known limitations

- In-memory only — state resets on full app reload
- No persistence, Supabase, auth, or sync
- No AI, notifications, or integrations
- Log edit is a placeholder
- Leaks / savings on Progress is a placeholder

## Docs

See `AGENTS.md`, [`docs/career-command-board-v0.1.md`](docs/career-command-board-v0.1.md), [`docs/job-scout-foundation-v0.2.md`](docs/job-scout-foundation-v0.2.md), [`docs/job-scout-approved-sources-v0.3.md`](docs/job-scout-approved-sources-v0.3.md), [`docs/job-scout-runner-v0.4.md`](docs/job-scout-runner-v0.4.md), and `docs/` for product rules and scope.

## Dev: Ask Harness (optional)

Read-only bridge from the board to local ai-gateway Chat Harness. Start ai-gateway on port 8111, then open **Ask Harness Dev** in the app nav. See [`docs/harness-context-export-v0.1.md`](docs/harness-context-export-v0.1.md).
