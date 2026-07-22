"""Semantic coding backend outcomes (Coding Slice C1).

Suitable for future OpenVINO integration; C1 uses deterministic fake outputs only.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from app.coding_models import (
    CodingAssistantBlock,
    CodingChatResponse,
    CodingTextBlock,
    CodingToolUseBlock,
    CodingUsage,
)
from app.coding_tools_schema import validate_input_against_schema
from app.providers.base import ProviderInputError, ProviderNotReadyError


@dataclass(frozen=True)
class CodingTextResult:
    text: str


@dataclass(frozen=True)
class CodingToolUseResult:
    tool_id: str
    name: str
    input: dict
    leading_text: str | None = None


def new_tool_use_id() -> str:
    return f"toolu_{uuid.uuid4().hex[:20]}"


def finalize_semantic_result(
    *,
    response_id: str,
    model_alias: str,
    result: CodingTextResult | CodingToolUseResult,
    tool_schemas: dict[str, dict] | None = None,
) -> CodingChatResponse:
    """Convert a semantic backend outcome into a typed coding response."""
    tool_schemas = tool_schemas or {}
    if isinstance(result, CodingTextResult):
        text = result.text.strip()
        if not text:
            raise ProviderNotReadyError("coding model returned empty output")
        return CodingChatResponse(
            id=response_id,
            model_alias=model_alias,
            content=[CodingTextBlock(type="text", text=text)],
            stop_reason="end_turn",
            usage=CodingUsage(input_tokens=0, output_tokens=0),
        )

    if result.name not in tool_schemas:
        raise ProviderInputError(
            f"model emitted unknown tool name: {result.name!r}"
        )
    schema = tool_schemas[result.name]
    validate_input_against_schema(
        result.input, schema, tool_name=result.name
    )

    blocks: list[CodingAssistantBlock] = []
    if result.leading_text and result.leading_text.strip():
        blocks.append(
            CodingTextBlock(type="text", text=result.leading_text.strip())
        )
    blocks.append(
        CodingToolUseBlock(
            type="tool_use",
            id=result.tool_id,
            name=result.name,
            input=result.input,
        )
    )
    return CodingChatResponse(
        id=response_id,
        model_alias=model_alias,
        content=blocks,
        stop_reason="tool_use",
        usage=CodingUsage(input_tokens=0, output_tokens=0),
    )
