"""LocalCodingProvider — Anthropic Messages → ai-gateway ``POST /ai/coding/chat``.

Coding Slice A: non-streaming text only. Does not call Raw Lab. Does not fall back
to MockProvider or cloud. Distinct from the experimental Raw Lab connectivity provider.
"""

from __future__ import annotations

import uuid
from typing import Any, Iterator

from app.config import Settings
from app.models import ContentBlock, MessagesRequest, MessagesResponse, Usage
from app.providers.base import MockPlan, MidStreamProviderError, PreStreamProviderError
from app.upstream.coding_client import (
    CodingClient,
    CodingRequestBody,
    CodingTurn,
)
from app.translate import events as ev
from app.upstream.errors import (
    UpstreamEmptyAnswerError,
    UpstreamHttpError,
    UpstreamOfflineError,
    UpstreamProtocolError,
    UpstreamResponseTooLargeError,
    UpstreamTimeoutError,
)

HARDCODED_MODEL_ALIAS = "acgw-local-coding"
UPSTREAM_MODEL_ALIAS = "coding_fast"


def _new_message_id() -> str:
    return f"msg_{uuid.uuid4().hex[:20]}"


def _flatten_text_content(content: str | list[ContentBlock]) -> str:
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content:
        if block.type == "text":
            parts.append(block.text or "")
    return "".join(parts)


def _system_text(system: str | list[dict[str, Any]] | None) -> str | None:
    if system is None:
        return None
    if isinstance(system, str):
        text = system.strip()
        return text or None
    parts: list[str] = []
    for item in system:
        if isinstance(item, dict):
            value = item.get("text")
            if isinstance(value, str) and value:
                parts.append(value)
    joined = "\n".join(parts).strip()
    return joined or None


def _content_has_tools(content: str | list[ContentBlock]) -> bool:
    if isinstance(content, str):
        return False
    return any(block.type in ("tool_use", "tool_result") for block in content)


def _is_default_tool_choice(tool_choice: Any) -> bool:
    if tool_choice is None:
        return True
    if isinstance(tool_choice, str):
        return tool_choice.strip().lower() in ("", "auto")
    if isinstance(tool_choice, dict):
        if not tool_choice:
            return True
        keys = set(tool_choice.keys())
        if keys <= {"type"} and tool_choice.get("type") == "auto":
            return True
        return False
    return False


def translate_messages_to_coding(request: MessagesRequest) -> CodingRequestBody:
    """Preserve native system + ordered user/assistant turns (no Raw Lab flattening)."""
    if not request.messages:
        raise PreStreamProviderError(
            "messages must be non-empty",
            error_type="invalid_request_error",
            status_code=400,
        )

    turns: list[CodingTurn] = []
    for msg in request.messages:
        turns.append(
            CodingTurn(role=msg.role, content=_flatten_text_content(msg.content))
        )

    return CodingRequestBody(
        model_alias=UPSTREAM_MODEL_ALIAS,
        system=_system_text(request.system),
        messages=turns,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        top_p=request.top_p,
        stop_sequences=request.stop_sequences,
        stream=False,
        metadata=request.metadata,
    )


