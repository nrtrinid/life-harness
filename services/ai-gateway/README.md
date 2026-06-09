# Life Harness AI Gateway

Minimal local AI gateway prototype for analyzing messy transcripts and speech-to-text notes. This is **not** the Life Harness app.

**Phase 0:** mock provider + OpenVINO integration path. **Phase 0.5:** evaluation harness. **Phase 1:** real OpenVINO GenAI provider. **Phase 1.5:** OpenVINO smoke script + manual report. **Phase 1.8:** Ask Harness read-only chat sandbox. **Phase 1.8b:** conversational Chat Harness endpoint.

See [docs/local-a770-plan.md](../../docs/local-a770-plan.md) for the full roadmap.

## Quickstart (mock mode)

```powershell
cd services/ai-gateway
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
$env:SCOUT_PROVIDER="mock"
pytest
uvicorn app.main:app --reload --host 127.0.0.1 --port 8111
```

## OpenVINO mode (Phase 1)

### 1. Install dependencies

Requires Intel GPU drivers and a Python 3.11+ venv:

```powershell
pip install -e ".[dev,openvino]"
```

This installs `openvino-genai` and `huggingface_hub`. GPU inference targets Intel Arc A770 via `SCOUT_DEVICE=GPU`.

### 2. Download the model (do not commit weights)

```powershell
mkdir models
huggingface-cli download OpenVINO/Qwen3-8B-int4-ov --local-dir models/qwen3-8b-int4-ov
```

Or download to any local directory and set `SCOUT_MODEL_PATH`.

### 3. Run the gateway

```powershell
$env:SCOUT_PROVIDER="openvino"
$env:SCOUT_MODEL_PATH="models/qwen3-8b-int4-ov"
$env:SCOUT_DEVICE="GPU"
$env:SCOUT_TIMEOUT_SECONDS="120"
$env:SCOUT_MAX_INPUT_CHARS="12000"
$env:SCOUT_TEMPERATURE="0.2"
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

`GET /health` returns `ok` when OpenVINO is installed and the model path is present. The pipeline lazy-loads on the first `POST /analyze-transcript`.

If dependencies or the model path are missing, `/health` is `degraded` and analyze returns HTTP 503 with setup instructions.

### 4. Quick analyze (optional)

```powershell
python scripts/analyze_file.py tests/fixtures/synthetic_transcript.txt --timeout 180
```

## Phase 1.5 — OpenVINO smoke test

Structured smoke run against the synthetic fixture. **Stdout** prints only `smoke: pass` or `smoke: fail`; metrics go to **stderr** for pasting into the report.

1. Start the OpenVINO gateway (step 3 above).
2. From `services/ai-gateway`:

   ```powershell
   python scripts/smoke_openvino.py
   ```

3. Optionally save validated JSON (synthetic example path only):

   ```powershell
   python scripts/smoke_openvino.py --write-output
   python scripts/smoke_openvino.py --write-output custom.json
   ```

4. Paste stderr `Smoke metrics:` block into [docs/openvino-smoke-report.md](docs/openvino-smoke-report.md).
5. Score with [docs/evaluation-rubric.md](docs/evaluation-rubric.md).

**Mock vs OpenVINO evaluation:**
- Mock: golden equality in `test_synthetic_golden.py` vs `mock_synthetic_analysis.json`
- OpenVINO: **schema + rubric only** — no golden JSON comparison

**Exit codes:** 2 = cannot reach service; 3 = health not ready / wrong provider; 4 = analyze or schema failure.

**Do not commit:** real transcript outputs, ad-hoc `openvino_*.json` (gitignored). `models/` stays gitignored. Only `openvino_synthetic_analysis.example.json` is safe to commit if generated from the synthetic fixture.

## Phase 1.8 — Ask Harness Sandbox

Read-only scout chat over a **caller-provided context bundle** (cards, logs, proof, analyses, decisions). Not persistent memory, not RAG, not app integration.

See [docs/ask-harness-sandbox.md](docs/ask-harness-sandbox.md).

### Mock quickstart

```powershell
$env:SCOUT_PROVIDER="mock"
uvicorn app.main:app --host 127.0.0.1 --port 8111

python scripts/ask_harness.py
python scripts/ask_harness.py --question "What should I build next?" --mode builder
```

Default context: `tests/fixtures/synthetic_harness_context.json` (fake data only).

### Optional OpenVINO

If the OpenVINO gateway is already running (see OpenVINO mode above), the same CLI works unchanged — no extra setup.

**Exit codes:** 1 = usage/context error; 2 = connection error; 3 = non-2xx API response.

### Browser playground

Dev-only UI for vibe-testing Ask Harness in the browser (no persistence, synthetic default context):

```powershell
$env:SCOUT_PROVIDER="mock"
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

