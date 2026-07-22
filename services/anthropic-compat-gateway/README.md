# Anthropic Compat Gateway (ACGW)

Local **Anthropic Messages-compatible subset** for development and testing of Claude Code / Anthropic client flows against Life Harness.

This is **not** full Anthropic API compatibility. It is a mock-first gateway that speaks a useful slice of `POST /v1/messages` (including SSE and tool_use) so clients can be exercised without real model backends.

## Purpose

- Deterministic mock completions for local client smoke tests
- Anthropic-shaped request/response and error envelopes
- Fail-closed real-provider seam (`DisabledRealProvider`) until a future slice enables inference
- Service-local only: no Companion board state, Expo app, Raw Lab, or root npm scripts required

## Supported API subset

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/health` | **None** (unauthenticated) | `{ ok, provider, ready, port }` |
| `POST` | `/v1/messages` | Required unless `ACGW_ALLOW_NO_AUTH=1` | Non-streaming JSON message |
| `POST` | `/v1/messages` (`stream: true`) | Same | Anthropic SSE (`text/event-stream`) |

Supported request fields (Slice 1):

- `model`, `max_tokens`, `messages`, `system`, `tools`, `stream`, `stop_sequences`
- Retained/ignored-for-behavior: `temperature`, `top_p`, `tool_choice`, `metadata`
- Message `content`: string **or** list of blocks (`text`, `tool_use`, `tool_result` only)
- `?beta=...` query accepted and ignored
- Unknown top-level Claude Code fields: `extra="ignore"` (accepted, not passed through)

## Unsupported features

- Real model inference (`ACGW_ENABLE_REAL=1` fails startup)
- Images, documents, thinking blocks, citations, batches, files, models list, count tokens
- Anthropic admin / organization APIs
- Cloud auth (OAuth, Anthropic console keys as upstream)
- Full beta feature parity

## Configuration

All settings use the `ACGW_*` prefix.

| Variable | Default | Meaning |
|----------|---------|---------|
| `ACGW_PROVIDER` | `mock` | `mock` (default) or `disabled_real` (fail-closed seam for tests) |
| `ACGW_HOST` | `127.0.0.1` | Bind host |
| `ACGW_PORT` | `8131` | Bind port |
| `ACGW_AUTH_TOKEN` | empty | **Required by default.** Bearer / `x-api-key` value |
| `ACGW_ALLOW_NO_AUTH` | `0` | If `1` and token empty: auth disabled (**local tests only**) |
| `ACGW_ENABLE_REAL` | `0` | Must stay `0`; `1` fails startup |
| `ACGW_LOG_BODIES` | `0` | Metadata-only logs by default |
| `ACGW_MAX_INPUT_CHARS` | `100000` | Budget over serialized `system` + `messages` + `tools` |

Empty `ACGW_AUTH_TOKEN` without `ACGW_ALLOW_NO_AUTH=1` is invalid: the process refuses to start.

## Local startup

Service-local commands only (no root `npm` scripts):

```powershell
cd services/anthropic-compat-gateway
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"

$env:ACGW_PROVIDER="mock"
$env:ACGW_AUTH_TOKEN="acgw-local-dev"
# optional: python scripts/run_uvicorn.py
uvicorn app.main:app --host 127.0.0.1 --port 8131
```

Or:

```powershell
$env:ACGW_AUTH_TOKEN="acgw-local-dev"
python scripts/run_uvicorn.py
```

## Authentication

- **`GET /health`**: always unauthenticated
- **`POST /v1/messages`**: requires `Authorization: Bearer <token>` or `x-api-key: <token>` matching `ACGW_AUTH_TOKEN`
- With `ACGW_ALLOW_NO_AUTH=1` and empty token: messages are allowed; startup logs a loud WARNING that authentication is DISABLED
- Missing/invalid credentials → HTTP 401 Anthropic `authentication_error` envelope
- Credentials are never logged

## Mock scenarios

Route via model alias or `x-acgw-scenario` header. Unknown scenarios → `invalid_request_error`.

| Model / scenario | Behavior |
|------------------|----------|
| `acgw-mock-text` / `text` | Plain text (includes `nonce=ACGW_MOCK_NONCE_7f3a91c2`) |
| `acgw-mock-stream` / `stream_text` | Streaming text |
| `acgw-mock-tool` / `tool_use` | Schema-aware safe `tool_use` |
| `acgw-mock-tool-continue` / `tool_continue` | Final text after tool result |
| `acgw-mock-bad-tool` / `malformed_tool` | Internal provider failure → Anthropic error |
| `acgw-mock-error` / `backend_error_pre` | Pre-stream HTTP error |
| `acgw-mock-error-mid` / `backend_error_mid` | Mid-stream SSE `error` event |
| `acgw-mock-limit` / `forced_limit` | Forced limit error |
| `acgw-mock-coding` / `coding` | Coding tool loop (prefer `Read`) |
| `acgw-mock-empty` / `empty_provider` | Empty/malformed provider fail-safe error |
| `auto` (default) | Infer text / tool_use / tool_continue from request |

Allowlist: `auto`, `text`, `stream_text`, `tool_use`, `tool_continue`, `malformed_tool`, `backend_error_pre`, `backend_error_mid`, `forced_limit`, `coding`, `empty_provider`.

## Curl examples

Replace the token with your `ACGW_AUTH_TOKEN`.

### Non-streaming

```powershell
curl -s http://127.0.0.1:8131/v1/messages `
  -H "Authorization: Bearer acgw-local-dev" `
  -H "content-type: application/json" `
  -d '{"model":"acgw-mock-text","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

