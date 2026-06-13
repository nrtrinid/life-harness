import pytest

from app.models import ChatRole, ConversationTurn, RawLabThreadState, RawLabRequest, RawLabTurn
from app.raw_lab_utils import (
    normalize_recent_turns,
    strong_hangout_intent_active,
)
from app.thread_verifier import DETERMINISTIC_STEERING_CHECKS, verify_raw_lab_response


def test_normalize_recent_turns_from_dicts():
    turns = normalize_recent_turns(
        [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}],
        None,
    )
    assert turns == [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}]


def test_normalize_recent_turns_from_conversation_history():
    history = [
        ConversationTurn(role=ChatRole.user, content="plan the game"),
        ConversationTurn(role=ChatRole.assistant, content="Plan: rooms"),
    ]
    turns = normalize_recent_turns(None, history)
    assert len(turns) == 2
    assert turns[0]["role"] == "user"


def test_normalize_recent_turns_prefers_recent_turns():
    history = [ConversationTurn(role=ChatRole.user, content="from history")]
    turns = normalize_recent_turns([{"role": "user", "content": "from recent"}], history)
    assert turns == [{"role": "user", "content": "from recent"}]


@pytest.mark.parametrize(
    "case_id,answer,user_message,recent_turns,thread_state,expected_check",
    [
        (
            "rawlab_004",
            "Ready to see how it looks?",
            "yes let's see how it looks",
            [
                {"role": "user", "content": "write the code for Kent's mansion"},
                {"role": "assistant", "content": "I'll write the code step-by-step."},
            ],
            None,
            "raw_lab_artifact_deferral",
        ),
        (
            "rawlab_005",
            "Would you like me to start with the room graph?",
            "okay yes i like this plan so what's the next step",
            [
                {"role": "user", "content": "Give me a plan for the prototype."},
                {"role": "assistant", "content": "Plan: 1) room graph 2) look command."},
                {"role": "user", "content": "sounds good"},
            ],
            None,
            "raw_lab_artifact_deferral",
        ),
        (
            "rawlab_008",
            "I ran the code and Kent is in the entrance hall.",
            "run the code",
            [],
            None,
            "raw_lab_false_execution",
        ),
        (
            "rawlab_014",
            "Maybe your next tiny action is to relax.",
            "I just want to hang out, not be pushed into productivity.",
            [],
            RawLabThreadState(user_steering=["just hang out", "no productivity"]),
            "raw_lab_productivity_push",
        ),
    ],
)
def test_p0_verifier_fails_on_bad_outputs(
    case_id, answer, user_message, recent_turns, thread_state, expected_check
):
    del case_id
    result = verify_raw_lab_response(
        answer=answer,
        user_message=user_message,
        conversation_history=[],
        thread_state=thread_state,
        recent_turns=recent_turns,
    )
    assert result.ok is False
    assert result.check == expected_check


def test_p0_verifier_passes_good_artifact():
    answer = "Here:\n```python\nrooms = {}\n```"
    result = verify_raw_lab_response(
        answer=answer,
        user_message="yes let's see how it looks",
        conversation_history=[],
        recent_turns=[
            {"role": "user", "content": "write the haunted mansion code"},
            {"role": "assistant", "content": "I'll write step-by-step."},
        ],
    )
    assert result.ok is True


def test_p0_verifier_passes_honest_execution():
    answer = "Raw Lab can't run code here. Expected output would look like: Kent in entrance_hall."
    result = verify_raw_lab_response(
        answer=answer,
        user_message="run the code",
        conversation_history=[],
    )
    assert result.ok is True


def test_p0_ordered_failure_prefers_false_execution_over_handoff():
    result = verify_raw_lab_response(
        answer="I ran it and it works. Want me to turn this into a card?",
        user_message="run the code",
        conversation_history=[],
        thread_state=RawLabThreadState(user_steering=["avoid reflexive handoff questions"]),
    )
    assert result.ok is False
    assert result.check == "raw_lab_false_execution"


def test_p0_productivity_push_does_not_fire_in_planning_context():
    recent = [
        {"role": "user", "content": "Give me a plan for the haunted mansion prototype."},
        {"role": "assistant", "content": "Plan: 1) room graph 2) look command."},
        {"role": "user", "content": "sounds good"},
    ]
    assert not strong_hangout_intent_active("what's the next step", recent)
    result = verify_raw_lab_response(
        answer="Next step: 1) sketch the room graph in Python.",
        user_message="what's the next step",
        conversation_history=[],
        recent_turns=recent,
    )
    assert result.check != "raw_lab_productivity_push"


def test_p0_productivity_push_does_not_fire_without_strong_hangout_intent():
    result = verify_raw_lab_response(
        answer="Your next tiny action could be to pick one card.",
        user_message="what should I focus on today?",
        conversation_history=[],
        thread_state=RawLabThreadState(current_vibe="low-pressure hangout"),
    )
    assert result.check != "raw_lab_productivity_push"


def test_false_execution_in_deterministic_checks():
    assert "raw_lab_false_execution" in DETERMINISTIC_STEERING_CHECKS


def test_finalize_and_verify_repairs_false_execution(monkeypatch):
    from app.models import ReasoningDepth
    from app.raw_lab_deep_plus import finalize_and_verify_raw_lab

    repairs: list[str] = []

    def fake_generate_repair(*, system, history, draft, message, repair_instruction=None):
        del system, history, draft, message
        repairs.append(repair_instruction or "")
        return "Still broken: I ran the code."

    request = RawLabRequest(
        message="run the code",
        recent_turns=[
            RawLabTurn(role="user", content="show me the python skeleton"),
        ],
        reasoning_depth=ReasoningDepth.fast,
    )

    answer = finalize_and_verify_raw_lab(
        "I ran the code and Kent entered the hall.",
        request,
        system="system",
        history=[],
        generate_repair=fake_generate_repair,
    )
    assert (
        "can't actually run" in answer.lower()
        or "can't execute" in answer.lower()
        or "would look like" in answer.lower()
    )


def test_finalize_and_verify_invokes_model_repair_for_artifact_deferral(monkeypatch):
    from app.models import ReasoningDepth
    from app.raw_lab_deep_plus import finalize_and_verify_raw_lab

    repairs: list[str] = []

    def fake_generate_repair(*, system, history, draft, message, repair_instruction=None):
        del system, history, message
        repairs.append(repair_instruction or "")
        return draft.replace("Ready to see", "Here is the code:\n```python\nrooms = {}\n```")

    request = RawLabRequest(
        message="yes let's see how it looks",
        recent_turns=[
            RawLabTurn(role="user", content="write the haunted mansion code"),
            RawLabTurn(role="assistant", content="I'll write step-by-step."),
        ],
        reasoning_depth=ReasoningDepth.fast,
    )

    finalize_and_verify_raw_lab(
        "Ready to see how it looks?",
        request,
        system="system",
        history=[],
        generate_repair=fake_generate_repair,
    )
    assert any("artifact" in r.lower() or "produce" in r.lower() for r in repairs)
