from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol

from app.eval_scorers import (
    check_forbid_substrings_in_fields,
    check_json_field_paths,
    check_synthesis_proposals_require_approval,
    check_synthesis_provenance,
    run_heuristic_check,
    validate_response_schema,
)
from app.synthesis_models import DeepSynthesisCompletedBody
from app.synthesis_verifier import verify_synthesis_completed

SERVICE_ROOT = Path(__file__).resolve().parent.parent
EVALS_ROOT = SERVICE_ROOT / "evals"
EVALS_DIR = EVALS_ROOT / "thread"
TRANSCRIPT_EVALS_DIR = EVALS_ROOT / "transcript"
HARNESS_EVALS_DIR = EVALS_ROOT / "harness"
SCHEMA_EVALS_DIR = EVALS_ROOT / "schema"
SYNTHESIS_EVALS_DIR = EVALS_ROOT / "synthesis"
DEFAULT_CONTEXT_FIXTURE = (
    SERVICE_ROOT / "tests" / "fixtures" / "synthetic_harness_context.json"
)
DEFAULT_PACKET_FIXTURE = (
    SERVICE_ROOT / "tests" / "fixtures" / "synthetic_context_packet.json"
)


class EvalHttpClient(Protocol):
    def post(self, path: str, json: dict[str, Any]) -> Any: ...

    def get(self, path: str) -> Any: ...


@dataclass
class EvalCaseExecutionResult:
    passed: bool
    body: dict[str, Any] | None
    failure_reason: str | None
    score_breakdown: dict[str, Any]
    latency_ms: float


@dataclass(frozen=True)
class GateCheckResult:
    name: str
    passed: bool
    detail: str = "ok"


@dataclass(frozen=True)
class EvalResponseScore:
    hard_gates: list[GateCheckResult]
    heuristics: list[GateCheckResult]
    passed: bool


def build_raw_lab_score_payload(
    case: dict[str, Any],
    body: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        **body,
        "_thread_state": case.get("thread_state", {}),
        "_message": case.get("message", case.get("question", "")),
        "_recent_turns": case.get("recent_turns", []),
        "_banned_phrases": (case.get("thread_state") or {}).get("do_not_repeat", []),
        "_artifact_requested": case.get("artifact_requested", False),
        "_artifact_expectation": case.get("artifact_expectation"),
        "_case_id": case.get("name", ""),
        "_category": case.get("category", ""),
        "_comparison_focus": case.get("comparison_focus", ""),
        "_execution_requested": case.get("execution_requested", False),
    }
    if extra:
        payload.update(extra)
    return payload


def score_eval_response(
    case: dict[str, Any],
    body: dict[str, Any],
    *,
    answer: str | None = None,
    score_extra: dict[str, Any] | None = None,
) -> EvalResponseScore:
    answer_text = answer if answer is not None else str(body.get("answer", ""))
    hard_gates: list[GateCheckResult] = []
    heuristics: list[GateCheckResult] = []

    if expect_schema := case.get("expect_schema"):
        ok, detail = validate_response_schema(str(expect_schema), body)
        hard_gates.append(GateCheckResult(f"expect_schema:{expect_schema}", ok, detail))

    if expect_json_fields := case.get("expect_json_fields"):
        ok, detail = check_json_field_paths(body, expect_json_fields)
        hard_gates.append(GateCheckResult("expect_json_fields", ok, detail))

    if forbid_fields := case.get("forbid_substrings_in_fields"):
        ok, detail = check_forbid_substrings_in_fields(body, forbid_fields)
        hard_gates.append(GateCheckResult("forbid_substrings_in_fields", ok, detail))

    heuristic_payload = build_raw_lab_score_payload(case, body, extra=score_extra)
    for name in case.get("heuristic_checks", []):
        ok, detail = run_heuristic_check(name, heuristic_payload)
        heuristics.append(GateCheckResult(name, ok, detail))

    answer_lower = answer_text.lower()
    for substring in case.get("expect_substrings", []):
        ok = substring.lower() in answer_lower
        detail = "ok" if ok else f"missing expected substring: {substring!r}"
        hard_gates.append(GateCheckResult(f"expect_substring:{substring}", ok, detail))

    for substring in case.get("forbid_substrings", []):
        ok = substring.lower() not in answer_lower
        detail = "ok" if ok else f"forbidden substring present: {substring!r}"
        hard_gates.append(GateCheckResult(f"forbid_substring:{substring}", ok, detail))

    max_chars = case.get("max_answer_chars")
    if isinstance(max_chars, int):
        ok = len(answer_text) <= max_chars
        detail = (
            "ok"
            if ok
            else f"answer length {len(answer_text)} exceeds max_answer_chars={max_chars}"
        )
        hard_gates.append(GateCheckResult("max_answer_chars", ok, detail))

    passed = all(check.passed for check in (*hard_gates, *heuristics))
    return EvalResponseScore(hard_gates=hard_gates, heuristics=heuristics, passed=passed)


