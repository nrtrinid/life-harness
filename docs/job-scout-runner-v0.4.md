# Job Scout Local Runner v0.4

Move approved-source fetching out of the browser and into a local Node service while preserving the approval boundary.

## Why the runner exists

v0.3 fetched sources from the Expo/web client. That hit CORS limits and could not become a reliable automation runner. v0.4 adds a **local service** on `127.0.0.1:8122` that:

- Fetches exactly one configured URL per run
- Reuses existing adapters and deterministic matching
- Returns `JobCandidate` rows with `origin: "source_fetch"`
- Never creates application cards or auto-applies

```text
Expo UI → POST /run-source → Local Runner → adapters → JobCandidate queue → user approves → Inbox card
```

## Architecture

| Layer | Responsibility |
|-------|----------------|
| [`app/job-sources.tsx`](../app/job-sources.tsx) | User clicks Run Source; calls runner client |
| [`src/core/jobScoutRunnerClient.ts`](../src/core/jobScoutRunnerClient.ts) | POST to local runner |
| [`services/job-scout-runner/`](../services/job-scout-runner/) | DNS-safe fetch, size limits, normalize |
| [`src/core/jobSourceRunner.ts`](../src/core/jobSourceRunner.ts) | Dedupe, scoring, run metadata |
| [`src/core/actions.ts`](../src/core/actions.ts) | `recordJobSourceRun` — app state only |

## Endpoints

### GET /health

```json
{ "status": "ok", "service": "job-scout-runner", "version": "0.4", "mode": "local" }
```

### POST /run-source

Request:

```json
{ "source": JobSource, "existingCandidates": JobCandidate[], "resumeModules": ResumeModule[] }
```

Response (always for valid POST bodies — operational errors use HTTP 200):

```json
{
  "result": JobSourceRunResult,
  "candidates": JobCandidate[],
  "updatedSourcePatch": Partial<JobSource>
}
```

| Case | HTTP |
|------|------|
| Malformed JSON / missing fields | 400 |
| Fetch/DNS/parse/validation errors | 200 with `result.errors` |
| Success / dedupe-only run | 200 |

## Safety boundaries

- Bind **127.0.0.1** only
- **DNS resolve** before network fetch; block private/internal/link-local/metadata IPs
- Block literal private hostnames and IPs in URLs
- **Stream-read** response bodies with hard **2 MB** cap (do not trust Content-Length alone)
- **20s** timeout
- Fixture paths: `/fixtures/<file>` → `public/fixtures/` only; no `..` traversal
- Log source id/name, hostname, resolved IPs, byte size, counts — not full descriptions

## Dev fixture

Seed source **Local Fixture Source** uses `/fixtures/sample-greenhouse.json`. Works when the runner reads from repo `public/fixtures/`.

## Dogfood

```bash
npm run scout:runner   # terminal 1
npm run web            # terminal 2
```

1. Open **Sources**
2. **Run Source** on Local Fixture Source
3. Open **Queue** — candidates show **Source Fetch**
4. **Approve** one → Inbox application card
5. Re-run source → duplicates skipped

If runner is not running, the app shows:

`Local Job Scout Runner is not running. Start it with npm run scout:runner.`

There is **no browser fetch fallback**.

## Explicit non-goals

- Scheduled fetching
- AI matching or chatbot
- Supabase/auth/sync
- Browser automation
- Multi-page crawling
- CAPTCHA bypass / login scraping
- Auto-apply
- Changes to `services/ai-gateway/`

## Future

- Scheduled runner (after 5 successful manual runs lock clears)
- Persistent run history
- Source health checks
- AI-assisted matching (separate lock)
