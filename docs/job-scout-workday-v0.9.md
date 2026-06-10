# Job Scout Workday v0.9

Fixture-first support for Workday / MyWorkdayJobs external career sites as an approved Job Scout source adapter.

## Purpose

Several target employers use Workday-hosted external career sites:

- Qualcomm (`qualcomm.wd12.myworkdayjobs.com`)
- Northrop Grumman (`ngc.wd1.myworkdayjobs.com`)
- Workday corporate (`workday.wd5.myworkdayjobs.com`)

v0.9 adds a `workday` adapter kind so Source Setup can detect myworkdayjobs URLs, test through the local runner, normalize JSON job-search payloads into `JobCandidate` rows, and send them to the Queue for manual approval.

```text
myworkdayjobs site URL → local runner fetch (one URL) → JSON parse (or HTML weak-pass) → JobCandidates → Queue → approve → Inbox card
```

## Supported URL shape

```text
https://{tenant}.wd{N}.myworkdayjobs.com/{site-path}
```

Examples:

- `https://qualcomm.wd12.myworkdayjobs.com/en-US/External`
- `https://ngc.wd1.myworkdayjobs.com/Northrop_Grumman_External_Site`
- `https://workday.wd5.myworkdayjobs.com/Workday`

Prefer the main external site/search URL, not a `/job/...` detail URL.

## How parsing works

The adapter receives **one configured URL response** and parses defensively:

1. Try JSON parse of the response body
2. Discover job arrays from common keys: `jobPostings`, `jobs`, `data`, `children`, `results`
3. Map title, external path/URL, location, department, posted date, req ID, and summary fields
4. If the response is HTML (shell page), return zero postings — **weak pass**, not a crash

**No POST endpoint discovery. No pagination. No browser automation. No detail-page fetch.**

The fixture contract in `public/fixtures/sample-workday-search.json` is a **representative spike shape**, not a guaranteed live Workday API response.

## Cadence default: manual

Workday sources are **testable but adapter-limited**.

- Default cadence: **manual**
- Change to daily/weekly only after a successful candidate-producing run
- A saved Workday source that only weak-passes HTML should not clutter **Run Due**

## Zero postings = weak pass

Live myworkdayjobs site URLs often return an **HTML shell**, not JSON. A plain HTTP fetch may find no job payload.

When the adapter runs but finds zero postings, the run is a **weak pass** (not a crash):

```text
No supported Workday postings found at this URL/payload. This source may need endpoint discovery or a different Workday site path.
```

`runStatus: success`, zero candidates, informative message.

**"Detected as Workday" is not the same as "returns candidates."**

Source Setup shows an explicit banner after a weak-pass test:

> This Workday URL was recognized, but no job payload was found. It may need a future endpoint-discovery adapter before it can return candidates. Save as registry-only or keep as a manual source for now.

## Dogfood

### Fixture (reliable, no network)

Option A — **Use this example** on **Workday Fixture (local)** in Setup.

Option B — manually:

1. Paste `/fixtures/sample-workday-search.json`
2. Set kind to **Workday / MyWorkdayJobs**
3. **Test Source** → expect 2+ preview candidates
4. **Save Source** (import optional)

### Live Workday URL

1. `npm run scout:runner`
2. `npm run web`
3. Open **Setup** (`/source-setup`)
4. Paste a Qualcomm or Northrop URL → **Detect**
5. **Test Source** → may weak-pass with zero candidates if HTML shell is returned
6. **Save Source** with **manual** cadence (default)
7. **Sources** → **Run Source** manually (not Run Due unless cadence changed after a successful fixture run)
8. **Queue** → review → **Approve** manually

## Future work (out of v0.9 scope)

- JSON endpoint discovery (`/wday/cxs/...` POST payloads)
- Pagination
- Detail enrichment
- Browser automation
