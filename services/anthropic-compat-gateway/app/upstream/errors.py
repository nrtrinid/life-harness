"""Shared upstream HTTP error types for loopback ai-gateway clients."""

from __future__ import annotations


class UpstreamError(Exception):
    """Base error for upstream HTTP failures."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class UpstreamOfflineError(UpstreamError):
    """Upstream could not be reached (connection refused / DNS / etc.)."""


class UpstreamTimeoutError(UpstreamError):
    """Connect or read timeout talking to upstream."""


class UpstreamHttpError(UpstreamError):
    """Non-success HTTP status from upstream."""

    def __init__(self, message: str, *, status: int) -> None:
        self.status = status
        super().__init__(message)


class UpstreamProtocolError(UpstreamError):
    """Response was not valid JSON / did not match expected shape."""


class UpstreamEmptyAnswerError(UpstreamError):
    """Upstream JSON missing answer or answer is empty/whitespace."""


class UpstreamResponseTooLargeError(UpstreamError):
    """Response body exceeded configured max_response_bytes."""
