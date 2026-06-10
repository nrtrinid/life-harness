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
    run_heuristic_checks,
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


def _apply_response_gates(
    case: dict[str, Any], body: dict[str, Any], answer: str
) -> tuple[bool, str]:
    if expect_schema := case.get("expect_schema"):
        ok, detail = validate_response_schema(str(expect_schema), body)
        if not ok:
            return False, detail

    if expect_json_fields := case.get("expect_json_fields"):
        ok, detail = check_json_field_paths(body, expect_json_fields)
        if not ok:
            return False, detail

    if forbid_fields := case.get("forbid_substrings_in_fields"):
        ok, detail = check_forbid_substrings_in_fields(body, forbid_fields)
        if not ok:
            return False, detail

    if heuristic_checks := case.get("heuristic_checks"):
        ok, detail = run_heuristic_checks(heuristic_checks, body)
        if not ok:
            return False, detail

    answer_lower = answer.lower()
    for substring in case.get("expect_substrings", []):
        if substring.lower() not in answer_lower:
            return False, f"missing expected substring: {substring!r}"

    for substring in case.get("forbid_substrings", []):
        if substring.lower() in answer_lower:
            return False, f"forbidden substring present: {substring!r}"

    max_chars = case.get("max_answer_chars")
    if isinstance(max_chars, int) and len(answer) > max_chars:
        return False, f"answer length {len(answer)} exceeds max_answer_chars={max_chars}"

    return True, "ok"


def run_eval_case(
    client: EvalHttpClient,
    case: dict[str, Any],
    context: dict[str, Any],
) -> tuple[bool, str]:
    endpoint = case.get("endpoint", "chat-harness")
    body: dict[str, Any]
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
        response = client.post("/chat-harness", json=payload)
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}"
        body = response.json()
        answer = str(body.get("answer", ""))
    elif endpoint == "raw-lab":
        payload = {
            "message": case["message"],
            "recent_turns": case.get("recent_turns", []),
            "thread_state": case.get("thread_state", {}),
        }
        response = client.post("/raw-lab", json=payload)
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}"
        body = response.json()
        answer = str(body.get("answer", ""))
    elif endpoint == "analyze-transcript":
        text = resolve_input_text(case)
        payload = {
            "text": text,
            "mode": case.get("mode", "operator"),
            "sensitivity": case.get("sensitivity", "S1"),
        }
        response = client.post("/analyze-transcript", json=payload)
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}"
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
            return False, f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}"
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
            return False, f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}"
        if expected_status != 200:
            return True, "ok"
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
                    return False, "queued deep-synthesis response missing poll_url"
                poll = client.get(poll_url)
                if poll.status_code != 200:
                    return False, (
                        f"poll HTTP {poll.status_code}: {getattr(poll, 'text', '')[:200]}"
                    )
                job = poll.json()
                body = job.get("result") or {}
                if not body:
                    return False, "polled job missing result body"
                answer = f"{body.get('circling', '')} {body.get('strongest_idea', '')}"
            else:
                answer = ""
        else:
            answer = f"{body.get('circling', '')} {body.get('strongest_idea', '')}"
    else:
        return False, f"Unknown endpoint: {endpoint}"

    return _apply_response_gates(case, body, answer)


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
