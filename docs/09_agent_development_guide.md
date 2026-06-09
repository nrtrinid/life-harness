# 09 - Agent Development Guide

## How to use coding agents

Use agents like junior engineers with narrow tickets, not like a magical founder.

Good agent tasks:

```text
Scaffold the app.
Create core types.
Build Today screen.
Build Board screen.
Implement active limit.
Implement quick capture parser.
Implement Pounce button.
Implement Proof Shelf.
```

Bad agent tasks:

```text
Build the whole Life Harness.
Make it like Jarvis.
Add AI and sync and notifications.
Make the app beautiful.
Figure out the best architecture.
```

## Agent workflow

For every task:

1. Read `AGENTS.md`.
2. Read `docs/01_final_design_doc.md`.
3. Read `docs/02_v0_1_scope.md`.
4. Make the smallest useful change.
5. Avoid new product concepts.
6. Run typecheck/tests.
7. Summarize exactly what changed.

## First prompt strategy

The first prompt should:

```text
create docs
create repo structure
scaffold Expo app
seed static screens
avoid backend
avoid AI
avoid integrations
```

It should not try to build the full app.

## Ticket size

Every ticket should be small enough that the agent can complete it cleanly.

Ideal ticket shape:

```text
Task:
Build X.

Context:
Read docs A, B, C.

Constraints:
Do not add Y.

Acceptance criteria:
Specific, checkable outcomes.
```

## Suggested ticket order

```text
001 Scaffold Expo app with routes and seed data.
002 Create core TypeScript models and seed cards.
003 Build Today screen with static seed data.
004 Build Board screen with card states and active limit.
005 Build one-sentence quick capture with rule-based parsing.
006 Build Pounce Mission, Pounce Button, MVD, and Salvage.
007 Build Progress screen with XP, warmth, and Proof Shelf.
008 Build Card Detail with Do vs Improve and Resume Packet.
009 Add computed While You Were Away briefing.
010 Add weekly review stub.
```

## Review prompt after first run

After Codex creates the scaffold, ask:

```text
Review the current Life Harness v0.1 scaffold against docs/v0.1.md and AGENTS.md. Find the top 5 gaps or rough edges. Do not implement yet. Return a prioritized patch plan with small tickets.
```

## Agent guardrails

Add this to any agent prompt if it starts to drift:

```text
Do not add new product concepts.
Do not add AI.
Do not add Supabase.
Do not add integrations.
Do not improve styling beyond basic usability.
Implement only the requested ticket.
```

## What to measure

Do not measure code volume.

Measure whether the built system supports:

```text
open app -> know next move
click Pounce -> get credit
log sentence -> progress visible
bad day -> MVD/Salvage available
idea appears -> captured but not active
```
