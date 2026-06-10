# Job Scout Workday Endpoint v0.10

Manual endpoint capture for Workday / MyWorkdayJobs sources. When a careers page URL returns an HTML shell (v0.9 weak-pass), the user can paste the JSON search endpoint and request body captured from DevTools.

## Why v0.9 weak-passed live pages

Live Qualcomm and Northrop Workday page URLs detect correctly but fetch HTML, not job JSON. v0.9 could parse JSON when present but had no way to reach the hidden CXS/search endpoint.

v0.10 adds **endpoint-backed mode**: user supplies endpoint URL + safe JSON POST body; local runner fetches and existing Workday adapter normalizes candidates.

## Manual DevTools capture

1. Open the Workday career page in a browser.
2. Open DevTools → **Network**.
3. Filter **XHR** or **Fetch**.
4. Search or refresh jobs on the page.
5. Find the JSON job search request (often `/wday/cxs/.../jobs`).
6. Copy the **request URL**.
7. Copy the **JSON request payload** only (Request body tab).
8. Do **not** copy cookies, Authorization, CSRF, or session headers.
9. Paste into Source Setup → **Use endpoint mode**.

## Supported in v0.10

- Endpoint URL (`http(s)` or `/fixtures/` for tests)
- `requestConfig.method`: `GET` or `POST` (POST is the common Workday case)
- Safe JSON body stored on `JobSource.requestConfig.bodyJson`
- Fixed headers only: `Accept: application/json`, `Content-Type: application/json`
- POST through local runner with 20s timeout and 2 MB response cap
- Workday JSON response normalization (including nested CXS shapes)
- Export/import preserves `requestConfig`

## Non-goals

- Browser automation (Playwright, Selenium)
- Automatic endpoint discovery
- HAR parsing
- Cookies, auth, CSRF, session headers
- Pagination
- Detail page enrichment
- Auto-apply

## Cadence

Endpoint-backed Workday sources default to **manual** cadence in the UI. Only switch to daily/weekly after a run produces candidates.

## Safety

- Credential-like JSON keys (`cookie`, `authorization`, `bearer`, `csrf`, `session`) are rejected on **GET and POST**, even when GET does not send the body.
- No arbitrary headers — fixed JSON headers only in v0.10.
- Private/internal URLs blocked (same as v0.4 runner).
- No logging of request bodies or job descriptions.

Error copy when a forbidden key is detected:

```text
Credential-like key detected: {key}. Do not paste cookies, auth headers, CSRF tokens, or session data.
```

## Dogfood

### Fixture (no network)

1. `npm run scout:runner` + `npm run web`
2. Setup → **Workday Endpoint Fixture (local)** → **Use endpoint mode**
3. Endpoint URL: `/fixtures/sample-workday-cxs-response.json`
4. Method: **POST**
5. Body: contents of `sample-workday-cxs-request.json`
6. **Test Source** → expect 2+ candidates
7. **Save Source** (manual cadence) → Sources → **Run Source** → Queue → Approve

### Live captured endpoint (optional)

If DevTools shows a public JSON search request that works **without cookies**:

1. Paste endpoint URL + JSON body into endpoint mode
2. Test → save as manual source
3. If fetch fails or weak-passes, the endpoint likely requires auth — unsupported in v0.10

## Future work

- Endpoint discovery helper (still manual confirmation)
- Pagination
- Detail enrichment
- Source health / last successful candidate run
