# 10 - Future Roadmap

## Phase 0 - Documentation and agent setup

```text
Finalize design docs.
Create AGENTS.md.
Create first Codex prompt.
Create small ticket backlog.
```

## Phase 1 - v0.1 local/manual prototype

Build:

```text
Expo app shell
Today
Board
Progress
Log
Card Detail
seed data
one-sentence capture
Pounce
Minimum Viable Day
Salvage
Proof Shelf
Momentum Warmth
While You Were Away computed locally
Do vs Improve
Resume Packet fields
Use-before-improve locks
```

No AI. No backend. No integrations.

## Phase 2 - v0.2 shared data and better rules

Add:

```text
Supabase schema
basic auth if needed
shared cross-device state
rule-based parser improvements
computed warmth
dormant detection
weekly review stub
better briefing generation
```

Still avoid complex AI.

## Phase 3 - v0.3 optional cloud AI

Add AI for low-risk, high-value tasks:

```text
log classification
pounce suggestions
scope creep detection
resume packet drafts
weekly review drafts
briefing phrasing
```

Use sensitivity levels before sending data.

## Phase 4 - v0.4 local A770 gateway

Build optional local service:

```text
life-ai-gateway
  /classify-log
  /summarize-card
  /suggest-pounce
  /generate-briefing
  /create-resume-packet
```

Experiment with Intel-compatible runtimes later.

## Phase 5 - v0.5 integrations

Only after manual behavior is proven.

Possible integrations:

```text
GitHub commits -> Build progress
Calendar -> Social/Career events
Notes/voice memos -> Inbox
Spending -> Money/leak updates
Fitness -> Body progress
Career repo -> application state
```

## Phase 6 - v1 operator layer

Background agents:

```text
Career Agent
Project Agent
Life Ops Agent
Money Agent
Review Agent
```

Rule remains:

```text
The system can prepare. The user approves.
```

## Forever constraints

Do not turn the app into:

```text
a guilt board
a dashboard graveyard
a notification spammer
a fake gamification toy
a full autonomy agent
a local LLM science project before the core loop works
```
