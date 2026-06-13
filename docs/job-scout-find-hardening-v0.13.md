# Job Scout Find Hardening v0.13

## Scope

Hardening for Jobs board **Find → Review** — runner gating, honest weak-pass feedback, health-aware batching, and curated source packs. Scheduled fetch remains **manual-click batch only** (no background daemon or cron).

## Runner gate

Batch run actions (Run healthy, Run all, Run due, Find fit matches) require the local Job Scout Runner on `127.0.0.1:8122`. The app polls `/health` with a 30s session cache. Dev: `npm run web` starts the launcher (`8123`) which can start the runner.

## Batch defaults

- **Run healthy sources** (primary): enabled + runnable + health `healthy`, `stale`, or `never_run`; excludes `weak_pass` and `error`. Respects **core/full pack** filter.
- **Run all enabled** (secondary): all enabled runnable sources; confirm when count > 5.

## Weak-pass honesty

A source run that completes without errors but creates zero candidates is a **weak-pass**. Batch notices report produced vs weak-pass vs failed counts.

## Source packs

- **Core pack**: Greenhouse/Lever/Ashby tech boards, Northrop Workday CXS, SoCal GovernmentJobs.
- **Full pack**: core + speculative feeds (Qualcomm Workday CXS, Viasat iCIMS — disabled by default until health is proven).

Toggle on Sources updates `jobSourcePackMode` and enables/disables full-only seed sources.

## Scheduled run unlock

`checkJobScoutLocks` — scheduled fetching unlocks after 5 successful manual source runs. Cadence `daily`/`weekly` in Source Setup requires a prior candidate-producing preview (not weak-pass) and healthy source health when editing existing sources.

## Workday CXS derive

Source Setup / discovery suggests `https://{host}/wday/cxs/{tenant}/{site}/jobs` from a MyWorkdayJobs site URL. **Never auto-saved** — user must Test Source first.
