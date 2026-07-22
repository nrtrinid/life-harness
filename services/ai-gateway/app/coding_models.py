"""Typed request/response models for the dedicated coding inference lane."""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import Field, field_validator, model_validator

from app.models import StrictModel


class CodingToolDefinition(StrictModel):
    name: str = Field(..., min_length=1)
    description: str | None = None
    input_schema: dict[str, Any] = Field(default_factory=dict)


class CodingToolChoice(StrictModel):
    type: Literal["auto", "none", "tool"]
    name: str | None = None

    @model_validator(mode="after")
    def _tool_requires_name(self) -> CodingToolChoice:
        if self.type == "tool" and not (self.name and self.name.strip()):
            raise ValueError("tool_choice type=tool requires name")
        return self


class CodingTextBlock(StrictModel):
    type: Literal["text"] = "text"
    text: str = Field(..., min_length=1)


class CodingToolUseBlock(StrictModel):
    type: Literal["tool_use"] = "tool_use"
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    input: dict[str, Any] = Field(default_factory=dict)


class CodingToolResultBlock(StrictModel):
    type: Literal["tool_result"] = "tool_result"
    tool_use_id: str = Field(..., min_length=1)
    content: str | dict[str, Any] | list[Any]
    is_error: bool | None = None


CodingUserBlock = Annotated[
    Union[CodingTextBlock, CodingToolResultBlock],
    Field(discriminator="type"),
]

CodingAssistantBlock = Annotated[
    Union[CodingTextBlock, CodingToolUseBlock],
    Field(discriminator="type"),
]

CodingContentBlock = Annotated[
    Union[CodingTextBlock, CodingToolUseBlock, CodingToolResultBlock],
    Field(discriminator="type"),
]


class CodingMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str | list[CodingContentBlock]

    @field_validator("content")
    @classmethod
    def _reject_empty_content(
        cls, value: str | list[CodingContentBlock]
    ) -> str | list[CodingContentBlock]:
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
    tools: list[CodingToolDefinition] | None = None
    tool_choice: CodingToolChoice | None = None
    metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _reject_stop_sequences(self) -> CodingChatRequest:
        if self.stop_sequences:
            raise ValueError(
                "non-empty stop_sequences are not supported on /ai/coding/chat "
                "(GenAI stop_strings mapping deferred)"
            )
        return self


class CodingUsage(StrictModel):
    input_tokens: int = 0
    output_tokens: int = 0


class CodingChatResponse(StrictModel):
    id: str
    model_alias: str
    content: list[CodingAssistantBlock]
    stop_reason: Literal["end_turn", "tool_use", "max_tokens", "error"] = "end_turn"
    usage: CodingUsage = Field(default_factory=CodingUsage)

    @model_validator(mode="after")
    def _non_empty_content(self) -> CodingChatResponse:
        if not self.content:
            raise ValueError("response content must be non-empty")
        return self
