# Anthropic Compat Gateway (ACGW)

Local **Anthropic Messages-compatible subset** for development and testing of Claude Code / Anthropic client flows against Life Harness.

This is **not** full Anthropic API compatibility. It is a mock-first gateway that speaks a useful slice of `POST /v1/messages` (including SSE and tool_use) so clients can be exercised without real model backends.

## Purpose

- Deterministic mock completions for local client smoke tests
- Anthropic-shaped request/response and error envelopes
- Optional **experimental Raw Lab connectivity provider** for local-model
  diagnostics (Slice 2A) via loopback `services/ai-gateway`
- Optional **LocalCodingProvider** (Coding Slice A) via loopback
  `POST /ai/coding/chat` — dedicated coding text lane (not Raw Lab)
- Fail-closed real-provider seam (`DisabledRealProvider`) until a future slice enables inference
- Service-local only: no Companion board state, Expo app, or root npm scripts required

The Raw Lab provider is **not** the permanent Claude Code coding provider, does
**not** preserve complete Anthropic coding semantics, is **not** used for
structured tool loops, and is **not** the planned true-streaming path. Keep it for
diagnostics; do not delete it. Prefer `ACGW_PROVIDER=local_coding` for Claude Code
local text experiments.

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
- Local Raw Lab provider streaming (`stream: true` / `/raw-lab/stream` — not this path)
- Local Raw Lab provider tools, non-default `tool_choice`, and tool_use/tool_result content
- Images, documents, thinking blocks, citations, batches, files, models list, count tokens
- Anthropic admin / organization APIs
- Cloud auth (OAuth, Anthropic console keys as upstream)
- Full beta feature parity
- Automatic fallback from local provider to mock or cloud

## Configuration

All settings use the `ACGW_*` prefix.

| Variable | Default | Meaning |
|----------|---------|---------|
| `ACGW_PROVIDER` | `mock` | `mock`, `disabled_real`, `local_ai_gateway`, or `local_coding` |
| `ACGW_HOST` | `127.0.0.1` | Bind host |
| `ACGW_PORT` | `8131` | Bind port |
| `ACGW_AUTH_TOKEN` | empty | **Required by default.** Bearer / `x-api-key` value |
| `ACGW_ALLOW_NO_AUTH` | `0` | If `1` and token empty: auth disabled (**local tests only**) |
| `ACGW_ENABLE_REAL` | `0` | Must stay `0`; `1` fails startup |
| `ACGW_LOG_BODIES` | `0` | Metadata-only logs by default |
| `ACGW_MAX_INPUT_CHARS` | `100000` | Budget over serialized `system` + `messages` + `tools` |
| `ACGW_ENABLE_LOCAL_AI_GATEWAY` | `0` | Must be `1` when `ACGW_PROVIDER=local_ai_gateway` |
| `ACGW_LOCAL_AI_GATEWAY_BASE_URL` | `http://127.0.0.1:8111` | Loopback-only Raw Lab base (`http` + `127.0.0.1`/`localhost`) |
| `ACGW_LOCAL_AI_GATEWAY_TIMEOUT_SECONDS` | `120` | Overall HTTP timeout |
| `ACGW_LOCAL_AI_GATEWAY_CONNECT_TIMEOUT_SECONDS` | `5` | Connect timeout |
| `ACGW_LOCAL_AI_GATEWAY_MAX_RESPONSE_BYTES` | `1048576` | Max upstream response body size |
| `ACGW_LOCAL_AI_GATEWAY_MODEL_ALIAS` | `local-qwen` | Canonical model alias (plus fixed `acgw-local-qwen`) |
| `ACGW_ENABLE_LOCAL_CODING` | `0` | Must be `1` when `ACGW_PROVIDER=local_coding` |
| `ACGW_LOCAL_CODING_BASE_URL` | `http://127.0.0.1:8111` | Loopback-only coding base |
| `ACGW_LOCAL_CODING_TIMEOUT_SECONDS` | `120` | Overall HTTP timeout |
| `ACGW_LOCAL_CODING_CONNECT_TIMEOUT_SECONDS` | `5` | Connect timeout |
| `ACGW_LOCAL_CODING_MAX_RESPONSE_BYTES` | `1048576` | Max upstream response body size |
| `ACGW_LOCAL_CODING_MODEL_ALIAS` | `local-qwen-coding` | Canonical coding alias (plus fixed `acgw-local-coding`) |

Empty `ACGW_AUTH_TOKEN` without `ACGW_ALLOW_NO_AUTH=1` is invalid: the process refuses to start.

## Local Raw Lab provider (Slice 2A)

**Experimental Raw Lab connectivity provider for local-model diagnostics.**

Non-streaming bridge from Anthropic `POST /v1/messages` to local ai-gateway
`POST /raw-lab`. This is not the permanent Claude Code coding provider and does
not preserve complete Anthropic coding semantics. It is not used for structured
tool loops and is not the planned true-streaming path. A dedicated coding lane
will supersede it for Claude Code use.

