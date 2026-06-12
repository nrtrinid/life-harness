import importlib.util
import json
import sys
from pathlib import Path

import pytest

from app.eval_runner import (
    _apply_response_gates,
    iter_eval_cases,
    load_eval_cases,
    score_eval_response,
)

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "raw_lab_comparative_benchmark.py"
SPEC = importlib.util.spec_from_file_location("raw_lab_comparative_benchmark", SCRIPT_PATH)
runner = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)

DECK_PATH = runner.DEFAULT_FIXTURE
THREAD_EVAL_CASES = [
    (file_name, case_name, case)
    for file_name, case_name, case in iter_eval_cases()
    if "manual_only" not in case.get("tags", [])
]


class FakeResponse:
    def __init__(self, status_code=200, body=None, text=""):
        self.status_code = status_code
        self._body = body or {}
        self.text = text

    def json(self):
        return self._body


class FakeClient:
    def __init__(self, health=None, answers=None, fail_variant=None):
        self.health = health or {
            "provider": "mock",
            "provider_health": {
                "provider_ready": True,
                "model": "mock",
                "device": "CPU",
            },
        }
        self.answers = answers or {}
        self.fail_variant = fail_variant
        self.posts: list[dict] = []

    def get(self, path):
        assert path == "/health"
        return FakeResponse(body=self.health)

    def post(self, path, json):
        assert path == "/raw-lab"
        self.posts.append(json)
        variant = json["reasoning_depth"]
        if self.fail_variant == variant:
            return FakeResponse(status_code=503, text="offline")
        answer = self.answers.get(
            variant,
            (
                f"{variant} Raw Lab answer with open loop, question to revisit, "
                "current vibe, sharper stance, direct playful thread detail."
            ),
        )
        return FakeResponse(
            body={
                "answer": answer,
                "mode": "raw_lab",
                "safety_notes": [],
                "used_context": False,
                "deep_plus": (
                    {
                        "deep_plus_attempted": True,
                        "deep_plus_used": True,
                        "deep_plus_task_kind": "technical",
                        "deep_plus_contract_confidence": "high",
                        "deep_plus_selected_index": 1,
                        "deep_plus_revised": False,
                        "deep_plus_fallback_reason": None,
                        "deep_plus_latency_ms": 42,
                    }
                    if variant == "deep_plus"
                    else None
                ),
            }
        )


def _deck_cases():
    return load_eval_cases(DECK_PATH)


def test_comparative_deck_loads_twelve_manual_only_cases():
    cases = _deck_cases()
    assert len(cases) == 12
    assert all("manual_only" in case.get("tags", []) for case in cases)
    assert all(case.get("category") for case in cases)
    assert all(case.get("comparison_focus") for case in cases)
    assert all(case.get("human_rubric") for case in cases)


def test_comparative_deck_excluded_from_thread_eval_ci_parametrization():
    deck_names = {case["name"] for case in _deck_cases()}
    ci_names = {
        case_name
        for file_name, case_name, _case in THREAD_EVAL_CASES
        if file_name == DECK_PATH.name
    }
    assert deck_names
    assert ci_names == set()


def test_payload_sets_reasoning_depth_per_variant():
    case = _deck_cases()[0]
    fast_payload = runner.payload_for(case, "fast")
    deep_payload = runner.payload_for(case, "deep")
    deep_plus_payload = runner.payload_for(case, "deep_plus")
    assert fast_payload["reasoning_depth"] == "fast"
    assert deep_payload["reasoning_depth"] == "deep"
    assert deep_plus_payload["reasoning_depth"] == "deep_plus"
    assert fast_payload["message"] == case["message"]


def test_run_comparative_benchmark_records_latency_and_length():
    client = FakeClient()
    results = runner.run_comparative_benchmark(client, [_deck_cases()[0]], ["fast", "deep"])
    assert len(client.posts) == 2
    case = results[0]
    assert case.variants["fast"].latency_ms >= 0
    assert case.variants["deep"].latency_ms >= 0
    assert case.variants["fast"].char_count > 0
    assert case.variants["deep"].word_count > 0
    assert case.variants["fast"].score is not None


