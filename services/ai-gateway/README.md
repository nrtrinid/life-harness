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
$env:SCOUT_TIMEOUT_SECONDS="180"
$env:SCOUT_MAX_INPUT_CHARS="18000"
$env:SCOUT_RAW_LAB_MAX_INPUT_CHARS="32000"
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

### Thread intelligence evals

Fixtures live in `evals/thread/`:

- `reference_resolution.json`
- `code_teaching.json`
- `grounded_context_vs_thread.json`
- `anti_repeat.json`
- `raw_lab_no_board_access.json`
- `personality_growth.json`
- `style_steering.json`
- `critic_evidence_coverage.json` — CI guard for `### Critic evidence` section presence/structure (not OpenVINO critic quality)

Run against mock (no live server required):

```powershell
$env:SCOUT_PROVIDER="mock"
pytest tests/test_thread_eval_fixtures.py -q
pytest -q
```

**CI-safe:** MockProvider only. Deterministic fixtures: `reference_resolution`, `anti_repeat`, `raw_lab_no_board_access`, `style_steering`, `grounded_context_vs_thread`. Manual-only comparative deck: `raw_lab_comparative_deck.json` (`tags: manual_only` — excluded from CI; see [docs/raw-lab-comparative-benchmark.md](../../docs/raw-lab-comparative-benchmark.md)).

**Raw Lab comparative benchmark (manual):** `python scripts/raw_lab_comparative_benchmark.py --variants fast,deep` — side-by-side Fast vs Deep report to `tmp/raw-lab-comparative-benchmark-results.md` (see doc for OpenVINO run). To include experimental Deep+, run `python scripts/raw_lab_comparative_benchmark.py --variants fast,deep,deep_plus`. v0.2 adds calibration scorers, category summary, failure spotlights, and optional `--check-python-artifacts`.

**OpenVINO manual smoke** (not in CI — run before prompt/model changes):

```powershell
$env:SCOUT_PROVIDER="openvino"
# Load model per OpenVINO section above
uvicorn app.main:app --host 127.0.0.1 --port 8111
python scripts/run_thread_eval.py
```

Model-dependent fixtures: `personality_growth`, `code_teaching` (phrasing may vary).

**Failure meanings:** missing `expect_substrings`, forbidden substring in answer, HTTP 422 (validation/S3), HTTP 503 (provider not ready).

Or against a running gateway (same as manual smoke):

```powershell
python scripts/run_thread_eval.py
```

### Local product evals (v0.1a)

Transcript, harness, and schema fixtures live beside thread evals:

- `evals/transcript/` — `POST /analyze-transcript` (ramble / pounce heuristics)
- `evals/harness/` — `POST /chat-harness` (pounce preference, limits)
- `evals/schema/` — JSON validity smoke (`expect_schema`, `expect_json_fields`)

Gate types: `expect_schema`, `heuristic_checks` (`single_pounce`, `inbox_default`, `proposed_updates_require_approval`), `expect_json_fields`, `forbid_substrings_in_fields`.

Run against mock (no live server required):

```powershell
$env:SCOUT_PROVIDER="mock"
pytest tests/test_transcript_eval_fixtures.py tests/test_harness_eval_fixtures.py -q
pytest tests/test_thread_eval_fixtures.py -q
pytest -q
```

**CI-safe:** MockProvider only. OpenVINO manual runs use the same fixtures via `run_thread_eval.py` once a unified runner ships (v0.1b).

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

**Request:** `{ message, mode?, sensitivity?, context, context_packet?, conversation_history?, thread_state?, reasoning_depth? }`

- `context_packet` (optional): ranked `AiContextPacket` wire (`packet_version: "0.1"`). When present, the **draft** prompt uses `resolve_context_bundle_for_prompt` (full ranked markdown sections). The **deep critic** uses `resolve_critic_context_bundle_for_prompt` — a tighter subset (top-ranked slices plus a structured `### Critic evidence` block when thread/packet fields exist), capped by `SCOUT_CRITIC_CONTEXT_MAX_CHARS` (default **1800**): S3 slices and `excluded_card_ids` omitted; no redaction notes or raw packet JSON. Invalid optional packets are stripped at validation; legacy `context` remains the fallback for both paths.
- `conversation_history`: prior user/assistant turns (answer text only for assistant).
- `thread_state`: temporary in-request working memory (`recent_digest`, `active_goal`, `current_topic`, `task_mode`, `open_loops`, `decisions`, `pinned_facts`, `user_steering`, `do_not_repeat`, `references`, `updated_at`). No personality.
- `reasoning_depth`: `fast` (default), `deliberate`, or `deep`. When `SCOUT_DEEP_ENABLED=true`, deep mode runs **draft → structured critic verdict → conditional final** inside the gateway (`InferenceOrchestrator` → `run_chat_harness_deep`). The app still receives the same `ChatHarnessResponse` shape — no critic text or model names in the response.

