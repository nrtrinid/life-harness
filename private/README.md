# Private local workspace

This folder holds **personal career material** that must never be committed.

## Layout

```text
private/
  career-source/     # Markdown resume evidence (authoring source)
  fitness/           # Personal lift / movement reference (Fitness Return card)
resume_pack/         # Generated Career Pack JSON (repo root, also gitignored)
```

## Build commands

From the Life Harness repo root:

```bash
# Preferred — source inside this repo (gitignored)
npm run career:pack:build:local
npm run career:pack:validate:local

# Fallback — separate private career-source repo sibling
npm run career:pack:build -- --source ../career-source --out resume_pack/life_harness_career_pack.v1.json
```

Output: `resume_pack/life_harness_career_pack.v1.json`

Import in the app: **Career Pack** (`/career-pack`) → **Pick pack file**.

## Privacy

- `private/` and `resume_pack/` are gitignored (only these README templates are tracked).
- Do not commit resumes, contact details, clearance notes, or generated packs.
- Committed test data: `public/fixtures/sample-career-source-pack.v1.json` (synthetic only).

See [`docs/career-private-source-v0.1.md`](../docs/career-private-source-v0.1.md).
