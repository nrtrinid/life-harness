# Local A770 AI Gateway Plan

Companion to [08_ai_provider_and_a770_plan.md](./08_ai_provider_and_a770_plan.md).

This document tracks the **standalone gateway prototype** at `services/ai-gateway/`. The main Life Harness Expo app remains rules-only in v0.1.

## Phase 0 — mock gateway (current)

**Goal:** Prove API contracts, sensitivity gate, and mock scout output without GPU setup.

Delivered:

```text
GET  /health
POST /analyze-transcript
MockProvider (default)
OpenVINO stub (degraded / 503)
Strict Pydantic response schema
SCOUT_PROVIDER=mock pytest
S3 rejected before provider execution
```

**Not in Phase 0:** real inference, model download, GPU debugging, UI, auth, database.

Acceptance:

```bash
cd services/ai-gateway
pip install -e ".[dev]"
SCOUT_PROVIDER=mock pytest
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

## Phase 1 — OpenVINO GenAI on A770

**Goal:** Run [OpenVINO/Qwen3-8B-int4-ov](https://huggingface.co/OpenVINO/Qwen3-8B-int4-ov) locally on Intel Arc A770 GPU.

Steps:

1. Install Intel GPU drivers and OpenVINO GenAI:

   ```bash
   pip install openvino-genai huggingface_hub
   ```

2. Download model to `./models/qwen3-8b-int4-ov` (do not commit weights).

3. Set environment:

   ```text
   SCOUT_PROVIDER=openvino
   SCOUT_MODEL_PATH=./models/qwen3-8b-int4-ov
   SCOUT_DEVICE=GPU
   ```

4. Implement real `OpenVinoProvider.analyze()`:

   - `LLMPipeline(model_path, device)`
   - Prompt via `app/prompts/transcript_analysis.md` + `prompt_loader.py`
   - `parse_model_json()` in `app/providers/base.py`
   - Fallback to degraded health if load fails

5. Validate on messy transcripts; tune `max_new_tokens` and JSON reliability.

**Hardware:** Intel Arc A770, ~5GB model download, Windows tested path first.

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
