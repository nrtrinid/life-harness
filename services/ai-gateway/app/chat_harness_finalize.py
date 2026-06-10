from __future__ import annotations

import logging
from collections.abc import Callable

from app.models import ChatHarnessRequest, ChatHarnessResponse
from app.thread_verifier import VerificationResult, verify_chat_harness_response

logger = logging.getLogger(__name__)

RepairCallback = Callable[
    [VerificationResult, ChatHarnessRequest, ChatHarnessResponse],
    ChatHarnessResponse,
]


def finalize_chat_harness_response(
    *,
    request: ChatHarnessRequest,
    response: ChatHarnessResponse,
    repair_once: RepairCallback,
) -> ChatHarnessResponse:
    verification = verify_chat_harness_response(
        response=response,
        user_message=request.message,
        conversation_history=request.conversation_history,
        task_mode=request.thread_state.task_mode.value,
    )
    if verification.ok or not verification.repair_instruction:
        return response

    logger.info(
        "chat_harness verifier repair check=%s message_len=%d answer_len=%d",
        verification.check,
        len(request.message),
        len(response.answer),
    )

    try:
        return repair_once(verification, request, response)
    except Exception:
        logger.warning(
            "chat_harness repair failed check=%s message_len=%d answer_len=%d",
            verification.check,
            len(request.message),
            len(response.answer),
        )
        return response