**Depth routing registry:** Authoritative mapping of `reasoning_depth` / `pipeline_profile` → slots and orchestrator paths lives in `app/orchestrator/depth_routing.py` (`resolve_depth_route`). Today `reasoning_depth` changes orchestration only — `slot_plan` always acquires `companion_fast`. With `SCOUT_DEBUG_THINKING_TRACE=true`, the gateway logs structured route metadata (`chat_harness_depth_route`, `raw_lab_depth_route`, `deep_synthesis_depth_route`, `deep_synthesis_job_depth_route`). Default **off**; no HTTP response change.

**Critic contract seam:** `app/critic_contract.py` provides internal normalization types and adapters so Chat Harness (`ChatHarnessCriticVerdict`), Deep Synthesis (`SynthesisCritique`), and Raw Lab Deep+ (`RawLabDeepPlusJudgeVerdict`) can be mapped into a shared verdict vocabulary for logging/evals. This is **not** a public API and does not change any request/response schemas.

**Sensitivity:** `S3` rejected with HTTP 422 before provider.

**Errors:** 422 / 503 only (no 502 for parse failure — OpenVINO returns a safe fallback body with HTTP 200).

### `POST /ai/deep-synthesis`

Structured deep synthesis over caller-provided board context. See [docs/plans/deep-synthesis-overnight-brain-v0.1.md](../../docs/plans/deep-synthesis-overnight-brain-v0.1.md).

**Request:** `{ trigger?, sensitivity?, user_prompt, context, conversation_history?, thread_state?, interpretation_lenses?, pipeline_profile?, prefer_async_if_slow? }`

- `pipeline_profile=fast_only` (or `auto`): sync completion — mock when `SCOUT_PROVIDER=mock`, OpenVINO companion_fast when `SCOUT_PROVIDER=openvino`.
- `pipeline_profile=with_critic` or `with_stretch`: returns `status: queued` with `job_id` + `poll_url` (poll via `GET /ai/jobs/{job_id}`).

**Stretch seam (prototype):** `with_stretch` is still mock-simulated in this gateway version. The job result includes optional `stretch_slot_status` (`slot_unavailable` vs `slot_ready_not_wired`) as **operational metadata only** — it reports slot availability/wiring state, not synthesis quality. No real `stretch_batch` inference calls yet.

**Retrieval stub (prototype):** `app/retrieval/embedding_slot.py` can probe `memory_embed` slot status (`disabled` / `unavailable_in_gateway` / `ready`). No embeddings are executed and no retrieval HTTP endpoint is exposed yet.

**Memory/RAG spine (mock v0.1):** `app/retrieval/` provides typed documents, deterministic chunking, a **mock token-overlap test provider**, and bounded evidence packets. See [docs/local-memory-rag-spine-v0.1.md](../../docs/local-memory-rag-spine-v0.1.md). `SCOUT_MEMORY_RAG_ENABLED=false` by default; enabling it does **not** turn on real RAG and does **not** wire into Chat Harness.

**Sensitivity:** `S3` rejected with HTTP 422 before provider or job creation.

**OpenVINO fast path:** Single structured JSON prompt (`app/prompts/deep_synthesis_fast_only.md`). Parse failure, timeout, or verifier rejection returns HTTP 200 with a valid degraded deterministic fallback (`degraded_notes` explains why) — not HTTP 502.

**Manual smoke** (requires local model weights):

```powershell
$env:SCOUT_PROVIDER="openvino"
pytest tests/test_deep_synthesis_openvino_smoke.py -q
```

**Synthesis critic via llama.cpp** (`pipeline_profile=with_critic`; draft stays mock/rule-based when `SCOUT_PROVIDER=mock` — only the **critic pass** uses llama.cpp when configured). Full manual guide: [docs/phi4-synthesis-critic-smoke.md](docs/phi4-synthesis-critic-smoke.md).

