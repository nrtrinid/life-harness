# Harness Context Quality v0.1

Improve what the Momentum Board sends to Chat Harness **without** changing the model, adding memory, or touching ai-gateway.

## Purpose

Ask Harness feels more alive when the scout receives a rich, deterministic snapshot of the real board — not when the LLM gets smarter on its own.

```text
Better context  →  more grounded /chat-harness answers
```

## Why context quality before memory or RAG

- The board already has cards, logs, proof, career queue, and resume bank data.
- Exporting that faithfully is cheaper and safer than retrieval or persistent chat memory.
- v0.1 rule: **read-only scout** — user approves every change.

## What is exported

Same [`HarnessContext`](../src/core/harnessContext.ts) schema ai-gateway already accepts:

| Field | v0.1 quality pass |
|-------|-------------------|
| `cards` | Life cards + career titles, job candidates (Inbox), resume modules (Parked), improved `why_it_matters` / `next_tiny_action` |
| `logs` | Newest 30, typed summaries, synthetic pounce/salvage/MVD/candidate/career signals |
| `proof_items` | Newest 20 proof shelf entries |
| `recent_analyses` | 2–5 deterministic board diagnoses (active limit, warmth, career, balance, job scout) |
| `decisions` | Static product rules + dynamic locks (active limit, resume automation, source fetching, read-only AI) |

No new top-level fields. No ai-gateway changes.

## What `recent_analyses` means

Rules-only “board diagnoses” generated at export time — not LLM output. Examples:

- Current board diagnosis (area counts + active limit signal)
- Warmth diagnosis (cold/dormant card titles)
- Career momentum diagnosis (career cards + candidate queue)
- Build vs body/social balance
- Job scout / resume bank diagnosis when v0.2 data exists

Phrasing uses **signal** / **diagnosis**, not certainty.

## How Ask Harness uses this

1. `buildHarnessContext()` maps live `LifeHarnessData` → `HarnessContext`
2. Ask Harness Dev (or CLI dogfood) POSTs to `/chat-harness`
3. Gateway scout reads cards, logs, proof, analyses, and decisions in the prompt
4. Response displays in the dev screen — **no board mutation**

## Dogfood steps

1. Start ai-gateway:
   ```powershell
   cd services/ai-gateway
   $env:SCOUT_PROVIDER="mock"
   uvicorn app.main:app --host 127.0.0.1:8111
   ```
2. Start Expo: `npm run web`
3. Nav → **Ask Harness Dev**
4. Expand **context quality summary** — check counts, active limit, cold/dormant titles
5. Ask: *What am I avoiding right now?*
6. Check whether the answer cites real board signals (career cold, candidate queue, active limit, Local LLM parked, etc.)

CLI replay with seed board:

```bash
npx tsx scripts/dogfood-chat-harness.ts
```

## Non-goals

- RAG, embeddings, persistent chat memory
- New ai-gateway endpoints or schema fields
- Auto-applying AI suggestions to the board
- Personality system or conversation summarization

## Future path

1. Export briefing / While You Were Away summaries into `recent_analyses`
2. Richer career application + follow-up due signals
3. Proposed card updates with explicit approval UI
4. Optional sensitivity-aware export trimming
5. RAG / memory only after manual context export is clearly useful

## Related

- [harness-context-export-v0.1.md](./harness-context-export-v0.1.md) — first bridge
- [../services/ai-gateway/docs/ask-harness-sandbox.md](../services/ai-gateway/docs/ask-harness-sandbox.md) — gateway API
