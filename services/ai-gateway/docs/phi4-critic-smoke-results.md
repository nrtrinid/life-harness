# Phi-4 / secondary critic — manual smoke results

Record A770 / SYCL manual runs here. Do not commit real personal context or model weights.

**Procedure:** [llamacpp-critic-slot.md](llamacpp-critic-slot.md)

## 2026-06-10 — GPU smoke completed (OpenVINO draft + SYCL llama.cpp critic on A770)

| Field | Value |
|-------|--------|
| Smoke type | **completed** — `smoke_deep_critic.py` (4 scenarios) + D1 fail-soft probe |
| Branch | `feat/lofi-companion-os-shell-v0.1` (unrelated WIP present; runtime-only work) |
| Draft provider | `openvino` (`.venv` Python) |
| Critic backend | **SYCL** `llamacpp_secondary` — `SYCL0` Intel Arc A770 |
| oneAPI | Base Toolkit 2025.1.3.8 via `winget install Intel.OneAPI.BaseToolkit` |
| llama.cpp | tag **b5377** (`24e86cae7`) — HEAD too new for oneAPI 2025.1 SYCL headers |
| Build dir | `C:\Users\nicki\Projects\llama.cpp\build-sycl` (`cl` + `icx`, `-DLLAMA_CURL=OFF`) |
| llama-server | `build-sycl\bin\llama-server.exe` — **must run with `setvars.bat` on PATH** (oneAPI DLLs) |
| Critic GGUF | `C:\Users\nicki\Models\critic\Phi-4-mini-instruct-Q4_K_M.gguf` (Q4_K_M) |
| GPU confirmation | `using device SYCL0 (Intel(R) Arc(TM) A770 Graphics) - 14700 MiB free` |
| Command | `llama-server -m <gguf> --host 127.0.0.1 --port 8121 -ngl 99 -c 8192` |

### `smoke_deep_critic.py` results (GPU)

| Run | HTTP | Latency (ms) | Critic signal | Notes |
|-----|------|--------------|---------------|-------|
| A clean deep | 200 | 3978 | `structured critic skipped (draft parse failed)` | Hardening v0.2 note correct; gateway log `draft_parse_failed` |
| B broad/sprawl | 200 | 6840 | `revised after structured critic` | Tightened to active cards |
| C pounce/career | 200 | 5193 | `revised after structured critic` | Qualcomm follow-up pounce |
| D repeat clean deep | 200 | 5138 | `revised after structured critic` | Regression repeat of A |

### D1 fail-soft (llama-server stopped)

| Signal | Result |
|--------|--------|
| HTTP | **200** |
| Latency | 4393 ms |
| Draft returned | **yes** |
| `confidence_notes` | `draft approved by structured critic` (fail-soft pass; critic unreachable) |

### CPU vs GPU comparison

| Scenario | CPU (ms) | GPU SYCL (ms) | Speedup |
|----------|----------|---------------|---------|
| A clean deep | 3780 | 3978 | ~1.0× (critic skipped on A) |
| B broad/sprawl | 17761 | 6840 | **2.6×** |
| C pounce/career | 15466 | 5193 | **3.0×** |
| D repeat | 14809 | 5138 | **2.9×** |
| D1 fail-soft | 4285 | 4393 | ~1.0× |
| Avg revised (B/C/D) | **16012** | **5724** | **2.8×** |

### Summary verdict (GPU run)

| Question | Answer |
|----------|--------|
| GPU backend confirmed? | **yes** — SYCL0 A770 in llama-server load logs |
| Parse success | **mixed** — scenario A still hits draft parse fail + skip (same as CPU) |
| Useful revisions? | **yes** — B/C/D revised usefully |
| Fail-soft? | **yes** — D1 HTTP 200 with draft |
| Interactive deep latency? | **improved** — revised passes ~5–7 s total (vs ~15–18 s CPU) |
| Recommendation | **keep `SCOUT_CRITIC_SLOT=same` as default** for now; GPU secondary viable for manual/advanced Deep; fix draft-parse reliability before eval fixtures |

### Scenario A re-smoke after deep draft JSON repair v0.1 (2026-06-10)

| Field | Value |
|-------|--------|
| Branch | `main` (gateway repair changes; unrelated app WIP present) |
| Change under test | `chat_harness_repair.py` + in-deep `draft_repair` before critic skip |
| Gateway env | `SCOUT_DEBUG_THINKING_TRACE=true`, `SCOUT_DEEP_MAX_EXTRA_PASSES=2`, `SCOUT_CRITIC_SLOT=secondary` |
| Prior A (pre-repair) | HTTP 200, 3978 ms, `structured critic skipped (draft parse failed)` |

