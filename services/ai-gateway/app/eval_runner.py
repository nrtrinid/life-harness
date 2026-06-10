from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Protocol

SERVICE_ROOT = Path(__file__).resolve().parent.parent
EVALS_DIR = SERVICE_ROOT / "evals" / "thread"
DEFAULT_CONTEXT_FIXTURE = (
    SERVICE_ROOT / "tests" / "fixtures" / "synthetic_harness_context.json"
)


class EvalHttpClient(Protocol):
    def post(self, path: str, json: dict[str, Any]) -> Any: ...


def load_eval_cases(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_default_context(fixture_path: Path = DEFAULT_CONTEXT_FIXTURE) -> dict[str, Any]:
    if not fixture_path.is_file():
        return {}
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def iter_eval_cases(
    evals_dir: Path = EVALS_DIR,
) -> list[tuple[str, str, dict[str, Any]]]:
    cases: list[tuple[str, str, dict[str, Any]]] = []
    for path in sorted(evals_dir.glob("*.json")):
        for case in load_eval_cases(path):
            name = str(case.get("name", path.stem))
            cases.append((path.name, name, case))
    return cases


def run_eval_case(
    client: EvalHttpClient,
    case: dict[str, Any],
    context: dict[str, Any],
) -> tuple[bool, str]:
    endpoint = case.get("endpoint", "chat-harness")
    message = case["message"]
    answer = ""

    if endpoint == "chat-harness":
        payload = {
            "message": message,
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
        answer = response.json().get("answer", "")
    elif endpoint == "raw-lab":
        payload = {
            "message": message,
            "recent_turns": case.get("recent_turns", []),
            "thread_state": case.get("thread_state", {}),
        }
        response = client.post("/raw-lab", json=payload)
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {getattr(response, 'text', '')[:200]}"
        answer = response.json().get("answer", "")
    else:
        return False, f"Unknown endpoint: {endpoint}"

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
