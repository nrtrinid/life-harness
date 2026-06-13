# Career source (private)

Put your **personal resume evidence** here as Markdown (`.md` or `.txt`).

This directory is **gitignored**. Only this README is tracked as a safe placeholder.

## Expected shape

Mirror the structure you use in a separate `career-source` repo, for example:

```text
private/career-source/
  README.md
  source_inventory.md
  projects/
    example_project.md
  roles/
    example_role.md
```

The builder walks this tree and produces `resume_pack/life_harness_career_pack.v1.json`.

## Build

```bash
npm run career:pack:build:local
npm run career:pack:validate:local
```

`validate:local` builds (when real markdown exists), validates JSON, and prints module/recipe/story counts.

## Migrating from `../career-source`

If you already maintain a sibling private repo, copy (do not symlink) its contents here once:

```bash
# example — adjust paths for your machine
cp -r ../career-source/* private/career-source/
```

The external-repo build command remains available as a fallback.

## Do not commit

Real project write-ups, GPA, contact info, clearance details, or employer-specific notes belong here only — never in git.
