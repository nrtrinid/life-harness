---
name: ask-harness-threading
description: Ask Harness and Chat Harness threading, context packets, and grounded chat work.
---

# Ask Harness Threading

## When to use

- Tickets touching Ask/Chat Harness UI, `chatThreadState`, `harnessContext`, `chatHarnessClient`, or context packets
- Thread continuity, send budget, synthesis, or grounded chat behavior

## First command

```bash
npm run agent:preflight
```

Then:

```bash
npm run agent:map -- --task ask-harness
npm run agent:impact -- --changed
npm run agent:tests-for -- --changed
```

## Read via context map

Use [`docs/AGENT_CONTEXT_MAP.md`](../../../docs/AGENT_CONTEXT_MAP.md) task block `ask-harness`.

Authority docs: `docs/ask-harness-v0.1.md`, `docs/conversation-thread-intelligence.md`, `docs/ai-workflows-current.md`.

Shared thread logic belongs in `src/core/chatThreadState.ts` (UI-independent).

## Forbidden scope

- Importing Raw Lab personality or thread internals into Ask/Chat Harness
- Board mutations without explicit user approval (scout suggests; user approves)
- Weakening S3 routing or board mutation guardrails
- `app/` or `src/` importing from `services/`
- Binding the app to a specific LLM provider in core behavior

## Verification

Always:

```bash
npm run check:boundaries
npm run test -- src/core/askHarness.containment.test.ts
```

Narrow changes:

```bash
npm run agent:typecheck
npm run agent:test -- -- src/core/<nearest>.test.ts
```

Or finish with:

```bash
npm run agent:auto-check
```

## Final response checklist

- Files changed
- Containment and thread tests run
- Board context remains source of truth over conversation history
- No Raw Lab internals leaked into harness paths
- Known failures and guardrail risks
