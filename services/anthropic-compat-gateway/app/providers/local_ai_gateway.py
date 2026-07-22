"""Experimental Raw Lab connectivity provider for local-model diagnostics.

Slice 2A bridge: Anthropic Messages → loopback ai-gateway ``POST /raw-lab``.

This is **not** the permanent Claude Code coding provider. It does not preserve
complete Anthropic coding semantics, does not support structured tool loops, and
is not the planned true-streaming path. A dedicated coding lane will supersede
it for Claude Code use. Keep this provider for diagnostics; do not delete it.

Translation mapping (Anthropic Messages → Raw Lab ``POST /raw-lab``):

- ``system``: **prompt translation**, not native system-role preservation. If str,
  prepend to the final user message as ``System:\\n{system}\\n\\n{user}``. If a
  list of dicts with ``text``, join those text parts the same way. System is
  **not** sent as a separate Raw Lab field.
- ``messages[:-1]`` → ``recent_turns`` (role + plain text only; text blocks flattened).
- ``messages[-1]`` user content → ``message`` (after optional system prepend).
- ``thread_state``: always ``{}``.
- ``companion_self_memories``: always ``[]``.
- ``reasoning_depth``: always ``\"fast\"``.

Generation / transport fields (accepted for protocol compatibility; **not**
forwarded; do **not** claim they influence Raw Lab generation):

- ``max_tokens``, ``temperature``, ``top_p``: accepted; Raw Lab applies its own
  server-side generation policy.
- ``metadata``: transport-only; never placed in model-visible text or the
  upstream Raw Lab body.

``tool_choice`` policy (never forwarded to Raw Lab):

- Non-empty ``tools`` list → reject.
- ``tool_use`` / ``tool_result`` content blocks → reject.
- Explicit **non-default** ``tool_choice`` → reject.
- Omitted or semantically empty/default ``tool_choice`` (``None``, ``{}``,
  ``\"auto\"``, or ``{\"type\": \"auto\"}``) with no tools → accept.

Rejected (Slice 2A): ``stream: true``, non-empty ``tools``, non-default
``tool_choice``, tool content blocks, non-empty ``stop_sequences``.

Usage: honest zero policy — ``input_tokens=0``, ``output_tokens=0`` (token counts
unavailable from Raw Lab in this slice).
"""

from __future__ import annotations

import uuid
from typing import Any, Iterator

from app.config import Settings
from app.models import ContentBlock, MessagesRequest, MessagesResponse, Usage
from app.providers.base import MockPlan, PreStreamProviderError
from app.upstream.raw_lab_client import (
    RawLabClient,
    RawLabRequestBody,
    RawLabTurn,
    UpstreamEmptyAnswerError,
    UpstreamHttpError,
    UpstreamOfflineError,
    UpstreamProtocolError,
    UpstreamResponseTooLargeError,
    UpstreamTimeoutError,
)

# Fixed client-facing alias that maps to the configured local model path.
HARDCODED_MODEL_ALIAS = "acgw-local-qwen"

_STREAM_REJECT_MSG = (
    "Streaming is not enabled for local_ai_gateway in Slice 2A "
    "(set stream=false; /raw-lab/stream consumption is Slice 2B)"
)


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
    """True when tool_choice is omitted or Anthropic's default ``auto`` form.

    Explicit non-default values (``any``, ``tool``, ``none``, unknown shapes)
    must be rejected so clients cannot believe tool configuration was honored.
    """
    if tool_choice is None:
        return True
    if isinstance(tool_choice, str):
        return tool_choice.strip().lower() in ("", "auto")
    if isinstance(tool_choice, dict):
        if not tool_choice:
            return True
        # Default Anthropic shape: {"type": "auto"} (no extra keys).
        keys = set(tool_choice.keys())
        if keys <= {"type"} and tool_choice.get("type") == "auto":
            return True
        return False
    return False


def translate_messages_to_raw_lab(request: MessagesRequest) -> RawLabRequestBody:
    """Pure translation helper (also used by unit tests)."""
    if not request.messages:
        raise PreStreamProviderError(
            "messages must be non-empty",
            error_type="invalid_request_error",
            status_code=400,
        )

    recent: list[RawLabTurn] = []
    for msg in request.messages[:-1]:
        recent.append(
            RawLabTurn(role=msg.role, content=_flatten_text_content(msg.content))
        )

    last = request.messages[-1]
    user_text = _flatten_text_content(last.content)
    system = _system_text(request.system)
    if system:
        message = f"System:\n{system}\n\n{user_text}"
    else:
        message = user_text

    return RawLabRequestBody(
        message=message,
        recent_turns=recent,
        thread_state={},
        companion_self_memories=[],
        reasoning_depth="fast",
    )