```powershell
# Terminal 1: llama.cpp server (OpenAI-compatible) — user-provided GGUF, not committed
# Example weights path (operator machine only):
#   models/phi-4-reasoning-plus-Q4_K_M.gguf
llama-server -m C:\path\to\models\phi-4-reasoning-plus-Q4_K_M.gguf --host 127.0.0.1 --port 8120

# Terminal 2: gateway or smoke pytest (mock draft + real critic)
$env:SCOUT_PROVIDER="mock"
$env:SCOUT_CRITIC_RUNTIME="llamacpp"
$env:SCOUT_CRITIC_BASE_URL="http://127.0.0.1:8120/v1"
$env:SCOUT_CRITIC_MODEL="phi-4-reasoning-plus"
$env:SCOUT_CRITIC_TIMEOUT_SECONDS="60"
```

**Optional Phi-4 synthesis critic smoke** (skipped unless `SCOUT_PHI4_SMOKE=1`; never runs in default CI):

```powershell
$env:SCOUT_PHI4_SMOKE="1"
pytest tests/test_phi4_synthesis_critic_smoke.py -q
```

Success: job `completed`, `critique` present, verifier-valid body, no mock-fallback note in `degraded_notes`. Server down or bad JSON: job still completes via mock-rules fallback (see `test_synthesis_critic_llamacpp.py`).

Chat Harness critic routing (`SCOUT_CRITIC_SLOT=secondary`) is separate from synthesis `SCOUT_CRITIC_RUNTIME`.

**Deep mode debug trace** (dev only): `SCOUT_DEBUG_THINKING_TRACE=true` logs structured pass metadata (`draft` / `draft_repair` / `critic` / `revision` latencies, critic backend, check ids, `critic_context_chars`, `critic_context_max_chars`, depth route keys above, `parse_failures`, `draft_repair_attempted`, `draft_repair_succeeded`, `fail_soft_reason`) to gateway logs. Default **off**. Does not change `ChatHarnessResponse` or expose chain-of-thought. When deep draft JSON fails parse and repair does not recover it, critic is skipped and `confidence_notes` report `structured critic skipped (draft parse failed)` — not critic approval.

**Manual Chat Harness deep + secondary critic smoke:** [docs/llamacpp-critic-slot.md](docs/llamacpp-critic-slot.md) and [`scripts/smoke_deep_critic.py`](scripts/smoke_deep_critic.py). Record results in [docs/phi4-critic-smoke-results.md](docs/phi4-critic-smoke-results.md). OpenVINO smoke requires `.\.venv\Scripts\python.exe` for the gateway. `critic_small.enabled` via local `.tmp.models.smoke.yaml` (not committed default); llama-server is started externally. CPU `llama-server` works but is slow; `SCOUT_CRITIC_SLOT=same` remains default. No CI GPU requirement.

### `POST /raw-lab`

**Unrestricted** isolated sandbox chat. **Not** Ask Harness or Chat Harness. App-side prompt policy is direct and unhedged; only Life Harness isolation constraints apply (no board, no tools, no mutations).

**Request:** `{ message, recent_turns?, thread_state?, companion_self_memories?, reasoning_depth? }`

- `recent_turns`: prior user/assistant turns for this chat (not the latest `message`).
- `thread_state`: temporary in-request thread memory (`recent_digest`, `pinned_facts`, `decisions`, `open_loops`, `tone_preferences`, `do_not_repeat`, `personality`, `updated_at`). `recent_digest` is an extractive snippet, not a semantic summary.
- `thread_state.personality`: emergent in-session style (`voice_traits`, `conversational_instincts`, `recurring_interests`, `user_responds_well_to`, `user_dislikes`, `current_stance`, `growth_notes`, `updated_at`). Not consciousness, not persistent memory, not exported to Ask Harness.
- `companion_self_memories`: approved persistent Raw Lab self-memories (`id`, `kind`, `subject`, `scope`, `text`, `confidence`, `sensitivity`). Not board context, not Memory Bank. Visible/editable/deletable in the app. Compacted on send when over budget.
- `reasoning_depth`: `fast` (default), `deliberate`, `deep`, or experimental `deep_plus`. `deep_plus` uses the same model/provider as Deep with internal contract, candidate, judge, optional revision, and final verification passes. It never exposes candidates, judge JSON, prompts, scores, or hidden reasoning.

**Runtime awareness:** The system prompt includes a **Runtime awareness** section so capability questions ("what memories/tools do you have?") distinguish approved Companion Self-Memories from board context, Memory Bank, files, internet, and hidden memory. The prompt also shows an active self-memory count preface before the JSON block.

**Response:** `{ answer, mode: "raw_lab", safety_notes, used_context: false, deep_plus? }`

When `reasoning_depth="deep_plus"`, `deep_plus` is always present and includes:

