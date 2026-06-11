# Ask Harness v0.1

Product and dev guide for the **Companion** screen (`/ask-harness`) — read-only Chat Harness bridge from the Momentum Board to local `services/ai-gateway`.

## Purpose

```text
Board state (source of truth)  →  buildHarnessContext()  →  POST /chat-harness  →  chat UI
```

Companion / Ask helps the user think about moves in natural language. It does **not** auto-apply AI output to cards, logs, or daily state.

## Setup

**Terminal 1 — ai-gateway:**

```powershell
cd services/ai-gateway
pip install -e ".[dev]"   # add ,openvino for GPU
$env:SCOUT_PROVIDER="mock"   # or openvino
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

**Terminal 2 — app:**

```bash
npm run web
```

Open **Companion** from primary nav (`/ask-harness`). See [`nav-backroom-cleanup-v0.1.md`](nav-backroom-cleanup-v0.1.md) and [`spine-attachment-audit-v0.1.md`](spine-attachment-audit-v0.1.md). The route and gateway contract still use Ask / Chat Harness names.

## Gateway URLs

| Environment | URL |
|-------------|-----|
| Web / desktop | `http://127.0.0.1:8111` |
| Android emulator | `http://10.0.2.2:8111` |
| Physical phone | LAN IP, e.g. `http://192.168.1.10:8111` |

## UI features

- **Chat-first layout** — thread history, composer, quick questions
- **Reasoning depth** — `fast` (default), `deliberate`, `deep`
- **Context panels** — what the gateway receives (cards, logs, career data, memory)
- **Export mode** — full vs compact context when prompt size is tight
- **Advanced panel** — gateway URL, mode, sensitivity override

Keyboard (web): **Enter** sends, **Shift+Enter** newline.

## Thread state and history

Multi-turn continuity uses:

- `conversation_history` — prior turns (assistant content = answer text only)
- `thread_state` — temporary working memory (pinned facts, open loops, do-not-repeat)

Shared logic: [`src/core/chatThreadState.ts`](../src/core/chatThreadState.ts). Board context **overrides** thread state when they conflict. See [`conversation-thread-intelligence.md`](./conversation-thread-intelligence.md).

Thread memory is **in-memory only** unless the user explicitly saves to Memory Bank.

## Memory save flow

From a chat turn, the user can save a summary to Memory Bank (user-approved durable ledger). See [`memory-bank-v0.1.md`](./memory-bank-v0.1.md) and [`conversation-summary-memory-v0.1.md`](./conversation-summary-memory-v0.1.md).

## Raw Lab handoff

Raw Lab is a separate unrestricted sandbox with **no board context**. Handoff to Ask requires explicit user action (**Use board context**): digest is sanitized and starts a new grounded thread. Never auto-export Raw Lab jailbreaks or personality to Ask. See [`raw-lab-thread-state.md`](./raw-lab-thread-state.md) and root [`AGENTS.md`](../AGENTS.md).

## Context export

- Rules-only mapping: [`src/core/harnessContext.ts`](../src/core/harnessContext.ts)
- Richer diagnoses: [`harness-context-quality-v0.1.md`](./harness-context-quality-v0.1.md)
- Bridge overview: [`harness-context-export-v0.1.md`](./harness-context-export-v0.1.md)

## Code map

| File | Role |
|------|------|
| [`app/ask-harness.tsx`](../app/ask-harness.tsx) | Ask screen |
| [`src/core/chatHarnessClient.ts`](../src/core/chatHarnessClient.ts) | Gateway client |
| [`src/core/askHarnessThreadAdapter.ts`](../src/core/askHarnessThreadAdapter.ts) | Thread → wire format |
| [`src/components/askHarness/*`](../src/components/askHarness/) | Chat UI components |

## Non-goals

- Auto-applying proposed card updates
- Cloud AI, Supabase, auth
- RAG / embeddings (Memory Bank is manual save)
- Voice or background agents

## Related

- [`services/ai-gateway/README.md`](../services/ai-gateway/README.md)
- [`ai-workflows-current.md`](./ai-workflows-current.md)
- [`local-a770-plan.md`](./local-a770-plan.md)
