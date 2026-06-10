# A770 Model Bench Harness (v0.1)

CI-safe comparison harness for Deep Synthesis pipeline profiles and future local model slots. Produces **evidence reports only** — no automatic yaml/env promotion.

**Related:** [`a770-model-promotion-gates.md`](./a770-model-promotion-gates.md), [`model-stack-freeze-v3.md`](./model-stack-freeze-v3.md), [`services/ai-gateway/README.md`](../../services/ai-gateway/README.md).

---

## Purpose

The harness answers: *does this pipeline profile (or candidate model behind it) pass the same synthesis eval fixtures as the frozen mock baseline, with acceptable verifier/schema/latency/fallback behavior?*

It supports the product rule **manual before automation**: models earn promotion through bench reports and human sign-off, not vibes.

---

## What runs where

| Layer | Location | CI default |
|-------|----------|------------|
| Bench models / runner | `services/ai-gateway/app/bench_models.py`, `bench_runner.py` | mock pytest |
| Eval execution + score breakdown | `services/ai-gateway/app/eval_runner.py` | mock pytest |
| CLI entry | `services/ai-gateway/scripts/run_model_bench.py` | manual (gateway must be up) |
| Real Phi-4 critic target | `bench_real_phi4.py` + `real_phi4_with_critic` | skipped unless `SCOUT_REAL_MODEL_BENCH=1` |

`SCOUT_PROVIDER=mock` for all default CI. No GPU weights in pytest.

---

## Bench targets (v0.1)

Targets are **pipeline profiles** (or explicit external model hooks), not committed model files:

| Target ID | Pipeline | `promotion_tier` | Notes |
|-----------|----------|------------------|-------|
| `mock_fast_only` | `fast_only` | `frozen_core` | CI baseline |
| `mock_with_critic` | `with_critic` | `frozen_core` | CI baseline |
| `mock_with_stretch` | `with_stretch` | `frozen_core` | CI baseline |
| `real_phi4_with_critic` | `with_critic` | `research_candidate` | Opt-in; requires llama.cpp critic + `SCOUT_REAL_MODEL_BENCH=1` |

Future targets (documented, not yet registered): stretch models as `overnight_bench`, coder swaps as `bench_candidate`.

---

## Bench profiles

Profiles filter which synthesis eval fixtures run:

| Profile | Focus |
|---------|--------|
| `synthesis_depth` | General completed-body depth |
| `critic_quality` | Cases expecting critique fields |
| `stretch_reflection` | Stretch / async reflection cases |
| `latency` | Same case set as synthesis_depth; summary emphasizes `avg_latency_ms` |
| `verifier_validity` | Schema + verifier gate emphasis |
| `fallback_behavior` | Fallback-tagged fixtures |
| `code_work`, `retrieval_quality` | Placeholders (empty case set v0.1) |

---

## Running

### Pytest (CI / local, no gateway required for in-process TestClient)

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest tests/test_model_bench_runner.py tests/test_model_bench_real_phi4_target.py -q
```

### CLI (gateway must be running)

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
python scripts/run_model_bench.py --profile synthesis_depth --targets mock_fast_only,mock_with_critic,mock_with_stretch
python scripts/run_model_bench.py --profile critic_quality --targets mock_with_critic --output bench_results/latest.json
```

### Optional real critic comparison

See [`services/ai-gateway/docs/phi4-synthesis-critic-smoke.md`](../../services/ai-gateway/docs/phi4-synthesis-critic-smoke.md).

---

## Report shape

Each run emits a `BenchRunResult` JSON document:

- `run_id`, `timestamp`, `profile`, `targets`
- Per-case rows: `status` (`passed` | `failed` | `skipped` | `degraded`), `latency_ms`, verifier/schema/approval/grounding flags, `degraded_notes`
- Per-target `summary`: counts, rates, `avg_latency_ms`, optional `summary_note` when a target was unavailable

Unavailable external targets (e.g. critic server down) **skip** with a note; other targets still run.

---

## How a candidate earns promotion

Promotion tiers (see [`model-stack-freeze-v3.md`](./model-stack-freeze-v3.md)):

| Tier | Bench role |
|------|------------|
| `frozen_core` | Mock targets + committed defaults; must stay green in CI |
| `near_core` | **Promotion destination** after evidence + human sign-off |
| `bench_candidate` | Competing model file; register target with this tier; beat incumbent on profile |
| `research_candidate` | Manual smoke + opt-in bench; e.g. `real_phi4_with_critic` |
| `overnight_bench` | Stretch / batch models; `never_hot`; separate latency/VRAM report |

### Promotion ladder (v0.1)

```text
research_candidate / bench_candidate
        │
        ▼  full bench profile pass + comparative evidence vs frozen mock/default
near_core
        │
        ▼  sustained evals + no fast_only regression + yaml ticket
frozen_core default (rare; version bump + eval gate)
```

### Required evidence (for `bench_candidate` → `near_core`)

All items must appear in a bench report — see [`a770-model-promotion-gates.md`](./a770-model-promotion-gates.md):

1. Verifier-valid output rate per target/profile
2. Schema-valid output rate per target/profile
3. No unsafe proposal writes (`requires_approval=true` on memory/personality proposals)
4. Latency report (`avg_latency_ms`)
5. Fallback behavior (`degraded` count + sample `degraded_notes`)
6. Comparative pass vs incumbent on the same profile

**v0.1:** thresholds are qualitative categories until real-model bench history exists. Harness does **not** auto-update `models.yaml`.

---

## What this harness does not do

- No Expo / board UI
- No companion memory or Raw Lab
- No automatic slot manager promotion
- No cloud AI calls
- No committed model weights

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-10 | Initial harness doc; recovered eval scoring + README from bench stash slice |