Open [http://127.0.0.1:8111/playground](http://127.0.0.1:8111/playground) (alias: `/ask-harness-playground`).

Quick-question buttons match the CLI vibe tests. Response renders in readable sections. Works with OpenVINO if that gateway is already running.

### Phase 1.8b — Conversational Chat Harness

Simpler chat endpoint for vibe-testing a normal chatbot feel (no structured grounding arrays). Defaults to **Conversational Chat** in the playground.

```powershell
python scripts/chat_harness.py
python scripts/chat_harness.py --message "Am I over-optimizing again?" --mode reflection
```

`POST /chat-harness` returns `{ answer, used_context, confidence_notes, safety_notes }`. OpenVINO parse failures return a safe fallback with HTTP 200 (not 502). `/ask-harness` remains unchanged.

## Evaluation harness (Phase 0.5)

1. Start the service (mock or OpenVINO).
2. `python scripts/analyze_file.py tests/fixtures/synthetic_transcript.txt`
3. Compare mock output to [docs/sample-outputs/mock_synthetic_analysis.json](docs/sample-outputs/mock_synthetic_analysis.json).
4. Review with [docs/evaluation-rubric.md](docs/evaluation-rubric.md).

The script prints **result JSON only** on stdout. stderr may show file path, length, and HTTP status — never transcript text.

**Transcript safety:** Do not commit real transcripts. Use `*.transcript.txt` for local-only files (gitignored). Only `tests/fixtures/synthetic_transcript.txt` is committed (clearly fake).

## Endpoints

### `GET /health`

Returns provider name, readiness, model, device, and optional setup message.

### `POST /analyze-transcript`

**Sensitivity:** `S3` is rejected with HTTP 422 before any provider runs.

**Errors:**
- 422 — validation or input exceeds `SCOUT_MAX_INPUT_CHARS`
- 502 — model output could not be parsed as valid JSON
- 503 — provider not ready (missing deps, model, load failure, or inference timeout)

### `POST /ask-harness`

Read-only scout chat over caller-provided context. See [docs/ask-harness-sandbox.md](docs/ask-harness-sandbox.md).

**Sensitivity:** `S3` rejected with HTTP 422 before provider.

**Errors:** same as analyze-transcript (422 / 502 / 503). OpenVINO checks full serialized prompt length against `SCOUT_MAX_INPUT_CHARS`.

### `POST /chat-harness`

Conversational scout chat with simpler response shape. See Phase 1.8b above.

**Sensitivity:** `S3` rejected with HTTP 422 before provider.

**Errors:** 422 / 503 only (no 502 for parse failure — OpenVINO returns a safe fallback body with HTTP 200).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCOUT_PROVIDER` | `mock` | `mock` or `openvino` |
| `SCOUT_HOST` | `127.0.0.1` | Bind host (localhost only) |
| `SCOUT_PORT` | `8111` | Bind port |
| `SCOUT_MODEL_PATH` | `models/qwen3-8b-int4-ov` | Local OpenVINO model directory |
| `SCOUT_DEVICE` | `GPU` | OpenVINO device (`GPU`, `CPU`, `NPU`) |
| `SCOUT_MAX_NEW_TOKENS` | `1024` | Max tokens generated |
| `SCOUT_TIMEOUT_SECONDS` | `120` | Inference timeout per request |
| `SCOUT_MAX_INPUT_CHARS` | `12000` | Max transcript length for OpenVINO |
| `SCOUT_TEMPERATURE` | `0.2` | Sampling temperature |

## Privacy

- Bind to `127.0.0.1` only
- No auth
- Transcript content is not logged (length only)
- Do not commit `models/` or `*.transcript.txt`
- No cloud AI

## Non-goals

- Life Harness frontend integration
- Database, authentication
- Speech-to-text, RAG, background agents
- Autonomous actions (send, spend, trade, commit)

## Layout

```text
app/
  main.py
  models.py
  config.py
  prompt_loader.py
  providers/
    base.py
    mock.py
    openvino_provider.py
  prompts/
    transcript_analysis.md
    ask_harness.md
    chat_harness.md
playground/
  ask_harness.html
scripts/
  analyze_file.py
  ask_harness.py
  chat_harness.py
  check_output_consistency.py
  smoke_openvino.py
tests/
  fixtures/synthetic_transcript.txt
  fixtures/synthetic_harness_context.json
  test_contracts.py
  test_ask_harness_contract.py
  test_ask_harness_cli.py
  test_chat_harness_contract.py
  test_chat_harness_cli.py
  test_playground.py
  test_openvino_provider.py
  test_smoke_openvino_cli.py
  test_synthetic_golden.py
docs/
  ask-harness-sandbox.md
  evaluation-rubric.md
  openvino-smoke-report.md
  sample-outputs/mock_synthetic_analysis.json
  sample-outputs/openvino_synthetic_analysis.example.json
```