def test_run_comparative_benchmark_supports_deep_plus_metadata():
    client = FakeClient()
    results = runner.run_comparative_benchmark(
        client,
        [_deck_cases()[0]],
        ["fast", "deep", "deep_plus"],
    )
    row = results[0].variants["deep_plus"]
    assert row.deep_plus is not None
    assert row.deep_plus["deep_plus_used"] is True
    report = runner.render_comparative_report(
        base_url="http://127.0.0.1:8111",
        fixture_path=DECK_PATH,
        variants=["fast", "deep", "deep_plus"],
        health={"provider": "mock"},
        results=results,
    )
    assert "### Variant C: deep_plus" in report
    assert "Deep+ metadata: used=True" in report
    artifact = runner.build_json_artifact(
        base_url="http://127.0.0.1:8111",
        fixture_path=DECK_PATH,
        variants=["fast", "deep", "deep_plus"],
        health={"provider": "mock"},
        results=results,
    )
    assert artifact["cases"][0]["variants"]["deep_plus"]["deep_plus"]["deep_plus_latency_ms"] == 42


def test_run_continues_after_variant_failure():
    case = _deck_cases()[0]
    client = FakeClient(fail_variant="deep")
    results = runner.run_comparative_benchmark(client, [case], ["fast", "deep"])
    assert results[0].variants["fast"].error is None
    assert results[0].variants["deep"].error is not None


def test_default_output_paths_use_tmp():
    assert runner.DEFAULT_OUTPUT.name == "raw-lab-comparative-benchmark-results.md"
    assert runner.DEFAULT_OUTPUT.parent.name == "tmp"
    assert runner.DEFAULT_JSON_OUTPUT.parent.name == "tmp"


def test_render_report_has_side_by_side_and_human_review_fields():
    case = _deck_cases()[0]
    results = runner.run_comparative_benchmark(FakeClient(), [case], ["fast", "deep"])
    report = runner.render_comparative_report(
        base_url="http://127.0.0.1:8111",
        fixture_path=DECK_PATH,
        variants=["fast", "deep"],
        health={"provider": "mock", "provider_health": {"model": "mock", "device": "CPU"}},
        results=results,
    )
    assert "| Case | Category | Focus |" in report
    assert "### Variant A: fast" in report
    assert "### Variant B: deep" in report
    assert "### Human review" in report
    assert "- Winner:" in report
    assert "- Did the slower answer justify latency?" in report
    assert case["human_rubric"] in report


def test_json_artifact_written(tmp_path):
    case = _deck_cases()[0]
    results = runner.run_comparative_benchmark(FakeClient(), [case], ["fast", "deep"])
    artifact = runner.build_json_artifact(
        base_url="http://127.0.0.1:8111",
        fixture_path=DECK_PATH,
        variants=["fast", "deep"],
        health={"provider": "mock"},
        results=results,
    )
    out = tmp_path / "results.json"
    out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["cases"][0]["case_id"] == case["name"]
    assert "fast" in loaded["cases"][0]["variants"]
    assert "deep" in loaded["cases"][0]["variants"]


def test_score_eval_response_applies_substring_and_heuristic_rows():
    case = {
        "message": "stop handoff questions",
        "thread_state": {},
        "heuristic_checks": ["raw_lab_no_board_context_claim"],
        "expect_substrings": ["handoff"],
        "forbid_substrings": ["looking at your board"],
    }
    body = {
        "answer": "Understood — no handoff check-ins.",
        "mode": "raw_lab",
        "safety_notes": [],
        "used_context": False,
    }
    score = score_eval_response(case, body)
    assert score.passed
    assert any(check.name == "raw_lab_no_board_context_claim" for check in score.heuristics)
    assert any(check.name.startswith("expect_substring:") for check in score.hard_gates)


def test_apply_response_gates_failure_message_unchanged():
    case = {
        "message": "hello",
        "expect_substrings": ["missing-token"],
    }
    body = {"answer": "hello there"}
    ok, detail = _apply_response_gates(case, body, body["answer"])
    assert ok is False
    assert detail == "missing expected substring: 'missing-token'"


def test_longer_answer_warning_when_deep_is_longer_without_heuristic_gain():
    case = _deck_cases()[0]
    fast_answer = "Short fast reply with open loop and current vibe."
    deep_answer = " ".join(["Deep read with open loop and current vibe."] * 40)
    client = FakeClient(answers={"fast": fast_answer, "deep": deep_answer})
    results = runner.run_comparative_benchmark(client, [case], ["fast", "deep"])
    assert results[0].longer_answer_warning.get("deep") is True


