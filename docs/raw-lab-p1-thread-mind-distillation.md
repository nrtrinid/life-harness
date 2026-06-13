# Raw Lab P1 — Thread Mind Display / Distillation

**Date:** 2026-06-13  
**Status:** Implemented (P1.0a–P1.0d)  
**Gate:** P0 closed; P1 distillation slice shipped in app + gateway mock reflection

---

## Scope

P1 closes the **display-vs-storage-vs-wire split** for Raw Lab thread mind:

- Thread mind list fields are **distilled on write** and **filtered on wire send**
- `recent_turns` stay **raw** (transcript ground truth)
- Raw Lab opts out of shared assistant-derived `doNotRepeat` snippets
- UI panel shows **labeled sections**; backroom chip counts use display-filtered lengths

---

## Core invariant

| Layer | Content |
|-------|---------|
| `recent_turns` | Raw conversation — unchanged |
| Thread mind (stored + visible) | Distilled interpretation |
| Wire `thread_state` list fields | Distilled, model-facing via `buildWireThreadMemoryState` |

`recent_digest` remains an extractive transcript snippet (labeled raw in UI). It is not thread mind.

---

## Implemented changes

### P1.0a — App storage + wire

- `updateSharedChatThreadStateAfterTurn({ deriveDoNotRepeatFromAssistant })` — default `true`; Raw Lab passes `false`
- Sanitize on write: `addDoNotRepeat`, `addUserSteering`, `addSelfObservation`, `addProvisionalStance`, `addQuestionToRevisit`, `addOpenLoop`
- `distillOpenLoop` / `distillQuestionToRevisit` — thin/vague lines rewritten; substantive tension preserved
- `buildWireThreadMemoryState` — separate from display; shared sanitizers; wire prefixes (`Still circling:`, `Steering:`, etc.)
- `toWireThreadState` uses wire builder for list fields
- Expanded `isNoisyRawLabAssistantSnippet` patterns (`I hear you`, `That's valid`, `You're absolutely right`, …)
- Unit tests: `rawlab_019` in `src/core/rawLabThreadState.test.ts`

### P1.0b — Gateway mock reflection

- `_distill_open_loop_to_revisit` — no verbatim loop copy into `questions_to_revisit`
- Echo regex aligned with app filler list
- Prompt clarifies distill-never-echo for loops
- Contract test: thin loop distillation

### P1.0c — UI cockpit labels

- `RawLabThreadMemoryPanel` section labels (Open loops, Steering, Do not repeat, …)
- Optional read-only **Current tension** from last `smartCompactedContext`
- `countRawLabThreadMemoryItems` uses `buildDisplayThreadMemoryState` lengths

### P1.0d — Docs

- This checkpoint doc
- Updated `docs/raw-lab-thread-state.md`

---

## Acceptance (P1)

- [x] `recent_turns` raw on send
- [x] Visible thread mind excludes assistant filler openers
- [x] `do_not_repeat` = user commands / compact banned phrases — not assistant answer prefixes
- [x] Open loops distilled when thin; substantive tension preserved
- [x] Wire uses `buildWireThreadMemoryState` (not display wrapper)
- [x] Clear chat still wipes session-local state
- [x] Companion Self-Memories remain separate
- [x] Companion/Ask shared chat default unchanged (`deriveDoNotRepeatFromAssistant` default true)
- [x] `rawlab_019` unit test passes

---

## Commands run

```bash
npm test -- rawLabThreadState chatBackroomSummary chatThreadState
cd services/ai-gateway && SCOUT_PROVIDER=mock pytest tests/test_raw_lab_thread_reflection_contract.py -q
```

---

## Explicit non-goals (unchanged)

- P0 verifier/finalizer behavior
- Deep+ / context selector / durable memory
- OpenVINO live thread reflection provider
- Personality panel display filter (deferred P1.1+)
- Distilling `recent_turns`

---

## Optional follow-up

- Gateway eval fixture: `evals/thread/raw_lab_memory_distillation.json` (`rawlab_019`)
- Personality section display filter
- `decisions` list UI in memory panel
