# Harness Context Export v0.1

Bridge the Expo Momentum Board to the local ai-gateway **Chat Harness** endpoint using read-only context export.

## Purpose

The board remains the source of truth. Chat Harness can read an exported snapshot of cards, logs, proof, and system decisions, then suggest moves in natural language. The user approves all actions — nothing in this slice auto-applies AI output to the board.

```text
Momentum Board state  →  buildHarnessContext()  →  POST /chat-harness  →  display answer
```

## Read-only rule

- Export is rules-only mapping in [`src/core/harnessContext.ts`](../src/core/harnessContext.ts)
- The **Companion** screen does not mutate cards, logs, or daily state from responses
- No persistence, RAG, or cloud AI in v0.1

## Start ai-gateway

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"   # or openvino on A770
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

Mock is enough for dev UI wiring. OpenVINO optional for richer answers.

## Open Companion in the app

```bash
npm run web
```

Backroom → **Companion**

1. Confirm gateway URL (default below)
2. Pick mode / sensitivity
3. Type a message or use a quick button
4. **Send to Chat Harness**

Example: *What am I avoiding right now?*

## Gateway URL notes

| Environment | URL |
|-------------|-----|
| Web / desktop | `http://127.0.0.1:8111` |
| Android emulator | `http://10.0.2.2:8111` |
| Physical phone | Your computer's LAN IP, e.g. `http://192.168.1.10:8111` |

If the gateway is down, Companion shows a friendly error and keeps your typed message and URL intact.

## What gets exported

- Life cards (including career application cards)
- Optional Job Scout v0.2 data when present: job candidates, resume modules
- Recent logs, proof shelf items, session pounce/salvage/MVD signals
- Static system decisions (source of truth, approval required, local AI optional, career-first direction)
- `recent_analyses`: empty in v0.1

Enum strings match ai-gateway display labels (`Build`, `Active`, `Hot`, …).

## Non-goals (v0.1)

- Auto-applying proposed card updates from Companion
- Applying proposed card updates
- Supabase, auth, cloud sync
- RAG, embeddings, persistent AI memory
- Voice transcription or background agents

## Future path

1. Improve exported context (briefings, richer career/candidate summaries)
2. Add proposed card updates with explicit user approval flow
3. Richer Companion approval surfaces for proposed updates
4. Optional local/OpenVINO provider routing from app settings
5. RAG / memory layers later, with sensitivity routing

## Related

- [`services/ai-gateway/docs/ask-harness-sandbox.md`](../services/ai-gateway/docs/ask-harness-sandbox.md) — gateway endpoints
- [`src/core/chatHarnessClient.ts`](../src/core/chatHarnessClient.ts) — client
- [`app/ask-harness.tsx`](../app/ask-harness.tsx) — Companion screen
