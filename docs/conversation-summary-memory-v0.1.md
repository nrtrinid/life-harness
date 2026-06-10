# Conversation Summary Memory v0.1

Lightweight, **user-approved** chat memory for Ask Harness — not RAG, not autonomous AI memory, not cloud sync.

## Purpose

Help Harness feel more continuous by remembering short summaries of recent Ask Harness sessions. The board stays the source of truth; chat memory is a separate scaffold that feeds the next export.

```text
Ask → preview summary → user saves → next export includes chat memory signals
```

## Why this is not RAG

- No embeddings, retrieval, or vector store
- No full transcripts stored or sent
- Rules-only summary builder (`buildChatSummary`) — no extra AI call
- Memory enters the existing `HarnessContext` schema via `recent_analyses` and `decisions` only

## Why memory writes are user-approved

- AI responses never auto-save
- Ask Harness Dev shows a **Preview memory** block after each response
- User clicks **Save chat summary to memory** to persist
- Deleting a saved summary is supported from the dev screen

## What gets saved

Each `HarnessChatSummary` stores:

| Field | Content |
|-------|---------|
| `userMessage` | Current prompt/question only |
| `assistantSummary` | Concise excerpt (~240 chars) — not full answer |
| `patterns` | Rules-detected tags (career avoidance, build-heavy, etc.) |
| `decisions` | Up to 2 durable recommendation lines (strict matching) |
| `suggestedNextActions` | Short action-like lines |
| `rememberForNextTime` | 1–3 concise continuity items |

## What does not get saved

- Full assistant answers or conversation history
- Confidence/safety note blobs
- Proof shelf items
- Automatic board/card/log mutations

## Persistence

Uses the **existing** local JSON snapshot (`LifeHarnessData.chatSummaries`). No new storage mechanism.

## How summaries enter HarnessContext

No new top-level gateway fields.

- **`recent_analyses`**: entries prefixed with `Recent chat memory:` (latest 5 in full export; compact keeps 1–3 when trimming)
- **`decisions`**: saved chat decision lines with reason `Saved chat memory.`

Built by `buildHarnessContext` / `buildCompactHarnessContext` when `chatSummaries` is passed on export input.

## Dogfood

1. Start ai-gateway on port 8111 (optional — save works without it; follow-up chat needs gateway)
2. `npm run web` → **Ask Harness Dev**
3. Ask: *What am I avoiding right now?*
4. Review **Preview memory** → click **Save chat summary to memory**
5. Ask a follow-up question
6. Check debug panel: `Chat summaries saved: N` and `Chat memories in export: yes`

## Related

- [`harness-context-quality-v0.1.md`](./harness-context-quality-v0.1.md) — context export + compact budget
- [`harness-context-export-v0.1.md`](./harness-context-export-v0.1.md) — first Chat Harness bridge
