# Career Private Source (local) v0.1

## Audit — current flow (pre-migration)

### Build pipeline

| Piece | Location |
|-------|----------|
| npm script | `career:pack:build` → `tsx scripts/build-career-source-pack.ts` |
| CLI args | `--source` (markdown tree), `--out` (JSON path) — required, no hardcoded default |
| Builder core | `src/core/careerSourcePackBuilder.ts` |
| Build script | `scripts/build-career-source-pack.ts` |
| Tests | `src/core/careerSourcePackBuilder.test.ts`, `careerSourcePack*.test.ts` |

Prior workflow assumed a **sibling private repo** at `../career-source` and wrote output to `resume_pack/life_harness_career_pack.v1.json`.

### Import / app usage

| Piece | Location |
|-------|----------|
| Parse + validate | `src/core/careerSourcePack.ts` |
| Import actions | `src/core/careerSourcePackActions.ts` (via Life Harness state) |
| File pick / fixture | `src/hooks/useCareerPackFilePicker.ts`, `src/platform/readLocalTextFile.ts` |
| Refresh diff | `src/core/careerPackRefresh.ts` |
| UI | `app/career-pack.tsx` — pick file, preview, apply refresh |
| Resume Bank / queue | `careerPackMatching.ts`, `careerPackCandidateFilters.ts`, career hub screens |

Import is **paste or file pick** into local app state. No cloud upload. Secret-like strings are rejected; PII-shaped content warns.

### Paths and gitignore (before)

- **Source (authoring):** external `../career-source` — outside repo, never tracked
- **Generated pack:** `resume_pack/life_harness_career_pack.v1.json` — gitignored
- **Also gitignored:** `exports/life_harness_career_pack*.json`
- **Committed fixture:** `public/fixtures/sample-career-source-pack.v1.json` (synthetic)
- **Risk:** generated packs were protected; authoring source had no in-repo home (only external repo)

### Docs referencing external source

- `docs/career-source-pack-import-v0.12.md`
- `docs/career-pack-refresh-v0.18.md`
- `docs/career-v0.1-pipeline.md`
- `app/career-pack.tsx` help text (web)

---

## Migration — local private source

Life Harness now supports **in-repo private authoring** adjacent to the app, without productizing a new subsystem.

### Layout

```text
life-harness/
  private/
    career-source/          # personal markdown evidence (gitignored)
  resume_pack/              # generated pack JSON (gitignored)
  public/fixtures/          # synthetic sample pack (committed)
```

### Build commands

```bash
# Preferred — gitignored source inside Life Harness
npm run career:pack:build:local

# Validate local source, build pack, and print counts
npm run career:pack:validate:local

# Re-validate an existing built pack without rebuilding
npm run career:pack:validate:local -- --validate-only

# Fallback — separate private repo (unchanged)
npm run career:pack:build -- --source ../career-source --out resume_pack/life_harness_career_pack.v1.json
```

Both build commands write the same output path. Import semantics are unchanged.

---

## Local private dogfood checklist

Use this after copying real markdown from `../career-source` into `private/career-source/`.

### 1. Copy private source locally (manual, once)

```powershell
# PowerShell — adjust source path if needed
New-Item -ItemType Directory -Force private\career-source | Out-Null
Copy-Item -Recurse ..\career-source\* private\career-source\
```

Do **not** commit copied files. Only README placeholders under `private/` are tracked.

### 2. Build and validate the pack

```bash
npm run career:pack:validate:local
```

Expected: builds `resume_pack/life_harness_career_pack.v1.json`, prints module/recipe/story counts, lists warnings.

If you only have README placeholders, the command fails with a clear message — copy real markdown first.

### 3. Import in the app

1. Start web: `npm run web`
2. Open **Career Pack** (`/career-pack`)
3. **Pick pack file** → select `resume_pack/life_harness_career_pack.v1.json`
4. Review preview counts and warnings
5. **Apply refresh**

### 4. Check Resume Bank

1. Open **Resume Bank** (`/resume-bank`)
2. Confirm imported modules appear (e.g. project modules from your source)
3. Expand a module — bullets, skills, claims-to-avoid, metrics-to-gather should match pack content

### 5. Check application readiness

1. Open **Job Candidates** or an application card with a resume draft packet
2. Confirm selected modules resolve from imported Resume Bank entries
3. Open readiness/hardening — claims cautions from the pack should surface as patch-worthy warnings when relevant

### 6. Export DOCX (optional)

Requires `docx` and `jszip` installed (`npm install`).

```bash
npm run resume:build:application -- --card <application-card-id>
```

Or export from the application card UI when readiness allows.

### 7. Fallback path (unchanged)

Keep using the sibling repo if you prefer:

```bash
npm run career:pack:build -- --source ../career-source --out resume_pack/life_harness_career_pack.v1.json
npm run career:pack:validate:local -- --validate-only
```

### Test / CI note

Public tests use `public/fixtures/sample-career-source-pack.v1.json` only. No private folder required.

### DOCX test dependencies

`docx` is a runtime dependency; `jszip` is a devDependency for DOCX structure tests. If `npm test` fails on `resumeDocx` imports, run `npm install` — both packages are declared in `package.json`.

### Gitignore

```gitignore
private/**
!private/README.md
!private/career-source/
private/career-source/**
!private/career-source/README.md
resume_pack/
exports/life_harness_career_pack*.json
```

Only README placeholders under `private/` are tracked. Real markdown evidence and generated JSON cannot be committed accidentally.

### Manual migration

If content lives in `../career-source` today, **copy** it into `private/career-source/` once (user action; not automated). The external build command remains valid if you prefer keeping the sibling repo.

### Non-goals

- No in-app builder
- No cloud sync of source or packs
- No requirement that `private/career-source/` exist for CI/tests (fixtures only)

## Related

- Import semantics: [`career-source-pack-import-v0.12.md`](career-source-pack-import-v0.12.md)
- File refresh UI: [`career-pack-refresh-v0.18.md`](career-pack-refresh-v0.18.md)
- Career pipeline: [`career-v0.1-pipeline.md`](career-v0.1-pipeline.md)
