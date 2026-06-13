# Job Scout iCIMS v0.12

Listing-page support for iCIMS-hosted career portals as an approved Job Scout source adapter.

## Purpose

Several target employers use iCIMS career portals (e.g. Viasat at `careers-viasat.icims.com`). v0.12 adds an `icims` adapter kind so Source Setup can detect `*.icims.com` URLs, test through the local runner, parse search listing HTML into `JobCandidate` rows, and send them to the Queue for manual approval.

```text
icims.com search URL → local runner fetch (one URL) → HTML parse → JobCandidates → Queue → approve → Inbox card
```

## Supported URL shape

```text
https://{tenant}.icims.com/jobs/search?ss=1&in_iframe=1
```

Examples:

- `https://careers-viasat.icims.com/jobs/search?ss=1&in_iframe=1`
- `https://careers-qualcomm.icims.com/jobs/search`

Source Setup canonicalizes search URLs with `ss=1` and `in_iframe=1`.

Prefer the `*.icims.com` search URL, not the marketing site (`careers.viasat.com`).

## How parsing works

The adapter receives **one configured URL response** and parses defensively:

1. Skip redirect-shell HTML (`window.top.location.href`)
2. Parse `iCIMS_Anchor` job links matching `/jobs/{id}/...`
3. Extract title (from `title` attr or `<h3>`), location, and listing snippet when present
4. Compose a thin description for deterministic fit scoring

**No pagination. No detail-page fetch. No `api.icims.com` credentials.**

## Cadence default: manual

iCIMS sources default to **manual** cadence. Change to daily/weekly only after a successful candidate-producing run.

## Zero postings = weak pass

Some portals redirect bare server fetches to a marketing site (JavaScript redirect shell). When the adapter runs but finds zero postings:

```text
No iCIMS listings found at this URL. The portal may redirect outside iframe mode — use the *.icims.com search URL with in_iframe=1.
```

`runStatus: success`, zero candidates, informative message.

## Dogfood

### Fixture (reliable, no network)

1. `npm run scout:runner` + `npm run web`
2. Open **Setup** (`/source-setup`)
3. Use **iCIMS Fixture (local)** example or paste `/fixtures/sample-icims-listing.html`
4. **Test Source** → expect 2+ preview candidates
5. **Save Source** → **Sources** → **Run Source** → **Queue** → **Approve**

### Live iCIMS URL

1. Paste `https://careers-viasat.icims.com/jobs/search?ss=1&in_iframe=1`
2. **Test Source** — may weak-pass if the portal returns a redirect shell to the marketing site
3. If weak-pass, keep as manual cadence or use paste intake for individual postings

## Starter pack sources

| ID | Name | Kind |
|----|------|------|
| `source-qualcomm-workday-cxs` | Qualcomm — Workday CXS | workday |
| `source-viasat-icims` | Viasat — iCIMS | icims |

## Non-goals

- `api.icims.com` authenticated Job Portal API
- Pagination across listing pages
- Per-job detail enrichment
- Browser automation or session cookies
- Auto-apply

## Related docs

- [`job-scout-workday-endpoint-v0.10.md`](job-scout-workday-endpoint-v0.10.md) — Qualcomm Workday CXS
- [`job-scout-source-setup-v0.7.md`](job-scout-source-setup-v0.7.md) — Setup wizard
- [`job-scout-runner-v0.4.md`](job-scout-runner-v0.4.md) — Local runner
