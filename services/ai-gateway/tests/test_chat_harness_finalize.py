from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.chat_harness_finalize import finalize_chat_harness_response
from app.models import ChatHarnessRequest, ChatHarnessResponse, HarnessContext
from app.thread_verifier import VerificationResult

FINALIZE_PATH = Path(__file__).resolve().parents[1] / "app" / "chat_harness_finalize.py"


def _request() -> ChatHarnessRequest:
    return ChatHarnessRequest(
        message="make it shorter",
        context=HarnessContext(),
    )


def _response(answer: str = "A long answer that should be repaired.") -> ChatHarnessResponse:
    return ChatHarnessResponse(
        answer=answer,
        used_context=False,
        confidence_notes=[],
        safety_notes=[],
    )


def test_finalize_returns_response_when_verification_ok():
    request = _request()
    response = _response()
    repair = MagicMock()

    with patch(
        "app.chat_harness_finalize.verify_chat_harness_response",
        return_value=VerificationResult(ok=True, check="ok"),
    ):
        result = finalize_chat_harness_response(
            request=request,
            response=response,
            repair_once=repair,
        )

    assert result is response
    repair.assert_not_called()


def test_finalize_calls_repair_once_when_verification_fails():
    request = _request()
    response = _response()
    repaired = _response("Shorter.")
    repair = MagicMock(return_value=repaired)
    verification = VerificationResult(
        ok=False,
        check="ignored_steering",
        repair_instruction="Rewrite more concisely.",
    )

    with patch(
        "app.chat_harness_finalize.verify_chat_harness_response",
        return_value=verification,
    ):
        result = finalize_chat_harness_response(
            request=request,
            response=response,
            repair_once=repair,
        )

    repair.assert_called_once_with(verification, request, response)
    assert result is repaired


def test_finalize_does_not_reverify_recursively():
    request = _request()
    response = _response()
    repair = MagicMock(return_value=_response("Still long enough to fail again."))

    with patch(
        "app.chat_harness_finalize.verify_chat_harness_response",
        return_value=VerificationResult(
            ok=False,
            check="ignored_steering",
            repair_instruction="Rewrite more concisely.",
        ),
    ) as verify_mock:
        result = finalize_chat_harness_response(
            request=request,
            response=response,
            repair_once=repair,
        )

    verify_mock.assert_called_once()
    repair.assert_called_once()
    assert result.answer == "Still long enough to fail again."


def test_finalize_returns_original_if_repair_callback_fails_safely():
    request = _request()
    response = _response()
    repair = MagicMock(side_effect=RuntimeError("repair failed"))

    with patch(
        "app.chat_harness_finalize.verify_chat_harness_response",
        return_value=VerificationResult(
            ok=False,
            check="anti_repeat",
            repair_instruction="Rewrite.",
        ),
    ):
        result = finalize_chat_harness_response(
            request=request,
            response=response,
            repair_once=repair,
        )

    assert result is response


def test_finalize_logging_does_not_emit_raw_message_or_answer_text(caplog):
    request = _request()
    request.message = "SECRET_USER_MESSAGE"
    response = _response("SECRET_ASSISTANT_ANSWER")
    repair = MagicMock(return_value=_response("fixed"))

    with patch(
        "app.chat_harness_finalize.verify_chat_harness_response",
        return_value=VerificationResult(
            ok=False,
            check="ignored_steering",
            repair_instruction="Rewrite more concisely.",
        ),
    ):
        with caplog.at_level("INFO", logger="app.chat_harness_finalize"):
            finalize_chat_harness_response(
                request=request,
                response=response,
                repair_once=repair,
            )

    combined = caplog.text
    assert "SECRET_USER_MESSAGE" not in combined
    assert "SECRET_ASSISTANT_ANSWER" not in combined


def test_finalize_module_source_avoids_logging_raw_content():
    source = FINALIZE_PATH.read_text(encoding="utf-8")
    assert "request.message)" not in source or "len(request.message)" in source
    assert "response.answer)" not in source or "len(response.answer)" in source
    assert 'logger.info("%s' not in source
    forbidden = [
        "logger.info(request.message",
        "logger.info(response.answer",
        "logger.debug(request.message",
        "logger.debug(response.answer",
    ]
    for pattern in forbidden:
        assert pattern not in source
