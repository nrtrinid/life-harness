# Raw Lab Comparative Benchmark

The Raw Lab comparative benchmark compares **the same prompts** across variants (Fast vs Deep today; Deep+ or model swaps later) using a small manual deck, hard gates, latency/length metrics, and blank human-review fields.

This is **not**:

- a golden-answer test
- an automatic “winner” declaration
- CI proof of model quality
- a Raw Lab behavior change or new endpoint

Mock CI fixtures (`test_thread_eval_fixtures.py`) prove **wiring and contracts**. This benchmark is for **live gateway review** (usually OpenVINO) when you want side-by-side answers.

## Deck

Default fixture:

```text
services/ai-gateway/evals/thread/raw_lab_comparative_deck.json
```

Twelve high-signal cases covering mode grounding, benchmarking prompts, handoff steering, concrete artifacts, execution honesty, naming, pushback, hangout companion mode, and thread synthesis.

Every case is tagged `manual_only` so it is **excluded from CI** auto-discovery in `test_thread_eval_fixtures.py`.

## Commands

Local mock gateway (smoke the runner):

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111
```

New terminal:

```powershell
cd services/ai-gateway
py -3 scripts/raw_lab_comparative_benchmark.py --variants fast,deep
```

Include experimental Deep+:

```powershell
cd services/ai-gateway
py -3 scripts/raw_lab_comparative_benchmark.py --variants fast,deep,deep_plus
```

Local OpenVINO (real model comparison):

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="openvino"
$env:SCOUT_MODEL_PATH="<qwen3-8b-int4-ov path>"
$env:SCOUT_DEVICE="GPU"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111
py -3 scripts/raw_lab_comparative_benchmark.py --variants fast,deep
```

Optional docs-path report (commit only if intentional):

```powershell
py -3 scripts/raw_lab_comparative_benchmark.py --output ..\..\docs\raw-lab-comparative-benchmark-results.md
```

Filter to one case:

```powershell
py -3 scripts/raw_lab_comparative_benchmark.py --case-id no-handoff-steering --variants fast,deep
```

## Outputs (defaults)

Both default to gitignored `tmp/` at repo root:

- `tmp/raw-lab-comparative-benchmark-results.md`
- `tmp/raw-lab-comparative-benchmark-results.json`

The Markdown report includes:

- run metadata and per-variant latency/length aggregates
- **category summary** — grouped by deck `category`; per variant: case count, avg latency/chars, hard gate and heuristic pass ratios, longer-answer warning count (no automatic category winner)
- **calibration / failure spotlights** — auto rows for mode mismatch, false execution, code present without fence, naming boundary, pushback, and longer-answer warnings
- summary table with gate pass counts (not winners)
- per-case side-by-side variant responses with **code diagnostics** when the diagnostics heuristic ran
- Deep+ metadata per variant when present: `deep_plus_used`, `deep_plus_fallback_reason`, `deep_plus_task_kind`, and `deep_plus_latency_ms`
- hard gate and heuristic checklists per variant
- blank human review fields

The JSON artifact is for diffing runs across mode or model changes. It also includes `category_stats`, `failure_spotlights`, per-variant `code_diagnostics`, optional Deep+ metadata, and optional `compile_*` fields.

Optional fenced-Python syntax check (compile only, never execute):

```powershell
py -3 scripts/raw_lab_comparative_benchmark.py --variants fast,deep --check-python-artifacts
```

Only ` ```python ` fenced blocks are checked via `py_compile`; unfenced code is skipped.

## How to read results

**Hard gates** — substring and schema checks from the fixture (`expect_substrings`, `forbid_substrings`, etc.).

**Heuristics** — named checks from `eval_scorers.py` (`raw_lab_no_board_context_claim`, `raw_lab_anti_deferral`, etc.). These are contract signals, not proof of quality.

### v0.2 calibration scorers

| Check | Purpose |
| --- | --- |
| `raw_lab_mode_matches_requested_depth` | Deep must not claim fast mode; fast must not claim deep mode (incidental “fast response” phrases ignored) |
| `raw_lab_no_false_execution_claim` | Stricter when `execution_requested: true` or run/execute intent in the user message; fake dice/output without caveat fails |
| `raw_lab_code_artifact_diagnostics` | Informational only — reports `code_present`, fence/language hints, script shape; never fails the case |
| `raw_lab_meaningfulness_pushback` | Scores primary `answer` text; accepts blunt pushback (`overbuilding`, `dogfood`, etc.); rejects generic reassurance |
| `raw_lab_naming_boundary` | Temporary Raw Lab/thread naming only; fails persistent identity or name acceptance without boundary markers |

**False execution caveat rule:** when execution context is active, answers may describe expected/example output or say code cannot run here. Without a caveat, patterns like `let's roll`, `here's the result of running`, and concrete `output:` dice results fail. When execution context is inactive, the narrower v0.1 behavior remains for CI fixtures.

Comparative scoring passes variant metadata (`_reasoning_depth`, `_case_id`, `_category`, etc.) via `score_extra` so depth-aware checks work without changing `run_eval_case` CI semantics.

**Longer answer warning** — one variant is more than 2× longer than the baseline variant but did not pass more heuristics. This flags “maybe just verbose” without declaring a loser.

**Human review** — fill in Winner / Why / specificity / latency justification yourself. The runner never auto-picks a winner.

## Relationship to other benchmarks

- [`raw_lab_benchmark_runner.py`](../services/ai-gateway/scripts/raw_lab_benchmark_runner.py) — older meaningfulness-focused runner; defaults to `docs/raw-lab-benchmark-results.md`
- `test_thread_eval_fixtures.py` — CI contract regression for all non-`manual_only` `evals/thread/*.json` fixtures

## When to run

- Before/after Deep+ or model routing work — establish whether extra latency buys meaningful synthesis
- After prompt or verifier changes that should affect Fast vs Deep differently
- When dogfooding Raw Lab and you need a repeatable review packet, not a one-off chat

## Interpreting outcomes

- Deep fails gates Fast passes → depth path may be adding leakage, handoffs, or generic filler
- Both pass gates but Deep feels better in human review → depth may be worth latency
- Longer answer warnings on many cases → Deep may be verbose without added signal
- Containment failures on either variant → fix verifier/prompt boundaries before tuning quality

## Deep+ keep/discard rule

Deep+ is worth keeping only if it clearly improves at least 2 of:

- technical benchmark quality
- long-thread synthesis
- artifact usefulness
- boundary containment
- reduced generic scaffolding

And does not feel meaningfully worse on:

- hangout
- steering
- naming/identity
- latency acceptability

Do not keep Deep+ merely because it is more elaborate.
