# Universal Capture v0.1

## Product rationale

Today Act Mode, Card Detail, and the Proof Ledger each reward movement — but capture grammar was still implicit and fragmented. **Universal Capture v0.1** makes Quick Capture the one deterministic input surface: a small prefix grammar routes common phrases into existing logs, proof, and card actions.

This is not a natural-language agent. It is a strict, forgiving command grammar.

## Supported phrases

| Phrase | Example |
|--------|---------|
| Idea | `new idea: …` · `idea: …` |
| Work | `worked on …` · `worked on: …` |
| Follow-up | `followed up with …` · `followed up:` · `followed up …` |
| Agent result | `agent finished …` · `agent done …` |
| Resume export note | `resume exported for …` · `resume exported:` · `resume exported …` |
| Park | `park …` · `park: …` |

Matching is case-insensitive. Payloads are trimmed. Empty payloads are rejected.

## What each phrase does

| Intent | Log | Proof | Card |
|--------|-----|-------|------|
| Idea | idea log | idea proof | new Inbox card |
| Worked on | win log always | `Worked on {card}.` if safe card match | touch if matched |
| Followed up | career win log always | follow-up proof if matched | touch if matched |
| Agent finished | win log always | `Agent finished: {card}` if matched | touch if matched |
| Resume exported | career win log always | resume exported proof if matched | touch if matched |
| Park | existing park flow | existing park proof | **requires** safe match |

**No card match:** movement intents still log progress; proof only when a safe card links (same as legacy `worked on` win behavior). Park fails non-mutating with a specific hint.

**Unmatched input:** no state change. Quick Capture keeps the typed text and shows:

```text
No rule matched. Try: worked on … · followed up with … · agent finished … · new idea: …
```

## What it intentionally does not do

- LLM or fuzzy parsing beyond listed prefixes
- Auto-complete Agent Sessions (use Card Detail / Workbench)
- Auto DOCX export on `resume exported`
- Email, calendar, GitHub, or cloud sync
- Body/leak/`applied to` implicit regex (removed in v0.1 prefix-only grammar)

## Relations

| Surface | Role |
|---------|------|
| **Today Quick Capture** | Primary entry; act-mode placeholder teaches grammar |
| **Proof Ledger** | Reads logs/proof created by capture — no ledger rewrite |
| **Agent Session Log** | Session mark-done remains explicit; `agent finished` capture is a separate signal |
| **Card Detail** | Card touch + proof when payload matches a safe card |

## Companion / Assistant actions

`quick_capture` proposals from Ask Harness go through `applyQuickCapture` after user Approve. With prefix-only grammar, Companion must prefix capture text (e.g. `new idea: …`) or use typed actions instead:

- **`log_win`** with `cardId` for progress on a known card
- **`park_card`** when the target card is known
- **`create_agent_session`** to start agent work — not `agent finished` capture

Validation rejects non-matching `quick_capture` text before Approve. Schema hints live in `buildAssistantActionSchemaHint()` and `chat_harness.md`.

## Future path

- Richer card disambiguation when multiple titles match
- Capture box on more screens
- Stronger event taxonomy (still deterministic)
