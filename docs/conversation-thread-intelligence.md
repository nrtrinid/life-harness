# Conversation Thread Intelligence

Life Harness chat uses a shared per-thread working memory layer that is separate from board context, Memory Bank, and Raw Lab personality.

## Layers

| Layer | Scope | Grounded? | Persists? |
|-------|-------|-----------|-----------|
| HarnessContext | Board snapshot | Yes | Until board changes |
| SharedChatThreadState | Current chat | No (continuity only) | Session / in-memory |
| Memory Bank | User-approved facts | Yes when active | localStorage (web) |
| RawLab personality | Raw Lab only | No | Never |

## Rules

- Board context is source of truth in Ask Harness / Chat Harness.
- Thread history and thread state are for conversational continuity only.
- Thread memory must never override board facts.
- Raw Lab remains ungrounded and isolated — no board context, no Memory Bank, no tools.
- Personality growth stays Raw-Lab-only.
- Proposed board changes require explicit user approval.
- Memory save remains explicit and user-initiated.

## Ask Harness flow

```text
UI thread → conversation_history + thread_state → POST /chat-harness → strict JSON
```

## Raw Lab flow

```text
UI turns → recent_turns + thread_state (+ personality) + companion_self_memories → POST /raw-lab → plain text
```

Companion Self-Memories are approved Raw Lab persona notes injected per request — not Memory Bank, not board context.

## Reasoning depth (Ask Harness)

- `fast` — default, one pass
- `deliberate` — one pass with stronger checklist in prompt
- `deep` — multi-pass in provider (final answer only)

## Permissioned mode shift (Phase 7)

Raw Lab may suggest switching to grounded Ask Harness. User must explicitly tap **Use board context** before board context enters the conversation. Navigation seeds a new Ask Harness thread from a sanitized digest (shared fields only — no personality).

## Verifier and finalization

- **Checks:** `services/ai-gateway/app/thread_verifier.py`
- **Chat Harness finalize:** `services/ai-gateway/app/chat_harness_finalize.py` — all response paths (including mock history-aware shortcuts) pass through one verifier + one optional repair
- **Raw Lab:** `ignored_steering` for shorter/concise requests when answer is too long vs prior assistant or first-turn hard cap; `raw_lab_runtime_awareness` when user asks about memory/tools/access and the answer wrongly denies injected Companion Self-Memories or claims board/tool/file/internet access (capability accuracy only — not style/personality)

## Evaluations

**Mock (CI-safe):**
```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest tests/test_thread_eval_fixtures.py -q
```

**OpenVINO manual smoke** (optional, not in CI):
```powershell
$env:SCOUT_PROVIDER="openvino"
uvicorn app.main:app --host 127.0.0.1 --port 8111
python scripts/run_thread_eval.py
```

See `services/ai-gateway/README.md` for fixture determinism notes.

## Streaming status

| Endpoint | Current behavior | Future |
|----------|------------------|--------|
| `POST /raw-lab/stream` | SSE chunks of a **completed** answer | True token streaming needs provider streaming API + repair buffering strategy |
| `POST /chat-harness` | No streaming | Deferred until full JSON can be validated from a buffered response |

## Phase roadmap (complete)

1. Multi-turn `conversation_history` in app
2A. Shared `thread_state` for Ask Harness
2B. Raw Lab composes shared base + personality
3. Reference resolution, code blocks, smarter packing
4. Verifier/repair + reasoning depth
5. Response variant buttons
6. Native chat experiment (flagged) + Raw Lab streaming
7. Permissioned mode shift / Presence bridge