class LocalCodingProvider:
    """Dedicated coding Messages provider backed by local ai-gateway coding lane."""

    name = "local_coding"

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        base_url: str | None = None,
        client: CodingClient | None = None,
        model_alias: str | None = None,
    ) -> None:
        if client is not None:
            self._client = client
            self._owns_client = False
        else:
            if settings is None:
                raise ValueError("settings or client is required")
            resolved_base = base_url or settings.local_coding_base_url
            self._client = CodingClient(
                base_url=resolved_base,
                timeout=settings.local_coding_timeout_seconds,
                connect_timeout=settings.local_coding_connect_timeout_seconds,
                max_response_bytes=settings.local_coding_max_response_bytes,
            )
            self._owns_client = True

        configured = (
            model_alias
            if model_alias is not None
            else (
                settings.local_coding_model_alias
                if settings is not None
                else "local-qwen-coding"
            )
        )
        self._configured_alias = configured
        self._allowed_models = frozenset({configured, HARDCODED_MODEL_ALIAS})

    def _validate_model(self, model: str) -> None:
        if model not in self._allowed_models:
            raise PreStreamProviderError(
                f"Unsupported model for local_coding: {model!r}; "
                f"allowed: {sorted(self._allowed_models)}",
                error_type="invalid_request_error",
                status_code=400,
            )

    def plan(self, request: MessagesRequest, *, scenario: str) -> MockPlan:
        _ = scenario
        # stream=true is allowed; stream_events handles translation.

        if request.tools:
            raise PreStreamProviderError(
                "local_coding does not support tools",
                error_type="invalid_request_error",
                status_code=400,
            )
        if not _is_default_tool_choice(request.tool_choice):
            raise PreStreamProviderError(
                "local_coding rejects explicit non-default tool_choice",
                error_type="invalid_request_error",
                status_code=400,
            )

        for msg in request.messages:
            if _content_has_tools(msg.content):
                raise PreStreamProviderError(
                    "local_coding rejects tool_use/tool_result content",
                    error_type="invalid_request_error",
                    status_code=400,
                )

        if request.stop_sequences:
            raise PreStreamProviderError(
                "local_coding rejects non-empty stop_sequences",
                error_type="invalid_request_error",
                status_code=400,
            )

        self._validate_model(request.model)

        if not request.messages:
            raise PreStreamProviderError(
                "messages must be non-empty",
                error_type="invalid_request_error",
                status_code=400,
            )
        if request.messages[-1].role != "user":
            raise PreStreamProviderError(
                "last message must have role=user for local_coding",
                error_type="invalid_request_error",
                status_code=400,
            )

        return MockPlan(kind="text", text=None, stop_reason="end_turn")

    def complete(self, request: MessagesRequest, *, scenario: str) -> MessagesResponse:
        self.plan(request, scenario=scenario)
        body = translate_messages_to_coding(request)
        try:
            upstream = self._client.post_coding_chat(body)
        except UpstreamOfflineError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc
        except UpstreamTimeoutError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=504
            ) from exc
        except UpstreamHttpError as exc:
            status = exc.status if 400 <= exc.status < 600 else 502
            if status == 200:
                status = 502
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=status
            ) from exc
        except UpstreamResponseTooLargeError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc
        except UpstreamEmptyAnswerError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc
        except UpstreamProtocolError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc

        usage = Usage(
            input_tokens=upstream.usage.input_tokens,
            output_tokens=upstream.usage.output_tokens,
        )
        return MessagesResponse(
            id=_new_message_id(),
            content=[{"type": "text", "text": upstream.answer_text}],
            model=request.model,
            stop_reason="end_turn",
            usage=usage,
        )

    def stream_events(
        self, request: MessagesRequest, *, scenario: str
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        self.plan(request, scenario=scenario)
        body = translate_messages_to_coding(request)
        body = body.model_copy(update={"stream": True})
        message_id = _new_message_id()

        try:
            upstream_events = self._client.iter_coding_chat_stream(body)
        except UpstreamOfflineError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc
        except UpstreamTimeoutError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=504
            ) from exc
        except UpstreamHttpError as exc:
            status = exc.status if 400 <= exc.status < 600 else 502
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=status
            ) from exc
        except UpstreamProtocolError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc
        except UpstreamResponseTooLargeError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc

        started = False
        saw_delta = False
        input_tokens = 0
        output_tokens = 0
        stop_reason = "end_turn"

        try:
            for event in upstream_events:
                etype = event.get("type")
                if etype == "start":
                    started = True
                    yield ev.message_start_event(
                        message_id=message_id,
                        model=request.model,
                        input_tokens=0,
                    )
                    yield ev.content_block_start_text(index=0)
                elif etype == "delta":
                    if not started:
                        raise MidStreamProviderError(
                            "coding stream delta before start",
                            error_type="api_error",
                        )
                    text = event.get("text")
                    if not isinstance(text, str) or not text:
                        continue
                    saw_delta = True
                    yield ev.content_block_delta_text(index=0, text=text)
                elif etype == "done":
                    if not started:
                        raise MidStreamProviderError(
                            "coding stream done before start",
                            error_type="api_error",
                        )
                    if not saw_delta:
                        raise MidStreamProviderError(
                            "coding stream completed with zero text",
                            error_type="api_error",
                        )
                    usage = event.get("usage") or {}
                    if isinstance(usage, dict):
                        input_tokens = int(usage.get("input_tokens") or 0)
                        output_tokens = int(usage.get("output_tokens") or 0)
                    stop_reason = str(event.get("stop_reason") or "end_turn")
                    yield ev.content_block_stop(index=0)
                    yield ev.message_delta(
                        stop_reason=stop_reason, output_tokens=output_tokens
                    )
                    # message_start already sent input_tokens=0; honest policy.
                    _ = input_tokens
                    yield ev.message_stop()
                    return
                elif etype == "error":
                    message = str(event.get("message") or "coding stream error")
                    error_type = str(event.get("error_type") or "api_error")
                    if not started:
                        raise PreStreamProviderError(
                            message, error_type=error_type, status_code=502
                        )
                    yield ev.error_event(error_type=error_type, message=message)
                    return
                else:
                    raise MidStreamProviderError(
                        f"unknown coding stream event type: {etype!r}",
                        error_type="api_error",
                    )
        except MidStreamProviderError:
            raise
        except PreStreamProviderError:
            raise
        except UpstreamHttpError as exc:
            # Raised on first iteration when upstream returns a non-2xx status.
            if not started:
                status = exc.status if 400 <= exc.status < 600 else 502
                raise PreStreamProviderError(
                    exc.message, error_type="api_error", status_code=status
                ) from exc
            yield ev.error_event(error_type="api_error", message=exc.message)
            return
        except UpstreamOfflineError as exc:
            if not started:
                raise PreStreamProviderError(
                    exc.message, error_type="api_error", status_code=502
                ) from exc
            yield ev.error_event(error_type="api_error", message=exc.message)
            return
        except UpstreamTimeoutError as exc:
            if not started:
                raise PreStreamProviderError(
                    exc.message, error_type="api_error", status_code=504
                ) from exc
            yield ev.error_event(error_type="api_error", message=exc.message)
            return
        except UpstreamResponseTooLargeError as exc:
            if not started:
                raise PreStreamProviderError(
                    exc.message, error_type="api_error", status_code=502
                ) from exc
            yield ev.error_event(error_type="api_error", message=exc.message)
            return
        except UpstreamProtocolError as exc:
            if not started:
                raise PreStreamProviderError(
                    exc.message, error_type="api_error", status_code=502
                ) from exc
            yield ev.error_event(error_type="api_error", message=exc.message)
            return

        if not started:
            raise PreStreamProviderError(
                "coding stream ended without events",
                error_type="api_error",
                status_code=502,
            )
        raise MidStreamProviderError(
            "coding stream ended without done event",
            error_type="api_error",
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()