### Streaming

```powershell
curl -N http://127.0.0.1:8131/v1/messages `
  -H "Authorization: Bearer acgw-local-dev" `
  -H "content-type: application/json" `
  -d '{"model":"acgw-mock-stream","max_tokens":64,"stream":true,"messages":[{"role":"user","content":"Hello"}]}'
```

### Tool-use

```powershell
curl -s http://127.0.0.1:8131/v1/messages `
  -H "Authorization: Bearer acgw-local-dev" `
  -H "content-type: application/json" `
  -d '{"model":"acgw-mock-tool","max_tokens":128,"messages":[{"role":"user","content":"Read package.json"}],"tools":[{"name":"Read","input_schema":{"type":"object","properties":{"file_path":{"type":"string"}},"required":["file_path"]}}]}'
```

## Tests

```powershell
cd services/anthropic-compat-gateway
pip install -e ".[dev]"
pytest
# or: pytest -q
```

In-process smoke (no live server required):

```powershell
python scripts/smoke_http.py
```

## Claude Code smoke status

**Proven (mock-only)** against `@anthropic-ai/claude-code` **2.1.217** on 2026-07-21.

Surfaces inspected (not guessed):

- `npx @anthropic-ai/claude-code --help` — documents `-p/--print`, `--model`, `--bare`, `--tools` / `--allowedTools`, auth via `ANTHROPIC_API_KEY` / `apiKeyHelper`
- Official env docs: [Environment variables](https://code.claude.com/docs/en/env-vars.md) — `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`
- Binary string presence of those env names in the installed `claude.exe`

Safe mock smoke (temp dir only; no repo edits; gateway mock provider):

```powershell
# Terminal A — gateway
$env:ACGW_AUTH_TOKEN="acgw-local-dev"
uvicorn app.main:app --host 127.0.0.1 --port 8131

# Terminal B — isolated temp workspace
$env:ANTHROPIC_BASE_URL="http://127.0.0.1:8131"
$env:ANTHROPIC_API_KEY="acgw-local-dev"
$env:ANTHROPIC_AUTH_TOKEN="acgw-local-dev"

npx @anthropic-ai/claude-code -p --bare --model acgw-mock-text --tools "" `
  --permission-mode dontAsk --no-session-persistence "Say only the word READY."
# → Mock assistant reply ... nonce=ACGW_MOCK_NONCE_7f3a91c2

npx @anthropic-ai/claude-code -p --bare --model acgw-mock-coding --allowedTools Read `
  --permission-mode dontAsk --no-session-persistence `
  "Read README.txt and reply with its contents only. Do not edit files."
# → Mock coding loop complete. The package name is life-harness. No edits were made.
```

Note: `--model acgw-mock-coding` with `--tools ""` returns HTTP 400 from this gateway (`No tools were supplied`) because the coding scenario requires tools — use `--allowedTools Read` or the text model for smokes.

## Security assumptions

- Localhost bind (`127.0.0.1`) intended for local/dev use
- No multi-tenant auth, TLS termination, or rate limiting in Slice 1
- Default: auth token required; `ACGW_ALLOW_NO_AUTH` is for automated tests only
- Logs are metadata/lengths only; authorization headers and API keys are redacted
- Do not expose this process on a public interface

## Future real-provider seam

`DisabledRealProvider` (`ACGW_PROVIDER=disabled_real`) exists so wiring can be tested without inference. All `plan` / `complete` / `stream_events` calls raise `PreStreamProviderError` (fail-closed). Enabling real backends remains a future explicit ticket (`ACGW_ENABLE_REAL` stays rejected at startup).

## Service-local scripts

| Script | Role |
|--------|------|
| `scripts/run_uvicorn.py` | Validate auth config from env, print host/port, run uvicorn |
| `scripts/smoke_http.py` | In-process TestClient smoke: non-stream, stream, tool loop |
