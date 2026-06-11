# Memory Bank / Pattern Ledger v0.1

Durable, **user-approved** memory ledger on top of chat summaries — not RAG, not autonomous writes, not a blank editor.

## Purpose

Chat summaries give short-term continuity. Memory Bank holds approved learnings that persist across sessions and can be toggled active/inactive.

```text
Companion → save chat summary → review suggested durable memories → save selected items → export includes Memory Bank signals
```

## Chat summary vs Memory Bank

| Layer | Role | Lifespan |
|-------|------|----------|
| `chatSummaries[]` | Session continuity, recent Companion / Ask context | Trimmed in compact export |
| `memoryItems[]` | Approved patterns, traps, rules, decisions | User-controlled; active items export |

## v0.1 workflow (only path)

```text
chat summary saved → suggested durable memories → user saves selected item(s)
```

No manual blank memory editor in v0.1.

## Memory kinds

| Kind | Typical use | Export field |
|------|-------------|--------------|
| `pattern` | Recurring behavior signal | `recent_analyses` |
| `preference` | Stable working preference | `recent_analyses` |
| `trap` | Over-optimization / rabbit hole | `recent_analyses` |
| `identity` | Identity-level note | `recent_analyses` |
| `project_fact` | Durable project fact | `recent_analyses` |
| `decision` | Approved durable direction | `decisions` |
| `rule` | Recurring operating rule | `decisions` |

Summaries are **1–2 sentences max** at creation to protect context budget.

## Conservative decision / rule policy

**Good:** durable direction — e.g. "Career-first Momentum Board is current practical direction."

**Bad:** ephemeral next action — e.g. "You should walk 10 minutes today." (belongs on the board, not Memory Bank)

Candidate builder does not promote every "you should…" or `suggestedNextActions` line into a decision.

## Export mapping

Active memory items only (`isActive: true`).

- **`recent_analyses`:** `pattern`, `preference`, `trap`, `identity`, `project_fact`  
  Prefix: `Memory Bank {kind}: {summary}`
- **`decisions`:** `decision`, `rule`  
  Prefix: `Memory Bank {kind}: …` · reason: `Approved durable memory.`

Full export caps memory-derived entries at 10 per field type. Compact keeps ≥3 Memory Bank analyses/decisions when trimming.

## Persistence

Uses existing local JSON snapshot (`LifeHarnessData.memoryItems`). No new storage.

## UI

- **Companion (`/ask-harness`):** after saving a chat summary, shows suggested durable memories + recent Memory Bank list (toggle/delete).
- **Tape Archive (`/memory-bank`):** grouped ledger view; toggle active / delete.

## Dogfood

1. Open **Companion** from Backroom with seed board loaded.
2. Ask a career/avoidance question; save the chat summary.
3. Review **Suggested durable memories**; save one pattern or rule.
4. Open **Tape Archive** in Backroom; confirm item appears and is active.
5. Check export debug — quality summary shows memory counts and "Memory items in export: yes".
6. Ask a follow-up question; response should cite Memory Bank / career signals when relevant.
7. Mark a memory inactive; confirm it drops from export debug.

## Not in scope

- RAG / embeddings
- Autonomous memory writes
- Manual blank memory creation
- Editing title/summary in UI (toggle/delete only)
