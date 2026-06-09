# Job Scout Runner (v0.4)

Local approved-source fetching service for Life Harness. Binds to **127.0.0.1:8122** only.

## Quickstart

From repo root:

```bash
npm install
npm run scout:runner
```

In another terminal:

```bash
npm run web
```

Then open **Sources** and **Run Source** on **Local Fixture Source**.

## Endpoints

- `GET /health` — service status
- `POST /run-source` — fetch one approved source URL, normalize, return JobCandidates

## Safety

- DNS resolution before fetch; blocks private/internal/link-local targets
- Streaming 2 MB response cap
- 20s fetch timeout
- `/fixtures/*` reads from `public/fixtures/` only (no path traversal)
- No crawling, no browser automation, no auto-apply

## Tests

```bash
npm run scout:runner:test
```

See [docs/job-scout-runner-v0.4.md](../../docs/job-scout-runner-v0.4.md).
