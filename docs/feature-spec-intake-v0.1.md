# Feature Spec Intake v0.1

## What this adds

A **Rough feature spec** textarea inside the Card Detail Backroom **Start feature** panel — the front door for the Feature Sprint Builder loop.

Paste a rough idea; Life Harness wraps it with card, project, and context into the existing scoping packet. Copy or run scoping with Codex/ChatGPT as before; import the plan manually.

## Why rough spec intake matters

The builder loop already worked from card context alone, but starting a new feature often meant manual prompt shaping outside the app. Spec intake keeps the user in the UI:

```text
Rough spec → scoping packet → import plan → implementation loop
```

## How rough spec combines with context

`buildFeatureScopingPacket(data, cardId, { roughSpec })` in `src/core/featureSprintOrchestrator.ts`:

1. Trims `roughSpec`; empty/whitespace → card-only scoping (unchanged).
2. Caps at `FEATURE_SCOPING_ROUGH_SPEC_MAX_CHARS` (12_000); adds `(truncated)` when capped.
3. When non-empty, inserts near the top of the packet:

```markdown
## User-provided rough spec

{normalized spec}

## Scoping instructions
- Treat the rough spec above as the primary feature intent.
- Use card, project, and existing context below as grounding only.
- Preserve the non-goals and safety boundaries in this packet.
- Return short prose plus a fenced `feature-sprint-plan` JSON block.
```

4. Card summary, project metadata, existing context, non-goals, and required output format follow unchanged.

Rough spec is **not** stored on the plan or in history unless the architect includes it in imported plan fields.

## Manual workflow

1. Open a build card with project metadata → **Backroom** → **Feature Sprint** → **Start feature** panel.
2. Paste a rough feature spec in step 1 (optional but recommended for new features).
3. Check setup in step 2; **Copy scoping packet** or **Run scoping with Codex** in step 3.
4. Inspect output → **Import plan** manually.
5. Continue the existing implementation → review → advance loop.

Helper actions:

- **Clear spec** — reset textarea
- **Use card next action as spec** — copy `nextTinyAction` when present

## Intentional limits (v0.1)

- Rough spec is **local UI state only** — not persisted; navigating away loses it
- UI note: *This rough spec is local only. Import the generated plan to keep it.*
- No auto-import, auto-save, auto-review, or auto-advance
- No automatic spec generation or prompt rewrite
- Feature Sprint Workbench has no textarea — open the card to use the **Start feature** panel
- Workbench **Copy scoping packet** remains card-context-only

## Future path

- Ask Companion/Codex to draft a spec from card context
- Persistent spec drafts per card
- Workbench intake surface
- Project Hub integration

See also [start-feature-flow-v0.2.md](./start-feature-flow-v0.2.md) for the guided Start feature panel.

## Related docs

- [feature-sprint-orchestrator-v0.1.md](./feature-sprint-orchestrator-v0.1.md)
- [feature-sprint-workbench-v0.1.md](./feature-sprint-workbench-v0.1.md)
- [feature-sprint-local-runner-v0.1.md](./feature-sprint-local-runner-v0.1.md)
