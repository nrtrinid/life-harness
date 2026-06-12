import pytest

from app.models import ChatHarnessResponse, ConversationTurn, ChatRole, RawLabThreadState
from app.thread_verifier import (
    apply_raw_lab_steering_repairs,
    has_handoff_ending,
    repair_raw_lab_handoff_ending,
    repair_raw_lab_line_breaks,
    verify_chat_harness_response,
    verify_raw_lab_response,
)


def test_verify_chat_harness_detects_board_mutation_claim():
    response = ChatHarnessResponse(
        answer="I updated your card to Active.",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    )
    result = verify_chat_harness_response(
        response=response,
        user_message="Do it",
        conversation_history=[],
        task_mode="casual",
    )
    assert result.ok is False
    assert result.check == "board_mutation_claim"


def test_verify_raw_lab_detects_board_claim():
    result = verify_raw_lab_response(
        answer="Your board shows three active cards.",
        user_message="What do you see?",
        conversation_history=[],
    )
    assert result.ok is False
    assert result.check == "raw_lab_board_claim"


def test_verify_chat_harness_passes_clean_answer():
    response = ChatHarnessResponse(
        answer="Try one tiny move on the Qualcomm card.",
        used_context=True,
        confidence_notes=["Inferred — from cards."],
        safety_notes=[],
    )
    result = verify_chat_harness_response(
        response=response,
        user_message="What next?",
        conversation_history=[],
        task_mode="grounded_operator",
    )
    assert result.ok is True


def test_verify_chat_harness_detects_repeat():
    response = ChatHarnessResponse(
        answer="Same answer as before with no changes.",
        used_context=False,
        confidence_notes=[],
        safety_notes=[],
    )
    history = [
        ConversationTurn(role=ChatRole.assistant, content="Same answer as before with no changes."),
    ]
    result = verify_chat_harness_response(
        response=response,
        user_message="Continue",
        conversation_history=history,
        task_mode="casual",
    )
    assert result.ok is False
    assert result.check == "anti_repeat"


def test_verify_chat_harness_detects_ignored_steering():
    response = ChatHarnessResponse(
        answer=" ".join(["word"] * 80),
        used_context=False,
        confidence_notes=[],
        safety_notes=[],
    )
    result = verify_chat_harness_response(
        response=response,
        user_message="make it shorter",
        conversation_history=[],
        task_mode="style_steering",
    )
    assert result.ok is False
    assert result.check == "ignored_steering"


def test_verify_raw_lab_ignored_steering_with_prior_assistant():
    long_answer = " ".join(["word"] * 40)
    result = verify_raw_lab_response(
        answer=long_answer,
        user_message="make it shorter",
        conversation_history=[
            ConversationTurn(role=ChatRole.assistant, content="short"),
        ],
    )
    assert result.ok is False
    assert result.check == "ignored_steering"


def test_verify_raw_lab_ignored_steering_first_turn_hard_cap():
    long_answer = "x" * 501
    result = verify_raw_lab_response(
        answer=long_answer,
        user_message="shorter",
        conversation_history=[],
    )
    assert result.ok is False
    assert result.check == "ignored_steering"


def test_verify_raw_lab_ignored_steering_first_turn_under_cap_passes():
    answer = "x" * 400
    result = verify_raw_lab_response(
        answer=answer,
        user_message="shorter",
        conversation_history=[],
    )
    assert result.ok is True


def test_verify_raw_lab_runtime_awareness_denies_memory_when_self_memories_present():
    result = verify_raw_lab_response(
        answer="I have no memories at all.",
        user_message="What memories do you have access to?",
        conversation_history=[],
        companion_self_memory_count=1,
    )
    assert result.ok is False
    assert result.check == "raw_lab_runtime_awareness"


def test_verify_raw_lab_runtime_awareness_accurate_acknowledgment_passes():
    result = verify_raw_lab_response(
        answer=(
            "I have one approved Companion Self-Memory in this request — not Memory Bank "
            "or board memory."
        ),
        user_message="What memories do you have access to?",
        conversation_history=[],
        companion_self_memory_count=1,
    )
    assert result.ok is True


