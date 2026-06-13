# Feature Sprint Flow Guide v0.3

## What this adds

A visible **How this flow works** guide on Card Detail Backroom that documents the full Feature Sprint trust loop — including the inspection step between implementation runs and saving output, and worktree cleanup after review.

The guide is presentational (`FeatureSprintFlowGuide.tsx`). No new runner power, no Save blocking, no auto-cleanup.

## Why this matters

View details, diff inspection, verification excerpts, and worktree cleanup already shipped in earlier slices. The on-screen dogfood checklist still jumped from *Run implementation* → *Save agent output*, which trains the wrong habit: run agent → blindly save.

v0.3 makes the trust boundary obvious:

```text
Run → View details → inspect → save → review → advance → complete → clean worktree
```

## Mental model

```text
Runner fills textareas for Codex or Cursor (toggle in Start feature).
You still import, save, and advance manually.
Feature Sprints Workbench is a dashboard.
Card Backroom is the control surface.
```

## Before you have a plan

Use the [Start feature panel](./start-feature-flow-v0.2.md):

1. **Describe the feature** — optional rough spec (local only)
2. **Check setup** — project metadata, repo path, runner
3. **Scope it** — copy scoping packet or run scoping with Codex/Cursor (pick agent in Start feature panel)
4. **Import plan** — inspect output, then click Import plan manually

## After you import a plan

Post-import trust loop on Card Detail Backroom:

1. **Run implementation in worktree**
2. **View details** — open the run in Recent runner runs
3. **Inspect** output, changed files, diff, and verification — see [feature-runner-output-diff-viewer-v0.1.md](./feature-runner-output-diff-viewer-v0.1.md)
4. **Save agent output** — manual; not auto-saved
5. **Run review with Codex** or copy review packet
6. **Import review verdict** — manual
7. **Advance step** — repeat from step 1 for the next slice
8. **Mark feature complete**
9. **Clean worktree** — View details → Clean worktree; Force clean only after inspecting output/diff — see [feature-sprint-worktree-cleanup-v0.1.md](./feature-sprint-worktree-cleanup-v0.1.md)

Repeat steps 1–7 for each plan step until the feature is done.

## Mock dogfood

```bash
npm run feature-runner
```

Every step still requires an explicit click. No auto-import, auto-save, auto-review, auto-advance, or auto-cleanup.

## UI surfaces

- **How this flow works** — collapsible in Card Detail → Backroom → Feature Sprint (above Start feature panel)
- **Builder readiness** — next-action checklist (copy updated for save step)
- **Recent runner runs** — View details expands output/diff/verification/cleanup
- **Agent output** — helper reminds user to View details before saving

## Action guide (v0.4)

Card Detail Backroom shows a **Current step checklist** after runner actions:

- Numbered steps for the active gate (import plan, post-implementation save, review, advance)
- Highlights the current step; marks View details done after you expand the latest implementation run
- **Load latest scoping output** when scoping succeeded but Import plan is empty
- Runner runs auto-expand **View details** after scoping, implementation, and review complete

## Intentional limits (v0.3)

- Guidance only — Save agent output is not disabled until View details is opened
- No hard block on Save when View details was skipped
- No auto-cleanup after mark complete
- No Workbench flow guide UI
- No runner, data model, or manual gate changes

## Related docs

- [start-feature-flow-v0.2.md](./start-feature-flow-v0.2.md)
- [feature-sprint-local-runner-v0.1.md](./feature-sprint-local-runner-v0.1.md)
- [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md)
- [feature-runner-output-diff-viewer-v0.1.md](./feature-runner-output-diff-viewer-v0.1.md)
- [feature-sprint-worktree-cleanup-v0.1.md](./feature-sprint-worktree-cleanup-v0.1.md)
