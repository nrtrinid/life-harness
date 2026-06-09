# AGENTS.md — AI Gateway Service

## Implementation discipline

**Ship mock + tests first.** OpenVINO is a stub in Phase 0 — degraded health, 503 on analyze. Do not debug GPU drivers or download model weights in this pass.

Phase 0 scope only:

```text
scaffold → mock provider → FastAPI → strict tests → docs → OpenVINO stub
```

Stop when `SCOUT_PROVIDER=mock pytest` passes. Phase 1 (real inference) is documented in `docs/local-a770-plan.md`.

## Product rules

- Scout, not boss. Suggest; user approves.
- Reject `S3` before any provider call.
- New card suggestions default to Inbox.
- Mark interpretations as inferred in `confidence_notes`.
- No medical/legal/financial advice. No harmful instructions.
- No autonomous send/spend/trade/commit behavior.

## Privacy

- Localhost bind only (`127.0.0.1`)
- No auth in Phase 0
- Do not log full transcripts
- Do not commit `models/` or transcript samples
- No cloud providers

## Commands

```bash
cd services/ai-gateway
pip install -e ".[dev]"
$env:SCOUT_PROVIDER="mock"; pytest
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

## Agent workflow

1. Read root `AGENTS.md` and `docs/local-a770-plan.md`.
2. Smallest change that satisfies the ticket.
3. Run `pytest` before finishing.
4. Do not expand scope into Phase 1 unless explicitly requested.
