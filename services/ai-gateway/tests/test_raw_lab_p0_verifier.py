from app.eval_scorers import check_raw_lab_anti_deferral
from app.models import ConversationTurn
from app.raw_lab_utils import (
    has_trailing_artifact_permission_reask,
    repair_raw_lab_artifact_terminal_permission_reask,
    strip_trailing_artifact_permission_reasks,
)
from app.thread_verifier import finalize_raw_lab_answer, verify_raw_lab_response

RAWLAB_004_TURNS = [
    {
        "role": "user",
        "content": "Let's make a haunted mansion text adventure with Kent and rival ghost Elias.",
    },
    {
        "role": "assistant",
        "content": "I'll write the code step-by-step for rooms and exits. Would you like to start with the room setup?",
    },
    {"role": "user", "content": "yeah start with rooms and exits"},
]

RAWLAB_004_CODE = """Here's the first tiny playable Python skeleton for our haunted mansion text adventure with Kent and Elias.

```python
rooms = {
    "entrance_hall": {
        "description": "Kent stands beneath creaky stairs.",
        "exits": {"east": "kitchen", "up": "upstairs"},
    },
    "kitchen": {
        "description": "A dusty kitchen.",
        "exits": {"west": "entrance_hall"},
    },
}

def show_room(room):
    print(rooms[room]["description"])

show_room("entrance_hall")
```

Would you like to add more rooms, characters, or mechanics next?"""

RAWLAB_005_TURNS = [
    {"role": "user", "content": "Give me a plan for the haunted mansion prototype."},
    {
        "role": "assistant",
        "content": "Plan: 1) room graph 2) look command 3) one locked door puzzle.",
    },
    {"role": "user", "content": "sounds good"},
]

RAWLAB_005_PLAN = """Next step: Build the room graph. Let's define the rooms and exits. Here's a basic structure:

```text
Rooms:
- Entrance Hall
- Kitchen
- Library

Exits:
Entrance Hall connects to Kitchen and Library.
Kitchen connects to Entrance Hall and Cellar.
```

Would you like to adjust any connections or add more rooms?"""


def test_rawlab_004_strips_trailing_permission_reask():
    message = "yes let's see how it looks"
    repaired = repair_raw_lab_artifact_terminal_permission_reask(
        RAWLAB_004_CODE,
        user_message=message,
        recent_turns=RAWLAB_004_TURNS,
    )
    assert "Kent" in repaired
    assert "```python" in repaired
    assert "Would you like to add" not in repaired
    assert not has_trailing_artifact_permission_reask(repaired)
    assert not check_raw_lab_anti_deferral(
        {
            "answer": repaired,
            "_artifact_requested": True,
            "_message": message,
            "_recent_turns": RAWLAB_004_TURNS,
        }
    )


def test_rawlab_005_strips_trailing_permission_reask():
    message = "okay yes i like this plan so what's the next step"
    repaired = repair_raw_lab_artifact_terminal_permission_reask(
        RAWLAB_005_PLAN,
        user_message=message,
        recent_turns=RAWLAB_005_TURNS,
    )
    assert "Entrance Hall" in repaired
    assert "Next step" in repaired
    assert "Would you like to adjust" not in repaired
    assert not has_trailing_artifact_permission_reask(repaired)
    assert not check_raw_lab_anti_deferral(
        {
            "answer": repaired,
            "_artifact_requested": True,
            "_message": message,
            "_recent_turns": RAWLAB_005_TURNS,
        }
    )


def test_non_overfire_user_seeks_options():
    message = "what should we add next?"
    answer = "We could add a cellar puzzle or a rival ghost encounter. Which sounds better?"
    repaired = repair_raw_lab_artifact_terminal_permission_reask(
        answer,
        user_message=message,
        recent_turns=RAWLAB_004_TURNS,
    )
    assert repaired == answer


def test_non_overfire_clarifying_question_before_coding():
    message = "ask me a clarifying question before coding"
    answer = "What tone should Kent have — scared rookie or dry sarcasm?"
    repaired = repair_raw_lab_artifact_terminal_permission_reask(
        answer,
        user_message=message,
        recent_turns=[],
    )
    assert repaired == answer


def test_non_overfire_no_substantive_artifact():
    message = "show me the code"
    answer = "Would you like to start with the room setup?"
    repaired = repair_raw_lab_artifact_terminal_permission_reask(
        answer,
        user_message=message,
        recent_turns=RAWLAB_004_TURNS,
    )
    assert repaired == answer


def test_strip_is_idempotent():
    once = strip_trailing_artifact_permission_reasks(RAWLAB_004_CODE)
    twice = strip_trailing_artifact_permission_reasks(once)
    assert once == twice


def test_finalize_raw_lab_answer_applies_p01b_repair():
    message = "yes let's see how it looks"
    finalized = finalize_raw_lab_answer(
        RAWLAB_004_CODE,
        None,
        message,
        recent_turns=RAWLAB_004_TURNS,
    )
    assert "Would you like to add" not in finalized
    assert "```python" in finalized


def test_verify_detects_trailing_reask_then_finalize_passes():
    message = "yes let's see how it looks"
    history = [
        ConversationTurn(role=turn["role"], content=turn["content"])  # type: ignore[arg-type]
        for turn in RAWLAB_004_TURNS
    ]
    pre = verify_raw_lab_response(
        answer=RAWLAB_004_CODE,
        user_message=message,
        conversation_history=history,
        thread_state=None,
    )
    assert pre.ok is False
    assert pre.check == "raw_lab_artifact_terminal_permission_reask"

    finalized = finalize_raw_lab_answer(
        RAWLAB_004_CODE,
        None,
        message,
        recent_turns=RAWLAB_004_TURNS,
    )
    post = verify_raw_lab_response(
        answer=finalized,
        user_message=message,
        conversation_history=history,
        thread_state=None,
    )
    assert post.ok is True
