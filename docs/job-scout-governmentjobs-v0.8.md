# Job Scout GovernmentJobs v0.8

First-class support for GovernmentJobs / NEOGOV public-sector career listing pages as an approved Job Scout source adapter.

## Purpose

Several target public-sector boards use GovernmentJobs / NEOGOV:

- County of San Diego
- City of San Diego
- Los Angeles County
- Orange County (and other city/county boards)

v0.8 adds a `governmentjobs` adapter kind so Source Setup can detect `/careers/{agency}` URLs, test through the local runner, normalize listings into `JobCandidate` rows, and send them to the Queue for manual approval.

```text
/careers/{agency} URL → local runner fetch (one URL) → HTML parse → JobCandidates → Queue → approve → Inbox card
```

## Supported URL shape

```text
https://www.governmentjobs.com/careers/{agency}
```

Examples:

- `https://www.governmentjobs.com/careers/sdcounty`
- `https://www.governmentjobs.com/careers/sandiego`
- `https://www.governmentjobs.com/careers/lacounty`
- `https://www.governmentjobs.com/careers/oc`

Do **not** use print or search URLs (e.g. `/jobs/newprint/...`) as the configured source URL.

## How parsing works

The adapter receives **HTML from exactly one configured URL** and parses defensively:

1. `li.list-item` blocks (NEOGOV-style listing rows)
2. Fallback job links matching `/careers/{agency}/jobs/` only (not broad `/jobs/` paths)
3. Embedded JobPosting JSON-LD if present

Fields composed into each candidate description when available: title, location, salary, department, job type, closing date, snippet.

**No detail-page fetch. No pagination. No crawling.**

## Zero listings = weak pass

Live `/careers/{agency}` pages may be JavaScript-rendered. A plain HTTP fetch can return shell HTML with no static listings.

When the adapter runs but finds zero rows, the run is a **weak pass** (not a crash):

```text
No static GovernmentJobs listings found. This page may require a future XHR/pagination adapter.
```

`runStatus: success`, zero candidates, informative message.

## Dogfood

### Live agency URL

1. `npm run scout:runner`
2. `npm run web`
3. Open **Setup** (`/source-setup`)
4. Paste `https://www.governmentjobs.com/careers/sdcounty` → **Detect**
5. **Test Source** → preview candidates (may be zero on live JS-rendered pages)
6. **Save Source** (import checkbox off by default)
7. **Sources** → **Run Source** / **Run Due**
8. **Queue** → review → **Approve** manually

### Fixture (reliable, no network)

The fixture path does **not** auto-detect as GovernmentJobs from URL alone.

Option A — **Use this example** on **GovernmentJobs Fixture (local)** in Setup.

Option B — manually:

1. Paste `/fixtures/sample-governmentjobs-listing.html`
2. Set kind = **GovernmentJobs / NEOGOV**
3. **Test Source**

## Limitations (v0.8)

- Listing page only — no job detail enrichment
- No pagination or saved-search support
- No login, CAPTCHA bypass, or browser automation
- HTML structure may change
- Live pages may return zero static listings until a future XHR/pagination adapter

## Future

- Detail page enrichment
- Pagination / XHR listing API support
- Saved searches / keyword filters
- Source health checks

## Related docs

- [`job-scout-source-setup-v0.7.md`](job-scout-source-setup-v0.7.md)
- [`job-scout-runner-v0.4.md`](job-scout-runner-v0.4.md)
- [`job-scout-run-due-v0.6.md`](job-scout-run-due-v0.6.md)