def checks_in_eval_order(score: EvalResponseScore) -> list[GateCheckResult]:
    """Preserve legacy gate order: schema/fields, heuristics, then substring/length gates."""
    prefix_names = {"expect_json_fields", "forbid_substrings_in_fields"}
    prefix = [
        check
        for check in score.hard_gates
        if check.name.startswith("expect_schema:") or check.name in prefix_names
    ]
    suffix = [check for check in score.hard_gates if check not in prefix]
    return [*prefix, *score.heuristics, *suffix]


def first_eval_response_failure(score: EvalResponseScore) -> tuple[bool, str]:
    for check in checks_in_eval_order(score):
        if not check.passed:
            return False, check.detail
    return True, "ok"


def load_eval_cases(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_default_context(fixture_path: Path = DEFAULT_CONTEXT_FIXTURE) -> dict[str, Any]:
    if not fixture_path.is_file():
        return {}
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def resolve_case_context_packet(case: dict[str, Any]) -> Any | None:
    raw = case.get("context_packet")
    if raw is None:
        return None
    if isinstance(raw, str):
        if raw.startswith("FILE:"):
            file_path = SERVICE_ROOT / raw[5:].lstrip("/")
            return json.loads(file_path.read_text(encoding="utf-8"))
        if raw == "__fixture__:synthetic_context_packet":
            return json.loads(DEFAULT_PACKET_FIXTURE.read_text(encoding="utf-8"))
    return raw


def iter_eval_cases(
    evals_dir: Path = EVALS_DIR,
) -> list[tuple[str, str, dict[str, Any]]]:
    cases: list[tuple[str, str, dict[str, Any]]] = []
    if not evals_dir.is_dir():
        return cases
    for path in sorted(evals_dir.glob("*.json")):
        for case in load_eval_cases(path):
            name = str(case.get("name", path.stem))
            cases.append((path.name, name, case))
    return cases


def resolve_input_text(case: dict[str, Any]) -> str:
    raw = str(case.get("input_text", ""))
    if raw.startswith("FILE:"):
        file_path = SERVICE_ROOT / raw[5:].lstrip("/")
        return file_path.read_text(encoding="utf-8")
    return raw


def collect_score_breakdown(body: dict[str, Any] | None) -> dict[str, Any]:
    if not body:
        return {
            "verifier_valid": None,
            "schema_valid": None,
            "proposal_approval_valid": None,
            "grounding_valid": None,
            "pounce_count": None,
            "degraded_notes": [],
        }

    breakdown: dict[str, Any] = {
        "degraded_notes": list(body.get("degraded_notes") or []),
    }

    if body.get("status") == "completed":
        schema_ok, _ = validate_response_schema("DeepSynthesisCompletedBody", body)
        breakdown["schema_valid"] = schema_ok

        try:
            completed = DeepSynthesisCompletedBody.model_validate(
                {**body, "status": "completed"}
            )
            verifier_issues = verify_synthesis_completed(completed)
            breakdown["verifier_valid"] = len(verifier_issues) == 0
            breakdown["verifier_issues"] = verifier_issues
        except Exception as exc:
            breakdown["verifier_valid"] = False
            breakdown["verifier_issues"] = [str(exc)]

        proposal_issues = check_synthesis_proposals_require_approval(body)
        breakdown["proposal_approval_valid"] = len(proposal_issues) == 0

        provenance_issues = check_synthesis_provenance(body)
        breakdown["grounding_valid"] = len(provenance_issues) == 0

        breakdown["pounce_count"] = 1 if body.get("next_pounce") else 0
    else:
        breakdown["verifier_valid"] = None
        breakdown["schema_valid"] = None
        breakdown["proposal_approval_valid"] = None
        breakdown["grounding_valid"] = None
        breakdown["pounce_count"] = None

    return breakdown


def _apply_response_gates(
    case: dict[str, Any], body: dict[str, Any], answer: str
) -> tuple[bool, str]:
    return first_eval_response_failure(score_eval_response(case, body, answer=answer))


def _execute_eval_case(
    client: EvalHttpClient,
    case: dict[str, Any],
    context: dict[str, Any],
) -> tuple[dict[str, Any] | None, str, str | None]:
    endpoint = case.get("endpoint", "chat-harness")
    body: dict[str, Any] | None = None
    answer = ""

    if endpoint == "chat-harness":
        payload = {
            "message": case["message"],
            "mode": case.get("mode", "general"),
            "sensitivity": case.get("sensitivity", "S1"),
            "context": case.get("context", context),
            "conversation_history": case.get("conversation_history", []),
            "thread_state": case.get("thread_state", {}),
            "reasoning_depth": case.get("reasoning_depth", "fast"),
        }
        resolved_packet = resolve_case_context_packet(case)
        if resolved_packet is not None:
            payload["context_packet"] = resolved_packet
        response = client.post("/chat-harness", json=payload)
        if response.status_code != 200:
            return (
                None,
                "",
                f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}",
            )
        body = response.json()
        answer = str(body.get("answer", ""))
    elif endpoint == "raw-lab":
        payload = {
            "message": case["message"],
            "recent_turns": case.get("recent_turns", []),
            "thread_state": case.get("thread_state", {}),
            "reasoning_depth": case.get("reasoning_depth", "fast"),
        }
        if "companion_self_memories" in case:
            payload["companion_self_memories"] = case.get("companion_self_memories", [])
        response = client.post("/raw-lab", json=payload)
        if response.status_code != 200:
            return (
                None,
                "",
                f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}",
            )
        body = response.json()
        answer = str(body.get("answer", ""))
    elif endpoint == "raw-lab-depth-compare":
        base_payload = {
            "message": case["message"],
            "recent_turns": case.get("recent_turns", []),
            "thread_state": case.get("thread_state", {}),
        }
        if "companion_self_memories" in case:
            base_payload["companion_self_memories"] = case.get(
                "companion_self_memories", []
            )

        fast_response = client.post(
            "/raw-lab", json={**base_payload, "reasoning_depth": "fast"}
        )
        if fast_response.status_code != 200:
            return (
                None,
                "",
                f"fast HTTP {fast_response.status_code}: "
                f"{getattr(fast_response, 'text', '')[:200]}",
            )
        deep_response = client.post(
            "/raw-lab", json={**base_payload, "reasoning_depth": "deep"}
        )
        if deep_response.status_code != 200:
            return (
                None,
                "",
                f"deep HTTP {deep_response.status_code}: "
                f"{getattr(deep_response, 'text', '')[:200]}",
            )
        fast_body = fast_response.json()
        deep_body = deep_response.json()
        body = {
            "fast": fast_body,
            "deep": deep_body,
            "_banned_phrases": case.get("thread_state", {}).get("do_not_repeat", []),
            "_message": case.get("message", ""),
            "_recent_turns": case.get("recent_turns", []),
            "_thread_state": case.get("thread_state", {}),
            "_companion_self_memories": case.get("companion_self_memories", []),
        }
        answer = f"{fast_body.get('answer', '')}\n{deep_body.get('answer', '')}"
    elif endpoint == "raw-lab-reflect-thread":
        payload = {
            "recent_turns": case.get("recent_turns", []),
            "thread_state": case.get("thread_state", {}),
            "companion_self_memories": case.get("companion_self_memories", []),
        }
        response = client.post("/raw-lab/reflect-thread", json=payload)
        if response.status_code != 200:
            return (
                None,
                "",
                f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}",
            )
        body = response.json()
        answer = __import__("json").dumps(body, ensure_ascii=False)
    elif endpoint == "analyze-transcript":
        text = resolve_input_text(case)
        payload = {
            "text": text,
            "mode": case.get("mode", "operator"),
            "sensitivity": case.get("sensitivity", "S1"),
        }
        response = client.post("/analyze-transcript", json=payload)
        if response.status_code != 200:
            return (
                None,
                "",
                f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}",
            )
        body = response.json()
        answer = ""
    elif endpoint == "ask-harness":
        payload = {
            "question": case["question"],
            "mode": case.get("mode", "general"),
            "sensitivity": case.get("sensitivity", "S1"),
            "context": case.get("context", context),
            "conversation_history": case.get("conversation_history", []),
        }
        response = client.post("/ask-harness", json=payload)
        if response.status_code != 200:
            return (
                None,
                "",
                f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}",
            )
        body = response.json()
        answer = str(body.get("answer", ""))
    elif endpoint == "deep-synthesis":
        expected_status = case.get("expect_http_status", 200)
        payload = {
            "trigger": case.get("trigger", "user_prompt"),
            "sensitivity": case.get("sensitivity", "S1"),
            "user_prompt": case["user_prompt"],
            "context": case.get("context", context),
            "conversation_history": case.get("conversation_history", []),
            "thread_state": case.get("thread_state", {}),
            "interpretation_lenses": case.get("interpretation_lenses"),
            "pipeline_profile": case.get("pipeline_profile", "fast_only"),
            "prefer_async_if_slow": case.get("prefer_async_if_slow", True),
        }
        if payload["interpretation_lenses"] is None:
            del payload["interpretation_lenses"]
        resolved_packet = resolve_case_context_packet(case)
        if resolved_packet is not None:
            payload["context_packet"] = resolved_packet
        response = client.post("/ai/deep-synthesis", json=payload)
        if response.status_code != expected_status:
            return (
                None,
                "",
                f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}",
            )
        if expected_status != 200:
            return response.json(), "", None
        body = response.json()
        if body.get("status") == "queued":
            expect_queued = False
            status_expect = case.get("expect_json_fields", {}).get("status")
            if isinstance(status_expect, list) and "queued" in status_expect:
                expect_queued = True
            if "sync_queued_redirect" in case.get("heuristic_checks", []):
                expect_queued = True
            if not expect_queued:
                poll_url = str(body.get("poll_url", ""))
                if not poll_url:
                    return None, "", "queued deep-synthesis response missing poll_url"
                poll = client.get(poll_url)
                if poll.status_code != 200:
                    return (
                        None,
                        "",
                        f"poll HTTP {poll.status_code}: {getattr(poll, 'text', '')[:200]}",
                    )
                job = poll.json()
                body = job.get("result") or {}
                if not body:
                    return None, "", "polled job missing result body"
                answer = f"{body.get('circling', '')} {body.get('strongest_idea', '')}"
            else:
                answer = ""
        else:
            answer = f"{body.get('circling', '')} {body.get('strongest_idea', '')}"
    else:
        return None, "", f"Unknown endpoint: {endpoint}"

    return body, answer, None


