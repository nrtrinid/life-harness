# Job Scout Foundation v0.2

Manual/import-first foundation for a future Job Scout agent: Resume Bank, JobSource registry, JobCandidate queue, deterministic fit matching, and approval into CareerApplication cards.

## Why manual first

v0.2 implements everything **except automatic fetching**:

```text
paste job -> JobCandidate -> deterministic match -> review -> approve -> Inbox application card
```

The system can prepare; the user approves. No auto-apply. No scraping.

## Models

### ResumeModule

Structured resume bank entries: projects, experience, education, skill clusters, certifications. Used for deterministic keyword matching only.

### JobCandidate

A normalized job opportunity **before** it becomes an application card.

Key fields:

- `origin`: `manual` | `source_fetch` | `import` | `agent` (v0.2 intake uses `manual`)
- `status`: `new` | `saved` | `dismissed` | `card_created`
- `fitScore`, `fitReasons`, `gaps`, `suggestedResumeModuleIds`
- `applicationCardId` after approval (bidirectional link)

### JobSource

Approved source registry stub. Display/edit seed only — **no network fetch**.

## Fit scoring (humble)

Deterministic keyword/tag matching against active ResumeModules. **Not AI.**

| Tier | Score |
|------|-------|
| Strong fit | 75+ |
| Mixed fit | 45–74 |
| Weak fit | <45 |

Always show: **Deterministic keyword match, not final judgment.**

## Approval flow

1. Paste job in **Candidate Intake** (`/candidate-intake`) → creates `JobCandidate` with `origin: manual`
2. Review fit tier, reasons, gaps, suggested modules in **Candidates Queue** (`/job-candidates`)
3. **Approve** → creates exactly one CareerApplication card in **Inbox**
4. Bidirectional link:
   - `candidate.applicationCardId = card.id`
   - `card.careerApplication.jobCandidateId = candidate.id`
5. Re-approving a `card_created` candidate is **idempotent** (no duplicate card)

Career Intake (`/career-intake`) remains the direct path to application cards without the candidate queue.

## Screens

| Route | Purpose |
|-------|---------|
| `/resume-bank` | View seeded ResumeModules |
| `/candidate-intake` | Paste job → candidate + fit review |
| `/job-candidates` | Queue: save / dismiss / approve |
| `/job-sources` | Approved sources + fetching locked message |

## Use-before-improve locks

| Lock | Unlock |
|------|--------|
| Job-source fetching | 10 manual candidates (`origin === "manual"`) |
| AI matching | 10 manual career actions |
| Resume automation | 5 manual applications |
| Auto-apply | Not supported |

v0.2 **deterministic matching is always available** — only AI/agent matching stays locked.

## Future Job Scout agent

1. Read approved JobSources
2. Fetch public postings through compliant APIs/feeds/structured data where available
3. Normalize to JobCandidate (`origin: source_fetch` or `agent`)
4. Match against ResumeBank
5. Create candidates for review
6. Require approval before application cards

Respect site terms, robots.txt, rate limits, logins, and CAPTCHAs. Never auto-apply. Never send messages without approval.

## Dogfood loop

1. Open **Paste** (Candidate Intake) and paste a job description
2. Inspect fit tier, reasons, gaps, suggested modules
3. Open **Queue** and **Approve** to application card (Inbox)
4. Open card detail — verify resume angle / modules prefilled and `jobCandidateId` link
5. Choose resume modules manually and apply outside the app
6. Log proof via Quick Capture (`applied to …`)

## Run locally

```bash
npm install
npm run web
```

Verify:

```bash
npm run typecheck
npm run test
```

## Out of scope

- Job-board scraping, live search, ATS APIs, browser automation
- AI matching, resume generation, email, notifications
- Supabase, auth, cloud sync
- Changes to `services/ai-gateway/`
