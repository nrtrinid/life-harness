# Job Scout Approved Sources v0.3

Manual-run approved-source fetching for the Job Scout layer: one configured URL per run, deterministic normalization, candidate queue review, and approval into Inbox application cards.

## Why manual-run first

v0.3 adds the first runnable source layer without automation-heavy behavior:

```text
approved JobSource -> user clicks Run Source -> fetch one URL -> normalize -> JobCandidates -> review -> approve -> Inbox card
```

The system can find and prepare. The user approves.

## Supported source kinds

| Kind | Adapter | Notes |
|------|---------|-------|
| `greenhouse` | Yes | Public Greenhouse-style JSON |
| `lever` | Yes | Public Lever-style JSON |
| `ashby` | Yes | Public Ashby-style JSON |
| `jobposting_jsonld` | Yes | HTML page with JobPosting JSON-LD in one URL |
| `manual` | Yes | Pasted/public JSON object or array |
| `company_careers` | Registry only | Unsupported in v0.3 — set a supported kind + public URL |

Generic company career pages are intentionally out of scope.

## One URL per run

v0.3 fetches **exactly** the configured `source.url`:

```text
fetch this URL -> normalize if supported -> dedupe -> create candidates
```

No homepage → careers → link following → multi-page retrieval.

## CORS (expected limitation)

This is an Expo/web client app with **no backend**. Many real career pages or ATS endpoints may fail due to CORS. That is an **expected v0.3 limitation, not a bug**.

- Show a clear error
- Do not add candidates
- Do not bypass with proxies or browser automation

v0.4 can add a backend fetcher. Until then:

- Use the web fixture source (`/fixtures/sample-greenhouse.json` on `npm run web`)
- Or paste into Candidate Intake manually
- Or use a public CORS-friendly ATS JSON URL

## Fit matching

Deterministic keyword matching against the Resume Bank remains always available. Same humble tiers as v0.2:

| Tier | Score |
|------|-------|
| Strong fit | 75+ |
| Mixed fit | 45–74 |
| Weak fit | <45 |

Always show: **Deterministic keyword match, not final judgment.**

## Approval flow (unchanged)

1. Fetched jobs become `JobCandidate` with `origin: "source_fetch"` and `status: "new"`
2. Review in **Candidates Queue** (`/job-candidates`)
3. **Approve** → exactly one CareerApplication card in **Inbox**
4. Bidirectional link: `candidate.applicationCardId` ↔ `card.careerApplication.jobCandidateId`
5. Re-approve is idempotent

Re-running the same source skips duplicates by `sourceUrl + company + roleTitle`.

## Locks (v0.3)

| Lock | v0.3 behavior |
|------|---------------|
| Manual-run source fetching | **Enabled** for approved sources |
| Scheduled source fetching | Locked until 5 successful manual source runs |
| AI matching | Locked until 10 manual career actions |
| Resume automation | Locked until 5 manual applications |
| Auto-apply | Not supported |

## Dogfood loop

1. Open **Sources** (`/job-sources`)
2. Run **Local Fixture Source** on web, or edit a source URL/kind and run a public JSON endpoint
3. Review fetched candidates in **Queue** (`/job-candidates`)
4. Save / dismiss / approve to Inbox
5. Choose resume modules on the card, apply manually outside the app
6. Log proof (e.g. `applied to Acme`)

## Safety rules

- Only fetch sources the user added or enabled
- Only fetch one configured source per Run click
- No login-gated pages
- No CAPTCHA bypass
- No aggressive multi-page retrieval
- No auto-apply, auto-email, or resume generation
- Respect site terms, robots.txt, and rate limits in future backend work

## Future (not v0.3)

- Backend fetcher (v0.4)
- Scheduled runs after 5 successful manual runs
- ATS-specific adapter improvements
- AI-assisted matching (separate lock)
- Agent normalization pipeline

## Explicit non-goals

- Generic web retrieval / multi-page crawling
- Browser automation (Playwright, Selenium)
- AI browsing or cloud AI
- Supabase/auth/sync
- Changes to `services/ai-gateway/`

## Terminology

Prefer: approved-source fetching, source adapters, public postings, manual-run scout.

Avoid: scraper, crawler, bot.
