# llama.cpp secondary critic slot — manual smoke (A770 / SYCL)

Frozen role: **`critic_fast`** (`Phi-4-mini-instruct`). Implementation yaml id today: `critic_small`. See [model-stack-freeze-v3.md](../../../docs/plans/model-stack-freeze-v3.md).

Phase 3 wires `SCOUT_CRITIC_SLOT=secondary` to that slot via HTTP. The gateway does **not** launch `llama-server`, download models, or manage GPU memory.

**Related:** record outcomes in [phi4-critic-smoke-results.md](phi4-critic-smoke-results.md).

## Architecture

| Step | Runtime | Notes |
|------|---------|--------|
| Draft | `companion_fast` (OpenVINO Qwen3-8B or mock) | Unchanged `POST /chat-harness` response schema |
| Critic | External `llama-server` → `POST /v1/chat/completions` | Packet-aware `build_chat_harness_critic_prompt()` |
| Verdict | `ChatHarnessCriticVerdict` JSON | Parse fail or HTTP error → **fail-soft pass** (draft kept) |

```text
deep: draft (OpenVINO/mock) → critic (llama.cpp HTTP) → optional final revision
```

---

## 1. Prerequisites

Check all before smoke:

- [ ] **llama.cpp** built locally with **Intel / SYCL** support (A770 path varies by build; not in CI)
- [ ] **Critic GGUF** on disk (see suggested models below; path is operator-specific)
- [ ] **`llama-server` running externally** on a known host/port (default slot: `127.0.0.1:8121`)
- [ ] **ai-gateway** running separately (`uvicorn` on `8111`)
- [ ] **Draft model** ready if using OpenVINO (`SCOUT_PROVIDER=openvino` + Qwen3 weights), or use `mock` for critic-only routing checks
- [ ] **`critic_small.enabled: true`** in `models.yaml` (committed default is `false`)
- [ ] **`SCOUT_CRITIC_SLOT=secondary`**
- [ ] Optional: seed board fixtures for realistic context — `tests/fixtures/synthetic_harness_context.json` + `synthetic_context_packet.json`

**CLI helpers:**

- [`scripts/smoke_deep_critic.py`](../scripts/smoke_deep_critic.py) — deep mode + `context_packet` smoke (four scenarios; prints latency and `confidence_notes`).
- [`scripts/chat_harness.py`](../scripts/chat_harness.py) — non-deep only (no `reasoning_depth=deep` or `context_packet`).

**Debug trace (optional):** set `SCOUT_DEBUG_THINKING_TRACE=true` on the gateway to log structured pass metadata (`chat_harness_thinking_trace` JSON in gateway logs). Default is **off**. Does not change the HTTP response schema and does not log chain-of-thought.

---

## 2. Suggested critic model

Use a **small instruct / reasoning** model suited to JSON verdict output, not long chat.

| Candidate | Role | Notes |
|-----------|------|--------|
| **Phi-4-mini-instruct** (or similar) | Default `critic_small` in `models.yaml` | Good latency vs quality tradeoff for first smoke |
| **Phi-4 reasoning** variants | Stricter critique | Try if mini misses `too_broad` / `too_many_tasks` |
| Other small GGUF | Fallback | Any model that follows JSON-only instructions |

Quantization (Q4_K_M, etc.) and exact filename are **operator choice**. Update `models.yaml` `model_path` / `model_id` for documentation only — the gateway HTTP client does not load GGUF files.

---

## 3. Example environment

### Terminal A — llama-server (external)

```powershell
# Placeholder — adjust binary path, GGUF path, and GPU flags for your SYCL build
llama-server `
  -m C:\path\to\your\phi-4-mini-instruct-q4_k_m.gguf `
  --host 127.0.0.1 `
  --port 8121 `
  -ngl 99
```

Verify:

```powershell
curl http://127.0.0.1:8121/health
# or POST /v1/chat/completions with a one-line prompt
```

### Terminal B — gateway

```powershell
cd services/ai-gateway

# Draft provider (pick one):
$env:SCOUT_PROVIDER="openvino"
$env:SCOUT_MODEL_PATH="models/qwen3-8b-int4-ov"
# OR draft smoke without GPU:
# $env:SCOUT_PROVIDER="mock"

# Secondary critic:
$env:SCOUT_CRITIC_SLOT="secondary"
$env:SCOUT_LLAMA_BASE_URL="http://127.0.0.1:8121"
$env:SCOUT_LLAMA_TIMEOUT_SECONDS="60"
# $env:SCOUT_LLAMA_API_KEY="..."   # only if server requires Bearer auth

$env:SCOUT_DEEP_ENABLED="true"
$env:SCOUT_DEEP_MAX_EXTRA_PASSES="2"
# Optional structured deep-mode trace in gateway logs (not in HTTP response):
# $env:SCOUT_DEBUG_THINKING_TRACE="true"

uvicorn app.main:app --host 127.0.0.1 --port 8111
```

### Enable `critic_small` in `models.yaml`

