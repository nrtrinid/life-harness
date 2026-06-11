# Agent Session Log v0.1

## What this adds

Agent Session Log is a manual tracking layer anchored to `LifeCard.id`. After you copy an Agent Task Packet into Codex/Cursor, you can record:

- which agent you used
- task name and goal
- result summary, files changed, verification output, commit hash, follow-ups

Saved sessions enrich card context packets and future copy flows. Completed sessions can create win log + proof evidence on first **Mark done**.

## Manual workflow

1. Copy agent task packet from Card Detail.
2. Paste into Codex/Cursor and do the work.
3. On Card Detail, open **Agent sessions** → **Log agent session**.
4. Fill in what you sent and what came back → **Save session**.
5. When finished, **Mark done** (Save first — Mark done only works on a saved session).
6. Use logged sessions as future context via card context / task packet copy.

## Source of truth

`LifeCard` remains the anchor for status and next action. `HarnessAgentSession` is metadata only. Optional `projectId` links to Project Registry when present.

## Completion evidence

First **Mark done** on a saved session:

- sets status to `done` and `completedAt`
- creates a win log + proof item linked to the card
- stores `evidenceLogId` and `evidenceProofItemId` on the session

Repeat Mark done or edits to a completed session update session fields only — no duplicate log/proof rows.

Completed proof appears on Proof Shelf automatically through existing proof aggregation.

## Intentionally not added

- automatic Codex/Cursor execution
- PC or browser automation
- background agent runs
- silent session creation on packet copy
- `Copy task packet + log sent` (future)
- assistant action registry
- sprint tracker / burndown / project dashboard route
- ai-gateway, Raw Lab, GitHub, auth, or cloud sync changes

## Future path

- Agent Session Log v0.2 proof timeline polish
- Copy task packet + log sent
- Codex/Cursor execution bridge
- Assistant Action Registry
