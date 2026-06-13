# Career Source Pack Import + Candidate Filtering v0.12

## Purpose

Paste-import **Career Source Pack v1** JSON to:

- Upsert resume modules into the Resume Bank
- Rank and filter the Job Candidates queue with deterministic role-recipe matching
- Surface clearance/seniority cautions, claims guardrails, and evidence gaps

No cloud AI, auto-apply, or resume generation in this ticket.

## Privacy

- Real packs live in local `resume_pack/` only — **never commit** them.
- `.gitignore` blocks `resume_pack/` and `exports/life_harness_career_pack*.json`.
- Committed test fixture: `public/fixtures/sample-career-source-pack.v1.json` (synthetic, no PII).
- Import rejects secret-like strings (`SUPABASE_SERVICE_ROLE`, `api_key`, `sk-`, `ghp_`, `AKIA`, etc.).
- PII-like keys or email/phone patterns produce **warnings**, not hard rejects.

## Schema v1

Required top-level sections:

- `careerPositioning`
- `resumeModules` (snake_case `id`, required `sourceFiles`)
- `roleRecipes` (snake_case `id`, required `preferredModuleIds`)
- `jobScoutFilters`
- `claimsSafety`
- `metricsToGather`
- `interviewStories`
- `matchingHints`
- `extractionMetadata` with `schemaVersion: 1` and `generatedAt`

## Import semantics

- **Success:** replace stored pack, set `importedAt`, upsert modules by `id`.
- **Re-import:** same module IDs update in place — no duplicates.
- **Failed import:** previous pack and modules stay unchanged.
- **Clear pack:** removes stored pack and queue matching only; upserted Resume Bank modules remain.

UI copy on clear:

> Clear Career Pack removes matching and queue filters. Imported Resume Bank modules remain.

## Matching

Parallel to legacy `fitScore` from Job Scout intake:

| Field | Use |
|-------|-----|
| `fitScore` / `fitLabel` | Intake scoring (unchanged) |
| `CareerCandidateMatch.fitTier` | `strong` / `mixed` / `weak` when pack imported |

Matching uses role recipes, module keyword maps, seniority/clearance signals from the pack, and claims/evidence rules. Suggested bullets come only from pack module bullets ∩ role recipe `bulletsToPrefer`.

## Queue filters

When a pack is imported, **Queue** adds:

- Fit tier, role recipe, module filters
- Hide weak / hide cautions
- Search text
- Sort: best fit (default), newest, queue order

## Dogfood

1. Export or copy your local `resume_pack/life_harness_career_pack.v1.json`.
2. Open **Career Pack** (`/career-pack`) and paste.
3. Review warnings, then open **Queue** with pack filters.
4. Approve a strong match — resume angle and project emphasis may pre-fill from pack match.

## Non-goals (v0.12)

- Persisting full pack match metadata on `JobCandidate` / `CareerApplication`
- Resume generation or bullet dumps on approval cards
- Cloud sync of pack JSON
- Runner or ai-gateway changes

## Future work

- Expanded Resume Bank claims/metrics UI on module expand
- Approval metadata persistence (`roleRecipeId`, evidence gap counts)
- ~~Optional local pack refresh~~ — implemented in [`career-pack-refresh-v0.18.md`](career-pack-refresh-v0.18.md)
- Optional local scout-assisted pack rebuild suggestions (separate ticket)
