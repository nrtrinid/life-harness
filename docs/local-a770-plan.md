# Local A770 AI Gateway Plan

Companion to [08_ai_provider_and_a770_plan.md](./08_ai_provider_and_a770_plan.md).

This document tracks the **standalone gateway prototype** at `services/ai-gateway/`. The main Life Harness Expo app remains rules-only in v0.1.

## Phase 0 — mock gateway (done)

**Goal:** Prove API contracts, sensitivity gate, and mock scout output without GPU setup.

Delivered: mock provider, OpenVINO stub path, strict schema, S3 gate, `SCOUT_PROVIDER=mock pytest`.

## Phase 0.5 — evaluation harness (done)

Synthetic fixture, `scripts/analyze_file.py`, evaluation rubric, golden mock sample, `test_synthetic_golden.py`.

## Phase 1 — OpenVINO GenAI on A770 (done)

**Goal:** Run [OpenVINO/Qwen3-8B-int4-ov](https://huggingface.co/OpenVINO/Qwen3-8B-int4-ov) locally on Intel Arc A770 GPU.

**Implemented in `services/ai-gateway`:**

```text
OpenVinoProvider with lazy LLMPipeline load
Prompt via transcript_analysis.md
JSON parse + one repair pass on failure
SCOUT_MAX_INPUT_CHARS / SCOUT_TIMEOUT_SECONDS / SCOUT_TEMPERATURE
Degraded /health when deps or model path missing
502 on parse failure, 503 on not-ready, 422 on oversize input
```

**Manual setup:**

```powershell
cd services/ai-gateway
pip install -e ".[dev,openvino]"
huggingface-cli download OpenVINO/Qwen3-8B-int4-ov --local-dir models/qwen3-8b-int4-ov

$env:SCOUT_PROVIDER="openvino"
$env:SCOUT_MODEL_PATH="models/qwen3-8b-int4-ov"
$env:SCOUT_DEVICE="GPU"
uvicorn app.main:app --host 127.0.0.1 --port 8111

python scripts/analyze_file.py tests/fixtures/synthetic_transcript.txt --timeout 180
```

CI does not require GPU or model weights; OpenVINO tests assert degraded/503 when the model path is missing.

**Hardware:** Intel Arc A770, ~5GB model download, Windows tested path first.

## Phase 1.5 — OpenVINO smoke / evaluation (done)

Smoke script, report template, CLI tests. OpenVINO evaluated by schema + rubric only.

## Phase 1.6 — Real A770 smoke run (done)

**Result:** GPU pass on Intel Arc A770 after `apply_chat_template=True` fix in OpenVinoProvider.

```text
Smoke: exit 0, schema_valid true, ~29s first analyze (GPU)
Example: docs/sample-outputs/openvino_synthetic_analysis.example.json
Report: services/ai-gateway/docs/openvino-smoke-report.md
Rubric: weak overall (valid JSON, mixed action quality) → Phase 1.7 prompt tuning
```

**Blocker resolved:** `apply_chat_template=False` caused JSON parse failure on Qwen3; not a GPU issue.

## Phase 1.7 — Prompt tuning (done)

**Result:** Parking/action consistency fixed on synthetic fixture; rubric overall mixed/usable (up from weak).

```text
Prompt: transcript_analysis.md — derivation order, parking rules, single pounce, body/career split
Helper: scripts/check_output_consistency.py (manual reviewer, not CI)
Provider: enable_thinking=False via ChatHistory (Qwen3 JSON reliability with longer prompt)
Smoke: exit 0, ~19s, consistency helper all pass
Example: docs/sample-outputs/openvino_synthetic_analysis.example.json
Report: services/ai-gateway/docs/openvino-smoke-report.md (Phase 1.7 section)
```

## Phase 1.8 — Ask Harness Sandbox (done)

**Result:** Read-only `POST /ask-harness` over caller-provided context bundle; mock heuristics + OpenVINO prompt path.

```text
Endpoint: POST /ask-harness
CLI: scripts/ask_harness.py (default synthetic context fixture)
Docs: services/ai-gateway/docs/ask-harness-sandbox.md
Tests: mock-only in CI; OpenVINO code path + 503 when model missing
Not: UI, DB, RAG, persistent memory, app integration
```

## Phase 1.8b — Ask Harness prompt tune (done)

**Result:** Tuned `app/prompts/ask_harness.md` + ask-harness-specific OpenVINO JSON repair hint. Re-smoke: **5/5 schema-valid**, reflection 502 fixed, operator/builder answers substantive.

```text
Prompt: app/prompts/ask_harness.md (substantive answer rules, mode guidance, JSON strictness)
Provider tweak: ask-harness repair prompt in openvino_provider.py (array-field reminder)
Report: services/ai-gateway/docs/ask-harness-openvino-smoke.md (Phase 1.8b section)
Next: Career-first Momentum Board context integration
```

## Phase 2 — Model Server + Life Harness integration

Optional alternate runtime:

```text
ovms --rest_port 8000 --source_model OpenVINO/Qwen3-8B-int4-ov --target_device GPU
```

OpenAI-compatible client against `http://127.0.0.1:8000/v3`.

Life Harness app integration:

```text
Life Harness (future) → services/ai-gateway → local model
```

Shared types may move to `packages/core/` later. Gateway API uses display labels for card areas/states; core uses snake_case — mapping layer TBD.

## Sensitivity routing

| Level | Gateway behavior |
|-------|------------------|
| S0/S1 | Allowed to provider (when ready) |
| S2 | Allowed — local AI preferred |
| S3 | HTTP 422 — never sent to model |

## Gitignore (service)

```text
services/ai-gateway/.venv/
services/ai-gateway/models/
services/ai-gateway/*.transcript.txt
```

## Failure modes

| Symptom | Action |
|---------|--------|
| OpenVINO not installed | Use `SCOUT_PROVIDER=mock` |
| Model path missing | Phase 1 setup; stub returns 503 |
| GPU unavailable | Document CPU fallback; do not block Phase 0 |
| Invalid model JSON | 502 + log parse error; improve prompt |
