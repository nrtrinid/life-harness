from __future__ import annotations

import json
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field


class UpstreamError(Exception):
    """Base error for Raw Lab upstream HTTP failures."""

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


class RawLabTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class RawLabRequestBody(BaseModel):
    message: str
    recent_turns: list[RawLabTurn] = Field(default_factory=list)
    thread_state: dict[str, Any] = Field(default_factory=dict)
    companion_self_memories: list[Any] = Field(default_factory=list)
    reasoning_depth: str = "fast"


class RawLabResponseBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    answer: str
    mode: str = "raw_lab"
    safety_notes: list[str] = Field(default_factory=list)
    used_context: bool = False


class RawLabClient:
    """Typed HTTP client for ``POST /raw-lab`` (non-streaming). No automatic retries."""

    def __init__(
        self,
        base_url: str,
        timeout: float,
        connect_timeout: float,
        max_response_bytes: int,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._max_response_bytes = max_response_bytes
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=httpx.Timeout(timeout, connect=connect_timeout),
            transport=transport,
        )

    def post_raw_lab(self, body: RawLabRequestBody) -> RawLabResponseBody:
        try:
            with self._client.stream(
                "POST",
                "/raw-lab",
                json=body.model_dump(mode="json"),
                headers={"content-type": "application/json", "accept": "application/json"},
            ) as response:
                content_length = response.headers.get("content-length")
                if content_length is not None:
                    try:
                        declared = int(content_length)
                    except ValueError:
                        declared = -1
                    if declared > self._max_response_bytes:
                        response.close()
                        raise UpstreamResponseTooLargeError(
                            f"Raw Lab Content-Length {declared} exceeds "
                            f"max_response_bytes={self._max_response_bytes}"
                        )

                chunks: list[bytes] = []
                total = 0
                try:
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > self._max_response_bytes:
                            raise UpstreamResponseTooLargeError(
                                f"Raw Lab response exceeded "
                                f"max_response_bytes={self._max_response_bytes}"
                            )
                        chunks.append(chunk)
                except UpstreamResponseTooLargeError:
                    response.close()
                    raise

                raw = b"".join(chunks)
                status = response.status_code
        except UpstreamResponseTooLargeError:
            raise
        except httpx.ConnectError as exc:
            raise UpstreamOfflineError(
                f"Raw Lab upstream offline/unreachable: {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError(f"Raw Lab upstream timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise UpstreamProtocolError(f"Raw Lab HTTP transport error: {exc}") from exc

        if status >= 400:
            snippet = raw.decode("utf-8", errors="replace")[:200]
            raise UpstreamHttpError(
                f"Raw Lab upstream HTTP {status}: {snippet}",
                status=status,
            )

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise UpstreamProtocolError(
                f"Raw Lab response was not valid JSON: {exc}"
            ) from exc

        if not isinstance(payload, dict):
            raise UpstreamProtocolError("Raw Lab response JSON must be an object")

        try:
            parsed = RawLabResponseBody.model_validate(payload)
        except Exception as exc:  # pydantic ValidationError
            raise UpstreamProtocolError(
                f"Raw Lab response failed schema validation: {exc}"
            ) from exc

        if not parsed.answer or not parsed.answer.strip():
            raise UpstreamEmptyAnswerError(
                "Raw Lab response answer is missing or empty/whitespace"
            )

        return parsed

    def close(self) -> None:
        self._client.close()
