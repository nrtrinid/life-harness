# Phi-4 Synthesis Critic Smoke (manual)

Optional manual validation for Deep Synthesis `pipeline_profile=with_critic` when the **critic pass** uses a local llama.cpp OpenAI-compatible server. Draft synthesis stays mock/rule-based when `SCOUT_PROVIDER=mock`.

## Prerequisites

- llama-server running with user-provided Phi-4 (or compatible) GGUF — **not committed** to the repo
- Gateway running with critic env configured

```powershell
# Terminal 1: llama-server (example)
llama-server -m C:\path\to\phi-4-reasoning-plus-Q4_K_M.gguf --host 127.0.0.1 --port 8120

# Terminal 2: gateway
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
$env:SCOUT_CRITIC_RUNTIME="llamacpp"
$env:SCOUT_CRITIC_BASE_URL="http://127.0.0.1:8120/v1"
$env:SCOUT_CRITIC_MODEL="phi-4-reasoning-plus"
$env:SCOUT_CRITIC_TIMEOUT_SECONDS="60"
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

## Smoke pytest (opt-in)

Skipped in default CI. Enable with `SCOUT_PHI4_SMOKE=1`:

```powershell
$env:SCOUT_PHI4_SMOKE="1"
pytest tests/test_phi4_synthesis_critic_smoke.py -q
```

Success: job completes, `critique` present, verifier-valid body. Server down or bad JSON: job still completes via mock-rules fallback (see `test_synthesis_critic_llamacpp.py`).

## Bench comparison

For promotion evidence, use the model bench harness with an explicit real target:

| Gate | Purpose |
|------|---------|
| `SCOUT_PHI4_SMOKE=1` | Single-case pytest smoke — quick “server up + one job” check |
| `SCOUT_REAL_MODEL_BENCH=1` | Enables `real_phi4_with_critic` bench target — multi-case `critic_quality` comparison |

```powershell
$env:SCOUT_PROVIDER="mock"
$env:SCOUT_REAL_MODEL_BENCH="1"
$env:SCOUT_CRITIC_RUNTIME="llamacpp"
$env:SCOUT_CRITIC_BASE_URL="http://127.0.0.1:8120/v1"
$env:SCOUT_CRITIC_MODEL="phi-4-reasoning-plus"
python scripts/run_model_bench.py --profile critic_quality --targets mock_with_critic,real_phi4_with_critic --output bench_results/phi4_critic.json
```

If the critic server is unreachable, `real_phi4_with_critic` is skipped with `summary_note: real_phi4_with_critic unavailable: <reason>`; mock targets still run.

See [`docs/plans/a770-model-promotion-gates.md`](../../../docs/plans/a770-model-promotion-gates.md) for promotion evidence requirements.
