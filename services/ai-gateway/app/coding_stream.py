"""Coding Slice B — typed SSE streaming for POST /ai/coding/chat/stream."""

from __future__ import annotations

import json
import logging
import threading
import uuid
from collections.abc import Iterator
from typing import Any, Protocol

from app.coding_chat import (
    build_coding_history,
    resolve_coding_generation,
    validate_coding_request,
)
from app.coding_models import CodingChatRequest, CodingUsage
from app.config import Settings, get_settings
from app.providers.base import ProviderInputError, ProviderNotReadyError, sanitize_raw_lab_text
from app.slots.manager import get_slot_manager

logger = logging.getLogger(__name__)


def _new_response_id() -> str:
    return f"coding_{uuid.uuid4().hex[:20]}"


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


class CodingStreamCapableProvider(Protocol):
    name: str

    def coding_chat_stream(self, request: CodingChatRequest) -> Iterator[str]: ...


def iter_coding_chat_sse(
    request: CodingChatRequest,
    *,
    provider: CodingStreamCapableProvider,
) -> Iterator[str]:
    validate_coding_request(request)
    logger.info(
        "coding_chat_stream provider=%s model_alias=%s message_count=%d",
        provider.name,
        request.model_alias,
        len(request.messages),
    )
    yield from provider.coding_chat_stream(request)


def coding_chat_stream_with_backend(
    request: CodingChatRequest,
    *,
    settings: Settings | None = None,
    backend: Any | None = None,
    cancel_event: threading.Event | None = None,
) -> Iterator[str]:
    """Produce SSE event strings from ``generate_chat_iter``."""
    resolved = settings or get_settings()
    validate_coding_request(request)
    cancel_event = cancel_event or threading.Event()

    slot_manager = get_slot_manager()
    acquired = slot_manager.acquire("coding_fast")
    if backend is None:
        if acquired.backend is None:
            raise ProviderNotReadyError(
                "coding_fast backend unavailable (mock path should use MockProvider)"
            )
        backend = acquired.backend

    companion = slot_manager.acquire("companion_fast")
    if (
        acquired.backend is not None
        and companion.backend is not None
        and acquired.backend is not companion.backend
    ):
        raise ProviderNotReadyError(
            "coding_fast must share the companion_fast OpenVINO backend instance"
        )

    if not hasattr(backend, "generate_chat_iter"):
        raise ProviderNotReadyError("backend does not support generate_chat_iter")

    supports_top_p = bool(
        getattr(backend, "supports_generation_top_p", lambda: False)()
    )
    overrides = resolve_coding_generation(
        request,
        settings=resolved,
        config_supports_top_p=supports_top_p,
    )
    system, history, message = build_coding_history(request)
    response_id = _new_response_id()

    yield _sse(
        {
            "type": "start",
            "id": response_id,
            "model_alias": request.model_alias,
        }
    )

    parts: list[str] = []
    cancelled = False
    try:
        for fragment in backend.generate_chat_iter(
            system=system,
            history=history,
            message=message,
            generation_overrides=overrides,
            cancel_event=cancel_event,
        ):
            if cancel_event.is_set():
                cancelled = True
                break
            text = str(fragment or "")
            if not text:
                continue
            parts.append(text)
            yield _sse({"type": "delta", "text": text})
    except GeneratorExit:
        # Client disconnect / generator close — do not emit a successful done.
        cancel_event.set()
        raise
    except ProviderNotReadyError as exc:
        yield _sse(
            {
                "type": "error",
                "error_type": "api_error",
                "message": exc.message,
            }
        )
        return
    except Exception as exc:  # noqa: BLE001 — typed stream error, no traceback
        # Do not catch BaseException (CancelledError, GeneratorExit).
        logger.warning("coding_stream_worker_error type=%s", type(exc).__name__)
        yield _sse(
            {
                "type": "error",
                "error_type": "api_error",
                "message": "coding stream failed",
            }
        )
        return

    if cancelled or cancel_event.is_set():
        yield _sse(
            {
                "type": "error",
                "error_type": "api_error",
                "message": "coding stream cancelled",
            }
        )
        return

    joined = sanitize_raw_lab_text("".join(parts))
    if not joined.strip():
        yield _sse(
            {
                "type": "error",
                "error_type": "api_error",
                "message": "coding model returned empty output",
            }
        )
        return

    usage = CodingUsage(input_tokens=0, output_tokens=0)
    yield _sse(
        {
            "type": "done",
            "stop_reason": "end_turn",
            "usage": usage.model_dump(),
        }
    )
