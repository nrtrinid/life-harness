"""Anthropic ↔ ai-gateway coding tool translation (Coding Slice C1)."""

from __future__ import annotations

import json
from typing import Any

from app.models import ContentBlock, MessagesRequest, ToolDefinition
from app.providers.base import PreStreamProviderError
from app.upstream.coding_client import (
    CodingContentBlock,
    CodingRequestBody,
    CodingToolChoice,
    CodingToolDefinition,
    CodingTurn,
)

UPSTREAM_MODEL_ALIAS = "coding_fast"

MAX_TOOL_RESULT_CONTENT_BYTES = 64 * 1024
MAX_TOOL_ROUNDS_IN_REQUEST = 8
MAX_ASSISTANT_TOOL_CALLS_PER_TURN = 1


def validate_local_coding_messages(request: MessagesRequest) -> None:
    """Stateless transcript validation before upstream coding call."""
    tools_present = bool(request.tools)
    if request.tool_choice is not None and not _is_default_tool_choice(
        request.tool_choice
    ):
        if isinstance(request.tool_choice, dict):
            if request.tool_choice.get("type") in ("none", "tool") and not tools_present:
                raise PreStreamProviderError(
                    "tool_choice requires a non-empty tools list",
                    error_type="invalid_request_error",
                    status_code=400,
                )

    unresolved: dict[str, str] = {}
    resolved: set[str] = set()
    tool_rounds = 0

    for msg in request.messages:
        blocks = _anthropic_blocks(msg.content)
        if msg.role == "assistant":
            tool_calls = 0
            for block in blocks:
                if block.type == "text":
                    if not (block.text or "").strip():
                        raise PreStreamProviderError(
                            "assistant text blocks must be non-empty",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                elif block.type == "tool_use":
                    tool_calls += 1
                    if tool_calls > MAX_ASSISTANT_TOOL_CALLS_PER_TURN:
                        raise PreStreamProviderError(
                            "assistant message contains more than one tool_use block",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    if not block.id or block.id in unresolved or block.id in resolved:
                        raise PreStreamProviderError(
                            "invalid or duplicate assistant tool_use id",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    if not block.name:
                        raise PreStreamProviderError(
                            "assistant tool_use requires name",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    if not isinstance(block.input, dict):
                        raise PreStreamProviderError(
                            "assistant tool_use requires input object",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    unresolved[block.id] = block.name
                    tool_rounds += 1
                else:
                    raise PreStreamProviderError(
                        f"assistant message contains unsupported block: {block.type!r}",
                        error_type="invalid_request_error",
                        status_code=400,
                    )
        elif msg.role == "user":
            for block in blocks:
                if block.type == "text":
                    continue
                if block.type == "tool_result":
                    if not block.tool_use_id:
                        raise PreStreamProviderError(
                            "tool_result requires tool_use_id",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    if block.tool_use_id in resolved:
                        raise PreStreamProviderError(
                            f"duplicate tool_result for id: {block.tool_use_id!r}",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    if block.tool_use_id not in unresolved:
                        raise PreStreamProviderError(
                            f"tool_result references unknown tool_use_id: "
                            f"{block.tool_use_id!r}",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    if block.content is None:
                        raise PreStreamProviderError(
                            "tool_result requires content",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    size = _tool_result_size(block.content)
                    if size > MAX_TOOL_RESULT_CONTENT_BYTES:
                        raise PreStreamProviderError(
                            "tool_result content exceeds maximum size",
                            error_type="invalid_request_error",
                            status_code=400,
                        )
                    resolved.add(block.tool_use_id)
                    del unresolved[block.tool_use_id]
                else:
                    raise PreStreamProviderError(
                        f"user message contains unsupported block: {block.type!r}",
                        error_type="invalid_request_error",
                        status_code=400,
                    )

    if tool_rounds > MAX_TOOL_ROUNDS_IN_REQUEST:
        raise PreStreamProviderError(
            "transcript exceeds maximum tool rounds",
            error_type="invalid_request_error",
            status_code=400,
        )

    if unresolved:
        last = request.messages[-1]
        last_blocks = _anthropic_blocks(last.content)
        last_has_result = any(b.type == "tool_result" for b in last_blocks)
        last_text_only = all(b.type == "text" for b in last_blocks)
        if last.role == "user" and last_text_only and not last_has_result:
            raise PreStreamProviderError(
                "unresolved tool_use remains; supply matching tool_result before "
                "a new user prompt",
                error_type="invalid_request_error",
                status_code=400,
            )


def _anthropic_blocks(content: str | list[ContentBlock]) -> list[ContentBlock]:
    if isinstance(content, str):
        if not content.strip():
            raise PreStreamProviderError(
                "message content must be non-empty",
                error_type="invalid_request_error",
                status_code=400,
            )
        return [ContentBlock(type="text", text=content)]
    if not content:
        raise PreStreamProviderError(
            "message content blocks must be non-empty",
            error_type="invalid_request_error",
            status_code=400,
        )
    return content


def _tool_result_size(content: Any) -> int:
    if isinstance(content, str):
        return len(content.encode("utf-8"))
    try:
        return len(
            json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
        )
    except (TypeError, ValueError):
        return MAX_TOOL_RESULT_CONTENT_BYTES + 1


def _is_default_tool_choice(tool_choice: Any) -> bool:
    if tool_choice is None:
        return True
    if isinstance(tool_choice, str):
        return tool_choice.strip().lower() in ("", "auto")
    if isinstance(tool_choice, dict):
        if not tool_choice:
            return True
        keys = set(tool_choice.keys())
        if keys <= {"type"} and tool_choice.get("type") == "auto":
            return True
        return False
    return False


def translate_tool_choice(raw: Any) -> CodingToolChoice | None:
    if raw is None or _is_default_tool_choice(raw):
        return None
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered == "none":
            return CodingToolChoice(type="none")
        raise PreStreamProviderError(
            f"unsupported tool_choice: {raw!r}",
            error_type="invalid_request_error",
            status_code=400,
        )
    if isinstance(raw, dict):
        choice_type = raw.get("type")
        if choice_type == "none":
            return CodingToolChoice(type="none")
        if choice_type == "tool":
            name = raw.get("name")
            if not isinstance(name, str) or not name.strip():
                raise PreStreamProviderError(
                    "tool_choice type=tool requires name",
                    error_type="invalid_request_error",
                    status_code=400,
                )
            return CodingToolChoice(type="tool", name=name.strip())
        if choice_type in ("any", "auto"):
            if choice_type == "any":
                raise PreStreamProviderError(
                    "local_coding rejects tool_choice type=any",
                    error_type="invalid_request_error",
                    status_code=400,
                )
            return None
        raise PreStreamProviderError(
            f"unsupported tool_choice type: {choice_type!r}",
            error_type="invalid_request_error",
            status_code=400,
        )
    raise PreStreamProviderError(
        "tool_choice must be a string or object",
        error_type="invalid_request_error",
        status_code=400,
    )


def translate_tool_definitions(
    tools: list[ToolDefinition] | None,
) -> list[CodingToolDefinition] | None:
    if not tools:
        return None
    return [
        CodingToolDefinition(
            name=t.name,
            description=t.description,
            input_schema=t.input_schema,
        )
        for t in tools
    ]


def translate_content_blocks(
    content: str | list[ContentBlock],
) -> str | list[CodingContentBlock]:
    if isinstance(content, str):
        return content
    blocks: list[CodingContentBlock] = []
    for block in content:
        if block.type == "text":
            blocks.append({"type": "text", "text": block.text or ""})
        elif block.type == "tool_use":
            blocks.append(
                {
                    "type": "tool_use",
                    "id": block.id or "",
                    "name": block.name or "",
                    "input": block.input or {},
                }
            )
        elif block.type == "tool_result":
            blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.tool_use_id or "",
                    "content": block.content,
                    "is_error": block.is_error,
                }
            )
    return blocks


def _messages_have_tool_blocks(request: MessagesRequest) -> bool:
    for msg in request.messages:
        content = msg.content
        if isinstance(content, list):
            for block in content:
                if block.type in ("tool_use", "tool_result"):
                    return True
    return False


def translate_messages_to_coding(request: MessagesRequest) -> CodingRequestBody:
    if not request.messages:
        raise PreStreamProviderError(
            "messages must be non-empty",
            error_type="invalid_request_error",
            status_code=400,
        )

    if request.tools or _messages_have_tool_blocks(request):
        validate_local_coding_messages(request)

    turns: list[CodingTurn] = []
    for msg in request.messages:
        turns.append(
            CodingTurn(
                role=msg.role,
                content=translate_content_blocks(msg.content),
            )
        )

    system_text: str | None = None
    if request.system is not None:
        if isinstance(request.system, str):
            system_text = request.system.strip() or None
        else:
            parts = [
                item.get("text", "")
                for item in request.system
                if isinstance(item, dict)
            ]
            system_text = "\n".join(p for p in parts if p).strip() or None

    return CodingRequestBody(
        model_alias="coding_fast",
        system=system_text,
        messages=turns,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        top_p=request.top_p,
        stop_sequences=request.stop_sequences,
        stream=False,
        tools=translate_tool_definitions(request.tools),
        tool_choice=translate_tool_choice(request.tool_choice),
        metadata=request.metadata,
    )


def anthropic_content_from_upstream(
    blocks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for block in blocks:
        btype = block.get("type")
        if btype == "text":
            out.append({"type": "text", "text": block.get("text") or ""})
        elif btype == "tool_use":
            out.append(
                {
                    "type": "tool_use",
                    "id": block.get("id"),
                    "name": block.get("name"),
                    "input": block.get("input") or {},
                }
            )
        else:
            raise PreStreamProviderError(
                f"unsupported upstream coding content block: {btype!r}",
                error_type="api_error",
                status_code=502,
            )
    return out
