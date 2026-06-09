# Job Scout Run Due v0.6

Manual batch orchestration for due and enabled job sources using persisted state and the local Job Scout Runner.

## Purpose

v0.6 moves one step closer to automated scouting without background scheduling:

```text
persisted JobSources + JobSourceRuns
  → compute due daily/weekly sources
  → user clicks Run Due Sources or Run All Enabled
  → sequential local runner calls
  → candidates in Queue
  → user approves manually
```

This is **not** cron, a daemon, or scheduled background fetching. The **Scheduled source fetching** use-before-improve lock remains locked until 5 successful manual source runs.

## Why this is not real scheduling yet

- No OS task, cron, or background service
- User must open Sources (or Today) and click a batch button
- Runner must be running (`npm run scout:runner`)
- Results persist via v0.5 JSON snapshot (web-local)

Real scheduled fetching is a future milestone after more manual-run dogfood.

## Due-source model

| Cadence | Run Due | Run All Enabled | Single Run Source |
|---------|---------|-----------------|-------------------|
| `manual` | Excluded | Included if runnable | Included if runnable |
| `daily` | Due when never run or interval ≥ 1 day | Included if runnable | Included if runnable |
| `weekly` | Due when never run or interval ≥ 7 days | Included if runnable | Included if runnable |

**Runnable** means enabled + supported adapter kind + valid URL (`canRunJobSource`). `company_careers` registry entries are not runnable.

**Due** applies only to daily/weekly runnable sources:

- Missing or invalid `lastRunAt` → **due** (corrupt timestamps must not hide a source forever)
- Otherwise due when days since last run ≥ cadence interval
- Failed/error runs can become due again after the interval elapses

## Run Due vs Run All Enabled

| Action | Target set |
|--------|------------|
| **Run Due Sources** | Enabled runnable daily/weekly sources that are due |
| **Run All Enabled Sources** | All enabled runnable sources (includes manual cadence) |

Both run **sequentially** (one source at a time) to avoid hammering sources and keep UI state simple.

If **Run All** would run more than 3 sources, the app asks for confirmation first.

## Safety boundaries

- No application cards created automatically — approval flow unchanged
- No AI matching, resume generation, or auto-apply
- Local runner only (`127.0.0.1:8122`) — same as v0.4
- **Runner unreachable:** record one error run for the current source, then **stop the batch**. Remaining sources are not marked failed (avoids polluting run history)
- Per-source fetch errors: record error run and **continue** batch
- Batch state uses a single accumulator with `state_replaced` dispatches and v0.5 persistence

## Core helpers

[`src/core/jobSourceSchedule.ts`](../src/core/jobSourceSchedule.ts):

- `getSourceRunIntervalDays`, `isJobSourceDue`, `getDueJobSources`, `getRunnableJobSources`
- `buildSourceScheduleStats`, `buildRunAllSummary`, `formatRunBatchNotice`
- `getSourceDueBadge` for UI labels (Due / Not due / Manual only / Unsupported / Disabled)

## UI surfaces

| Screen | What changed |
|--------|--------------|
| **Sources** | Due Sources section, Run Due / Run All buttons, per-source schedule badge, cadence edit |
| **Today** | Briefing mentions due sources; link shows due count when > 0 |
| **Progress** | Runnable/due/failed run stats; lock copy for manual-run vs scheduled |

## Dogfood steps

```bash
npm run scout:runner   # terminal 1
npm run web            # terminal 2
```

1. Open **Sources** and edit Local Fixture Source cadence to **Daily**
2. Click **Run Due Sources** (or **Run All Enabled Sources**)
3. Open **Queue** — candidates show **Source Fetch**
4. **Approve** one candidate → Inbox application card
5. **Refresh browser** — candidates, runs, and cards persist (v0.5)
6. Export/import JSON from Progress **Local Data** if desired

## Future path

- Persisted scheduled runner process (after scheduled lock clears)
- Backend/daemon scheduling with health checks
- AI-assisted matching (separate lock)
- Never auto-apply without explicit approval

## Explicit non-goals

- Cron / background daemon / OS scheduled tasks
- Supabase, auth, cloud sync
- AI matching or chatbot memory
- Browser automation or multi-page crawling
- Changes to `services/ai-gateway/`

## Run locally

```bash
npm run typecheck
npm run test
npm run scout:runner:test
```
