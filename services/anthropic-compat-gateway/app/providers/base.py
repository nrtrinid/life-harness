from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterator, Literal, Protocol, runtime_checkable

from app.models import MessagesRequest, MessagesResponse


class ProviderError(Exception):
    """Base provider error converted to Anthropic-shaped responses."""

    def __init__(self, message: str, *, error_type: str = "api_error") -> None:
        self.message = message
        self.error_type = error_type
        super().__init__(message)


class MalformedToolOutputError(ProviderError):
    """Internal mock failure: provider could not produce valid tool output."""

    def __init__(self, message: str) -> None:
        super().__init__(message, error_type="api_error")


class MidStreamProviderError(ProviderError):
    """Raised after streaming has begun; transport must emit SSE error event."""

    def __init__(self, message: str, *, error_type: str = "api_error") -> None:
        super().__init__(message, error_type=error_type)


class PreStreamProviderError(ProviderError):
    """Raised before any SSE bytes; transport returns HTTP error."""

    def __init__(
        self,
        message: str,
        *,
        error_type: str = "api_error",
        status_code: int = 500,
    ) -> None:
        self.status_code = status_code
        super().__init__(message, error_type=error_type)


@dataclass
class MockPlan:
    kind: Literal["text", "tool_use", "error_pre", "error_mid", "malformed_tool"]
    text: str | None = None
    stop_reason: str = "end_turn"
    tool_name: str | None = None
    tool_id: str | None = None
    tool_input: dict[str, Any] | None = None
    error_message: str | None = None
    error_type: str = "api_error"
    status_code: int = 500
    text_chunks: list[str] = field(default_factory=list)
    json_chunks: list[str] = field(default_factory=list)


@runtime_checkable
class MessagesProvider(Protocol):
    name: str

    def plan(self, request: MessagesRequest, *, scenario: str) -> MockPlan: ...

    def complete(self, request: MessagesRequest, *, scenario: str) -> MessagesResponse: ...

    def stream_events(
        self, request: MessagesRequest, *, scenario: str
    ) -> Iterator[tuple[str, dict[str, Any]]]: ...
