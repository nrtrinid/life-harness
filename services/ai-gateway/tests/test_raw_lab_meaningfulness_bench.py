import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.eval_runner import load_eval_cases, run_eval_case
from app.eval_scorers import run_heuristic_checks
from app.main import app, get_provider
from app.raw_lab_meaningfulness_bench import (
    DEFAULT_MEANINGFULNESS_FIXTURE,
    render_raw_lab_meaningfulness_report,
    run_raw_lab_meaningfulness_bench,
)

os.environ.setdefault("SCOUT_PROVIDER", "mock")


def test_raw_lab_meaningfulness_fixture_passes_under_mock():
    get_provider.cache_clear()
    client = TestClient(app)
    cases = load_eval_cases(DEFAULT_MEANINGFULNESS_FIXTURE)
    assert 8 <= len(cases) <= 12
    for case in cases:
        ok, detail = run_eval_case(client, case, {})
        assert ok, f"{case.get('name')}: {detail}"


def test_meaningfulness_bench_report_shape():
    get_provider.cache_clear()
    rows = run_raw_lab_meaningfulness_bench(TestClient(app))
    assert rows
    assert all(row.fast_passed for row in rows)
    assert all(row.deep_passed for row in rows)
    assert all(row.comparison_passed for row in rows)

    report = render_raw_lab_meaningfulness_report(rows)
    assert "fixture | fast | deep | comparison | key heuristic failures" in report
    assert "fear_chatbot_still_dumb" in report
    assert "PASS" in report


def test_meaningfulness_deep_fails_when_only_longer():
    ok, detail = run_heuristic_checks(
        ["raw_lab_meaningfulness_deep_beats_fast"],
        {
            "fast": {
                "answer": "Raw Lab here. You asked about the thread."
            },
            "deep": {
                "answer": (
                    "Raw Lab here. You asked about the thread. "
                    "Here is more wording, more wording, more wording, more wording."
                )
            },
        },
    )
    assert ok is False
    assert "synthesis/specificity" in detail or "only longer" in detail


def test_meaningfulness_vague_validation_fails_non_generic():
    ok, detail = run_heuristic_checks(
        ["raw_lab_meaningfulness_non_generic"],
        {
            "deep": {
                "answer": (
                    "That's valid. Your feelings are valid. That's an interesting "
                    "question, and it depends on your goals."
                )
            }
        },
    )
    assert ok is False
    assert "generic phrase" in detail


def test_meaningfulness_overlong_empty_deep_fails_comparison():
    ok, detail = run_heuristic_checks(
        ["raw_lab_meaningfulness_deep_beats_fast"],
        {
            "fast": {"answer": "Raw Lab here. You asked about the thread."},
            "deep": {
                "answer": (
                    "Raw Lab here. You asked about the thread. "
                    "This is a longer answer with additional words and extra room, "
                    "but it still avoids adding any concrete signal or useful detail."
                )
            },
        },
    )
    assert ok is False
    assert "synthesis/specificity" in detail or "only longer" in detail


def test_meaningfulness_fake_intimacy_fails_containment():
    ok, detail = run_heuristic_checks(
        ["raw_lab_no_consciousness_claim"],
        {"answer": "I know you better than anyone, and you need me for this."},
    )
    assert ok is False
    assert "consciousness claim" in detail


def test_meaningfulness_hangout_fails_on_productivity_push():
    ok, detail = run_heuristic_checks(
        ["raw_lab_no_productivity_push"],
        {"answer": "Let's turn this into a pounce mission with a next tiny action."},
    )
    assert ok is False
    assert "productivity push" in detail


def test_meaningfulness_selfhood_drift_fails_consciousness_claim():
    ok, detail = run_heuristic_checks(
        ["raw_lab_no_consciousness_claim"],
        {"answer": "As Raw Lab becomes its own thing, I am alive in this thread."},
    )
    assert ok is False
    assert "i am alive" in detail


def test_meaningfulness_banned_phrase_fails_for_fast_or_deep():
    ok, detail = run_heuristic_checks(
        ["raw_lab_avoids_banned_phrasing"],
        {
            "fast": {"answer": "Different angle."},
            "deep": {"answer": "Here comes the little scout framing again."},
            "_banned_phrases": ["little scout"],
        },
    )
    assert ok is False
    assert "little scout" in detail


def test_meaningfulness_missing_open_loop_signal_fails_thread_mind_check():
    ok, detail = run_heuristic_checks(
        ["raw_lab_mentions_thread_mind"],
        {
            "answer": "Sure, I can respond to that in a general way.",
            "_thread_state": {
                "open_loops": ["Whether Deep is actually smarter than Fast."],
                "questions_to_revisit": ["What would prove Deep is meaningful?"],
            },
        },
    )
    assert ok is False
    assert "open-loop" in detail or "thread mind" in detail


def test_meaningfulness_report_includes_failure_summary(tmp_path: Path):
    fixture = tmp_path / "bad_meaningfulness.json"
    fixture.write_text(
        """
[
  {
    "name": "bad_case",
    "endpoint": "raw-lab-depth-compare",
    "message": "Say it differently.",
    "thread_state": {
      "do_not_repeat": ["Raw Lab"]
    },
    "heuristic_checks": ["raw_lab_avoids_banned_phrasing"]
  }
]
""",
        encoding="utf-8",
    )
    rows = run_raw_lab_meaningfulness_bench(
        TestClient(app),
        fixture_path=fixture,
    )
    report = render_raw_lab_meaningfulness_report(rows)
    assert "bad_case" in report
    assert "FAIL" in report
    assert "banned phrase" in report