```yaml
critic_small:
  enabled: true   # default committed: false
  backend: llamacpp
  model_id: microsoft/Phi-4-mini-instruct
  model_path: models/phi-4-mini-instruct-q4_k_m.gguf  # documentation; server loads weights
  llamacpp:
    host: 127.0.0.1
    port: 8121
```

When `SCOUT_LLAMA_BASE_URL` is **unset**, URL resolves from `critic_small.llamacpp` host/port. When set explicitly, it overrides the slot.

---

## 4. Manual smoke checklist — test requests

Use fixtures from repo root `services/ai-gateway/tests/fixtures/`. In PowerShell:

```powershell
$ctx = Get-Content tests/fixtures/synthetic_harness_context.json -Raw | ConvertFrom-Json
$pkt = Get-Content tests/fixtures/synthetic_context_packet.json -Raw | ConvertFrom-Json
$base = "http://127.0.0.1:8111/chat-harness"
```

### A. Clean deep pass (critic should approve or lightly revise)

**Intent:** Grounded next move; draft cites board; critic returns `no_issue` or minor revision.

```powershell
$body = @{
  message = "What should I do next?"
  mode = "general"
  sensitivity = "S1"
  context = $ctx
  context_packet = $pkt
  conversation_history = @()
  reasoning_depth = "deep"
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri $base -Method Post -ContentType "application/json" -Body $body
```

**Expect:** HTTP 200; `answer` present; `confidence_notes` includes deep critic note (approved or revised); gateway log mentions secondary / `llamacpp_secondary`.

---

### B. Broad / sprawling draft (critic should flag `too_broad` or `too_many_tasks`)

**Intent:** Mock draft with OpenVINO is content-dependent; for deterministic mock draft + real critic, use a sprawling user message and inspect critic verdict in logs if you add temporary logging, or compare answer length after revision.

With **mock** draft provider, prefix messages still drive **mock critic rules** — use **OpenVINO** for real draft + real critic:

```powershell
$body = @{
  message = "Give me a full life overhaul plan with career, fitness, coding, finance, and relationships."
  mode = "general"
  sensitivity = "S1"
  context = $ctx
  context_packet = $pkt
  reasoning_depth = "deep"
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri $base -Method Post -ContentType "application/json" -Body $body
```

**Expect:** Tighter `answer` after revision pass if critic flags sprawl; `confidence_notes` may include `"revised after structured critic"`.

---

### C. Pounce / career preference (ranked packet context)

**Intent:** Ranked packet should surface cold career over hot build; draft and critic both see packet sections.

```powershell
$body = @{
  message = "What is today's one pounce?"
  mode = "operator"
  sensitivity = "S1"
  context = $ctx
  context_packet = $pkt
  reasoning_depth = "deep"
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri $base -Method Post -ContentType "application/json" -Body $body
```

**Expect:** `answer` mentions career/networking/resume/follow-up (seed board); not a multi-item numbered plan.

---

### D. Fail-soft — llama-server down or malformed JSON

**D1 — server stopped:** Stop `llama-server`; repeat test A.

**Expect:** HTTP 200; draft answer returned; log warning (`llama.cpp critic request failed; treating as pass`); no 5xx.

**D2 — malformed critic output (optional):** Temporarily point at a chat model that returns prose, or use a proxy — gateway should `pass_verdict()` and keep draft.

**D3 — slot disabled:** `critic_small.enabled: false` + `SCOUT_CRITIC_SLOT=secondary`.

**Expect:** Warning log; fallback to same/mock critic; HTTP 200.

---

## 5. Expected observations

| Signal | Pass criteria |
|--------|----------------|
| Gateway logs | Secondary path used when slot enabled; no crash on critic failure |
| HTTP | Always 200 for valid S0–S2 requests (S3 → 422 before model) |
| Response shape | `answer`, `used_context`, `confidence_notes`, `safety_notes` only |
| Deep notes | `"Deep mode: draft approved by structured critic"` or `"revised after structured critic"` when deep + critic ran |
| Fail-soft | Unreachable llama or bad JSON → draft unchanged, no client error |
| App | No Expo / app changes required |
| Packet | Critic prompt includes ranked sections when `context_packet` sent (check gateway debug logging if enabled) |

---

## 6. Results template

Copy [phi4-critic-smoke-results.md](phi4-critic-smoke-results.md) and fill one row per run.

---

## 7. Follow-up decision

After filling the results table:

| Outcome | Next step |
|---------|-----------|
| Verdicts **useful** and JSON **reliable** | Add secondary-critic eval fixtures; consider defaulting `SCOUT_CRITIC_SLOT=secondary` for local OpenVINO dev only |
| Verdicts **noisy** or parse **flaky** | Tighten `chat_harness_critic.md`, add schema repair pass, tune temperature / `max_tokens` on slot |
| Latency **too high** for interactive deep | Keep `SCOUT_CRITIC_SLOT=same` as default; use secondary only for manual / overnight runs |
| GPU memory **conflicts** with Qwen draft | Run critic on separate port; avoid loading both on A770 without unload policy |

---

## CI

llama.cpp is **not** required in CI. Routing and fail-soft behavior are covered by mock pytest (`test_llamacpp_backend.py`, `test_critic_secondary_slot.py`).

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest -q
```