**Scenario A (`A_clean_next_action`) — full smoke run:**

| Field | Result |
|-------|--------|
| HTTP | **200** |
| Latency | **8068 ms** (full 4-scenario smoke); **7427 ms** (isolated repeat) |
| `confidence_notes` | `Deep mode: revised after structured critic.` |
| Draft repair | **succeeded** — gateway log: `deep draft parse failed; attempting draft JSON repair` (first request only) |
| Critic ran | **yes** — revised after structured critic |
| `revision_applied` | **yes** (inferred from revised note + full deep flow) |
| `fail_soft_reason` | **none** |

**Thinking trace** (`SCOUT_DEBUG_THINKING_TRACE=true`; uvicorn stdout captured WARNING only, INFO trace JSON not emitted to console):

| Field | Expected / inferred |
|-------|---------------------|
| `passes` | `["draft", "draft_repair", "critic", "revision"]` |
| `parse_failures` | `["draft"]` |
| `draft_repair_attempted` | `true` |
| `draft_repair_succeeded` | `true` |
| `critic_backend` | `llamacpp_secondary` |
| `critic_checks` | non-empty (revision requested; exact ids not captured in stdout) |

**Full smoke post-repair (all scenarios):**

| Run | HTTP | Latency (ms) | Critic signal |
|-----|------|--------------|---------------|
| A clean deep | 200 | 8068 | `revised after structured critic` |
| B broad/sprawl | 200 | 6895 | `revised after structured critic` |
| C pounce/career | 200 | 5303 | `revised after structured critic` |
| D repeat clean deep | 200 | 5026 | `revised after structured critic` |

**Verdict:** Draft repair v0.1 **fixes Scenario A** — draft parse still fails on raw Qwen3 output, but repair recovers JSON and the SYCL critic + revision path runs. Prior A skip is resolved.

**Recommendation:** Proceed to **secondary critic eval fixtures** (GPU latency acceptable; A no longer blocked). Optional follow-up: tighten draft repair prompt to reduce repair latency on A (~8 s vs ~4 s pre-skip). Keep `SCOUT_CRITIC_SLOT=same` as default.

**CI regression coverage:** mock deep/critic quality gates live in [`evals/thread/deep_critic_quality.json`](../evals/thread/deep_critic_quality.json) (`pytest tests/test_thread_eval_fixtures.py`). GPU results in this doc are manual reference only.

---

## 2026-06-10 — Smoke completed (OpenVINO draft + CPU llama.cpp critic)

| Field | Value |
|-------|--------|
| Smoke type | **completed** — `smoke_deep_critic.py` (4 scenarios) + D1 fail-soft probe |
| Operator | Cursor agent session |
| Draft provider | `openvino` (`.venv` Python — system `python` lacks `openvino_genai`) |
| Critic backend | `llamacpp_secondary` — CPU build (`-ngl 0`) |
| `SCOUT_CRITIC_SLOT` | `secondary` |
| `SCOUT_LLAMA_BASE_URL` | `http://127.0.0.1:8121` |
| `critic_small.enabled` | `true` (via `.tmp.models.smoke.yaml`) |
| Gateway | `.venv\Scripts\python.exe -m uvicorn` on `8111` |
| llama-server | `C:\Users\nicki\Projects\llama.cpp\build-cpu\bin\llama-server.exe` |
| Critic GGUF | `C:\Users\nicki\Models\critic\Phi-4-mini-instruct-Q4_K_M.gguf` |

### `smoke_deep_critic.py` results

| Run | HTTP | Latency (ms) | Critic signal in `confidence_notes` | Notes |
|-----|------|--------------|-------------------------------------|-------|
| A clean deep | 200 | 3780 | `draft approved by structured critic` | Career + fitness next move; gateway log: `deep draft parse failed; skipping critic` on first pass (still 200) |
| B broad/sprawl | 200 | 17761 | `revised after structured critic` | Sprawling ask tightened to active cards |
| C pounce/career | 200 | 15466 | `revised after structured critic` | Qualcomm follow-up pounce cited |
| D fail-soft probe | 200 | 14809 | `revised after structured critic` | Message text literal (“stop llama-server…”) — not a true fail-soft test |

### D1 fail-soft (llama-server stopped)

| Signal | Result |
|--------|--------|
| llama-server | Stopped before probe |
| HTTP | **200** |
| Latency | 4285 ms |
| `confidence_notes` | `Deep mode: draft approved by structured critic.` |
| Draft returned | **yes** — no 5xx |

### Summary verdict (this run)

