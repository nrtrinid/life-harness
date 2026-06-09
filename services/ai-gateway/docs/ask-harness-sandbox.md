# Ask Harness Sandbox (Phase 1.8)

Read-only scout chat over a **caller-provided** Life Harness context bundle. This is not the full app, not persistent memory, and not RAG.

## Purpose

Test whether chatting with the Life Harness scout feels useful when given cards, logs, proof, analyses, and decisions as context.

```text
The board remains the source of truth.
The scout can suggest and prepare.
The user approves changes.
```

## Endpoint

`POST /ask-harness`

### Request

```json
{
  "question": "What am I avoiding right now?",
  "mode": "operator",
  "sensitivity": "S1",
  "context": {
    "cards": [],
    "logs": [],
    "proof_items": [],
    "recent_analyses": [],
    "decisions": []
  },
  "conversation_history": []
}
```

- `conversation_history` is optional and **not persisted**.
- `context` is supplied by the caller — no database.
- `S3` is rejected with HTTP 422 before any provider call (rules-only).

### Response

```json
{
  "answer": "...",
  "grounding": [
    {
      "source_type": "card",
      "label": "...",
      "summary": "..."
    }
  ],
  "patterns_detected": ["..."],
  "suggested_next_actions": ["..."],
  "proposed_card_updates": [
    {
      "card_title": "...",
      "proposed_change": "...",
      "requires_approval": true
    }
  ],
  "confidence_notes": ["..."],
  "safety_notes": ["..."]
}
```

`requires_approval` is schema-locked to `true` — the API cannot return auto-applied card changes.

## Modes

| Mode | Focus |
|------|--------|
| `operator` | Next move, park, pounce, active limits, salvage |
| `reflection` | Patterns, loops, over-optimization, avoidance |
| `builder` | Project reasoning, next implementation slice |
| `general` | Normal chat, still grounded and cautious |

## Guardrails

- Ground in provided context; say when context is insufficient.
- Distinguish facts from inferences in `confidence_notes`.
- No medical/legal/financial prescriptions.
- No autonomous send/spend/trade/commit recommendations.
- Tiny suggested actions (usually ≤15 minutes).
- Read-only — no state mutation on the server.

## Example questions

```text
What am I avoiding right now?
What should I do next?
Am I over-optimizing again?
What should I build next?
```

## CLI

```powershell
cd services/ai-gateway
uvicorn app.main:app --host 127.0.0.1 --port 8111

python scripts/ask_harness.py
python scripts/ask_harness.py --question "What should I do next?" --mode operator
python scripts/ask_harness.py --question "Am I over-optimizing again?" --mode reflection
python scripts/ask_harness.py --question "What should I build next?" --mode builder
```

Default context: `tests/fixtures/synthetic_harness_context.json` (fake data only).

## Browser playground

Dev sandbox at `GET /playground` — same localhost server, no separate frontend build.

```text
http://127.0.0.1:8111/playground
```

- Prefills context from `GET /playground/default-context` (synthetic fixture, `Cache-Control: no-store`)
- Quick-question buttons for common vibe tests
- Renders answer, grounding, patterns, next actions, proposed updates, confidence/safety notes
- No persistence; not the Life Harness app UI

OpenVINO smoke results: [ask-harness-openvino-smoke.md](./ask-harness-openvino-smoke.md).

Prompt expects a substantive `answer` (2–6 sentences, not the voice template alone) and JSON-only output with all list fields as arrays.

## Future path

- Read-only chat over real Life Harness board state (app integration ticket)
- User-approved application of `proposed_card_updates`
- RAG / memory layers later, with sensitivity routing
- Local A770 for private context (already supported via OpenVINO provider)

## Privacy

- Use synthetic fixture for committed samples.
- Keep real context bundles local; do not commit personal board exports.
