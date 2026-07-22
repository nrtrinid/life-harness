"""LocalCodingProvider — Anthropic Messages → ai-gateway ``POST /ai/coding/chat``.

Dedicated coding lane (not Raw Lab). Supports structured tools via fake upstream
in C1; does not execute tools or fall back to mock/cloud/Raw Lab.
"""

from __future__ import annotations

import uuid
from typing import Any, Iterator

from app.config import Settings
from app.models import MessagesRequest, MessagesResponse, Usage
from app.providers.base import MockPlan, MidStreamProviderError, PreStreamProviderError
from app.translate.coding_tools import (
    anthropic_content_from_upstream,
    translate_messages_to_coding,
)
from app.upstream.coding_client import CodingClient
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


def _new_message_id() -> str:
    return f"msg_{uuid.uuid4().hex[:20]}"


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

        if request.stream and request.tools:
            raise PreStreamProviderError(
                "local_coding tool streaming is deferred to Coding Slice C3; "
                "use non-streaming requests for tools",
                error_type="invalid_request_error",
                status_code=400,
            )

        # Validate translation (tool_choice, structured content) early.
        translate_messages_to_coding(request)

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
        stop_reason = upstream.stop_reason
        if stop_reason not in ("end_turn", "tool_use", "max_tokens"):
            stop_reason = "end_turn"
        return MessagesResponse(
            id=_new_message_id(),
            content=anthropic_content_from_upstream(upstream.content),
            model=request.model,
            stop_reason=stop_reason,
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
                        output_tokens = int(usage.get("output_tokens") or 0)
                    stop_reason = str(event.get("stop_reason") or "end_turn")
                    yield ev.content_block_stop(index=0)
                    yield ev.message_delta(
                        stop_reason=stop_reason, output_tokens=output_tokens
                    )
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
