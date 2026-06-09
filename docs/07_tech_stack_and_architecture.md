# 07 - Tech Stack and Architecture

## Recommended stack

```text
App:
Expo + React Native + TypeScript

Cross-platform target:
iPhone / Android / Web

v0.1 state:
local seed data / local state

v0.2+ shared source of truth:
Supabase Postgres

Background alive jobs later:
Supabase Edge Functions + Cron

AI layer later:
AI Provider Gateway with rules/cloud/local providers

Repo:
monorepo-style structure with docs, app, core package, prompts, tickets
```

## Why Expo

Expo gives a single TypeScript/React Native app that can target phone and web. Since the desired product should eventually exist on both phone and computer, Expo is a strong starting point.

## Why not local-only first

A local-only desktop app would be easy to build, but the actual product needs phone + computer continuity.

v0.1 can be local state only to validate UX, but the architecture should anticipate shared state.

## Why Supabase later

Supabase is a practical v0.2 source of truth because it gives:

```text
Postgres
Auth
Realtime APIs
Edge Functions
Cron-compatible background jobs
Storage
```

But Supabase should be treated as v0.1/v0.2 infrastructure, not a forever prison.

Keep core logic portable so future options remain possible:

```text
hosted Supabase
self-hosted Supabase
local Postgres
SQLite/local-first mode
local AI gateway
cloud AI
no AI
```

## Architecture layers

```text
Expo App
  - Today
  - Board
  - Progress
  - Log
  - Card Detail

Core Package
  - types
  - scoring
  - warmth
  - parsing
  - guards
  - proof
  - briefings
  - sensitivity
  - ai routing later

Data Layer
  - local seed state in v0.1
  - Supabase in v0.2+

Background Jobs Later
  - generate briefings
  - detect dormant cards
  - compute warmth
  - prepare pounce mission
  - draft weekly review

AI Gateway Later
  - rules provider
  - cloud provider
  - local A770 provider
```

## Suggested repo structure

```text
life-harness/
  AGENTS.md
  README.md

  docs/
    00_project_overview.md
    01_final_design_doc.md
    02_v0_1_scope.md
    03_motivation_layer.md
    04_evidence_informed_workflows.md
    05_product_rules.md
    06_data_model.md
    07_tech_stack_and_architecture.md
    08_ai_provider_and_a770_plan.md
    09_agent_development_guide.md
    10_future_roadmap.md
    11_backlog_and_use_before_improve_locks.md

  app/
    _layout.tsx
    index.tsx
    board.tsx
    progress.tsx
    log.tsx
    card/[id].tsx

  src/
    components/
    data/
      seed.ts
    core/
      types.ts
      scoring.ts
      warmth.ts
      parsing.ts
      guards.ts
      proof.ts
      briefing.ts
```

Future monorepo version:

```text
life-harness/
  apps/
    mobile/
  packages/
    core/
  supabase/
    migrations/
    functions/
  services/
    ai-gateway/
```

## Background alive behavior

Do not rely on the phone to do all background work. Mobile background execution can be constrained.

For reliable future "While You Were Away":

```text
Supabase Cron
-> calls Edge Function
-> scans cards/logs
-> writes briefing rows
-> app displays briefing on open
```

v0.1 should fake this by computing briefings from local state on app open.

## First milestone

```text
Open app on phone/laptop
-> see Today
-> click Pounce
-> log one sentence
-> Proof Shelf updates
-> While You Were Away feels useful
```
