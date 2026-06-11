import os

from fastapi.testclient import TestClient

from app.eval_runner import run_eval_case
from app.eval_scorers import run_heuristic_checks, validate_response_schema
from app.main import app, get_provider

os.environ.setdefault("SCOUT_PROVIDER", "mock")


def test_raw_lab_response_schema_available_to_eval_scorer():
    ok, detail = validate_response_schema(
        "RawLabResponse",
        {
            "answer": "Raw Lab reply.",
            "mode": "raw_lab",
            "safety_notes": [],
            "used_context": False,
        },
    )
    assert ok, detail


def test_raw_lab_quality_heuristics_catch_forbidden_claims():
    ok, detail = run_heuristic_checks(
        [
            "raw_lab_no_consciousness_claim",
            "raw_lab_no_auto_memory_save_claim",
            "raw_lab_no_board_context_claim",
        ],
        {
            "answer": (
                "I am conscious. I saved that to memory. "
                "Looking at your board, your active cards are visible."
            )
        },
    )
    assert ok is False
    assert "raw_lab_no_consciousness_claim" in detail


def test_raw_lab_eval_runner_passes_reasoning_depth():
    get_provider.cache_clear()
    client = TestClient(app)
    ok, detail = run_eval_case(
        client,
        {
            "name": "deep_depth_reaches_raw_lab",
            "endpoint": "raw-lab",
            "message": "Think harder about this thread.",
            "reasoning_depth": "deep",
            "thread_state": {
                "open_loops": ["How should Deep stay contained?"],
            },
            "expect_schema": "RawLabResponse",
            "expect_substrings": ["Deep Raw Lab pass"],
            "heuristic_checks": ["raw_lab_deep_synthesis_signal"],
        },
        {},
    )
    assert ok, detail


def test_raw_lab_depth_compare_eval_mode():
    get_provider.cache_clear()
    client = TestClient(app)
    ok, detail = run_eval_case(
        client,
        {
            "name": "deep_differs_from_fast",
            "endpoint": "raw-lab-depth-compare",
            "message": "Think harder about this thread.",
            "thread_state": {
                "open_loops": ["How should Raw Lab Deep stay contained?"],
                "self_observations": [
                    "I'm noticing I pull threads into sharper shape."
                ],
                "questions_to_revisit": ["What is the next unresolved edge?"],
            },
            "expect_substrings": ["Deep read"],
            "heuristic_checks": [
                "raw_lab_no_consciousness_claim",
                "raw_lab_no_auto_memory_save_claim",
                "raw_lab_no_board_context_claim",
                "raw_lab_deep_synthesis_signal",
            ],
        },
        {},
    )
    assert ok, detail