class LocalAiGatewayProvider:
    """Experimental Raw Lab connectivity provider for local-model diagnostics."""

    name = "local_ai_gateway"

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        base_url: str | None = None,
        client: RawLabClient | None = None,
        model_alias: str | None = None,
    ) -> None:
        if client is not None:
            self._client = client
            self._owns_client = False
        else:
            if settings is None:
                raise ValueError("settings or client is required")
            resolved_base = base_url or settings.local_ai_gateway_base_url
            self._client = RawLabClient(
                base_url=resolved_base,
                timeout=settings.local_ai_gateway_timeout_seconds,
                connect_timeout=settings.local_ai_gateway_connect_timeout_seconds,
                max_response_bytes=settings.local_ai_gateway_max_response_bytes,
            )
            self._owns_client = True

        configured = (
            model_alias
            if model_alias is not None
            else (
                settings.local_ai_gateway_model_alias
                if settings is not None
                else "local-qwen"
            )
        )
        self._configured_alias = configured
        self._allowed_models = frozenset({configured, HARDCODED_MODEL_ALIAS})

    def _validate_model(self, model: str) -> None:
        if model not in self._allowed_models:
            raise PreStreamProviderError(
                f"Unsupported model for local_ai_gateway: {model!r}; "
                f"allowed: {sorted(self._allowed_models)}",
                error_type="invalid_request_error",
                status_code=400,
            )

    def plan(self, request: MessagesRequest, *, scenario: str) -> MockPlan:
        _ = scenario
        if request.stream:
            raise PreStreamProviderError(
                _STREAM_REJECT_MSG,
                error_type="invalid_request_error",
                status_code=400,
            )

        if request.tools:
            raise PreStreamProviderError(
                "local_ai_gateway Slice 2A does not support tools",
                error_type="invalid_request_error",
                status_code=400,
            )
        if not _is_default_tool_choice(request.tool_choice):
            raise PreStreamProviderError(
                "local_ai_gateway Slice 2A rejects explicit non-default "
                "tool_choice (omit or use default auto; tools are not supported)",
                error_type="invalid_request_error",
                status_code=400,
            )

        for msg in request.messages:
            if _content_has_tools(msg.content):
                raise PreStreamProviderError(
                    "local_ai_gateway Slice 2A rejects tool_use/tool_result content",
                    error_type="invalid_request_error",
                    status_code=400,
                )

        if request.stop_sequences:
            raise PreStreamProviderError(
                "local_ai_gateway Slice 2A rejects non-empty stop_sequences "
                "(would be silently ignored)",
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
                "last message must have role=user for local_ai_gateway",
                error_type="invalid_request_error",
                status_code=400,
            )

        # text filled in complete() after Raw Lab call
        return MockPlan(kind="text", text=None, stop_reason="end_turn")

    def complete(self, request: MessagesRequest, *, scenario: str) -> MessagesResponse:
        self.plan(request, scenario=scenario)
        body = translate_messages_to_raw_lab(request)
        try:
            upstream = self._client.post_raw_lab(body)
        except UpstreamOfflineError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=502
            ) from exc
        except UpstreamTimeoutError as exc:
            raise PreStreamProviderError(
                exc.message, error_type="api_error", status_code=504
            ) from exc
        except UpstreamHttpError as exc:
            # Surface upstream status when client-ish; otherwise Bad Gateway.
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

        return MessagesResponse(
            id=_new_message_id(),
            content=[{"type": "text", "text": upstream.answer}],
            model=request.model,
            stop_reason="end_turn",
            usage=Usage(input_tokens=0, output_tokens=0),
        )

    def stream_events(
        self, request: MessagesRequest, *, scenario: str
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        _ = request
        _ = scenario
        raise PreStreamProviderError(
            _STREAM_REJECT_MSG,
            error_type="invalid_request_error",
            status_code=400,
        )
        yield  # pragma: no cover — makes this a generator for the Protocol

    def close(self) -> None:
        if self._owns_client:
            self._client.close()
