"""Typed request/response models for the dedicated coding inference lane."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.models import StrictModel


class CodingContentType(str, Enum):
    text = "text"
    # Reserved for Coding Slice C — rejected in Slice A validators.
    tool_use = "tool_use"
    tool_result = "tool_result"


class CodingTextBlock(StrictModel):
    type: Literal["text"] = "text"
    text: str = Field(..., min_length=1)


class CodingMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str | list[CodingTextBlock]

    @field_validator("content")
    @classmethod
    def _reject_empty_content(cls, value: str | list[CodingTextBlock]) -> str | list[CodingTextBlock]:
        if isinstance(value, str):
            if not value.strip():
                raise ValueError("message content must be non-empty text")
            return value
        if not value:
            raise ValueError("message content blocks must be non-empty")
        return value


class CodingChatRequest(StrictModel):
    """Service-local coding chat contract (not Anthropic wire format)."""

    model_alias: str = Field(..., min_length=1)
    system: str | None = None
    messages: list[CodingMessage] = Field(..., min_length=1)
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None
    stop_sequences: list[str] | None = None
    stream: bool = False
    tools: list[Any] | None = None
    tool_choice: Any | None = None
    metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _reject_unsupported(self) -> CodingChatRequest:
        if self.stream:
            raise ValueError("stream=true is not supported on /ai/coding/chat (Coding Slice A)")
        if self.tools:
            raise ValueError("tools are not supported on /ai/coding/chat (Coding Slice A)")
        if self.tool_choice is not None:
            # Reject any explicit tool_choice; omit for Slice A.
            raise ValueError("tool_choice is not supported on /ai/coding/chat (Coding Slice A)")
        if self.stop_sequences:
            raise ValueError(
                "non-empty stop_sequences are not supported on /ai/coding/chat "
                "(Coding Slice A; GenAI stop_strings mapping deferred)"
            )
        return self


class CodingUsage(StrictModel):
    input_tokens: int = 0
    output_tokens: int = 0


class CodingChatResponse(StrictModel):
    id: str
    model_alias: str
    content: list[CodingTextBlock]
    stop_reason: Literal["end_turn", "max_tokens", "error"] = "end_turn"
    usage: CodingUsage = Field(default_factory=CodingUsage)
