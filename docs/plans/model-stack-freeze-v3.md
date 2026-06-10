# Model Stack Freeze v3 — A770 Local Intelligence

**Status:** Frozen catalog (documentation authority).  
**Last updated:** 2026-06-10.

This document is the **canonical model-role and load-policy freeze** for Life Harness local AI on Intel Arc A770 (16GB). It supersedes slot tables in [`ai-gateway-model-slots-v0.1.md`](./ai-gateway-model-slots-v0.1.md) for **which models exist and how they are tiered**. Implementation may lag — see [§ Implementation map](#implementation-map).

**Rules (unchanged):**

- App calls **task endpoints** only — no model names in Expo UI.
- `SCOUT_PROVIDER=mock` remains CI/default; no GPU weights in pytest.
- Board is source of truth; AI suggests; user approves durable memory and mutations.
- Stretch models are **batch / overnight only** — never hot beside interactive chat.

**Related:** [`a770-local-intelligence-integrated-roadmap.md`](./a770-local-intelligence-integrated-roadmap.md), [`services/ai-gateway/README.md`](../../services/ai-gateway/README.md), [`services/ai-gateway/docs/llamacpp-critic-slot.md`](../../services/ai-gateway/docs/llamacpp-critic-slot.md).

---

## Status tiers

| Tier | Meaning | Change policy |
|------|---------|---------------|
| `frozen_core` | Product + CI depend on behavior | Version bump + eval gate only |
| `near_core` | Shipped role; model file may swap after bench | Promote via `model_bench_harness` |
| `bench_candidate` | Compete; never default in committed config | Manual env / one-off yaml |
| `research_candidate` | Occasional experiments | Never default job routing |
| `overnight_bench` | Async jobs only; pick one winner per family | `never_hot` |
| `product_goal` | Pipeline contract, not a model slot | Job profiles + UX |
| `required_for_promotion` | Gate before `bench_candidate` → `near_core` | Eval + manual smoke row |

---

## Frozen stack

### Core (always in the architecture)

| Role | Model | Backend | Status | Load policy | Primary use |
|------|-------|---------|--------|-------------|-------------|
| **mock** | deterministic rules | mock provider | `frozen_core` | always (CI) | pytest, evals, schema safety |
| **companion_fast** | OpenVINO `Qwen3-8B-int4-ov` | OpenVINO GPU | `frozen_core` | **hot** | Ask, Raw Lab, chat, transcript, self-reflection |
| **memory_embed** | `Qwen3-Embedding-0.6B` | OpenVINO (GPU or CPU) | `frozen_core` | **warm** | Embed Memory Bank, companion lines, logs for retrieval |

### Near core (on-demand specialists)

| Role | Model | Backend | Status | Load policy | Primary use |
|------|-------|---------|--------|-------------|-------------|
| **memory_rerank** | `Qwen3-Reranker-0.6B` | OpenVINO / local | `near_core` | on_demand or warm | Rerank retrieval candidates before prompt inject |
| **critic_fast** | `Phi-4-mini-instruct` | llama.cpp SYCL (OpenVINO alt if convenient) | `near_core` | on_demand | Sync chat deep critic; synthesis `with_critic` jobs |
| **coder_fallback** | `Qwen2.5-Coder-7B-Instruct` | llama.cpp SYCL | `near_core` | on_demand | Small patch / teach / debug fallback |
| **coder_daily_default** | `Qwen2.5-Coder-14B-Instruct` | llama.cpp SYCL | `near_core` | on_demand | Default dev `/ai/code-*` contained patches |

### Bench / research (not daily defaults)

| Role | Model | Status | Load policy | Notes |
|------|-------|--------|-------------|-------|
| **coder_experimental** | `DeepSeek-Coder-V2-Lite-Instruct` | `bench_candidate` | on_demand | Compete against 14B default |
| **critic_deep** | `Phi-4-reasoning-plus` | `research_candidate` | on_demand | Only if `critic_fast` misses quality bar |

### Overnight stretch (never hot)

**General synthesis / overnight brain** (`overnight_bench`, `never_hot`):

- `Qwen3-30B-A3B-Instruct-2507` — **default** stretch general
- `Qwen3.6-35B-A3B` — experimental alt

**Code deep pass** (`overnight_bench`, `never_hot`):

- `Qwen3-Coder-30B-A3B-Instruct`

Committed config should enable **one default per stretch family**; other candidates are manual override only.

### Non-slot product contracts

| Name | Status | Load policy | Meaning |
|------|--------|-------------|---------|
| **deep_synthesis_pipeline** | `product_goal` | async or user-triggered | Job profiles: `fast_only`, `with_critic`, `with_stretch` — not a model |
| **model_bench_harness** | `required_for_promotion` | — | Eval fixtures + manual A770 smoke before promoting bench → near_core |

---

## VRAM policy (A770 16GB)

```text
HOT (steady interactive)
  companion_fast

WARM (small footprint; CPU ok for embed)
  memory_embed
  memory_rerank (optional — prefer on_demand if VRAM tight)

ON_DEMAND (heavy mutex — at most one besides companion, often unload companion)
  critic_fast
  coder_fallback | coder_daily_default (enable ONE daily coder in config)
  critic_deep (research only)

NEVER_HOT (batch_only jobs)
  stretch_general_*
  stretch_code_*
```

**Mutex rule:** Never load stretch + companion + coder simultaneously. Overnight jobs may unload `companion_fast` for the job window.

---

## Routing (target)

| User action | Slots / pipeline |
|-------------|------------------|
| Fast Ask / Raw Lab chat | `companion_fast` |
| `reasoning_depth=deliberate` | `companion_fast` + prompt suffix |
| `reasoning_depth=deep` (sync) | `companion_fast` draft → `critic_fast` (or same-model critic until wired) → optional revision |
| Memory-aware send | `memory_embed` → `memory_rerank` → inject ranked slices into context packet |
| Deep synthesis `fast_only` | `companion_fast` (OpenVINO) or mock |
| Deep synthesis `with_critic` | async job → draft → `critic_fast` → optional revision → verify |
| Deep synthesis `with_stretch` | async job → `stretch_general` default |
| Code agent daily | `coder_daily_default` (fallback to `coder_fallback` on timeout/degrade) |
| Overnight brain | `stretch_general` job |
| Code deep pass | `stretch_code` job |

Model names stay **gateway-internal** — responses use human labels only (`companionLabels.ts`).

---

## Critic env (two paths today)

| Path | Env | Slot role | Prompt |
|------|-----|-----------|--------|
| Chat Harness deep | `SCOUT_CRITIC_SLOT=secondary` | `critic_fast` (code: `critic_small`) | `chat_harness_critic.md` |
| Synthesis `with_critic` | `SCOUT_CRITIC_RUNTIME=llamacpp` | `critic_fast` via HTTP | `synthesis_critic.md` |

Default CI: mock / same-path critic — no llama-server required.

---

## Promotion (`model_bench_harness`)

Before moving a slot from `bench_candidate` or `research_candidate` to `near_core`, or `near_core` to a new default model file:

1. Mock eval fixtures pass (`SCOUT_PROVIDER=mock pytest`).
2. Relevant synthesis/thread/harness eval suite passes.
3. One manual A770 row in [`phi4-critic-smoke-results.md`](../../services/ai-gateway/docs/phi4-critic-smoke-results.md) or stretch benchmark doc (latency, parse OK, useful output).
4. No regression on `fast_only` interactive path.

**Coder ladder:** enable at most one of `coder_daily_default` | `coder_experimental` in committed yaml.  
**Stretch:** enable at most one general + one code stretch default.

---

## Implementation map

`services/ai-gateway/models.yaml` is **v2** — names and defaults may differ until a v3 yaml ticket lands.

| Freeze role (v3) | Current code / yaml (v2) | Notes |
|------------------|--------------------------|-------|
| `critic_fast` | `critic_small` | Rename in yaml ticket |
| `coder_daily_default` | `coder_daily_alt` (14B) | Flip default; Lite → experimental |
| `coder_experimental` | `coder_daily` (DeepSeek Lite) | Demote |
| `coder_fallback` | — | Not in yaml yet |
| `memory_rerank` | — | Not in yaml yet |
| `critic_deep` | old phi-4-reasoning path in docs | Research only |
| `stretch_general` | `stretch_batch` | 30B-A3B default |
| `stretch_code` | `stretch_experimental` | Coder 30B-A3B |
| `memory_embed` | `memory_embed` | Align load_policy to warm |

`app/model_slots.py` role enum still uses v1 names (`critic`, `coding_daily`, …) — map to v3 ids when yaml v3 ships.

---

## What this freeze does not include

- Cloud models or auth
- Auto-persist memory without user approval
- Raw Lab → Ask export of personality or jailbreaks
- Loading all models at once
- Expo UI model picker

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-10 | Initial v3 freeze: core + memory rerank + critic/coder ladder + overnight stretch families + bench harness gate |
