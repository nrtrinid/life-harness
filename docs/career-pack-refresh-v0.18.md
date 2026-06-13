# Career Pack Local Refresh v0.18

## Purpose

Refresh Career Source Pack v1 from a **local JSON file** without copy/paste. Preview a deterministic diff against the currently imported pack, confirm, then apply the same import semantics as paste import.

Build stays outside the app:

```text
edit private/career-source/ (or ../career-source/)  →  npm run career:pack:build:local  →  Career Pack screen  →  Pick file  →  Apply refresh
```

## Flow

1. Run the local builder:

```bash
# Preferred — in-repo private source
npm run career:pack:build:local

# Fallback — sibling private repo
npm run career:pack:build -- --source ../career-source --out resume_pack/life_harness_career_pack.v1.json
```

2. Open **Career Pack** (`/career-pack`).
3. Tap **Pick pack file** (web or native).
4. Review **Preview refresh** — module/recipe added/removed/updated counts, warnings, newer-build badge.
5. Tap **Apply refresh** — upserts Resume Bank modules by id and replaces stored pack + `importedAt`.

Paste import remains under **Show paste import**.

## Platforms

| Platform | Mechanism |
|----------|-----------|
| Web | Hidden file input + `FileReader` |
| Native | `expo-document-picker` + `expo-file-system` |
| Web dev | **Load test fixture** fetches `public/fixtures/sample-career-source-pack.v1.json` |

## Diff logic

Core: [`src/core/careerPackRefresh.ts`](../src/core/careerPackRefresh.ts)

- Compares incoming pack vs stored `careerSourcePack.pack` by module/recipe id
- Marks **updated** when title, summary, bullets, skills, or placement fields change
- Role recipes: `summaryAngle`, `preferredModuleIds`, `targetKeywords` length
- Does not diff claims/metrics/interview stories in UI (non-goal for v0.18)

## Privacy

Unchanged from v0.12:

- Real packs stay in local `resume_pack/` — gitignored
- Import still runs `parseCareerSourcePackJson` (secret rejection, PII warnings)
- No cloud upload, no GitHub integration

## Non-goals

- Running `career:pack:build` inside the app
- Watching `resume_pack/` for file changes
- Auto-import on startup
- Silent overwrite without preview confirm

## Related

- Import semantics: [`career-source-pack-import-v0.12.md`](career-source-pack-import-v0.12.md)
- Career pipeline: [`career-v0.1-pipeline.md`](career-v0.1-pipeline.md)
