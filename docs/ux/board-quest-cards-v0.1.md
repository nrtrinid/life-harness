# Board Quest Cards v0.1

**Builds on:** [lofi-companion-os-shell-v0.1.md](./lofi-companion-os-shell-v0.1.md)

**Status:** Implemented.

## Problem

Board cards showed five equal-weight admin buttons (Activate, Park, Waiting, Done, Kill) on every tile regardless of state. That felt like operator tooling, not a quest board. Active cards said "Start" when the user was already in progress. Done and killed cards still exposed Activate, but that capability was easy to miss in the noise.

## Goal

Replace the default five-button row with **Start / Done / More** on Board only. Card detail keeps full `CardStateButtons`. No reducer, route, or active-limit changes.

## Before / after

| Area | Before | After |
|------|--------|-------|
| Board card actions | 5 equal buttons always | Start or Continue · Done · More |
| Active card primary | Activate (same as inbox) | **Continue** → card detail |
| Done / killed reactivate | Activate in 5-button row | **Reopen** inside More |
| Secondary transitions | All visible at once | More inline disclosure |
| Card detail | Full state buttons | Unchanged |

## Primary actions by state

| Card state | Primary | Behavior |
|------------|---------|----------|
| inbox, parked, waiting | **Start** | `setCardState(id, "active")` |
| active | **Continue** | Navigate to `/card/[id]` |
| done, killed | *(hidden)* | — |

## Done

- Available on inbox, active, parked, waiting.
- Hidden on done and killed.

## More (secondary)

Inline expand only — no dropdown libraries.

| Target | Label | Notes |
|--------|-------|-------|
| active | **Reopen** | Only when current state is done or killed |
| parked | Park | |
| waiting | Move to waiting | |
| killed | Kill | |
| done | Done | When Done is not on the primary row (e.g. killed) |
| — | View detail | Navigation only |

**Capability parity:** Every transition the old five-button row allowed remains reachable. Nothing removed — only demoted from the default view.

## Board copy

- Header subtitle: *Active quests, parked threads, and next tiny actions.*
- Column labels (board-local): Inbox · Active · Parked / Later · Waiting · Done / Archive · Killed

## What changed

- `QuestCardActions` on Board tiles via `CardTile actionVariant="quest"`
- `questCardActions.ts` — testable Start / Continue / Done / More plan
- Lo-fi quest tile polish (quiet card surface, area accent strip, softer warmth pill)
- NTA label: **Next tiny action** (sentence case) on quest tiles

## What did not change

- `CardStateButtons` component and card detail screen
- `applyCardStateChange`, `canActivateCard`, active limit (3)
- Kanban column structure and routes
- Today compact tiles (`actionVariant="none"`)

## Backlog

- Card detail progressive disclosure (quest-style primary row)
- Kanban polish and mobile column density
- Inline metadata edit on Board tiles