**Enable:**

```powershell
$env:ACGW_PROVIDER="local_ai_gateway"
$env:ACGW_ENABLE_LOCAL_AI_GATEWAY="1"
$env:ACGW_LOCAL_AI_GATEWAY_BASE_URL="http://127.0.0.1:8111"
$env:ACGW_AUTH_TOKEN="acgw-local-dev"
```

**Model aliases:** configured `ACGW_LOCAL_AI_GATEWAY_MODEL_ALIAS` (default `local-qwen`) and hardcoded `acgw-local-qwen` (same upstream path). Echo `request.model` on the response.

**Translation:**

| Anthropic | Raw Lab |
|-----------|---------|
| `system` (str or text parts) | **Prompt translation** only: prepended into final user `message` as `System:\n...\n\n{user}` — not a native system role and not a separate Raw Lab field |
| `messages[:-1]` | `recent_turns` (role + flattened plain text) |
| last user message | `message` |
| — | `thread_state={}`, `companion_self_memories=[]`, `reasoning_depth="fast"` |

**Generation / transport fields** (accepted for Anthropic protocol compatibility; **never** forwarded to Raw Lab; do **not** claim they influence Raw Lab generation):

| Field | Behavior |
|-------|----------|
| `max_tokens`, `temperature`, `top_p` | Accepted; Raw Lab applies its own server-side generation policy |
| `metadata` | Transport-only; never placed in model-visible text or the upstream body |
| Non-empty `stop_sequences` | **Rejected** (would be silently ignored) |

**`tool_choice` / tools policy** (never forwarded to Raw Lab):

- Non-empty `tools` list → reject
- `tool_use` / `tool_result` content blocks → reject
- Explicit non-default `tool_choice` → reject
- Omitted or default (`auto` / `{"type":"auto"}` / empty) with no tools → accept

**Usage:** honest zeros — `input_tokens=0`, `output_tokens=0` (Raw Lab does not expose token counts in this slice).

**Also rejected:** `stream: true`. Mock scenario header `x-acgw-scenario` is ignored (scenario label fixed to `local`).

**No fallback:** offline/timeout/malformed Raw Lab responses surface as Anthropic errors. There is no automatic switch to MockProvider or cloud.

**Logging:** lengths/metadata only. Raw Lab prompts, answers, and upstream bodies are never logged.

**Security:** base URL must be loopback `http://127.0.0.1` or `http://localhost` only. IPv6 `::1`, LAN/public hosts, https, and URL userinfo are rejected at startup.

## Local Coding provider (Coding Slice A/B)

Dedicated bridge from Anthropic `POST /v1/messages` to local
ai-gateway `POST /ai/coding/chat` (non-stream) and `POST /ai/coding/chat/stream`
(true incremental SSE). **Does not call Raw Lab.**

**Enable:**

```powershell
$env:ACGW_PROVIDER="local_coding"
$env:ACGW_ENABLE_LOCAL_CODING="1"
$env:ACGW_LOCAL_CODING_BASE_URL="http://127.0.0.1:8111"
$env:ACGW_AUTH_TOKEN="acgw-local-dev"
```

**Model aliases:** configured `ACGW_LOCAL_CODING_MODEL_ALIAS` (default
`local-qwen-coding`) and hardcoded `acgw-local-coding`. Upstream always uses
`model_alias=coding_fast`. Echo `request.model` on the response.

**Translation:** Anthropic `system` + ordered `messages` → coding contract
(structured; not Raw Lab `message`/`recent_turns`). Forwards `max_tokens`,
`temperature`, `top_p`, and transport `metadata` for ai-gateway policy mapping.
Rejects tools, non-default `tool_choice`, tool blocks, and non-empty
`stop_sequences`. Streaming is supported via `/ai/coding/chat/stream` (Coding Slice B).

**Streaming** via `LocalCodingProvider` maps Anthropic SSE onto ai-gateway
`POST /ai/coding/chat/stream`. Pipeline busy behavior (ai-gateway): while a
generation worker holds the shared OpenVINO backend, a second coding/companion
call is **rejected immediately** with a temporary busy / provider-unavailable
error (not “model missing”). Ownership releases only after the worker exits;
health stays responsive.

### Later notes

- Coding Slice C: structured tools
- Raw Lab remains diagnostics-only; keep Raw Lab endpoint ownership explicit

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
python scripts/smoke_local_fake.py
python scripts/smoke_local_coding_fake.py
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
| `scripts/smoke_http.py` | In-process TestClient smoke: non-stream, stream, tool loop (mock) |
| `scripts/smoke_local_fake.py` | In-process local Raw Lab provider smoke with MockTransport |
| `scripts/smoke_local_coding_fake.py` | In-process local coding provider smoke with MockTransport |
