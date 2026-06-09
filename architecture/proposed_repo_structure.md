# Proposed Repo Structure

## v0.1 simple Expo structure

```text
life-harness/
  AGENTS.md
  README.md
  docs/
  prompts/
  tickets/

  app/
    _layout.tsx
    index.tsx
    board.tsx
    progress.tsx
    log.tsx
    card/
      [id].tsx

  src/
    components/
      BriefingCard.tsx
      CardColumn.tsx
      LifeCard.tsx
      ProgressBar.tsx
      ProofShelf.tsx
      QuickCapture.tsx
      PouncePanel.tsx
      SalvagePanel.tsx
      MinimumViableDayPanel.tsx

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
      locks.ts
```

## Future monorepo version

```text
life-harness/
  AGENTS.md
  docs/
  prompts/
  tickets/

  apps/
    mobile/
      app/
      components/
      features/
      lib/

  packages/
    core/
      types/
      scoring/
      warmth/
      parsing/
      guards/
      briefings/
      sensitivity/
      ai-routing/

  supabase/
    migrations/
    functions/
      generate-briefing/
      weekly-review/

  services/
    ai-gateway/
      src/
        providers/
          rules.ts
          cloud-openai.ts
          local-openvino.ts
          local-llamacpp-sycl.ts
          local-ipex-llm.ts
        routes/
          classify-log.ts
          suggest-pounce.ts
          summarize-card.ts
          generate-briefing.ts
```

## Placement rules

```text
Product rules -> src/core or packages/core
UI rendering -> components/screens
Seed data -> data/seed.ts
AI provider code -> future services/ai-gateway only
Supabase-specific code -> future supabase/ only
```

Avoid scattering product logic across screens.
