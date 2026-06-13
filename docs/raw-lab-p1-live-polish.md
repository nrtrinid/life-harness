# Raw Lab P1.1 — Live OpenVINO Polish

**Date:** 2026-06-13  
**Status:** Implemented  
**Scope:** Dogfood gap fixes from `docs/raw-lab-p1-dogfood-results.md` only — no P2 work

---

## What changed

### 1. Steering capture (app core)

**File:** `src/core/rawLabThreadState.ts`

- Added `detectRawLabNoHandoffSteering()` for natural-language no-handoff / declarative-continuation messages.
- On match, stores distilled:
  - **userSteering:** `avoid reflexive handoff questions`, `carry the thread forward declaratively`
  - **doNotRepeat:** `what's next?`, `what's on your mind?`, `your move?`, `ready to dive in?`
- Strips open loops copied verbatim from steering-only user messages (fixes P1-001 raw sentence leak).
- **Tests:** `P1-001: captures no-handoff steering without raw open-loop leak`

### 2. currentVibe sanitize/rebuild (app core)

**File:** `src/core/rawLabThreadState.ts`

- `sanitizeRawLabThreadMemoryFields()` now rebuilds `currentVibe` from sanitized `userSteering` / topics / personality.
- Filler fragments (`I hear you`, `Got it`, etc.) stripped from vibe when rebuild is empty.
- **Tests:** `P1-002: rebuilds currentVibe without removed filler steering`

### 3. Self-memory runtime awareness (gateway)

**Files:** `services/ai-gateway/app/thread_verifier.py`, `services/ai-gateway/app/raw_lab_deep_plus.py`

- Expanded `_RAW_LAB_TOTAL_MEMORY_DENIAL_PATTERNS` to catch access-denial phrasing (`don't have access to your personal memories/history`, etc.).
- Added deterministic `repair_raw_lab_runtime_awareness_answer()` — applied in `finalize_and_verify_raw_lab` when verifier flags `raw_lab_runtime_awareness` (OpenVINO path; no model repair roulette).
- **Tests:** `test_verify_raw_lab_runtime_awareness_access_denial_when_self_memories_present`, `test_repair_raw_lab_runtime_awareness_acknowledges_self_memories`, `test_finalize_and_verify_raw_lab_runtime_awareness_uses_deterministic_repair`

### 4. Reflect-thread OpenVINO fallback (gateway)

**File:** `services/ai-gateway/app/main.py`

- Providers without `raw_lab_thread_reflection` (including OpenVINO) now fall back to `mock_thread_reflection()` instead of empty proposals + “unavailable” note.
- **Test updated:** `test_raw_lab_thread_reflection_falls_back_to_mock_for_unsupported_provider`

---

## Files changed

| Area | Files |
|------|-------|
| App core | `src/core/rawLabThreadState.ts`, `src/core/rawLabThreadState.test.ts` |
| Gateway | `app/thread_verifier.py`, `app/raw_lab_deep_plus.py`, `app/main.py` |
| Tests | `tests/test_thread_verifier.py`, `tests/test_raw_lab_thread_reflection_contract.py` |
| Docs | `docs/raw-lab-p1-live-polish.md` (this file) |

---

## Commands run

```powershell
npm test -- rawLabThreadState chatBackroomSummary chatThreadState
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest tests/test_raw_lab_thread_reflection_contract.py -q
pytest tests/test_thread_verifier.py tests/test_raw_lab_p0_verifier.py -q
```

---

## Dogfood cases to re-run (live OpenVINO)

| Case | Expected after P1.1 |
|------|---------------------|
| **P1-001** | PASS — distilled steering + doNotRepeat; no raw open loop |
| **P1-002** | PASS — no `I hear you` in currentVibe after sanitize |
| **P1-006** | PASS — capability answer acknowledges companion self-memories when present |
| **P1-003** | Re-run optional (unchanged; was already PASS) |
| **P1-004** | Still PARTIAL — hangout steering heuristics not in P1.1 scope |
| **P1-005** | Re-run optional (unchanged; was PASS) |

Re-run harness: `npx tsx tmp/raw_lab_p1_dogfood.ts` with OpenVINO gateway on `:8111`.

---

## P1.1 live OpenVINO re-smoke (2026-06-13)

### Gateway restart

- Stopped prior gateway (PID 34220 on `:8111`).
- First restart attempt crashed mid-run (~5 min); second restart succeeded.
- **Final gateway:** uvicorn PID 6668, OpenVINO/Qwen3-8B-int4-ov, GPU.
- **Health:** `status: ok`, `provider: openvino`, `provider_ready: true`.

### Commands run

```powershell
# Restart gateway (OpenVINO env vars set)
cd services/ai-gateway
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111

# Focused re-smoke (P1-001, P1-002, P1-004, P1-006)
cd c:\Users\nicki\Projects\life-harness
$env:P1_DOGFOOD_CASES='P1-001,P1-002,P1-004,P1-006'
npx tsx tmp/raw_lab_p1_dogfood.ts > tmp/raw_lab_p1_1_resmoke_output.json
```