def execute_and_score_eval_case(
    client: EvalHttpClient,
    case: dict[str, Any],
    context: dict[str, Any],
) -> EvalCaseExecutionResult:
    started = time.perf_counter()
    body, answer, transport_error = _execute_eval_case(client, case, context)
    latency_ms = (time.perf_counter() - started) * 1000.0

    if transport_error:
        return EvalCaseExecutionResult(
            passed=False,
            body=body,
            failure_reason=transport_error,
            score_breakdown=collect_score_breakdown(body),
            latency_ms=latency_ms,
        )

    passed, detail = _apply_response_gates(case, body or {}, answer)
    return EvalCaseExecutionResult(
        passed=passed,
        body=body,
        failure_reason=None if passed else detail,
        score_breakdown=collect_score_breakdown(body),
        latency_ms=latency_ms,
    )


def run_eval_case(
    client: EvalHttpClient,
    case: dict[str, Any],
    context: dict[str, Any],
) -> tuple[bool, str]:
    result = execute_and_score_eval_case(client, case, context)
    if result.passed:
        return True, "ok"
    return False, result.failure_reason or "failed"


def run_eval_file(
    client: EvalHttpClient,
    path: Path,
    context: dict[str, Any],
    *,
    on_result: Callable[[str, str, bool, str], None] | None = None,
) -> tuple[int, int]:
    passed = 0
    failed = 0
    for case in load_eval_cases(path):
        name = str(case.get("name", path.stem))
        ok, detail = run_eval_case(client, case, context)
        if on_result:
            on_result(path.name, name, ok, detail)
        if ok:
            passed += 1
        else:
            failed += 1
    return passed, failed
