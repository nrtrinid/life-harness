# Ask Harness OpenVINO Smoke Report (Phase 1.8a)

Real A770 GPU smoke run of `POST /ask-harness` via CLI and browser playground. Synthetic context only — no personal board data.

**Evaluation rule:** Judge schema validity and grounding quality only. Do not golden-compare to mock heuristics.

**Privacy:** Fixture: `tests/fixtures/synthetic_harness_context.json` only.

---

## Run metadata

- **Date:** 2026-06-09
- **Machine / GPU:** Intel Arc A770 Graphics (Windows, local dev machine)
- **Model:** OpenVINO/Qwen3-8B-int4-ov
- **Provider / device:** `openvino` / `GPU`
- **Pre-flight commit:** `f8a3772` — Add Ask Harness browser playground

### SCOUT env snapshot

```text
SCOUT_PROVIDER=openvino
SCOUT_MODEL_PATH=models/qwen3-8b-int4-ov
SCOUT_DEVICE=GPU
SCOUT_TIMEOUT_SECONDS=180
SCOUT_MAX_INPUT_CHARS=12000
SCOUT_TEMPERATURE=0.2
```

## Commands run

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest                                    # 34 passed

Get-NetTCPConnection -LocalPort 8111 ...  # stop prior gateway

$env:SCOUT_PROVIDER="openvino"
$env:SCOUT_MODEL_PATH="models/qwen3-8b-int4-ov"
$env:SCOUT_DEVICE="GPU"
$env:SCOUT_TIMEOUT_SECONDS="180"
$env:SCOUT_MAX_INPUT_CHARS="12000"
$env:SCOUT_TEMPERATURE="0.2"
uvicorn app.main:app --host 127.0.0.1 --port 8111

Invoke-RestMethod http://127.0.0.1:8111/health

python scripts/ask_harness.py --timeout 180 --question "What am I avoiding right now?"
python scripts/ask_harness.py --timeout 180 --question "What should I do next?" --mode operator
python scripts/ask_harness.py --timeout 180 --question "Am I over-optimizing again?" --mode reflection
python scripts/ask_harness.py --timeout 180 --question "What should I build next?" --mode builder
python scripts/ask_harness.py --timeout 180 --question "Give me blunt advice based on this context." --mode general

