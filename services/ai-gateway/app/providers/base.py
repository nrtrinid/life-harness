import json
import re
from typing import Iterator, Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

from app.models import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    AskHarnessRequest,
    AskHarnessResponse,
    ChatHarnessRequest,
    ChatHarnessResponse,
    ProviderHealth,
    RawLabRequest,
    RawLabResponse,
    RawLabSelfReflectionRequest,
    RawLabSelfReflectionResponse,
)

CHAT_HARNESS_PARSE_FALLBACK = ChatHarnessResponse(
    answer=(
        "I had trouble formatting the model response, but the likely next step is to "
        "ask again more narrowly or switch to structured Ask Harness."
    ),
    used_context=False,
    confidence_notes=["Formatting failed after repair."],
    safety_notes=[],
)

RAW_LAB_EMPTY_FALLBACK = RawLabResponse(
    answer=(
        "I didn't get a usable reply. Raw Lab is still ungrounded — "
        "try asking again in a shorter, clearer way."
    ),
    mode="raw_lab",
    safety_notes=[],
    used_context=False,
)

T = TypeVar("T", bound=BaseModel)


class ProviderParseError(Exception):
    """Raised when model output cannot be parsed into the response schema."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ProviderNotReadyError(Exception):
    """Raised when the provider is not ready to analyze."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ProviderInputError(Exception):
    """Raised when request input violates provider limits."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@runtime_checkable
class TranscriptProvider(Protocol):
    name: str

    def health(self) -> ProviderHealth: ...

    def analyze(self, request: AnalyzeTranscriptRequest) -> AnalyzeTranscriptResponse: ...

    def ask_harness(self, request: AskHarnessRequest) -> AskHarnessResponse: ...

    def chat_harness(self, request: ChatHarnessRequest) -> ChatHarnessResponse: ...

    def raw_lab(self, request: RawLabRequest) -> RawLabResponse: ...

    def raw_lab_self_reflection(
        self, request: RawLabSelfReflectionRequest
    ) -> RawLabSelfReflectionResponse: ...


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_THINKING_TAG_RE = re.compile(
    r"<think[^>]*>.*?</" + "think>",
    re.DOTALL | re.IGNORECASE,
)


def sanitize_raw_lab_text(raw: str) -> str:
    cleaned = raw.strip()
    cleaned = _THINKING_TAG_RE.sub("", cleaned).strip()
    cleaned = _FENCE_RE.sub("", cleaned).strip()
    return cleaned


def _json_candidates(raw: str) -> Iterator[str]:
    cleaned = raw.strip()
    cleaned = _FENCE_RE.sub("", cleaned).strip()
    yield cleaned
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        yield cleaned[start : end + 1]


def parse_strict_json(raw: str, model: type[T]) -> T:
    """Strip markdown fences, extract JSON object, validate against strict schema."""
    last_error: Exception | None = None
    for candidate in _json_candidates(raw):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        try:
            return model.model_validate(data)
        except Exception as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise ProviderParseError(f"Response failed schema validation: {last_error}") from last_error
    raise ProviderParseError("No valid JSON object found in model output")


def parse_model_json(raw: str) -> AnalyzeTranscriptResponse:
    return parse_strict_json(raw, AnalyzeTranscriptResponse)