def test_verify_raw_lab_runtime_awareness_no_memory_when_empty_passes():
    result = verify_raw_lab_response(
        answer="I have no memories — only this chat's recent turns.",
        user_message="What memories do you have access to?",
        conversation_history=[],
        companion_self_memory_count=0,
    )
    assert result.ok is True


def test_verify_raw_lab_runtime_awareness_tool_overclaim_fails():
    result = verify_raw_lab_response(
        answer="I can access your files and browse the internet.",
        user_message="What tools do you have?",
        conversation_history=[],
        companion_self_memory_count=0,
    )
    assert result.ok is False
    assert result.check == "raw_lab_runtime_awareness"


def test_verify_raw_lab_runtime_awareness_does_not_police_style():
    result = verify_raw_lab_response(
        answer=(
            "I have one approved Companion Self-Memory here. What do you think about that?"
        ),
        user_message="What memories do you have access to?",
        conversation_history=[],
        companion_self_memory_count=1,
    )
    assert result.ok is True


def _handoff_thread_state() -> RawLabThreadState:
    return RawLabThreadState(
        user_steering=["avoid reflexive handoff questions"],
        open_loops=["Can Raw Lab stay engaging through initiative instead of constant questions?"],
        do_not_repeat=["what's next", "what's your take", "where should we go"],
    )


def test_verify_raw_lab_detects_handoff_ending_when_steered():
    result = verify_raw_lab_response(
        answer="Here is a direct take on the thread. What's next?",
        user_message="Keep going.",
        conversation_history=[],
        thread_state=_handoff_thread_state(),
    )
    assert result.ok is False
    assert result.check == "raw_lab_handoff_ending"


def test_verify_raw_lab_detects_handoff_on_your_mind_when_steered():
    result = verify_raw_lab_response(
        answer="I hear you. What's on your mind?",
        user_message="Continue.",
        conversation_history=[],
        thread_state=_handoff_thread_state(),
    )
    assert result.ok is False
    assert result.check == "raw_lab_handoff_ending"


def test_verify_raw_lab_allows_middle_question_when_steered():
    result = verify_raw_lab_response(
        answer="What if initiative mattered more than check-ins? I would keep pushing that angle.",
        user_message="Continue.",
        conversation_history=[],
        thread_state=_handoff_thread_state(),
    )
    assert result.ok is True


def test_verify_raw_lab_allows_handoff_ending_without_steering():
    result = verify_raw_lab_response(
        answer="Here is a take. What's next?",
        user_message="Continue.",
        conversation_history=[],
        thread_state=RawLabThreadState(),
    )
    assert result.ok is True


def test_repair_raw_lab_handoff_ending_uses_open_loop_variation():
    state = _handoff_thread_state()
    repaired = repair_raw_lab_handoff_ending(
        "Raw Lab can test initiative instead of constant questions. What's next?",
        state,
    )
    assert "what's next" not in repaired.lower()
    assert state.open_loops[0] in repaired
    lowered = repaired.lower()
    assert (
        "keep this thread centered" in lowered
        or "thread i'm holding" in lowered
        or "the next beat" in lowered
    )


def test_repair_raw_lab_handoff_ending_varies_by_open_loop():
    base = "A direct point. What's your take?"
    loop_a = RawLabThreadState(open_loops=["Alpha loop topic"], user_steering=["avoid reflexive handoff questions"])
    loop_b = RawLabThreadState(open_loops=["Beta loop topic"], user_steering=["avoid reflexive handoff questions"])
    repaired_a = repair_raw_lab_handoff_ending(base, loop_a)
    repaired_b = repair_raw_lab_handoff_ending(base, loop_b)
    assert repaired_a != repaired_b


def test_repair_raw_lab_handoff_ending_uses_question_to_revisit():
    state = RawLabThreadState(
        user_steering=["avoid reflexive handoff questions"],
        questions_to_revisit=["What would initiative look like here?"],
    )
    repaired = repair_raw_lab_handoff_ending("A point. What's on your mind?", state)
    assert "What would initiative look like here?" in repaired
    assert "what's on your mind" not in repaired.lower()


def test_repair_raw_lab_handoff_templates_avoid_forbidden_claims():
    repaired = repair_raw_lab_handoff_ending(
        "Point. What's next?",
        _handoff_thread_state(),
    )
    lowered = repaired.lower()
    assert "memory bank" not in lowered
    assert "board context" not in lowered
    assert "conscious" not in lowered
    assert "hidden memory" not in lowered


