import json
import re
from typing import Iterator, Protocol, runtime_checkable

from app.models import AnalyzeTranscriptRequest, AnalyzeTranscriptResponse, ProviderHealth


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


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _json_candidates(raw: str) -> Iterator[str]:
    cleaned = raw.strip()
    cleaned = _FENCE_RE.sub("", cleaned).strip()
    yield cleaned
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        yield cleaned[start : end + 1]


def parse_model_json(raw: str) -> AnalyzeTranscriptResponse:
    """Strip markdown fences, extract JSON object, validate against strict schema."""
    last_error: Exception | None = None
    for candidate in _json_candidates(raw):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        try:
            return AnalyzeTranscriptResponse.model_validate(data)
        except Exception as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise ProviderParseError(f"Response failed schema validation: {last_error}") from last_error
    raise ProviderParseError("No valid JSON object found in model output")
