# Chat Backroom Transparency v0.1

**Branch:** `feat/chat-backroom-transparency-v0.1`
**Builds on:** [companion-chat-surfaces-v0.1.md](./companion-chat-surfaces-v0.1.md), [lofi-palette-lock-v0.1.md](./lofi-palette-lock-v0.1.md)

## Problem

After Companion Chat Surfaces collapsed advanced panels into Backroom, memory/personality/budget state became safer but harder to see. Users must scroll past the chat and open multiple nested collapses to learn what the thread remembers.

## Principle

**Surface summary, hide guts.**

- **ChatStateStrip** — primary transparency (always above chat)
- **ChatBackroomPanel** — secondary detail, default closed, quick close

## Component map (after)

```
PageHeader
Mode note / SafetyBanner
ChatStateStrip                    ← summary chips
[ChatBackroomPanel if open]       ← inline (<1200px) or beside chat (≥1200px)
ChatSurfaceFrame
  thread + composer
```

### Companion split

| Surface | Role |
|---------|------|
| HarnessReadCard | Prose grounding only |
| ChatStateStrip | Grounded · Board context ready · Mode · Budget · Backroom |

### Raw Signal

| Surface | Role |
|---------|------|
| SafetyBanner | Sandbox safety prose |
| ChatStateStrip | Ungrounded · thread memory · signal notes · style · budget · Backroom |

## Safety boundaries

- Raw Signal never imports board context modules
- Handoff remains explicit: **Open in Companion with board context**
- Personality not exported on handoff

## What changed

- ChatStateStrip + ChatBackroomPanel on both chat routes
- Side Backroom only at ≥1200px (inline below strip otherwise)
- Raw Signal memory/personality as review cards
- Unified message **Actions** menu (Raw Signal)
- HarnessReadCard pills removed (no duplicate with strip)

## What did not change

- Routes, gateway, memory semantics, budget math
- Raw Signal containment policy
- No new persistence or backend

## Manual verification

- [ ] Raw Signal empty + with messages — strip visible without scroll
- [ ] Raw Signal Backroom open/close via strip
- [ ] Companion strip shows Grounded + board context ready
- [ ] Narrow layout — Backroom inline between strip and chat
- [ ] Wide (≥1200px) — Backroom beside chat when open
- [ ] Budget warning opens budget section

## Backlog

- Non-scroll Screen viewport (full chat height)
- Companion thread Actions menu full merge
- Native action menus