```json
{
  "deep_plus_attempted": true,
  "deep_plus_used": true,
  "deep_plus_task_kind": "technical",
  "deep_plus_contract_confidence": "high",
  "deep_plus_selected_index": 1,
  "deep_plus_revised": false,
  "deep_plus_fallback_reason": null,
  "deep_plus_latency_ms": 12345
}
```

`deep_plus_used=false` means the request fell back to current Deep. Fallback reasons are `contract_failed`, `candidate_generation_failed`, `judge_failed`, `revision_failed`, `timeout`, and `final_contract_failed`. For fast/deliberate/deep responses, `deep_plus` is omitted or null.

**Isolation:** No `context`, `board_context`, `memory_context`, `proposed_card_updates`, `tools_enabled`, `save_summary`, or `conversation_history` — unknown fields rejected with HTTP 422. Always returns `used_context: false`. Does not use ask-harness or chat-harness prompts.

**Sensitivity:** v0.1 has no `sensitivity` field. Do not paste secrets or S3-style private data into Raw Lab. If `sensitivity` is added later, `S3` must be rejected with HTTP 422 before the provider runs.

**Inference:** Native multi-turn chat (system prompt includes `thread_state` JSON + companion self-memory preface/JSON + prior user/assistant `recent_turns` + latest `message`). Plain-text replies in `answer` — no JSON parse. Before generation, `raw_lab_budget.prepare_raw_lab_request` may deterministically compact `recent_turns` and `thread_state` when input exceeds `SCOUT_RAW_LAB_MAX_INPUT_CHARS` (falls back to `SCOUT_MAX_INPUT_CHARS` when unset; rebuilds system prompt after state compaction; logs length/count only). OpenVINO may run one internal hedging-repair pass, one anti-repeat repair pass, and one `raw_lab_runtime_awareness` verifier repair for capability-accuracy only; repair prompts never enter `recent_turns` or the app thread. Set `SCOUT_PROVIDER=openvino` with a loaded model for real chat; mock is dev-only heuristics.

**Deep+ inference note:** `deep_plus` is experimental and slower. It uses the same model/provider as Deep with internal contract -> 3 candidates -> deterministic flags -> judge JSON -> optional one-shot revision -> finalizer/verifier -> final contract check. On timeout or unsafe/invalid intermediate output it falls back to current Deep with metadata. Worst-case timeout fallback may be expensive because standard Deep can run after Deep+ has already spent budget.

**Provider note:** Output may still be limited by the underlying model; Raw Lab does not add Harness-side refusal layers.

**Errors:** 422 / 503 only (empty model output returns a safe fallback with HTTP 200).

### `POST /raw-lab/self-reflection`

Suggest-only Companion Self-Memory proposals from recent turns and thread state. User must approve before persistence in the app.

**Request:** `{ recent_turns?, thread_state?, existing_self_memories? }`

**Response:** `{ proposals: [{ kind, subject, text, confidence, sensitivity, reason }], safety_notes, used_context: false }`

Rejects harness/board/memory/action fields. Parse failures return HTTP 200 with empty `proposals` and a safety note (not 502).

### `POST /raw-lab/stream`

SSE streaming variant of Raw Lab. Emits `data: {"chunk": "..."}` events, then a final `data: {"done": true, "answer": "...", ...}` event. Falls back gracefully when streaming is unavailable (client may retry `/raw-lab`).

**Errors:** provider errors are emitted as SSE `error` events with HTTP 200 on the stream response.

### `POST /ai/coding/chat` and `POST /ai/coding/chat/stream`

Dedicated coding text lane (not Raw Lab). Non-stream JSON vs typed SSE (`start` / `delta` / `done` / `error`). Logical slot `coding_fast` shares the physical `companion_fast` OpenVINO backend.

**Pipeline ownership:** only one `pipeline.generate` may run per physical backend. A second generation while a worker is still alive is rejected with a temporary busy / `ProviderNotReadyError` (not presented as missing weights). Timeout and client disconnect request cancellation but keep ownership until the worker exits. Health/readiness do not take ownership.

**Streaming capability:** feature-detected (`TextStreamer`, `StreamingStatus`, `streamer=` support). Missing or unconfirmable streaming APIs fail the stream route clearly; non-streaming coding and companion remain available.

## Model slot catalog (`models.yaml`)

Gateway-internal slot definitions for future multi-model routing. **Not app-facing** — the Expo UI never reads this file.

