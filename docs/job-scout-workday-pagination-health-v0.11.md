# Job Scout Workday Pagination, Source Health, and Endpoint Templates v0.11

Bounded Workday offset pagination, derived source health, and endpoint templates for known working patterns — building on v0.10 live POST support.

## Restart the runner after upgrading to v0.11

**Pagination runs inside the local runner.** A stale runner process will not paginate.

```bash
npm run scout:runner
```

Restart this process after pulling v0.11 before dogfooding pagination.

## Purpose

- Fetch more than one page from Workday CXS POST endpoints (bounded, sequential).
- Classify source health from run history (healthy, weak-pass, error, stale, never run).
- Provide Northrop and fixture endpoint templates so dogfood does not require re-pasting DevTools capture every time.
- Surface weak-pass Workday sources that still need endpoint capture.

## Northrop dogfood result

Live Northrop CXS endpoint (no cookies):

- URL: `https://ngc.wd1.myworkdayjobs.com/wday/cxs/ngc/Northrop_Grumman_External_Site/jobs`
- Method: `POST`
- Body: `{ "appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "" }`
- Result: **20 candidates** on offset 0

## Workday pagination model

Optional `requestConfig.pagination`:

```json
{
  "mode": "workday_offset",
  "limit": 20,
  "maxPages": 3,
  "maxResults": 50
}
```

### Single effective cap

```text
effectiveMaxResults = pagination.maxResults ?? source.maxResults ?? 50
```

Used for both the pagination loop stop and candidate finalization — no second lower cap.

### Rules

- Default: no pagination (`pagination` absent or `mode: "none"`).
- `workday_offset` requires `POST` and object `bodyJson`.
- Each page sets `bodyJson.limit` and `bodyJson.offset` sequentially.
- Stop when:
  - parsed postings on page &lt; `limit` (uses raw array count, before candidate dedupe)
  - zero postings on page
  - `maxPages` reached
  - accumulated parsed postings ≥ `effectiveMaxResults`
  - fetch error
- Pages run **sequentially**; results are merged and deduped.

`JobSourceRunResult` may include `pagesFetched` and `paginationStoppedReason`.

## Source health statuses

Derived from `jobSourceRuns` (sorted by `fetchedAt`, not array order):

| Status | Rule |
|--------|------|
| Never run | No runs for source |
| Error | Latest run has errors |
| Weak-pass | Latest run succeeded with 0 candidates |
| Stale | Latest candidate-producing run older than 14 days |
| Healthy | Latest run created ≥1 candidate and is recent |

Weak-pass Workday sources show: *Recognized Workday source, but no candidate payload found. Endpoint capture or endpoint template may be needed.*

## Endpoint templates

In Source Setup → Workday endpoint templates:

1. **Northrop Grumman — Workday CXS** — runnable live endpoint; pagination default enabled (limit 20, maxPages 3).
2. **Workday Endpoint Fixture** — `/fixtures/sample-workday-cxs-response.json`; pagination off.
3. **Qualcomm — Workday** — guide only. *Qualcomm needs exact DevTools CXS endpoint capture.*

Templates live in `src/data/workdayEndpointTemplates.ts`.

## Dogfood steps

1. **Restart the runner:** `npm run scout:runner`
2. Start app: `npm run web`
3. **Setup** → **Use Northrop endpoint template**
4. **Test Source**
5. Enable pagination, set maxPages 3
6. **Save** (manual cadence)
7. **Sources** → **Run Source**
8. **Queue** → approve candidates manually
9. **Progress** → Source Health shows Northrop as Healthy
10. Re-run with pagination; confirm multiple pages when source returns enough data
11. No application card until approval

## Qualcomm note

Qualcomm page URL and guessed CXS path may still weak-pass. Paste the exact DevTools CXS endpoint before expecting candidates.

## Non-goals

- Browser automation
- Cookies / auth / session / CSRF
- Automatic endpoint discovery
- AI matching or auto-apply
- Scheduled background runner

## Future

- Endpoint discovery helper (manual-assisted)
- Detail page enrichment
- Source health dashboard
- Scheduled runner integration