| Question | Answer |
|----------|--------|
| Secondary critic HTTP path works? | **yes** — B/C show revision notes; A/D approve |
| Fail-soft when critic down? | **yes** — D1 returned 200 with draft |
| Parse / JSON reliability | **mixed** — one gateway log `deep draft parse failed; skipping critic` on A; responses still valid JSON |
| Useful revisions? | **partial** — B/C tightened sprawl; career pounce on C |
| Latency acceptable for interactive deep? | **borderline** — 15–18 s for revised passes on CPU critic + OpenVINO draft |
| Recommendation | **keep `SCOUT_CRITIC_SLOT=same` as default**; secondary manual/advanced only until SYCL GPU critic build |

**Hardening (v0.2):** Gateway now skips misleading `draft approved by structured critic` when deep draft parse fails; thinking trace records `draft_parse_failed`. Smoke script scenario D renamed to repeat-clean-deep; manual D1 remains the real fail-soft probe.

---

## 2026-06-10 — Prerequisites installed — smoke ready (superseded by run above)

| Field | Value |
|-------|--------|
| Smoke type | **not run** (runtime verified; full `smoke_deep_critic.py` pending operator) |
| Branch / commit | `main` @ `4806949` |
| Baseline before smoke | gateway `354 passed`; thinking trace `6 passed`; critic/llamacpp `22 passed`; app `464 passed`; `npm run typecheck` pass |

### Prerequisites installed (this session)

| Prerequisite | Status |
|--------------|--------|
| **llama-server** | **Built** — `C:\Users\nicki\Projects\llama.cpp\build-cpu\bin\llama-server.exe` (MSVC CPU/AVX2; **not SYCL**) |
| **llama-server health** | **OK** — `GET http://127.0.0.1:8121/health` → `200 {"status":"ok"}` with critic GGUF loaded |
| **Critic GGUF** | **Present** — `C:\Users\nicki\Models\critic\Phi-4-mini-instruct-Q4_K_M.gguf` (2.49 GB, `unsloth/Phi-4-mini-instruct-GGUF`) |
| **Smoke models config** | **Present** — `services/ai-gateway/.tmp.models.smoke.yaml` (`critic_small.enabled: true`, gitignored) |
| OpenVINO draft (`models/qwen3-8b-int4-ov`) | **Present** (38 files) |
| Gateway port 8111 | **In use** (PID 9896 — restart with smoke env vars before run) |
| llama-server port 8121 | **Free** (verified after probe stop) |

### Remaining caveats