**Frozen catalog (authority):** [`docs/plans/model-stack-freeze-v3.md`](../../docs/plans/model-stack-freeze-v3.md) — roles, load policy (`hot` / `warm` / `on_demand` / `never_hot`), critic/coder/stretch ladder, promotion via `model_bench_harness`.

Committed implementation: [`models.yaml`](models.yaml) (v2). `companion_fast` is enabled (OpenVINO); other slots are present but disabled. v2 names may lag v3 freeze (`critic_small` → `critic_fast`, etc.) — see the implementation map in the freeze doc.

| Variable | Default | Description |
|----------|---------|-------------|
| `SCOUT_MODELS_CONFIG` | `models.yaml` | Path to slot catalog (relative to `services/ai-gateway/`) |
| `SCOUT_WARM_SLOTS` | *(empty)* | Comma-separated slot ids to warm on gateway lifespan (falls back to `defaults.warm_on_start` in `models.yaml`) |

**Current behavior:** `POST /chat-harness` routes through `InferenceOrchestrator` → `ModelSlotManager.acquire("companion_fast")` → shared `OpenVinoBackend`. Other endpoints still call the provider directly. `companion_fast` is the only enabled slot; stretch slots appear in `/health.slots` as `disabled`.

**Lifespan warm (OpenVINO only):** when `companion_fast` is in `SCOUT_WARM_SLOTS` or `defaults.warm_on_start`, startup calls `ensure_ready()` on the shared backend. Missing model/deps log a warning and do not crash startup.

**`GET /health.slots`:** optional map of slot id → `{ enabled, state }` where `state` is `ready`, `degraded`, `disabled`, or `warming`. Mock mode reports `companion_fast` as `ready` without loading OpenVINO.

Parse/validate in Python: `from app.config import get_slot_registry`.

## Model bench harness (v0.1)

