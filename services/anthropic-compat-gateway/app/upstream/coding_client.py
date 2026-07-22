"""Typed HTTP client for ai-gateway ``POST /ai/coding/chat`` (Coding Slice A/C)."""

from __future__ import annotations

import json
from typing import Any, Iterator, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.upstream.errors import (
    UpstreamEmptyAnswerError,
    UpstreamHttpError,
    UpstreamOfflineError,
    UpstreamProtocolError,
    UpstreamResponseTooLargeError,
    UpstreamTimeoutError,
)


class CodingToolDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    description: str | None = None
    input_schema: dict[str, Any] = Field(default_factory=dict)


class CodingToolChoice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["auto", "none", "tool"]
    name: str | None = None


CodingContentBlock = dict[str, Any]


class CodingTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str | list[CodingContentBlock]


class CodingRequestBody(BaseModel):
    model_alias: str
    system: str | None = None
    messages: list[CodingTurn]
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None
    stop_sequences: list[str] | None = None
    stream: bool = False
    tools: list[CodingToolDefinition] | None = None
    tool_choice: CodingToolChoice | None = None
    metadata: dict[str, Any] | None = None


class CodingUsage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    input_tokens: int = 0
    output_tokens: int = 0


class CodingResponseBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    model_alias: str
    content: list[dict[str, Any]] = Field(..., min_length=1)
    stop_reason: str = "end_turn"
    usage: CodingUsage = Field(default_factory=CodingUsage)

    @property
    def answer_text(self) -> str:
        return "".join(
            block.get("text") or ""
            for block in self.content
            if block.get("type") == "text"
        )

    @property
    def has_tool_use(self) -> bool:
        return any(block.get("type") == "tool_use" for block in self.content)


class CodingClient:
    """Bounded loopback client for ``/ai/coding/chat``. No retries. Distinct from Raw Lab."""

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

    def post_coding_chat(self, body: CodingRequestBody) -> CodingResponseBody:
        try:
            with self._client.stream(
                "POST",
                "/ai/coding/chat",
                json=body.model_dump(mode="json", exclude_none=True),
                headers={
                    "content-type": "application/json",
                    "accept": "application/json",
                },
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
                            f"Coding upstream Content-Length {declared} exceeds "
                            f"max_response_bytes={self._max_response_bytes}"
                        )

                chunks: list[bytes] = []
                total = 0
                try:
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > self._max_response_bytes:
                            raise UpstreamResponseTooLargeError(
                                f"Coding upstream response exceeded "
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
                f"Coding upstream offline/unreachable: {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError(f"Coding upstream timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise UpstreamProtocolError(
                f"Coding HTTP transport error: {exc}"
            ) from exc

        if status >= 400:
            snippet = raw.decode("utf-8", errors="replace")[:200]
            raise UpstreamHttpError(
                f"Coding upstream HTTP {status}: {snippet}",
                status=status,
            )

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise UpstreamProtocolError(
                f"Coding response was not valid JSON: {exc}"
            ) from exc

        if not isinstance(payload, dict):
            raise UpstreamProtocolError("Coding response JSON must be an object")

        try:
            parsed = CodingResponseBody.model_validate(payload)
        except Exception as exc:
            raise UpstreamProtocolError(
                f"Coding response failed schema validation: {exc}"
            ) from exc

        if not parsed.content:
            raise UpstreamEmptyAnswerError("Coding response content is empty")
        if parsed.stop_reason == "end_turn" and not parsed.answer_text.strip():
            raise UpstreamEmptyAnswerError(
                "Coding response text is missing or empty/whitespace"
            )
        if parsed.stop_reason == "tool_use" and not parsed.has_tool_use:
            raise UpstreamProtocolError(
                "Coding response stop_reason=tool_use without tool_use block"
            )

        return parsed

    def iter_coding_chat_stream(
        self, body: CodingRequestBody
    ) -> Iterator[dict[str, Any]]:
        """Yield parsed JSON objects from ``POST /ai/coding/chat/stream`` SSE."""
        payload = body.model_dump(mode="json", exclude_none=True)
        payload["stream"] = True
        try:
            with self._client.stream(
                "POST",
                "/ai/coding/chat/stream",
                json=payload,
                headers={
                    "content-type": "application/json",
                    "accept": "text/event-stream",
                },
            ) as response:
                if response.status_code >= 400:
                    raw = response.read()
                    snippet = raw.decode("utf-8", errors="replace")[:200]
                    raise UpstreamHttpError(
                        f"Coding stream upstream HTTP {response.status_code}: {snippet}",
                        status=response.status_code,
                    )

                total = 0
                buffer = ""
                try:
                    for chunk in response.iter_text():
                        total += len(chunk.encode("utf-8"))
                        if total > self._max_response_bytes:
                            raise UpstreamResponseTooLargeError(
                                f"Coding stream exceeded "
                                f"max_response_bytes={self._max_response_bytes}"
                            )
                        buffer += chunk
                        while "\n\n" in buffer:
                            block, buffer = buffer.split("\n\n", 1)
                            block = block.strip()
                            if not block:
                                continue
                            data_lines: list[str] = []
                            for line in block.split("\n"):
                                if line.startswith("data:"):
                                    data_lines.append(line[5:].lstrip())
                            if not data_lines:
                                raise UpstreamProtocolError(
                                    "Coding stream SSE block missing data line"
                                )
                            raw_json = "\n".join(data_lines)
                            try:
                                event = json.loads(raw_json)
                            except json.JSONDecodeError as exc:
                                raise UpstreamProtocolError(
                                    f"Coding stream event was not valid JSON: {exc}"
                                ) from exc
                            if not isinstance(event, dict) or "type" not in event:
                                raise UpstreamProtocolError(
                                    "Coding stream event missing type"
                                )
                            yield event
                except GeneratorExit:
                    response.close()
                    raise
        except UpstreamResponseTooLargeError:
            raise
        except UpstreamHttpError:
            raise
        except UpstreamProtocolError:
            raise
        except GeneratorExit:
            raise
        except httpx.ConnectError as exc:
            raise UpstreamOfflineError(
                f"Coding upstream offline/unreachable: {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError(f"Coding upstream timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise UpstreamProtocolError(
                f"Coding HTTP transport error: {exc}"
            ) from exc

    def close(self) -> None:
        self._client.close()
