# AGENTS.md — AI Gateway Service

## Scope

Local scout gateway for Life Harness: transcript analysis, grounded chat (Ask/Chat Harness), and isolated Raw Lab sandbox. Default provider is **mock**; OpenVINO is optional.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /analyze-transcript` | Structured scout JSON from transcript text |
| `POST /ask-harness` | Full read-only scout with grounding arrays |
| `POST /chat-harness` | Conversational grounded chat (strict JSON) |
| `POST /raw-lab` | Ungrounded sandbox (plain text) |
| `POST /raw-lab/stream` | Raw Lab SSE (chunked full answer) |

## Chat Harness request fields

- `message` — latest user turn
- `context` — board snapshot (source of truth; required v0.1)
- `context_packet` — optional ranked `AiContextPacket` wire (`packet_version: "0.1"`); when present, draft and deep critic prompts prefer compact packet sections over raw `context` JSON; invalid packet is stripped (legacy `context` fallback)
- `conversation_history` — prior turns; assistant content = answer text only
- `thread_state` — temporary working memory (no personality)
- `reasoning_depth` — `fast` (default), `deliberate`, or `deep`
- `SCOUT_DEBUG_THINKING_TRACE` — default `false`; when `true`, logs structured deep-mode pass metadata only (no chain-of-thought, no response schema change)
- `SCOUT_CRITIC_SLOT=secondary` — deep critic via `critic_fast` (`critic_small` in yaml v2) + `LlamaCppCriticBackend` (HTTP to external `llama-server`); disabled slot falls back to same/mock; see [docs/llamacpp-critic-slot.md](docs/llamacpp-critic-slot.md)
- Frozen model roles / load policy: [docs/plans/model-stack-freeze-v3.md](../../docs/plans/model-stack-freeze-v3.md)

Raw Lab accepts `message`, `recent_turns`, `thread_state` (+ personality). **Rejects** `context`, `conversation_history`, board/memory/action fields.

## Thread intelligence rules

- Board context overrides conversation history and thread state.
- Checks live in `thread_verifier.py`; Chat Harness finalization in `chat_harness_finalize.py` (one repair max).
- Verifier repair text never enters client history or `recent_turns`.
- `reasoning_depth=deep` may run extra provider passes when `SCOUT_DEEP_ENABLED=true`.
- `SCOUT_CHAT_HARNESS_NATIVE_CHAT` — experimental native chat template (default off).
- Gateway logs lengths/counts/modes only — never full transcripts or answers.

## Evaluations

- **CI / mock:** `pytest tests/test_thread_eval_fixtures.py -q`
- **OpenVINO manual smoke:** start gateway with `SCOUT_PROVIDER=openvino`, then `python scripts/run_thread_eval.py` (not required in CI)

## Product rules

- Scout, not boss. Suggest; user approves.
- Reject `S3` before any provider call.
- Mark interpretations as inferred in `confidence_notes`.
- No medical/legal/financial advice. No autonomous send/spend/trade/commit.

## Privacy

- Localhost bind only (`127.0.0.1`)
- No auth in prototype
- Do not log full transcripts
- Do not commit `models/` or transcript samples

## Commands

```bash
cd services/ai-gateway
pip install -e ".[dev]"
SCOUT_PROVIDER=mock pytest
pytest tests/test_thread_eval_fixtures.py
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

## Agent workflow

1. Read root `AGENTS.md`, [`docs/local-ai-agent-guide.md`](../../docs/local-ai-agent-guide.md), and `docs/conversation-thread-intelligence.md` (harness/thread work).
2. Smallest change that satisfies the ticket.
3. Run `SCOUT_PROVIDER=mock pytest` before finishing (thread evals when touching verifier / Raw Lab / compaction).
4. Keep `CHAT_HARNESS_PROMPT_SHELL_CHARS` in app `harnessContext.ts` synced with `tests/test_prompt_shell_sync.py`.

Full verify command table: root `AGENTS.md` → **Verify commands**.
