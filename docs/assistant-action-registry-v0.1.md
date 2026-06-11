# Assistant Action Registry v0.1

## Why this exists

Companion can read the board and suggest concrete moves. v0.1 adds the **propose → validate → approve → apply** spine so the model never mutates state directly. The user stays in control; existing core `apply*` helpers still own persistence, logs, and proof.

```text
Model suggests → app validates → user approves → core mutates
```

## Lifecycle

1. An assistant message may include a fenced `assistant-actions` JSON block.
2. The app parses proposals and runs `validateAssistantAction` against current `LifeHarnessData`.
3. Ask Harness renders proposal cards with **Approve** / **Dismiss**.
4. On approve, `confirmAssistantAction` calls `applyConfirmedAssistantAction`, then `state_replaced` updates persisted state.
5. Side effects (win logs, proof items, park logs, agent sessions) flow through the same paths as manual UI actions.

## Supported actions (v0.1)

| Action | Risk | Apply path |
|--------|------|------------|
| `quick_capture` | low | `applyQuickCapture` |
| `log_win` | low | `applyQuickCapture` with win-shaped text |
| `park_card` | medium | `applyCardStateChange(..., "parked")` |
| `update_next_tiny_action` | medium | `applyUpdateNextTinyAction` |
| `create_agent_session` | medium | `createAgentSessionForCard` |

S3 cards are rejected at validation. Destructive/delete actions are omitted.

## Fenced block format

Label is case-sensitive: `assistant-actions`. Body must be a JSON **array**. Unknown types and invalid JSON are ignored. At most **5** actions per message.

Here is the move.

````text
```assistant-actions
[
  {
    "type": "update_next_tiny_action",
    "cardId": "card-build-momentum",
    "nextTinyAction": "Wire proposal cards in Ask Harness."
  },
  {
    "type": "log_win",
    "cardId": "card-build-momentum",
    "text": "Drafted assistant action registry."
  }
]
```
````

Display text uses `stripAssistantActionBlocks` so the raw fence is hidden in the chat bubble.

## v0.2 — Companion prompting and diagnostics

Companion now receives action-block instructions in:

- [`services/ai-gateway/app/prompts/chat_harness.md`](../services/ai-gateway/app/prompts/chat_harness.md) — when to propose, exact fence label, JSON-safe placement inside `answer`
- Context packet `tools.notes` via `buildAssistantActionSchemaHint()` — rendered as `### Proposable actions` in the gateway prompt

### Dogfood prompts

Primary:

> Given my current board, what should I do next? If a state change would help, propose it using an assistant-actions block.

Narrow test:

> Reply with one valid assistant-actions block proposing a quick_capture action for testing.

### What success looks like

1. Companion returns normal prose plus a fenced `assistant-actions` block inside `answer`.
2. Ask Harness **strips** the raw fence from the visible bubble text.
3. **Suggested actions: N** appears below the message when proposals parse.
4. Proposal cards render with Approve / Dismiss.
5. **Approve** mutates board state; **Dismiss** marks the proposal dismissed.
6. **No state change** happens before Approve.

If a fence is present but nothing parses, you see: *Action block found, but no valid actions could be parsed.*

Proposals still require explicit user approval. Companion must not claim it applied a change.

## Boundaries

- **No autonomous execution** — every mutation requires explicit Approve.
- **No Command Inbox, Workbench chat, PC automation, or Codex/Cursor execution bridge** in this slice.
- **No persistent proposal inbox** — proposal UI state is session-local on the Ask Harness screen.

## Code map

| Piece | Location |
|-------|----------|
| Registry + parser | `src/core/assistantActionRegistry.ts` |
| Tests | `src/core/assistantActionRegistry.test.ts` |
| Proposal card UI | `src/components/assistantActions/AssistantActionProposalCard.tsx` |
| State hook | `confirmAssistantAction` in `src/state/LifeHarnessState.tsx` |
| Ask Harness wiring | `app/ask-harness.tsx`, `src/components/askHarness/ChatThread.tsx` |
