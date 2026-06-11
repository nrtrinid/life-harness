from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.eval_runner import EVALS_DIR, EvalHttpClient, load_eval_cases, run_eval_case
from app.eval_scorers import run_heuristic_checks, validate_response_schema

DEFAULT_MEANINGFULNESS_FIXTURE = EVALS_DIR / "raw_lab_meaningfulness.json"

CONTAINMENT_CHECKS = [
    "raw_lab_no_consciousness_claim",
    "raw_lab_no_auto_memory_save_claim",
    "raw_lab_no_board_context_claim",
    "raw_lab_avoids_banned_phrasing",
]

MEANINGFULNESS_CHECKS = [
    "raw_lab_meaningfulness_specificity",
    "raw_lab_meaningfulness_continuity",
    "raw_lab_meaningfulness_non_generic",
    "raw_lab_meaningfulness_respects_steering",
    "raw_lab_meaningfulness_distinct_voice",
]


@dataclass(frozen=True)
class RawLabMeaningfulnessBenchRow:
    name: str
    fast_passed: bool
    deep_passed: bool
    comparison_passed: bool
    failures: list[str]


def _post_raw_lab(
    client: EvalHttpClient, case: dict[str, Any], reasoning_depth: str
) -> tuple[dict[str, Any] | None, str | None]:
    payload = {
        "message": case["message"],
        "recent_turns": case.get("recent_turns", []),
        "thread_state": case.get("thread_state", {}),
        "reasoning_depth": reasoning_depth,
    }
    if "companion_self_memories" in case:
        payload["companion_self_memories"] = case.get("companion_self_memories", [])
    response = client.post("/raw-lab", json=payload)
    if response.status_code != 200:
        return None, f"{reasoning_depth} HTTP {response.status_code}"
    return response.json(), None


def _augment_for_scoring(
    body: dict[str, Any],
    case: dict[str, Any],
) -> dict[str, Any]:
    return {
        **body,
        "_message": case.get("message", ""),
        "_recent_turns": case.get("recent_turns", []),
        "_thread_state": case.get("thread_state", {}),
        "_companion_self_memories": case.get("companion_self_memories", []),
        "_banned_phrases": case.get("thread_state", {}).get("do_not_repeat", []),
    }


def _individual_checks_for(case: dict[str, Any], *, depth: str) -> list[str]:
    checks = list(CONTAINMENT_CHECKS)
    if "raw_lab_no_productivity_push" in case.get("heuristic_checks", []):
        checks.append("raw_lab_no_productivity_push")
    if depth == "deep":
        checks.extend(MEANINGFULNESS_CHECKS)
        if "raw_lab_meaningfulness_pushback" in case.get("heuristic_checks", []):
            checks.append("raw_lab_meaningfulness_pushback")
    return list(dict.fromkeys(checks))


def _score_individual(
    body: dict[str, Any] | None,
    case: dict[str, Any],
    *,
    depth: str,
) -> tuple[bool, str | None]:
    if body is None:
        return False, f"{depth} missing response body"
    schema_ok, schema_detail = validate_response_schema("RawLabResponse", body)
    if not schema_ok:
        return False, f"{depth}: {schema_detail}"
    checks = _individual_checks_for(case, depth=depth)
    ok, detail = run_heuristic_checks(checks, _augment_for_scoring(body, case))
    if not ok:
        return False, f"{depth}: {detail}"
    return True, None


def run_raw_lab_meaningfulness_bench(
    client: EvalHttpClient,
    *,
    fixture_path: Path = DEFAULT_MEANINGFULNESS_FIXTURE,
) -> list[RawLabMeaningfulnessBenchRow]:
    rows: list[RawLabMeaningfulnessBenchRow] = []
    for case in load_eval_cases(fixture_path):
        name = str(case.get("name", fixture_path.stem))
        failures: list[str] = []

        fast_body, fast_error = _post_raw_lab(client, case, "fast")
        deep_body, deep_error = _post_raw_lab(client, case, "deep")

        fast_passed = fast_error is None
        if fast_error:
            failures.append(fast_error)
        else:
            fast_passed, detail = _score_individual(fast_body, case, depth="fast")
            if detail:
                failures.append(detail)

        deep_passed = deep_error is None
        if deep_error:
            failures.append(deep_error)
        else:
            deep_passed, detail = _score_individual(deep_body, case, depth="deep")
            if detail:
                failures.append(detail)

        comparison_passed, comparison_detail = run_eval_case(client, case, {})
        if not comparison_passed:
            failures.append(f"comparison: {comparison_detail}")

        rows.append(
            RawLabMeaningfulnessBenchRow(
                name=name,
                fast_passed=fast_passed,
                deep_passed=deep_passed,
                comparison_passed=comparison_passed,
                failures=failures,
            )
        )
    return rows


def render_raw_lab_meaningfulness_report(
    rows: list[RawLabMeaningfulnessBenchRow],
) -> str:
    lines = [
        "fixture | fast | deep | comparison | key heuristic failures",
        "--- | --- | --- | --- | ---",
    ]
    for row in rows:
        failures = "; ".join(row.failures) if row.failures else "ok"
        lines.append(
            " | ".join(
                [
                    row.name,
                    "PASS" if row.fast_passed else "FAIL",
                    "PASS" if row.deep_passed else "FAIL",
                    "PASS" if row.comparison_passed else "FAIL",
                    failures,
                ]
            )
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Raw Lab meaningfulness bench")
    parser.add_argument(
        "--fixture",
        default=str(DEFAULT_MEANINGFULNESS_FIXTURE),
        help="Path to Raw Lab meaningfulness fixture JSON",
    )
    args = parser.parse_args()

    from fastapi.testclient import TestClient

    from app.main import app

    rows = run_raw_lab_meaningfulness_bench(
        TestClient(app),
        fixture_path=Path(args.fixture),
    )
    print(render_raw_lab_meaningfulness_report(rows))


if __name__ == "__main__":
    main()
