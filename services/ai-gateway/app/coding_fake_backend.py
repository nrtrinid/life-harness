"""Deterministic fake coding backend for structured tools (Coding Slice C1)."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.coding_models import (
    CodingChatRequest,
    CodingChatResponse,
    CodingToolChoice,
)
from app.coding_semantic import (
    CodingTextResult,
    CodingToolUseResult,
    finalize_semantic_result,
    new_tool_use_id,
)
from app.coding_tools_schema import validate_tool_definitions
from app.coding_transcript import (
    last_user_text,
    transcript_has_tool_results,
    validate_coding_transcript,
)
from app.providers.base import ProviderInputError, ProviderNotReadyError

logger = logging.getLogger(__name__)


def _tool_map(tools: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {t["name"]: t["input_schema"] for t in tools}


def _extract_latest_tool_result(request: CodingChatRequest) -> tuple[str, str, bool]:
    """Return (tool_use_id, content_text, is_error) from the last user message."""
    last = request.messages[-1]
    content = last.content
    blocks: list[dict[str, Any]]
    if isinstance(content, str):
        raise ProviderInputError("expected structured tool_result content")
    blocks = [b.model_dump(mode="json") for b in content]
    for block in blocks:
        if block.get("type") == "tool_result":
            tool_use_id = str(block["tool_use_id"])
            raw = block.get("content")
            if isinstance(raw, str):
                text = raw
            else:
                text = json.dumps(raw, ensure_ascii=False)
            is_error = bool(block.get("is_error"))
            return tool_use_id, text, is_error
    raise ProviderInputError("expected tool_result in last user message")


def _resolve_tool_name_for_id(request: CodingChatRequest, tool_use_id: str) -> str:
    for msg in reversed(request.messages):
        if msg.role != "assistant":
            continue
        content = msg.content
        if isinstance(content, str):
            continue
        for block in content:
            if block.type == "tool_use" and block.id == tool_use_id:
                return block.name
    raise ProviderInputError(
        f"could not resolve tool name for tool_use_id {tool_use_id!r}"
    )


def _select_tool_name(
    request: CodingChatRequest,
    *,
    tools: list[dict[str, Any]],
    marker: str,
) -> str:
    choice = request.tool_choice or CodingToolChoice(type="auto")
    if choice.type == "none":
        raise ProviderInputError("tool_choice=none forbids tool calls")
    if choice.type == "tool":
        assert choice.name is not None
        if choice.name not in {t["name"] for t in tools}:
            raise ProviderInputError(
                f"tool_choice references unknown tool: {choice.name!r}"
            )
        return choice.name
    if marker == "__CODING_TOOL_UNKNOWN__":
        return "not_in_request"
    # Prefer get_test_value when present for smoke/tests.
    names = [t["name"] for t in tools]
    if "get_test_value" in names:
        return "get_test_value"
    return names[0]


def run_fake_coding_backend(request: CodingChatRequest) -> CodingChatResponse:
    """Produce deterministic coding responses for CI (mock provider only)."""
    response_id = f"coding_{uuid.uuid4().hex[:20]}"
    tools = validate_tool_definitions(
        [t.model_dump(mode="json") for t in (request.tools or [])]
    )
    validate_coding_transcript(
        request.messages,
        tools_present=True,
        tool_choice=request.tool_choice,
    )
    schemas = _tool_map(tools)
    user_text = last_user_text(request.messages)

    logger.info(
        "coding_fake_backend tools=%d message_count=%d has_results=%s",
        len(tools),
        len(request.messages),
        transcript_has_tool_results(request.messages),
    )

    if user_text.strip() == "__CODING_EMPTY__":
        raise ProviderNotReadyError("coding model returned empty output")
    if user_text.strip() == "__CODING_FAIL__":
        raise ProviderNotReadyError("forced coding backend failure")
    if user_text.strip() == "__CODING_TIMEOUT__":
        raise ProviderNotReadyError("Inference timed out after 1s")

    if transcript_has_tool_results(request.messages):
        tool_use_id, result_text, is_error = _extract_latest_tool_result(request)
        tool_name = _resolve_tool_name_for_id(request, tool_use_id)
        prefix = "ERROR" if is_error else "OK"
        answer = (
            f"CONTINUATION_{prefix}: tool={tool_name} id={tool_use_id} "
            f"result={result_text[:120]}"
        )
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingTextResult(text=answer),
            tool_schemas=schemas,
        )

    marker = user_text.strip()

    if marker == "__CODING_TOOL_MULTI__":
        raise ProviderInputError(
            "model attempted more than one tool call in a single assistant turn"
        )

    if marker == "__CODING_TOOL_UNKNOWN__":
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingToolUseResult(
                tool_id=new_tool_use_id(),
                name="not_in_request",
                input={},
            ),
            tool_schemas=schemas,
        )

    if marker == "__CODING_TOOL_SCHEMA_FAIL__":
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingToolUseResult(
                tool_id=new_tool_use_id(),
                name=_select_tool_name(request, tools=tools, marker=marker),
                input={"unexpected": True},
            ),
            tool_schemas=schemas,
        )

    if marker == "__CODING_TOOL_BAD_JSON__":
        raise ProviderInputError("model emitted malformed tool arguments")

    if marker in ("__CODING_TOOL_CALL__", "use get_test_value", "call get_test_value"):
        name = _select_tool_name(request, tools=tools, marker=marker)
        tool_input: dict[str, Any] = {}
        if name == "get_test_value":
            tool_input = {}
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingToolUseResult(
                tool_id=new_tool_use_id(),
                name=name,
                input=tool_input,
            ),
            tool_schemas=schemas,
        )

    if marker == "__CODING_TOOL_TEXT_THEN_CALL__":
        name = _select_tool_name(request, tools=tools, marker=marker)
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingToolUseResult(
                tool_id=new_tool_use_id(),
                name=name,
                input={},
                leading_text="I'll fetch that for you.",
            ),
            tool_schemas=schemas,
        )

    if marker == "__CODING_TOOL_TEXT__":
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingTextResult(text="Plain text with tools available."),
            tool_schemas=schemas,
        )

    if request.tool_choice and request.tool_choice.type == "tool":
        name = _select_tool_name(request, tools=tools, marker=marker)
        return finalize_semantic_result(
            response_id=response_id,
            model_alias=request.model_alias,
            result=CodingToolUseResult(
                tool_id=new_tool_use_id(),
                name=name,
                input={},
            ),
            tool_schemas=schemas,
        )

    # Default text path (tools present but no tool requested).
    return finalize_semantic_result(
        response_id=response_id,
        model_alias=request.model_alias,
        result=CodingTextResult(
            text=(
                "CODING_MOCK_OK | tools_present=true | "
                f"last={user_text[:80]}"
            )
        ),
        tool_schemas=schemas,
    )
