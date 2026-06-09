import json
import re
from typing import Protocol, runtime_checkable

from app.models import AnalyzeTranscriptRequest, AnalyzeTranscriptResponse, ProviderHealth


class ProviderParseError(Exception):
    """Raised when model output cannot be parsed into the response schema."""


class ProviderNotReadyError(Exception):
    """Raised when the provider is not ready to analyze (Phase 0 OpenVINO stub)."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@runtime_checkable
class TranscriptProvider(Protocol):
    name: str

    def health(self) -> ProviderHealth: ...

    def analyze(self, request: AnalyzeTranscriptRequest) -> AnalyzeTranscriptResponse: ...


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def parse_model_json(raw: str) -> AnalyzeTranscriptResponse:
    """Strip markdown fences, parse JSON, validate against strict schema."""
    cleaned = raw.strip()
    cleaned = _FENCE_RE.sub("", cleaned).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ProviderParseError(f"Invalid JSON from model: {exc}") from exc
    try:
        return AnalyzeTranscriptResponse.model_validate(data)
    except Exception as exc:
        raise ProviderParseError(f"Response failed schema validation: {exc}") from exc
