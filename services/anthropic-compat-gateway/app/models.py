from __future__ import annotations

from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class IgnoreExtraModel(BaseModel):
    """Accept unknown Claude Code fields; ignore them in Slice 1 (not pass-through)."""

    model_config = ConfigDict(extra="ignore")


class ToolDefinition(IgnoreExtraModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: str
    description: str | None = None
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ContentBlock(IgnoreExtraModel):
    type: Literal["text", "tool_use", "tool_result"]
    text: str | None = None
    id: str | None = None
    name: str | None = None
    input: dict[str, Any] | None = None
    tool_use_id: str | None = None
    content: Any | None = None
    is_error: bool | None = None

    @model_validator(mode="after")
    def validate_required_fields(self) -> Self:
        if self.type == "text":
            if self.text is None:
                raise ValueError("text content block requires text:str")
        elif self.type == "tool_use":
            if not self.id:
                raise ValueError("tool_use content block requires id")
            if not self.name:
                raise ValueError("tool_use content block requires name")
            if self.input is None or not isinstance(self.input, dict):
                raise ValueError("tool_use content block requires input:dict")
        elif self.type == "tool_result":
            if not self.tool_use_id:
                raise ValueError("tool_result content block requires tool_use_id")
            if self.content is None:
                raise ValueError("tool_result content block requires content")
        else:
            raise ValueError(f"unsupported content block type: {self.type!r}")
        return self


class Message(IgnoreExtraModel):
    role: Literal["user", "assistant"]
    content: str | list[ContentBlock]


class MessagesRequest(IgnoreExtraModel):
    model: str
    max_tokens: int
    messages: list[Message]
    system: str | list[dict[str, Any]] | None = None
    tools: list[ToolDefinition] | None = None
    stream: bool = False
    stop_sequences: list[str] | None = None
    temperature: float | None = None
    top_p: float | None = None
    tool_choice: Any | None = None
    metadata: dict[str, Any] | None = None


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class MessagesResponse(BaseModel):
    id: str
    type: Literal["message"] = "message"
    role: Literal["assistant"] = "assistant"
    content: list[dict[str, Any]]
    model: str
    stop_reason: str | None
    stop_sequence: str | None = None
    usage: Usage


class AnthropicErrorBody(BaseModel):
    type: Literal["error"] = "error"
    error: dict[str, Any]


def anthropic_error(
    *,
    type_: str,
    message: str,
) -> dict[str, Any]:
    return {
        "type": "error",
        "error": {
            "type": type_,
            "message": message,
        },
    }
