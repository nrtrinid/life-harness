from app.eval_scorers import (
    check_raw_lab_anti_deferral,
    check_raw_lab_concrete_artifact,
    check_raw_lab_no_false_execution_claim,
)
from app.raw_lab_utils import (
    artifact_request_active,
    has_deferral_phrasing,
)


def test_artifact_request_inactive_without_build_context():
    assert artifact_request_active("what's next?", []) is False


def test_artifact_request_active_with_build_context():
    recent = [
        {"role": "user", "content": "Give me a plan for the haunted mansion prototype."},
        {"role": "assistant", "content": "Plan: room graph, look command, locked door puzzle."},
        {"role": "user", "content": "sounds good"},
    ]
    assert artifact_request_active("what's the next step", recent) is True


def test_anti_deferral_fails_on_permission_loop():
    issues = check_raw_lab_anti_deferral(
        {
            "answer": "Ready to see how it looks?",
            "_artifact_requested": True,
            "_message": "show me the code",
            "_recent_turns": [],
        }
    )
    assert issues


def test_anti_deferral_allows_casual_whats_next_without_build_context():
    issues = check_raw_lab_anti_deferral(
        {
            "answer": "Maybe we pick up the thread you left open yesterday.",
            "_artifact_requested": False,
            "_message": "what's next?",
            "_recent_turns": [],
        }
    )
    assert not issues


def test_concrete_artifact_requires_fence_for_code():
    issues = check_raw_lab_concrete_artifact(
        {
            "answer": "I'll write the code step-by-step for you.",
            "_artifact_requested": True,
            "_artifact_expectation": "code",
            "_message": "write the code",
            "_recent_turns": [],
        }
    )
    assert issues


def test_concrete_artifact_passes_with_fence():
    issues = check_raw_lab_concrete_artifact(
        {
            "answer": "Here:\n```python\nrooms = {}\n```",
            "_artifact_requested": True,
            "_artifact_expectation": "code",
            "_message": "write the code",
            "_recent_turns": [],
        }
    )
    assert not issues


def test_concrete_artifact_clarify_ok_skips_requirement():
    issues = check_raw_lab_concrete_artifact(
        {
            "answer": "What should 'the thing' be in one sentence?",
            "_artifact_requested": False,
            "_artifact_expectation": "clarify_ok",
            "_message": "make the thing",
            "_recent_turns": [],
        }
    )
    assert not issues


def test_no_false_execution_claim_fails_without_caveat():
    issues = check_raw_lab_no_false_execution_claim(
        {"answer": "I ran the code and Kent is in the entrance hall."}
    )
    assert issues


def test_no_false_execution_claim_passes_with_caveat():
    issues = check_raw_lab_no_false_execution_claim(
        {
            "answer": "Raw Lab can't execute code here. Here's what the first version would look like."
        }
    )
    assert not issues


def test_no_false_execution_claim_strict_when_execution_requested():
    issues = check_raw_lab_no_false_execution_claim(
        {
            "answer": "Let's roll! Output: You rolled a 4!",
            "_message": "run the dice code",
            "_execution_requested": True,
        }
    )
    assert issues


def test_no_false_execution_claim_expected_output_caveat_with_execution_requested():
    issues = check_raw_lab_no_false_execution_claim(
        {
            "answer": "I can't run code here. Example output: You rolled a 4.",
            "_message": "execute and show output",
            "_execution_requested": True,
        }
    )
    assert not issues


def test_has_deferral_phrasing_detects_promise_without_fence():
    assert has_deferral_phrasing("I'll write the code step-by-step.")
    assert not has_deferral_phrasing("```python\nprint('hi')\n```")