CI-safe pipeline comparison over synthesis eval fixtures. Default targets are mock pipeline profiles (`mock_fast_only`, `mock_with_critic`, `mock_with_stretch`), not model files. Harness + promotion flow: [`docs/plans/a770-model-bench-harness.md`](../../docs/plans/a770-model-bench-harness.md), [`docs/plans/a770-model-promotion-gates.md`](../../docs/plans/a770-model-promotion-gates.md).

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
# Summary JSON to stdout (gateway must be running for CLI):
python scripts/run_model_bench.py --profile synthesis_depth --targets mock_fast_only,mock_with_critic,mock_with_stretch
# Optional full result file:
python scripts/run_model_bench.py --profile critic_quality --targets mock_with_critic --output bench_results/latest.json
```

**Optional real Phi-4 critic bench target** (`real_phi4_with_critic`) — skipped unless explicitly enabled and the local llama.cpp critic server responds. Compare mock vs real on the same profile:

```powershell
$env:SCOUT_PROVIDER="mock"
$env:SCOUT_REAL_MODEL_BENCH="1"
$env:SCOUT_CRITIC_RUNTIME="llamacpp"
$env:SCOUT_CRITIC_BASE_URL="http://127.0.0.1:8120/v1"
$env:SCOUT_CRITIC_MODEL="phi-4-reasoning-plus"
python scripts/run_model_bench.py --profile critic_quality --targets mock_with_critic,real_phi4_with_critic --output bench_results/phi4_critic.json
```

Requirements: gateway and llama-server must already be running; model files are user-provided and not committed. CI/default pytest uses mock targets only. If the real target is unavailable, the bench skips it with a `summary_note` and continues other targets.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCOUT_PROVIDER` | `mock` | `mock` or `openvino` |
| `SCOUT_HOST` | `127.0.0.1` | Bind host (localhost only) |
| `SCOUT_PORT` | `8111` | Bind port |
| `SCOUT_MODEL_PATH` | `models/qwen3-8b-int4-ov` | Local OpenVINO model directory (overrides `companion_fast` path in registry) |
| `SCOUT_MODELS_CONFIG` | `models.yaml` | Model slot catalog path |
| `SCOUT_WARM_SLOTS` | *(empty)* | Slots to warm on gateway lifespan (`companion_fast` when set or in `models.yaml` defaults) |
| `SCOUT_DEVICE` | `GPU` | OpenVINO device (`GPU`, `CPU`, `NPU`) |
| `SCOUT_MAX_NEW_TOKENS` | `1024` | Max tokens generated |
| `SCOUT_TIMEOUT_SECONDS` | `180` | Inference timeout per request |
| `SCOUT_MAX_INPUT_CHARS` | `18000` | Max input length for Ask/Chat Harness and analyze-transcript |
| `SCOUT_RAW_LAB_MAX_INPUT_CHARS` | `32000` | Raw Lab input budget (independent of Ask/Chat Harness) |
| `SCOUT_TEMPERATURE` | `0.2` | Sampling temperature (scout endpoints) |
| `SCOUT_RAW_LAB_MAX_NEW_TOKENS` | `2048` | Max tokens for Raw Lab replies |
| `SCOUT_RAW_LAB_TEMPERATURE` | `0.7` | Sampling temperature for Raw Lab |
| `SCOUT_RAW_LAB_REPETITION_PENALTY` | `1.12` | Repetition penalty for Raw Lab (when supported by OpenVINO) |
| `SCOUT_RAW_LAB_DEEP_PLUS_TIMEOUT_MS` | `120000` | Overall experimental Raw Lab Deep+ budget before deterministic finish or Deep fallback |
| `SCOUT_DEEP_ENABLED` | `true` | Enable structured deep critic pass for Chat Harness |
| `SCOUT_CRITIC_CONTEXT_MAX_CHARS` | `1800` | Max chars for Chat Harness **deep critic** evidence packet (not the draft prompt). Raise locally (e.g. `3600`) to give the critic more board/thread evidence; may increase critic latency on OpenVINO or llama.cpp. |
| `SCOUT_DEEP_MAX_EXTRA_PASSES` | `2` | Max extra provider passes after draft (1 = critic only, 2 = critic + final revision) |
| `SCOUT_DEBUG_THINKING_TRACE` | `false` | Log structured deep-mode pass metadata to gateway logs (`chat_harness_thinking_trace`); does not change HTTP response |
| `SCOUT_CRITIC_SLOT` | `same` | Critic backend: `same` (shared `companion_fast` / mock rules). `secondary` → `critic_small` via llama.cpp HTTP when slot enabled — see [docs/llamacpp-critic-slot.md](docs/llamacpp-critic-slot.md) (manual A770 smoke: [phi4-critic-smoke-results.md](docs/phi4-critic-smoke-results.md)) |
| `SCOUT_CRITIC_MODEL_PATH` | *(unset)* | Optional path hint for `critic_small` in `models.yaml` (server loads weights; gateway does not) |
| `SCOUT_CRITIC_RUNTIME` | `mock` | Deep Synthesis critic: `mock` (rules) or `llamacpp` (HTTP critic with mock fallback on failure) |
| `SCOUT_CRITIC_BASE_URL` | `http://127.0.0.1:8120/v1` | llama.cpp OpenAI API base for synthesis critic (`/v1` suffix normalized) |
| `SCOUT_CRITIC_MODEL` | `phi-4-reasoning-plus` | Model id on llama.cpp wire for synthesis critic (gateway-internal only) |
| `SCOUT_CRITIC_TIMEOUT_SECONDS` | `30` | HTTP timeout for synthesis critic llama.cpp calls |
| `SCOUT_PHI4_SMOKE` | *(unset)* | Set to `1` to run optional manual synthesis critic smoke (`test_phi4_synthesis_critic_smoke.py`); skipped in CI |
| `SCOUT_REAL_MODEL_BENCH` | *(unset)* | Set to `1` to enable optional `real_phi4_with_critic` bench target (requires `SCOUT_CRITIC_RUNTIME=llamacpp` and reachable critic server); skipped in CI |
| `SCOUT_LLAMA_BASE_URL` | `http://127.0.0.1:8120` | llama.cpp OpenAI API base when env set; else `critic_small.llamacpp` host/port from `models.yaml` |
| `SCOUT_LLAMA_TIMEOUT_SECONDS` | `60` | HTTP timeout for llama.cpp critic calls |
| `SCOUT_LLAMA_API_KEY` | *(unset)* | Optional Bearer token for llama-server |
| `SCOUT_CHAT_HARNESS_NATIVE_CHAT` | `false` | Experimental native chat template for Chat Harness (OpenVINO). When enabled, fast/deliberate uses native chat; deep mode uses native chat for the **initial draft only** (critic + optional revision remain single-prompt). |
| `SCOUT_MEMORY_RAG_ENABLED` | `false` | **Mock-only** memory/RAG spine (`app/retrieval/`). Does **not** enable real retrieval or embeddings. When `true`, runs deterministic token-overlap test ranking via `retrieve_memory_evidence()` only — still **not wired into Chat Harness** or any HTTP route. |

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
    raw_lab.md
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
  test_raw_lab_contract.py
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
