# Start Feature Flow v0.2

## What this adds

A guided **Start feature** panel on Card Detail Backroom that composes [Feature Spec Intake v0.1](./feature-spec-intake-v0.1.md) into three numbered steps:

1. **Describe the feature** — rough spec textarea (local only)
2. **Check setup** — project metadata, repo path, and runner status rows
3. **Scope it** — copy scoping packet or run scoping with Codex

The panel is presentational (`FeatureSprintStartFlow.tsx`). Card Detail wires existing handlers and state; no new runner power or manual gate changes.

## Why this matters

Spec intake v0.1 added the rough spec textarea and packet wrapping, but controls were scattered: rough spec at the top, a standalone runner row, and scoping buttons mixed with post-plan implementation/review actions. Start Feature Flow v0.2 groups the pre-plan path into one obvious sequence without changing automation boundaries.

```text
Describe → check setup → scope → import plan (manual) → implementation loop
```

## Panel behavior

### Active plan banner

When a feature sprint plan already exists, the panel shows:

> Feature plan already started. Continue below with the current step.

Steps 1–3 remain visible. Users can re-copy scoping packets or run a new scoping pass from step 3 after a plan exists.

### Step 1 — Describe the feature

- Same rough spec textarea and placeholder as v0.1
- **Clear spec** and **Use card next action as spec** (when `nextTinyAction` is set)
- Helper: rough spec is local only; import the generated plan to keep it

### Step 2 — Check setup

Status rows (plain ready/missing labels):

- **Project metadata** — project registry row linked to the card
- **Repo path** — project `repoPath` present
- **Runner** — available / unavailable / not checked (from existing health check)

**Check runner** uses the same handler as before. Helper notes that manual copy/paste still works when the runner is unavailable.

### Step 3 — Scope it

- **Copy scoping packet** when clipboard is available; otherwise helper: *Clipboard copy unavailable in this environment.*
- **Run scoping with Codex** or **Run scoping with Cursor** always shown (disabled while running; agent picked in step 3)
- Helper: output fills the Import plan box below; import is still manual

## Deduped controls

Removed from Card Detail Backroom (now covered by the Start feature panel):

- Standalone **Local runner** row + Check runner
- **Copy scoping packet** and **Run scoping with Codex** from the lower action row

Unchanged on Card Detail:

- Import plan textarea and **Import plan**
- Implementation / review copy and run buttons (post-plan)
- Builder readiness tile, recent runs, save output, import verdict, advance, complete, delete

## Post-import trust loop

After **Import plan**, the builder loop continues on Card Detail Backroom:

1. Run implementation in worktree
2. View details (Recent runner runs)
3. Inspect output, changed files, diff, and verification
4. Save agent output
5. Run review with Codex / copy review packet
6. Import review verdict
7. Advance step → repeat for next slice
8. Mark feature complete
9. Clean worktree — View details → Clean worktree; Force clean only after inspecting output/diff

See [feature-sprint-flow-guide-v0.3.md](./feature-sprint-flow-guide-v0.3.md) and [feature-sprint-worktree-cleanup-v0.1.md](./feature-sprint-worktree-cleanup-v0.1.md).

## Manual gates unchanged

- Import plan — manual
- Save agent output — manual (inspect via View details first)
- Import review verdict — manual
- Advance step / mark complete — manual
- Worktree cleanup — manual
- No auto-import, auto-save, auto-review, auto-advance, or auto-cleanup

## Intentional limits (v0.2)

- Rough spec remains **session-local UI state** — not persisted
- No Workbench start-flow UI — Workbench points users to open the card
- No mock-loop shortcut, Companion spec drafting, or persistent drafts
- No new runner endpoints, profiles, or data model changes
- No Project Hub integration

## Future path

- Mock loop shortcut for dogfood
- Ask Companion to draft a spec from card context
- Persistent spec drafts per card
- Start feature flow from Workbench or Project Hub
- Project Hub aggregation for feature-building cards

## Related docs

- [feature-sprint-flow-guide-v0.3.md](./feature-sprint-flow-guide-v0.3.md)
- [feature-spec-intake-v0.1.md](./feature-spec-intake-v0.1.md)
- [feature-sprint-dogfood-checklist-v0.1.md](./feature-sprint-dogfood-checklist-v0.1.md)
- [feature-sprint-workbench-v0.1.md](./feature-sprint-workbench-v0.1.md)
- [feature-sprint-orchestrator-v0.1.md](./feature-sprint-orchestrator-v0.1.md)
