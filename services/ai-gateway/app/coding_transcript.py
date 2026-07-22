"""Stateless transcript validation for coding tool messages (Coding Slice C1)."""

from __future__ import annotations

import json
from typing import Any, Literal

from app.coding_models import (
    CodingMessage,
    CodingToolChoice,
    CodingToolUseBlock,
)
from app.coding_tools_limits import (
    MAX_TOOL_RESULT_CONTENT_BYTES,
    MAX_TOOL_ROUNDS_IN_REQUEST,
    MAX_ASSISTANT_TOOL_CALLS_PER_TURN,
)
from app.providers.base import ProviderInputError


def _blocks(content: str | list[Any]) -> list[dict[str, Any]]:
    if isinstance(content, str):
        if not content.strip():
            raise ProviderInputError("message content must be non-empty text")
        return [{"type": "text", "text": content}]
    blocks: list[dict[str, Any]] = []
    for block in content:
        if hasattr(block, "model_dump"):
            blocks.append(block.model_dump(mode="json"))
        elif isinstance(block, dict):
            blocks.append(block)
        else:
            raise ProviderInputError("message content blocks must be objects")
    if not blocks:
        raise ProviderInputError("message content blocks must be non-empty")
    return blocks


def _tool_result_content_bytes(content: Any) -> int:
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


def _reject_binary_or_unknown_result(content: Any) -> None:
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                item_type = item.get("type")
                if item_type in ("image", "document", "binary"):
                    raise ProviderInputError(
                        "binary or image tool_result content is not supported"
                    )
                if item_type not in (None, "text"):
                    raise ProviderInputError(
                        f"unsupported tool_result content block type: {item_type!r}"
                    )


def validate_coding_transcript(
    messages: list[CodingMessage],
    *,
    tools_present: bool,
    tool_choice: CodingToolChoice | None,
) -> None:
    """Validate ordered transcript including tool blocks (stateless)."""
    if tool_choice is not None and tool_choice.type != "auto" and not tools_present:
        raise ProviderInputError(
            "tool_choice requires a non-empty tools list"
        )

    unresolved: dict[str, str] = {}  # tool_use_id -> tool name
    resolved: set[str] = set()
    tool_rounds = 0

    for msg in messages:
        blocks = _blocks(msg.content)
        if msg.role == "assistant":
            tool_calls = 0
            for block in blocks:
                btype = block.get("type")
                if btype == "text":
                    text = block.get("text")
                    if not isinstance(text, str) or not text.strip():
                        raise ProviderInputError(
                            "assistant text blocks must be non-empty strings"
                        )
                elif btype == "tool_use":
                    tool_calls += 1
                    if tool_calls > MAX_ASSISTANT_TOOL_CALLS_PER_TURN:
                        raise ProviderInputError(
                            "assistant message contains more than one tool_use block"
                        )
                    tool_id = block.get("id")
                    name = block.get("name")
                    tool_input = block.get("input")
                    if not isinstance(tool_id, str) or not tool_id.strip():
                        raise ProviderInputError(
                            "assistant tool_use requires non-empty id"
                        )
                    if tool_id in unresolved or tool_id in resolved:
                        raise ProviderInputError(
                            f"duplicate assistant tool_use id: {tool_id!r}"
                        )
                    if not isinstance(name, str) or not name.strip():
                        raise ProviderInputError(
                            "assistant tool_use requires non-empty name"
                        )
                    if not isinstance(tool_input, dict):
                        raise ProviderInputError(
                            "assistant tool_use requires input object"
                        )
                    unresolved[tool_id] = name
                    tool_rounds += 1
                else:
                    raise ProviderInputError(
                        f"assistant message contains unsupported block type: {btype!r}"
                    )
        elif msg.role == "user":
            saw_result = False
            for block in blocks:
                btype = block.get("type")
                if btype == "text":
                    text = block.get("text")
                    if not isinstance(text, str):
                        raise ProviderInputError("user text blocks must be strings")
                elif btype == "tool_result":
                    saw_result = True
                    tool_use_id = block.get("tool_use_id")
                    content = block.get("content")
                    if not isinstance(tool_use_id, str) or not tool_use_id.strip():
                        raise ProviderInputError(
                            "tool_result requires non-empty tool_use_id"
                        )
                    if tool_use_id in resolved:
                        raise ProviderInputError(
                            f"duplicate tool_result for id: {tool_use_id!r}"
                        )
                    if tool_use_id not in unresolved:
                        raise ProviderInputError(
                            f"tool_result references unknown tool_use_id: "
                            f"{tool_use_id!r}"
                        )
                    if content is None:
                        raise ProviderInputError("tool_result requires content")
                    _reject_binary_or_unknown_result(content)
                    size = _tool_result_content_bytes(content)
                    if size > MAX_TOOL_RESULT_CONTENT_BYTES:
                        raise ProviderInputError(
                            f"tool_result content exceeds maximum size "
                            f"{MAX_TOOL_RESULT_CONTENT_BYTES} bytes"
                        )
                    resolved.add(tool_use_id)
                    del unresolved[tool_use_id]
                else:
                    raise ProviderInputError(
                        f"user message contains unsupported block type: {btype!r}"
                    )
            if saw_result and unresolved:
                # Additional user text alongside results is allowed; unresolved
                # from earlier assistant turns must still be cleared eventually.
                pass
        else:
            raise ProviderInputError(f"unsupported message role: {msg.role!r}")

    if tool_rounds > MAX_TOOL_ROUNDS_IN_REQUEST:
        raise ProviderInputError(
            f"transcript exceeds maximum tool rounds {MAX_TOOL_ROUNDS_IN_REQUEST}"
        )

    if unresolved:
        last = messages[-1]
        last_blocks = _blocks(last.content)
        last_has_result = any(b.get("type") == "tool_result" for b in last_blocks)
        last_has_text_only = all(b.get("type") == "text" for b in last_blocks)
        if last.role == "user" and last_has_text_only and not last_has_result:
            raise ProviderInputError(
                "unresolved tool_use remains; supply matching tool_result before "
                "a new user prompt"
            )


def parse_tool_choice(raw: Any) -> CodingToolChoice | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in ("", "auto"):
            return CodingToolChoice(type="auto")
        if lowered == "none":
            return CodingToolChoice(type="none")
        raise ProviderInputError(f"unsupported tool_choice string: {raw!r}")
    if isinstance(raw, dict):
        if not raw:
            return CodingToolChoice(type="auto")
        choice_type = raw.get("type")
        if choice_type == "auto":
            return CodingToolChoice(type="auto")
        if choice_type == "none":
            return CodingToolChoice(type="none")
        if choice_type == "tool":
            name = raw.get("name")
            if not isinstance(name, str) or not name.strip():
                raise ProviderInputError("tool_choice type=tool requires name")
            return CodingToolChoice(type="tool", name=name.strip())
        raise ProviderInputError(f"unsupported tool_choice type: {choice_type!r}")
    raise ProviderInputError("tool_choice must be a string or object")


def transcript_has_tool_results(messages: list[CodingMessage]) -> bool:
    for msg in messages:
        if msg.role != "user":
            continue
        for block in _blocks(msg.content):
            if block.get("type") == "tool_result":
                return True
    return False


def last_user_text(messages: list[CodingMessage]) -> str:
    blocks = _blocks(messages[-1].content)
    parts: list[str] = []
    for block in blocks:
        if block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "\n".join(parts).strip()
