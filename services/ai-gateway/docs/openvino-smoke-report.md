# OpenVINO Smoke Report (Phase 1.6)

Real A770 GPU smoke run on synthetic fixture. Paste metrics from `scripts/smoke_openvino.py`; scored with [evaluation-rubric.md](./evaluation-rubric.md).

**Evaluation rule:** OpenVINO output is judged by **schema + rubric only**. Do not golden-compare to [mock_synthetic_analysis.json](./sample-outputs/mock_synthetic_analysis.json).

**Privacy:** Synthetic fixture only. Example output: [openvino_synthetic_analysis.example.json](./sample-outputs/openvino_synthetic_analysis.example.json).

---

## Run metadata

- **Date:** 2026-06-09
- **Machine / GPU:** Intel Arc A770 Graphics (Windows, local dev machine)
- **Phase 1.6 pass verdict:** **PASS** (GPU smoke exit 0, `SCOUT_DEVICE=GPU`)
- **Fixture:** tests/fixtures/synthetic_transcript.txt

### SCOUT env snapshot

```text
SCOUT_PROVIDER=openvino
SCOUT_MODEL_PATH=models/qwen3-8b-int4-ov
SCOUT_DEVICE=GPU
SCOUT_TIMEOUT_SECONDS=180
SCOUT_MAX_INPUT_CHARS=12000
SCOUT_TEMPERATURE=0.2
```

## Environment / versions

### Before install

```text
Python 3.12.10
openvino_genai: ModuleNotFoundError (not installed)
pip show openvino openvino-genai huggingface-hub: packages not found
```

### After install

```text
Python 3.12.10
openvino_genai.__version__: 2026.2.0.0-3121-adf73e80e66
openvino: 2026.2.0
openvino-genai: 2026.2.0.0
huggingface-hub: 1.18.0
```

Model download: `hf download OpenVINO/Qwen3-8B-int4-ov --local-dir models/qwen3-8b-int4-ov`

## Smoke metrics

(from successful GPU run after `apply_chat_template=True` fix)

```text
Smoke metrics:
- health_status: ok
- provider: openvino
- model: OpenVINO/Qwen3-8B-int4-ov
- device: GPU
- load_result: ready
- request_duration_seconds: 29.411
- schema_valid: true
- first_try_json_success: n/a
- repair_used: n/a
```

Second `--write-output` run (pipeline warm): `request_duration_seconds: 19.874`

## Manual follow-up

- **first_try_json_success:** yes (server log showed HTTP 200 with no repair warning after chat-template fix)
- **repair_used:** no on passing run; yes on first attempt with `apply_chat_template=False` (502 after repair)
- **Rubric overall:** weak (schema pass, quality mixed)
- **Biggest issue:** Contradictory actions — parks todo-app comparison but also suggests researching job board apps and setting up a todo app in `next_actions`
- **Next adjustment:** Phase 1.7 prompt tuning — tighten “one pounce mission”, align `next_actions` with `things_to_park`, keep research items parked

## Rubric (pass / weak / fail)

| Criterion | Score | Notes |
|-----------|-------|-------|
| Summary accuracy | pass | Captures procrastination, over-optimization, body neglect without inventing major facts |
| Useful themes | pass | Side project, workflow rabbit hole, body/stability, open loops |
| Inbox-by-default cards | pass | All four cards use Inbox |
| Tiny next actions | weak | “Eat a snack” good; “Research 2 job board apps” / “Pick 1 todo app and set up” borderline large |
| Practical pounce mission | weak | Combines snack + research (two moves, not one tiny pounce) |
| Reasonable things_to_park | pass | Todo app comparison and workflow tooling called out |
| Humble confidence_notes | pass | Uses inferred language |
| No high-stakes overreach | pass | No medical/legal/financial prescriptions or autonomous actions |

See [evaluation-rubric.md](./evaluation-rubric.md).

## Code change during Phase 1.6

**File:** `app/providers/openvino_provider.py`

**Change:** `GenerationConfig.apply_chat_template = True` (was `False`)

**Why:** Qwen3 is a chat/instruct model. With `apply_chat_template=False`, first GPU run returned non-JSON output (502 after repair, ~63s). With `True`, first-try JSON validated (~29s warm load, ~20s warm pipeline).

This is a provider API usage fix, not prompt content tuning.

## Notes

- First GPU attempt (before fix): exit 4, `JSON parse/schema issue`, duration 62.798s, repair attempted
- CPU diagnostic not run — GPU inference succeeded after fix
- Example JSON written from synthetic fixture only; safe to commit

---

## Example (synthetic fixture only)

Output file: `docs/sample-outputs/openvino_synthetic_analysis.example.json`

- **Fixture:** synthetic ShelfTracker / procrastination ramble
- **Phase 1.6 rubric overall:** weak — see Phase 1.7 section below for current output

---

## Phase 1.7 — Prompt tuning (2026-06-09)

**Verdict:** **PASS** (GPU smoke exit 0, `schema_valid: true`, consistency helper all checks pass)

**Changes:**
- Expanded [`app/prompts/transcript_analysis.md`](../app/prompts/transcript_analysis.md): derivation order, parking/pounce/next-action/card/body rules, checklist, BAD/GOOD example, schema strictness for array fields
- Extended [`evaluation-rubric.md`](./evaluation-rubric.md): parking consistency, career directness, body floor, synthetic fixture expectations
- Added [`scripts/check_output_consistency.py`](../scripts/check_output_consistency.py) (non-blocking reviewer helper)
- **Provider API fix** (required for Qwen3 + longer prompt): `ChatHistory` with `enable_thinking=False` in [`openvino_provider.py`](../app/providers/openvino_provider.py) — same class of fix as Phase 1.6 `apply_chat_template`; without it the model emits long chain-of-thought and never reaches JSON within token budget

### Smoke metrics (Phase 1.7)

```text
Smoke metrics:
- health_status: ok
- provider: openvino
- model: OpenVINO/Qwen3-8B-int4-ov
- device: GPU
- load_result: ready
- request_duration_seconds: 19.413
- schema_valid: true
```

Consistency helper: all 5 checks pass on regenerated example JSON.

### Rubric (pass / weak / fail) — vs Phase 1.6

| Criterion | Phase 1.6 | Phase 1.7 | Notes |
|-----------|-----------|-----------|-------|
| Summary accuracy | pass | pass | Procrastination, career/body neglect |
| Useful themes | pass | pass | Career avoidance, body, open loops |
| Inbox-by-default cards | pass | pass | All Inbox |
| Tiny next actions | weak | pass | Snack + 10-min walk/stretch |
| Pounce mission | weak | pass | Single career move: one resume bullet |
| Parking consistency | fail | pass | Parks todo comparison, job-board research, workflow rabbit hole; pounce/next do not pursue them |
| Career directness | weak | pass | Direct resume bullet, not more research |
| Body floor | pass | pass | Snack + walk in next_actions |
| Things to park | pass | pass | Tooling/career-research loops named |
| Humble confidence_notes | pass | pass | Uses "Inferred — …" |
| No high-stakes overreach | pass | pass | Scout lane |

**Rubric overall:** mixed/usable (up from weak)

**Remaining gaps:** duplicate entries in `things_to_park`; homelab dashboard sometimes omitted from park list; career action duplicated in `next_actions` when already the pounce (minor).
