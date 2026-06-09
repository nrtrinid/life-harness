# Life Harness AI Gateway (Phase 0)

Minimal local AI gateway prototype for analyzing messy transcripts and speech-to-text notes. This is **not** the Life Harness app — it tests whether structured scout output can be produced locally before wiring into the main product.

**Phase 0:** mock provider (default) + OpenVINO stub. **Phase 0.5:** local evaluation harness (synthetic fixture + CLI script). Real A770 inference is Phase 1 — see [docs/local-a770-plan.md](../../docs/local-a770-plan.md).

## Quickstart (mock mode)

```bash
cd services/ai-gateway
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -e ".[dev]"
$env:SCOUT_PROVIDER="mock"      # PowerShell
pytest
uvicorn app.main:app --reload --host 127.0.0.1 --port 8111
```

## Evaluation harness (Phase 0.5)

Manual check that scout output is worth iterating on before OpenVINO.

1. Start the service (see Quickstart above).
2. Analyze the synthetic fixture:

   ```powershell
   python scripts/analyze_file.py tests/fixtures/synthetic_transcript.txt
   ```

3. Compare stdout to [docs/sample-outputs/mock_synthetic_analysis.json](docs/sample-outputs/mock_synthetic_analysis.json).
4. Score usefulness with [docs/evaluation-rubric.md](docs/evaluation-rubric.md).

The script prints **result JSON only** on stdout. On stderr it may show file path, character length, and HTTP status — never the transcript text.

```powershell
# Optional flags
python scripts/analyze_file.py tests/fixtures/synthetic_transcript.txt --mode operator --sensitivity S1 --timeout 30
# Phase 1 OpenVINO (slow): --timeout 180
```

**Transcript safety:** Do not commit real transcripts. Use `*.transcript.txt` for local-only files (gitignored). The only committed sample is `tests/fixtures/synthetic_transcript.txt` (clearly fake).

Golden sync in CI: `tests/test_synthetic_golden.py` asserts mock output matches the committed sample.

## Endpoints

### `GET /health`

Returns provider name, readiness, and optional setup message.

### `POST /analyze-transcript`

```bash
curl -s http://127.0.0.1:8111/health

curl -s -X POST http://127.0.0.1:8111/analyze-transcript ^
  -H "Content-Type: application/json" ^
  -d "{\"text\": \"um I keep putting off my resume and researching notion instead\", \"mode\": \"operator\", \"sensitivity\": \"S1\"}"
```

**Sensitivity:** `S3` is rejected with HTTP 422 before any provider runs (rules-only).

**OpenVINO (`SCOUT_PROVIDER=openvino`):** Phase 0 stub returns degraded `/health` and HTTP 503 on analyze with setup instructions. No model download in this pass.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCOUT_PROVIDER` | `mock` | `mock` or `openvino` (stub) |
| `SCOUT_HOST` | `127.0.0.1` | Bind host (localhost only) |
| `SCOUT_PORT` | `8111` | Bind port |
| `SCOUT_MODEL_PATH` | `./models/qwen3-8b-int4-ov` | Reserved for Phase 1 |
| `SCOUT_DEVICE` | `GPU` | Reserved for Phase 1 (A770) |
| `SCOUT_MAX_NEW_TOKENS` | `1024` | Reserved for Phase 1 |

## Privacy

- Bind to `127.0.0.1` only
- No auth in Phase 0
- Full transcripts are not logged (length only)
- Do not commit `models/` or `*.transcript.txt`
- No cloud AI — local/mock only

## Non-goals (Phase 0)

- Life Harness frontend integration
- Database, authentication
- Real OpenVINO inference or GPU debugging
- Autonomous actions (send, spend, trade, commit)

## Layout

```text
app/
  main.py              # FastAPI app
  models.py            # Strict Pydantic contracts
  config.py            # Environment settings
  prompt_loader.py     # Prompt template loader (Phase 1)
  providers/
    base.py            # Provider protocol + JSON parser
    mock.py            # Default provider
    openvino_provider.py  # Phase 0 stub
  prompts/
    transcript_analysis.md
scripts/
  analyze_file.py      # POST local file to running gateway
tests/
  fixtures/
    synthetic_transcript.txt
  test_contracts.py
  test_synthetic_golden.py
docs/
  evaluation-rubric.md
  sample-outputs/
    mock_synthetic_analysis.json
```
