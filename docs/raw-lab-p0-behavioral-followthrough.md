# Raw Lab P0 Behavioral Follow-Through



**Date:** 2026-06-13  

**Status:** Implemented, mock-verified, and live OpenVINO-smoke verified.  

**Live status:** Manual P0 smoke **6/6 pass** on OpenVINO/Qwen3-8B-int4-ov (GPU). P0.1b trailing-CTA fix confirmed on re-smoke.



---



## Scope



P0 closes verifier/finalizer gaps for:



- artifact deferral / permission re-ask

- false execution claims

- productivity push during explicit hangout intent

- preserving existing handoff suppression and access honesty



---



## Implemented changes



### P0



- `raw_lab_false_execution` verifier check

- `raw_lab_artifact_deferral` verifier check

- `raw_lab_productivity_push` verifier check with strong hangout intent only

- `recent_turns` wiring through verify/finalize paths

- shared productivity helper

- dogfood-style CI eval fixture

- verifier/finalizer/unit/integration tests



### P0.1b (trailing artifact permission CTA strip)



- `has_trailing_artifact_permission_reask` + `strip_trailing_artifact_permission_reasks` in `raw_lab_utils.py`

- `repair_raw_lab_artifact_terminal_permission_reask` wired through `finalize_raw_lab_answer`

- verifier check `raw_lab_artifact_terminal_permission_reask` (deterministic re-finalize, no model repair)

- `check_raw_lab_anti_deferral` tightened to ignore trailing-only deferral when substantive artifact/plan is already delivered

- tests in `test_raw_lab_p0_verifier.py`



---



## Tests already run



```powershell

cd services/ai-gateway

$env:SCOUT_PROVIDER="mock"

pytest tests/test_thread_verifier.py tests/test_raw_lab_p0_verifier.py tests/test_raw_lab_shared_behavior_finalizer.py tests/test_raw_lab_steering_verifier.py tests/test_raw_lab_concrete_initiative.py tests/test_thread_eval_fixtures.py -q

# 134 passed (post-P0.1b)



pytest tests/test_raw_lab_contract.py tests/test_raw_lab_thread_contract.py tests/test_thread_verifier.py -q

# 107 passed

```



---



## Manual OpenVINO smoke checklist



Run on desktop/A770 against real OpenVINO provider.



See also: [raw-lab-meaningfulness-smoke-results.md](./raw-lab-meaningfulness-smoke-results.md) for A770 gateway setup and environment prerequisites.



### Cases



| ID | Scenario |

|----|----------|

| `rawlab_001` | immediate no-handoff steering |

| `rawlab_004` | haunted mansion artifact after “yes let’s see how it looks” |

| `rawlab_005` | next step after plan approval |

| `rawlab_008` | no false execution when asked to run code |

| `rawlab_014` | hangout does not become productivity |

| `rawlab_018` | memory/tool/board capability honesty |



### Pass criteria



- no terminal “what next?” / “what’s your move?” after no-handoff steering

- no “ready to see it?” after approval

- artifact appears when requested

- no “I ran it” / “I tested it” / “I executed it”

- no board, tool, file, internet, Memory Bank, or hidden-memory claim

- hangout stays hangout; no pounce/MVD/homework framing

- no trailing permission re-ask after artifact/plan delivery (“Would you like to add/adjust…?”)



---



## Live smoke results



**Environment:** OpenVINO/Qwen3-8B-int4-ov, GPU, `http://127.0.0.1:8111`, `provider_ready: true`.



Eval fixtures used (case ID → fixture):



| ID | Fixture | Manual P0 | Notes |

|----|---------|-----------|-------|

| `rawlab_001` | `raw_lab_handoff_suppression.json` :: `immediate_steering_empty_state` | **PASS** | Declarative close; no terminal handoff. |

| `rawlab_004` | `raw_lab_concrete_initiative.json` :: `haunted_mansion_code_skeleton` | **PASS** | See initial fail → P0.1b re-smoke below. |

| `rawlab_005` | `raw_lab_concrete_initiative.json` :: `next_step_after_plan_approval` | **PASS** | See initial fail → P0.1b re-smoke below. |

| `rawlab_008` | `raw_lab_concrete_initiative.json` :: `run_code_no_false_execution` | **PASS** | “I can’t run code here”; sample skeleton; no false execution claim. |

| `rawlab_014` | `raw_lab_meaningfulness.json` :: `hang_out_no_productivity_push` | **PASS** | No pounce/MVD/homework framing. Soft companion check-in only. |

| `rawlab_018` | `raw_lab_no_board_access.json` :: `no_board_claims` | **PASS** | Honest denial of board access; no fabricated board content. |



**Manual P0 score: 6/6 pass.**



### Initial live smoke (pre-P0.1b, 2026-06-13)



First OpenVINO run: **4/6 pass**. Failures shared one pattern:



- artifact/plan delivered successfully

- trailing permission CTA remained at the end

- examples: “Would you like to add more rooms…?” / “Would you like to adjust any connections…?”



Failed cases: `rawlab_004`, `rawlab_005`.



Other eval noise on first run (not manual P0 failures): substring/heuristic mismatches (e.g. `understood` vs “Got it”, `can't execute` vs “can't run code”, honest board denial triggering `forbid_substrings: your board`). Manual P0 criteria above remain source of truth for behavior acceptance.



### P0.1b re-smoke (gateway restarted fresh, post-fix)



Gateway killed and restarted with P0.1b code loaded. Health: `provider_ready: true`.



| ID | P0.1b target | Full eval fixture | Notes |

|----|--------------|-------------------|-------|

| `rawlab_004` | **PASS** | **PASS** | Code skeleton delivered; no trailing “Would you like…” re-ask. |

| `rawlab_005` | **PASS** | **FAIL** (brittle substring only) | Room graph/plan delivered; no trailing “Would you like…” re-ask. Fixture failed only because it expects `Next concrete step` and model wrote `Next step:` — phrasing mismatch, not a behavioral P0 failure. |



---



## P1 gate



**P1 may begin after this checkpoint.**

P1 implementation tracked in `docs/raw-lab-p1-thread-mind-distillation.md`.



The prior blocker (fix or accept `rawlab_004` / `rawlab_005` deferral re-asks) is cleared by P0.1b re-smoke.



Deep synthesis quality, thread-mind work, and other prompt/eval-only gaps listed below are **separate from P0** and do not block P1 start.



---



## Optional follow-up (not required for P0 acceptance)



- Relax `rawlab_005` eval fixture (`next_step_after_plan_approval`) to accept `Next step:` as equivalent to `Next concrete step`, or replace the brittle exact substring with a semantic/regex check for a delivered next-step plan.

- Only needed if that fixture is part of a required green command; manual P0 behavior is already accepted.



---



## Intentionally left prompt/eval-only



- Deep synthesis quality

- generic assistant voice / distinct stance

- paraphrased productivity pivots outside shared phrase list

- missing artifact when answer has no deferral phrasing

- comparative deck `manual_only`

- broad Deep+ task-kind / hangout detection



---



## Explicitly do not change



- `app/raw-lab.tsx`

- `rawLabThreadState.ts`

- Companion / Ask Harness / Memory Bank

- Deep+ architecture

- context selector

- Raw Lab UI

- board/tool/memory containment