# Browser: http://127.0.0.1:8111/playground — all five quick-question buttons
```

**Note:** CLI default timeout is 30s; `--timeout 180` required for OpenVINO GPU latency.

## Baseline tests

| Check | Result |
|-------|--------|
| `SCOUT_PROVIDER=mock pytest` | **34 passed** |

## Health check

```json
{
  "status": "ok",
  "provider": "openvino",
  "provider_ready": true,
  "model": "OpenVINO/Qwen3-8B-int4-ov",
  "device": "GPU",
  "message": "Model path ready; pipeline loads on first analyze request."
}
```

Pipeline loaded on first `ask_harness` request (~17s first call, ~9–11s warm calls).

## Question-by-question verdict

| # | Question | Mode | HTTP | Schema | Grounding | Tone / quality | Notes |
|---|----------|------|------|--------|-----------|----------------|-------|
| 1 | What am I avoiding right now? | operator | 200 | pass | pass | pass | Cites career avoidance log + cooling body/career analysis; tiny resume + walk actions; `requires_approval: true` |
| 2 | What should I do next? | operator | 200 | pass | pass | **weak** | `answer` is only the voice template (*"I kept track… Here is the move."*) — substance lives in grounding/actions, not the main answer |
| 3 | Am I over-optimizing again? | reflection | **502** | **fail** | n/a | n/a | JSON parse failed after one repair pass (reproduced on CLI retry + playground) |
| 4 | What should I build next? | builder | 200 | pass | pass | **weak** | Same template-only `answer` as Q2; structured fields otherwise reasonable |
| 5 | Give me blunt advice based on this context. | general | 200 | pass | pass | pass/weak | Substantive blunt summary; cites active cards + logs; mentions Local LLM rabbit hole only indirectly via patterns |

### Q1 — best answer (snippet)

> You are avoiding resume updates and job follow-up, as well as neglecting the body floor while focusing heavily on build work.

Grounding pulled from `Career / Networking` note log and `recent_analyses`. Inference marked in `confidence_notes`. Feels scout/operator, not generic chatbot.

### Q2 / Q4 — weakest successful answers (snippet)

> I kept track. Here is what changed. Here is what matters. Here is the move.

Model treated the voice block as the entire `answer` field. Grounding and `suggested_next_actions` were populated, but the prominent answer panel would look empty/useless in the playground.

### Q3 — blocked question

Server log:

```text
openvino ask_harness parse failed; attempting one JSON repair pass
provider parse error: Model output could not be parsed as valid ask-harness JSON after repair
```

Reflection mode consistently failed (502) across CLI and playground. Not a timeout; repair pass exhausted.

## Playground

| Check | Result |
|-------|--------|
| `GET /playground` | 200 — title + dev-sandbox subtitle present |
| `GET /playground/default-context` | 200 — 6 cards prefilled |
| Quick buttons (5) | **4/5 succeeded** — answer + list panels would render via `textContent` |
| Reflection button | 502 shown in status line (expected error UI) |

Playground plumbing works. OpenVINO quality issues mirror CLI.

## Evaluation summary

| Criterion | Overall |
|-----------|---------|
| Schema valid | **4/5 pass** — reflection mode blocked |
| Grounded in fixture | pass on successful runs — career cold, build hot, body cooling, proof/logs cited |
| Facts vs inference | pass when successful — `"Inferred — …"` present in most responses |
| Tiny next actions | pass — resume bullet, walk, endpoint stubs |
| No hallucination | pass — no invented cards or external events observed |
| No autonomous actions | pass — no send/spend/commit; `requires_approval: true` on updates |
| Better than mock | **mixed** — Q1/Q5 more nuanced; Q2/Q4 worse than mock (template answer) |
| Scout tone | mixed — Q1 good; Q2/Q4 over-index on voice template |

## Overall verdict

**mixed**

OpenVINO Ask Harness runs end-to-end on GPU for 4/5 vibe questions. First question quality is genuinely useful and grounded. Operator/builder modes often collapse the `answer` field to the voice template. Reflection mode fails JSON parsing reliably.

## Blockers

- **Reflection mode:** consistent 502 after repair — blocks over-optimization vibe test
- **Template-only answers:** operator/builder modes return schema-valid but low-signal `answer` text

No provider code changes made during this smoke (evaluation-only).

## Next recommendation

**Primary:** **Tune Ask Harness prompt** — require a substantive `answer` sentence before/alongside the voice template, and add reflection-mode JSON examples (especially `patterns_detected` / Local LLM Setup rabbit hole).

**Secondary:** **Return to board/context integration** — Q1 shows the loop is worth wiring to real Momentum Board state once prompt reliability improves.

**If reflection stays at 502 after prompt tune:** **Debug OpenVINO provider** parse/repair path for that mode.

## Related docs

- [ask-harness-sandbox.md](./ask-harness-sandbox.md) — endpoint, CLI, browser playground
- [openvino-smoke-report.md](./openvino-smoke-report.md) — Phase 1.6 transcript smoke

---

## Phase 1.8b — Prompt tune re-smoke

- **Date:** 2026-06-09
- **Changes:** [`app/prompts/ask_harness.md`](../app/prompts/ask_harness.md) — substantive `answer` rules, mode guidance, reflection guardrails, BAD/GOOD examples, JSON strictness, checklist; [`openvino_provider.py`](../app/providers/openvino_provider.py) — ask-harness-specific repair prompt (array-field reminder for `safety_notes` / `confidence_notes`)
- **Root cause (reflection 502):** Model emitted `safety_notes` as a string instead of array; pydantic strict validation failed even when `answer` was good

### Before / after (OpenVINO A770)

| # | Question | Mode | Phase 1.8a | Phase 1.8b |
|---|----------|------|------------|------------|
| 1 | What am I avoiding right now? | operator | 200 pass | 200 pass |
| 2 | What should I do next? | operator | 200 **weak** (template-only answer) | 200 **pass** (substantive) |
| 3 | Am I over-optimizing again? | reflection | **502** | 200 **pass** |
| 4 | What should I build next? | builder | 200 **weak** (template-only answer) | 200 **pass** (substantive) |
| 5 | Give me blunt advice based on this context. | general | 200 pass/weak | 200 **pass** |

### Phase 1.8b per-question notes

| # | HTTP | Schema | Quality | Notes |
|---|------|--------|---------|-------|
| 1 | 200 | pass | pass | Career avoidance + stalled thread; grounded in log/card |
| 2 | 200 | pass | pass | Names hot build cards + pounce on Career / Networking resume bullet |
| 3 | 200 | pass | pass | Local LLM Setup rabbit hole; over-optimization pattern; repair not needed on final run |
| 4 | 200 | pass | pass | Hot builds vs cold career; concrete resume bullet slice |
| 5 | 200 | pass | pass | Blunt read on tooling loop + cooling career/body; tiny actions |

### Best answer (1.8b)

> Based on the provided logs, you fell into comparing local LLM tooling while build cards stayed hot. Inferred — this is an optimization loop, not the active product move.

### Weakest answer (1.8b)

Q4 builder leans heavily on career resume bullet rather than naming EV Tracker / Life Harness build slices — grounded but mode-specific guidance partially missed. Still pass vs 1.8a template collapse.

### Phase 1.8b verdict

**pass**

All 5 OpenVINO Ask Harness questions return schema-valid JSON. Reflection 502 fixed. Q2/Q4 no longer template-only. Answers grounded in synthetic fixture with tiny next actions.

### Next step

**Return to board/context integration** — wire real Momentum Board state into Ask Harness once Career-first slice lands.
