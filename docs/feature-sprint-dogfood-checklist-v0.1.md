# Feature Sprint Dogfood Checklist v0.1

## What this adds

Feature Sprint Dogfood Checklist v0.1 adds a read-only readiness summary for a card's Feature Sprint builder loop.

It answers:

```text
Is this feature card ready to run the builder loop?
What is the next safe manual action?
```

The checklist lives in core logic as `buildFeatureSprintDogfoodSummary()` and appears in Card Detail Backroom near the existing Feature Sprint controls.

## Why it exists

The Feature Sprint loop now has scoping, plan import, implementation runner history, review, verdict import, step advance, and completion proof. That power is useful, but it is dense while dogfooding.

This checklist makes the manual gates visible without removing them. It should help the user test the loop, spot missing setup, and avoid wondering which control to press next.

## Checklist fields

Each check has:

```ts
id: string;
label: string;
status: "ready" | "missing" | "warning" | "done" | "blocked";
detail: string;
targetRoute?: string;
```

Current checks inspect existing state only:

- card exists and is not redacted
- project metadata exists
- repo path exists
- verification commands exist
- runner health, when passed by the UI
- active or latest feature sprint plan
- current step
- latest implementation output
- worktree/diff metadata
- verification results
- saved step output
- review output
- imported review verdict
- advance gate
- completion proof

## Next-action rules

The next action is deterministic and intentionally simple:

```text
1. Missing project metadata/repoPath -> Add project metadata
2. Runner not checked/unavailable -> Check runner
3. Scoping output exists with no active plan -> Import plan
4. No active plan -> Run scoping
5. No current step and plan is reviewing/done-ready -> Mark feature complete
6. Implementation output exists but step output is not saved -> Save agent output
7. Ready/planned step with no output -> Run implementation
8. Review output exists but verdict is not imported -> Import review verdict
9. Output exists but no review -> Run review
10. Review accepted and step is not done -> Advance step
11. All steps done / plan reviewing -> Mark feature complete
12. Feature done with proof -> Inspect proof
13. Fallback -> Manual inspection
```

## Mock-mode dogfood loop

Use the mock runner path for safe loop testing:

```text
1. Start runner: npm run feature-runner
2. Check runner
3. Run scoping with Codex
4. Import plan
5. Run implementation in worktree
6. Save agent output
7. Run review with Codex
8. Import verdict
9. Advance step
10. Mark feature complete
```

Every step still requires an explicit user action.

## What this intentionally does not add

- no new runner profiles
- no CLI execution surface
- no Cursor runner
- no PC/browser automation
- no commits, merge, push, or cleanup
- no automatic import
- no automatic save
- no automatic review
- no automatic advance
- no automatic completion
- no new app data model
- no ai-gateway changes
- no Raw Lab changes
- no Project Hub

## Future path

Useful later slices:

- one-click mock full-loop test
- runner result diff viewer
- worktree cleanup UI
- commit approval gate
- Project Hub after more dogfood
