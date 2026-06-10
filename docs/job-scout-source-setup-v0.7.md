# Job Scout Source Setup v0.7

Help configure job sources that work with the existing Job Scout runner — without crawling, AI browsing, or auto-apply.

## Purpose

v0.3–v0.6 added approved-source fetching, the local runner, persistence, and Run Due / Run All. Users still had to know which URL shape each adapter expects.

v0.7 adds a **Source Setup Wizard** (`/source-setup`):

```text
paste URL → detect kind + runnable URL → test (dry-run) → preview candidates → save source
```

Optional: import preview candidates on save (explicit opt-in only).

## Supported source URL shapes

| Adapter | Direct API URL | Hosted page (derived) |
|---------|----------------|------------------------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` | `boards.greenhouse.io/{slug}` |
| Lever | `api.lever.co/v0/postings/{company}?mode=json` | `jobs.lever.co/{company}` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | `jobs.ashbyhq.com/{org}` |
| JobPosting JSON-LD | Any other valid http(s) page (low confidence) | — |

Query params on Lever/Ashby URLs are set with `URL.searchParams` — existing params are preserved; duplicates are avoided.

## How detection works

Detection is **URL-shape only**. It does not fetch.

Order (critical):

1. Greenhouse patterns
2. Lever patterns
3. Ashby patterns
4. **Unsupported domain block** (before generic fallback)
5. Generic `jobposting_jsonld` for other valid http(s) URLs
6. Invalid URL → non-runnable warning

### Unsupported families (registry-only)

These are detected as `company_careers`, `isRunnable: false`:

- Workday / `myworkdayjobs` (e.g. Northrop, Qualcomm career sites)
- GovernmentJobs / NEOGOV
- iCIMS
- Microsoft careers / apply
- LinkedIn
- Indeed

You can still **Save Source** as a target list entry. Test Source, Run Source, and Run Due stay disabled until an adapter exists.

## Dry-run test vs save vs import

| Action | Effect |
|--------|--------|
| **Test Source** | POST to local runner; preview in UI only — **no state write** |
| **Save Source** (default) | Adds `JobSource` only |
| **Save + "Also import preview candidates"** | Saves source and runs `recordJobSourceRun` with rebound preview output |

The import checkbox is hidden until a successful test preview exists. Default: **unchecked**.

## Safety / non-goals

- No crawling or multi-page retrieval
- No login scraping or CAPTCHA bypass
- No LinkedIn/Indeed scraping
- No AI matching or chatbot
- No scheduled background runner (cadence labels are metadata only in v0.7)
- No auto-apply or auto-email
- No browser fetch fallback when runner is unreachable

If the runner is not running:

```text
Local Job Scout Runner is not running. Start it with npm run scout:runner.
```

## Dogfood

1. `npm run scout:runner` (terminal 1)
2. `npm run web` (terminal 2)
3. Open **Setup** (`/source-setup`)
4. Paste a Greenhouse, Lever, or Ashby hosted URL → **Detect**
5. **Test Source** — preview candidates, fit tiers, errors
6. **Save Source** (leave import unchecked unless you want queue entries now)
7. Open **Sources** → **Run Due Sources** or **Run All Enabled**
8. Review **Queue** (`/job-candidates`)

Example reference URLs live on the Setup screen under "Example sources to try" — test before saving.

## Future adapters

Planned registry targets (not in v0.7):

- GovernmentJobs / NEOGOV
- Workday
- iCIMS
- CalCareers / CalOpps
- Microsoft / static HTML career pages

## Related docs

- [`job-scout-approved-sources-v0.3.md`](job-scout-approved-sources-v0.3.md)
- [`job-scout-runner-v0.4.md`](job-scout-runner-v0.4.md)
- [`job-scout-run-due-v0.6.md`](job-scout-run-due-v0.6.md)
