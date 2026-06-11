# Agent Session Log v0.1

## What this adds

Agent Session Log is a manual tracking layer anchored to `LifeCard.id`. After you copy an Agent Task Packet into Codex/Cursor, you can record:

- which agent you used
- task name and goal
- result summary, files changed, verification output, commit hash, follow-ups

Saved sessions enrich card context packets and future copy flows. Completed sessions can create win log + proof evidence on first **Mark done**.

## Manual workflow

### v0.1 (manual log)

1. Copy agent task packet from Card Detail.
2. Paste into Codex/Cursor and do the work.
3. On Card Detail, open **Agent sessions** → **Log agent session**.
4. Fill in what you sent and what came back → **Save session**.
5. When finished, **Mark done** (Save first — Mark done only works on a saved session).
6. Use logged sessions as future context via card context / task packet copy.

### v0.2 (Copy + log sent)

1. Click **Copy + log sent** on Card Detail (same default task packet as **Copy agent task packet**).
2. Clipboard copy succeeds → a new `sent` Agent Session is created automatically.
3. Paste into Codex/Cursor and do the work.
4. Edit the session in **Agent sessions** if needed, then **Mark done** when finished.

**Copy agent task packet** remains side-effect-free — it does not create a session. Only the explicit **Copy + log sent** action logs `sent`.

Sent sessions do not create proof/log evidence until **Mark done** (unchanged idempotent completion flow).

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
- silent session creation on normal packet copy
- assistant action registry
- sprint tracker / burndown / project dashboard route
- ai-gateway, Raw Lab, GitHub, auth, or cloud sync changes

## Future path

- Agent Session Log proof timeline polish
- Codex/Cursor execution bridge
- Assistant Action Registry