1. **SYCL / A770 GPU offload not available** — Intel oneAPI (`icx`) not installed; Vulkan SDK also missing. Current build is **CPU-only** (`-ngl 0` for probe). For A770 GPU critic, install [Intel oneAPI Base Toolkit](https://www.intel.com/content/www/us/en/developer/tools/oneapi/base-toolkit-download.html) and rebuild with `-DGGML_SYCL=ON`, or install Vulkan SDK and rebuild with `-DGGML_VULKAN=ON`.
2. **Gateway must be restarted** with secondary-critic env vars (existing PID 9896 likely lacks `SCOUT_CRITIC_SLOT=secondary`).
3. **Full smoke script not executed** — operator runs three terminals below.

### Operator commands (copy-paste)

**Terminal A — llama-server**

```powershell
$env:LLAMA_SERVER = "C:\Users\nicki\Projects\llama.cpp\build-cpu\bin\llama-server.exe"
$env:PHI4_GGUF_PATH = "C:\Users\nicki\Models\critic\Phi-4-mini-instruct-Q4_K_M.gguf"
$env:SCOUT_CRITIC_MODEL_PATH = $env:PHI4_GGUF_PATH

& $env:LLAMA_SERVER `
  -m $env:PHI4_GGUF_PATH `
  --host 127.0.0.1 `
  --port 8121 `
  -ngl 0 `
  -c 8192
```

**Terminal B — gateway** (stop existing 8111 listener first; **must use `.venv`** for OpenVINO)

```powershell
cd C:\Users\nicki\Projects\life-harness\services\ai-gateway

$env:SCOUT_PROVIDER = "openvino"
$env:SCOUT_MODEL_PATH = "models/qwen3-8b-int4-ov"
$env:SCOUT_MODELS_CONFIG = ".tmp.models.smoke.yaml"
$env:SCOUT_CRITIC_SLOT = "secondary"
$env:SCOUT_CRITIC_MODEL_PATH = "C:\Users\nicki\Models\critic\Phi-4-mini-instruct-Q4_K_M.gguf"
$env:SCOUT_LLAMA_BASE_URL = "http://127.0.0.1:8121"
$env:SCOUT_LLAMA_TIMEOUT_SECONDS = "120"
$env:SCOUT_DEEP_ENABLED = "true"
$env:SCOUT_DEEP_MAX_EXTRA_PASSES = "2"

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111
```

**Terminal C — smoke**

```powershell
cd C:\Users\nicki\Projects\life-harness\services\ai-gateway
.\.venv\Scripts\python.exe scripts/smoke_deep_critic.py --base-url http://127.0.0.1:8111 --provider-hint openvino
```

---

## 2026-06-10 (earlier) — Not run — missing prerequisites

| Field | Value |
|-------|--------|
| Smoke type | **not run** |
| Branch / commit | `main` @ `4806949` |
| Baseline before smoke | gateway `354 passed`; thinking trace `6 passed`; critic/llamacpp `22 passed`; app `464 passed`; `npm run typecheck` pass |

### Blockers (audited — resolved in session above)

1. **`llama-server` not available** — not on PATH; `where.exe llama-server` found no binary.
2. **No critic GGUF** — `PHI4_GGUF_PATH` and `SCOUT_CRITIC_MODEL_PATH` unset; `*.gguf` count `0` in searched paths.
3. **Fail-soft live probe not attempted** — requires a running llama-server first.

---

## Session metadata

| Field | Value |
|-------|--------|
| Date | YYYY-MM-DD |
| Operator | |
| Gateway commit / branch | |
| llama.cpp build (SYCL?) | |
| Draft provider | `openvino` / `mock` |
| `SCOUT_CRITIC_SLOT` | `secondary` |
| `SCOUT_LLAMA_BASE_URL` | |
| `critic_small.enabled` | `true` / `false` |

## Per-run results

| Run | Model file | Quant | llama-server command (summary) | Draft latency (s) | Critic latency (s) | Verdict parse OK? | Useful critique? | Failure modes | Recommendation |
|-----|------------|-------|--------------------------------|-------------------|--------------------|--------------------|------------------|---------------|----------------|
| A clean deep | e.g. `phi-4-mini-instruct-q4_k_m.gguf` | Q4_K_M | `llama-server -m ... --port 8121 -ngl 99` | | | yes/no | yes/no/partial | | keep / tune / reject |
| B broad/sprawl | | | | | | | | `too_broad` missed, prose not JSON, timeout | |
| C pounce/career | | | | | | | career cited? | ignored stale career | |
| D1 server down | | | (stopped) | | n/a | n/a | n/a | fail-soft pass? | |
| D2 malformed JSON | | | | | | no (expected) | n/a | draft kept? | |

### Notes per run

#### Run A — clean deep pass

- Request: `What should I do next?` + seed `context_packet`
- `confidence_notes`:
- Critic revised? yes / no
- Raw critic JSON sample (redact):

```json

```

#### Run B — broad / sprawling

- Request message:
- Critic check ids observed:
- Answer length before/after:

#### Run C — pounce / career

- Request: `What is today's one pounce?`
- Career/stale mentioned in answer? 
- Hot build incorrectly prioritized?

#### Run D — fail-soft

- Server down: HTTP status ___ ; draft returned? ___
- Slot disabled fallback: log warning seen? ___

## Summary table (fill after session)

| Date | Draft model | Critic model | Quant | Backend | Avg latency | Parse success | Useful revisions | Failure modes | Recommendation |
| ---- | ----------- | ------------ | ----- | ------- | ----------- | ------------- | ---------------- | ------------- | -------------- |
| YYYY-MM-DD | Qwen3-8B OV | Phi-4-mini | Q4_K_M | llamacpp_secondary | | | | | |

## Decision rubric

| Outcome | Next step |
| ------- | --------- |
| Parse success **≥ 80%** and useful revisions are **common** | Add secondary critic eval fixtures in `evals/thread/`; keep `SCOUT_CRITIC_SLOT=secondary` manual/advanced only |
| Parse success **poor** | Add JSON repair for critic verdicts; simplify critic prompt |
| Latency **too high** | Keep `SCOUT_CRITIC_SLOT=same` as default; use secondary only for explicit “think harder” or batch jobs |

## Summary verdict

| Question | Answer |
|----------|--------|
| Ready for secondary critic eval fixtures? | **later** — GPU smoke ~2.8× faster on revised passes; fix draft-parse skip on A first |
| Default `SCOUT_CRITIC_SLOT` change? | **stay `same`** |
| Prompt/schema work needed? | Unknown until real critic HTTP smoke |
| Blockers (VRAM, latency, parse rate): | **GPU SYCL done** — revised ~5–7 s; draft-parse skip on A remains; use `.venv` + `setvars.bat` for SYCL server (2026-06-10) |

## Follow-up (from smoke)

- [ ] Harden secondary critic evals in `evals/thread/`
- [ ] Improve critic prompt / JSON repair
- [ ] Keep secondary manual-only; document latency budget
- [ ] Try alternate quant or Phi-4 reasoning variant
