# A770 Model Promotion Gates

Evidence-based promotion criteria for local model roles. Models and pipelines **earn promotion through evals and bench reports**, not vibes.

Related: [`model-stack-freeze-v3.md`](./model-stack-freeze-v3.md), [`services/ai-gateway/README.md`](../../services/ai-gateway/README.md) (model bench harness).

**v0.1:** Bench harness produces reports only — **no automatic promotion**. Thresholds are categories, not hard numeric locks, until real-model bench history exists.

## Tiers

| Tier | Meaning |
|------|---------|
| `frozen_core` | Product safety / CI baseline; committed default path |
| `near_core` | Shipped role; candidate for default after evidence review |
| `research_candidate` | Promising; manual smoke only |
| `overnight_bench` | Batch-only; `never_hot`; heavy stretch / overnight jobs |

## Required evidence (near_core candidates)

All items must appear in a bench report (`python scripts/run_model_bench.py` or pytest bench suite):

1. **Verifier-valid output rate** — reported per target/profile (mock suite expected 100%)
2. **Schema-valid output rate** — reported per target/profile
3. **No unsafe proposal writes** — all memory/personality proposals have `requires_approval=true`
4. **Latency report** — `avg_latency_ms` per target/profile
5. **Fallback behavior report** — `degraded` count + sample `degraded_notes`

## Comparative evidence

- Matches or beats current default on the relevant bench profile (e.g. new stretch model vs `mock_with_stretch` baseline on `stretch_reflection` cases)
- No regression on `fast_only` interactive path when changing core companion slot

## Tier gates (qualitative v0.1)

### frozen_core

- Gateway mock pytest passes (`SCOUT_PROVIDER=mock`)
- Synthesis eval fixtures pass
- Default committed `models.yaml` / env path uses this role

### near_core

- Manual A770 smoke row (see `phi4-critic-smoke-results.md` or stretch benchmark doc when available)
- Bench report with all **required evidence** above
- **Comparative evidence** vs incumbent default
- Human sign-off before yaml/env promotion

### research_candidate

- Manual smoke only
- No promotion without full bench pass on target profile

### overnight_bench

- Explicit latency, VRAM, and memory report
- `never_hot` load policy
- No promotion to interactive default without separate near_core review

## Bench targets (v0.1)

Pipeline profiles, not model files:

| Target | Pipeline |
|--------|----------|
| `mock_fast_only` | `fast_only` |
| `mock_with_critic` | `with_critic` |
| `mock_with_stretch` | `with_stretch` |

Future: `gemma27_stretch`, `phi4_critic`, etc.

## Changelog

| Date | Change |
|------|--------|
| 2026-06-10 | Initial promotion gates doc for model bench harness v0.1 |