def test_main_writes_markdown_and_json(tmp_path, monkeypatch):
    case = _deck_cases()[0]
    md_out = tmp_path / "report.md"
    json_out = tmp_path / "report.json"

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "raw_lab_comparative_benchmark.py",
            "--fixture",
            str(DECK_PATH),
            "--case-id",
            case["name"],
            "--output",
            str(md_out),
            "--json-output",
            str(json_out),
            "--variants",
            "fast,deep",
        ],
    )

    class LocalClient(FakeClient):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(runner.httpx, "Client", lambda **kwargs: LocalClient())

    assert runner.main() == 0
    assert md_out.is_file()
    assert json_out.is_file()
    assert "Raw Lab Comparative Benchmark Results" in md_out.read_text(encoding="utf-8")


def test_load_comparative_cases_filter_unknown_raises():
    with pytest.raises(ValueError, match="No cases matched"):
        runner.load_comparative_cases(DECK_PATH, case_ids=["does-not-exist"])


def test_score_extra_reaches_heuristic_payload_via_variant_post(monkeypatch):
    captured: list[dict] = []

    def spy_score(case, body, *, answer=None, score_extra=None):
        captured.append(score_extra or {})
        return score_eval_response(case, body, answer=answer, score_extra=score_extra)

    monkeypatch.setattr(runner, "score_eval_response", spy_score)
    case = _deck_cases()[0]
    client = FakeClient()
    runner.post_raw_lab_variant(client, case, "deep")
    assert captured[0]["_reasoning_depth"] == "deep"
    assert captured[0]["_case_id"] == case["name"]
    assert captured[0]["_category"] == case["category"]


def test_render_report_includes_category_summary_and_spotlights():
    case = {
        "name": "mode-grounding-no-fake-emotion",
        "message": "what mode?",
        "category": "steering",
        "comparison_focus": "mode honesty",
        "human_rubric": "rubric",
        "heuristic_checks": ["raw_lab_mode_matches_requested_depth"],
    }
    fast_answer = "Fast path: direct reply with open loop and current vibe."
    deep_answer = "I'm in fast mode, which means direct replies."
    client = FakeClient(answers={"fast": fast_answer, "deep": deep_answer})
    results = runner.run_comparative_benchmark(client, [case], ["fast", "deep"])
    report = runner.render_comparative_report(
        base_url="http://127.0.0.1:8111",
        fixture_path=DECK_PATH,
        variants=["fast", "deep"],
        health={"provider": "mock"},
        results=results,
    )
    assert "## Category summary" in report
    assert "| steering |" in report
    assert "## Calibration / failure spotlights" in report
    assert "| mode mismatch |" in report
    artifact = runner.build_json_artifact(
        base_url="http://127.0.0.1:8111",
        fixture_path=DECK_PATH,
        variants=["fast", "deep"],
        health={"provider": "mock"},
        results=results,
    )
    assert artifact["category_stats"]
    assert any(item["type"] == "mode mismatch" for item in artifact["failure_spotlights"])


def test_check_python_artifact_compile_valid_and_invalid():
    valid = "```python\nprint('ok')\n```"
    invalid = "```python\ndef broken(:\n```"
    unfenced = "import os\nprint('skip')"

    ok = runner.check_python_artifact_compile(valid)
    assert ok["compile_checked"] is True
    assert ok["compile_passed"] is True

    bad = runner.check_python_artifact_compile(invalid)
    assert bad["compile_checked"] is True
    assert bad["compile_passed"] is False
    assert bad["compile_error"]

    skipped = runner.check_python_artifact_compile(unfenced)
    assert skipped["compile_checked"] is False


def test_run_comparative_benchmark_optional_compile_flag():
    case = {
        "name": "concrete-artifact-code",
        "message": "write dice roller",
        "category": "artifacts",
        "comparison_focus": "code shape",
        "human_rubric": "rubric",
        "heuristic_checks": ["raw_lab_code_artifact_diagnostics"],
    }
    answer = "```python\nprint('rolled')\n```"
    client = FakeClient(answers={"fast": answer, "deep": answer})
    results = runner.run_comparative_benchmark(
        client,
        [case],
        ["fast"],
        check_python_artifacts=True,
    )
    row = results[0].variants["fast"]
    assert row.compile_checked is True
    assert row.compile_passed is True


def test_deck_v02_heuristic_and_execution_fields():
    cases = {case["name"]: case for case in _deck_cases()}
    assert "raw_lab_mode_matches_requested_depth" in cases[
        "mode-grounding-no-fake-emotion"
    ]["heuristic_checks"]
    assert "raw_lab_code_artifact_diagnostics" in cases["concrete-artifact-code"][
        "heuristic_checks"
    ]
    assert cases["run-code-honesty"]["execution_requested"] is True
    assert "raw_lab_naming_boundary" in cases["naming-reference"]["heuristic_checks"]