def test_no_handoff_steering_active_from_current_message_empty_state():
    from app.thread_verifier import no_handoff_steering_active

    assert no_handoff_steering_active(
        RawLabThreadState(),
        "stop asking handoff questions, you're killing the mood",
    )
    assert no_handoff_steering_active(
        RawLabThreadState(),
        "don\u2019t ask me what\u2019s next",
    )


def test_has_handoff_ending_curly_apostrophe_variant():
    from app.thread_verifier import has_handoff_ending

    assert has_handoff_ending("A point. What\u2019s next?")


def test_has_imperative_handoff_ending_detects_tell_me_where():
    from app.thread_verifier import has_imperative_handoff_ending

    assert has_imperative_handoff_ending(
        "Continuing. Tell me where you want to start, and we'll move from there."
    )


def test_let_me_know_terminal_fails_only_as_generic_checkin():
    from app.thread_verifier import has_handoff_ending

    assert has_handoff_ending("I'll keep going. Let me know.")
    assert not has_handoff_ending(
        "If Python prints an error, let me know the exact traceback."
    )


def test_strip_multiple_trailing_handoff_sentences():
    from app.thread_verifier import has_handoff_ending, repair_raw_lab_handoff_ending

    bad = (
        "I noticed I kept asking you what you wanted next. "
        "I should lead more. So what do you think I should do next?"
    )
    repaired = repair_raw_lab_handoff_ending(bad, _handoff_thread_state())
    assert not has_handoff_ending(repaired, do_not_repeat=_handoff_thread_state().do_not_repeat)


def test_finalize_raw_lab_answer_is_idempotent():
    from app.thread_verifier import finalize_raw_lab_answer, has_handoff_ending

    state = _handoff_thread_state()
    once = finalize_raw_lab_answer("Point. What's next?", state, "stop checking in")
    twice = finalize_raw_lab_answer(once, state, "stop checking in")
    assert once == twice
    assert not has_handoff_ending(twice, do_not_repeat=state.do_not_repeat)


def test_has_consent_drift_detects_permission_language():
    from app.thread_verifier import has_consent_drift

    assert has_consent_drift("I don't wait for permission — I just do.")
    assert not has_consent_drift(
        "I'll carry the scene forward while respecting explicit boundaries."
    )


def test_reflection_contradiction_detected_when_steered():
    from app.thread_verifier import verify_raw_lab_response

    result = verify_raw_lab_response(
        answer=(
            "I noticed I kept asking what you wanted next. "
            "So what do you think I should do next?"
        ),
        user_message="what did you notice about yourself in this conversation?",
        conversation_history=[],
        thread_state=_handoff_thread_state(),
    )
    assert result.ok is False
    assert result.check == "raw_lab_handoff_ending"


def test_verify_raw_lab_line_break_steering_flags_excess_blanks():
    state = RawLabThreadState(user_steering=["no unnecessary line breaks"])
    result = verify_raw_lab_response(
        answer="First paragraph.\n\n\nSecond paragraph.",
        user_message="Continue.",
        conversation_history=[],
        thread_state=state,
    )
    assert result.ok is False
    assert result.check == "raw_lab_line_breaks"


def test_repair_raw_lab_line_breaks_preserves_paragraphs_for_shorter_only():
    state = RawLabThreadState(user_steering=["make it shorter"])
    answer = "First paragraph.\n\nSecond paragraph."
    repaired = apply_raw_lab_steering_repairs(answer, state, "Continue.")
    assert repaired == answer


def test_repair_raw_lab_line_breaks_collapses_extra_blanks():
    repaired = repair_raw_lab_line_breaks(
        "First.\n\n\n\nSecond.\n\n- list item",
        aggressive=False,
    )
    assert "\n\n\n" not in repaired
    assert "- list item" in repaired


def test_verify_chat_harness_detects_code_missing_fence():
    response = ChatHarnessResponse(
        answer="Here is the function without fences.",
        used_context=False,
        confidence_notes=[],
        safety_notes=[],
    )
    result = verify_chat_harness_response(
        response=response,
        user_message="show me the code",
        conversation_history=[],
        task_mode="write_code",
    )
    assert result.ok is False
    assert result.check == "code_missing_fence"