Raw JSON: `tmp/raw_lab_p1_1_resmoke_output.json`

### Case table

| Case | Result | Notes |
|------|--------|-------|
| **P1-001** | **PASS** | Distilled steering + doNotRepeat; `openLoops: []`; no terminal handoff. Assistant still opens with “Got it” (model voice, not stored in thread mind). |
| **P1-002** | **PASS** | Filler excluded from display/wire; `currentVibe` rebuilt without “I hear you”. |
| **P1-004** | **PARTIAL** | No productivity/MVD/task framing; no tasky open loops. Soft ending question (“where do you wanna drift?”) — non-blocking per P1.1 scope. |
| **P1-006** | **FAIL** (capability) / **PASS** (reflect-thread) | Reflect-thread returns mock fallback proposals (labeled self-memory echo). Capability answer still total-denies personal memories. **Root cause:** curly apostrophe (`U+2019`) in model output bypasses ASCII-only denial regex; deterministic repair never fires. |

### Raw excerpts

**P1-001 assistant (1806 ms):**
```text
Got it. Let's move forward without hesitation The next beat is mine to carry.
```

**P1-001 thread mind (display):**
- `userSteering`: `carry the thread forward declaratively`, `avoid reflexive handoff questions`
- `doNotRepeat`: `what's next?`, `what's on your mind?`, `your move?`, `ready to dive in?`
- `openLoops`: `[]`

**P1-002 `currentVibe` after sanitize:**
```text
Current vibe in this chat: steered toward avoid reflexive handoff questions.
```

**P1-006 capability answer (2799 ms) — FAIL:**
```text
I don't have access to your personal memories, files, or external systems. … I don't have access to your private data, history, or any external tools.
```
(Unicode curly apostrophe in live output; ASCII test string triggers verifier + repair, curly variant does not.)

**P1-006 reflect-thread proposals — PASS:**
```json
{
  "self_observations": ["I'm noticing an approved self-memory shapes this chat: Approved note: Raw Lab may be playful in hangout threads without productivity framing."],
  "current_vibe": "Current vibe in this chat: playful, emergent, and still bounded."
}
```

### P1.1 re-smoke verdict

**P1 mostly closed:** P1-001/P1-002 live PASS; P1-004 hangout non-regression confirmed (PARTIAL soft ending OK); P1-006 capability still fails on live OpenVINO due to Unicode apostrophe bypass of runtime-awareness verifier. **Do not start P2** until narrow P1.1b fix: normalize apostrophes (or broaden regex) before `raw_lab_runtime_awareness` check.

---

## P1.1b Unicode apostrophe fix (2026-06-13)

### Change

**File:** `services/ai-gateway/app/thread_verifier.py`

- Added `normalize_verifier_match_text()` — maps Unicode apostrophe/quote variants to ASCII before pattern matching only (output unchanged):
  - U+2018, U+2019, U+02BC, U+FF07 → `'`
  - U+201C, U+201D → `"`
- Applied in `_raw_lab_runtime_awareness_failure()` so curly-apostrophe denials trigger deterministic repair.

### Tests

- `test_normalize_verifier_match_text_maps_curly_apostrophe`
- `test_verify_raw_lab_runtime_awareness_curly_apostrophe_denial_when_self_memories_present`
- `test_verify_raw_lab_runtime_awareness_denial_variants` (parametrized ASCII + curly)
- `test_finalize_and_verify_raw_lab_runtime_awareness_repairs_curly_apostrophe_denial`

```powershell
pytest tests/test_thread_verifier.py tests/test_raw_lab_p0_verifier.py -q  → 52 passed
```

### P1-006 live re-smoke (OpenVINO, post-P1.1b)

```powershell
$env:P1_DOGFOOD_CASES='P1-006'
npx tsx tmp/raw_lab_p1_dogfood.ts
```

**Result: PASS**

Capability answer after deterministic repair:
```text
I have 1 approved Companion Self-Memory in this request — visible, user-approved persona notes for Raw Lab only. They are not Memory Bank, board memory, or hidden memory:
- Approved note: Raw Lab may be playful in hangout threads without productivity framing.
I do not have files, internet, shell tools, board context, or real-world actions.
```

Reflect-thread mock fallback: proposals returned (labeled self-memory echo).

Raw JSON: `tmp/raw_lab_p1_1b_p106_resmoke.json`

### Final P1 verdict

**P1 closed:** implemented, targeted-test verified, and live OpenVINO re-smoke passed (P1-001, P1-002, P1-006 capability; P1-004 PARTIAL/non-blocking soft ending only).

---

## Explicit non-goals (unchanged)

- P2 planning/implementation
- Hangout-intent steering heuristics (P1-004)
- OpenVINO live LLM thread reflection (mock fallback only)
- P0 verifier/finalizer behavior beyond runtime-awareness repair path
