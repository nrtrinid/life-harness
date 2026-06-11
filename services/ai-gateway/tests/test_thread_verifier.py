import pytest

from app.models import ChatHarnessResponse, ConversationTurn, ChatRole
from app.thread_verifier import verify_chat_harness_response, verify_raw_lab_response


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
