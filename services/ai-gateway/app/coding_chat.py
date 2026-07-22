"""Dedicated coding chat runner — no Raw Lab / Harness finalize or memory."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Protocol

from app.coding_models import (
    CodingChatRequest,
    CodingChatResponse,
    CodingTextBlock,
    CodingUsage,
)
from app.config import Settings, get_settings
from app.models import ChatRole, ConversationTurn
from app.prompt_loader import build_coding_system_prompt
from app.providers.base import ProviderInputError, ProviderNotReadyError, sanitize_raw_lab_text
from app.slots.manager import get_slot_manager

logger = logging.getLogger(__name__)

CODING_MODEL_ALIASES = frozenset({"coding_fast", "local-qwen-coding"})

# Generation bounds (Coding Slice A).
CODING_MAX_NEW_TOKENS_CAP = 2048
CODING_MAX_NEW_TOKENS_MIN = 1
CODING_TEMPERATURE_MIN = 0.0
CODING_TEMPERATURE_MAX = 2.0
CODING_DEFAULT_TEMPERATURE = 0.2
CODING_TOP_P_MIN = 0.0
CODING_TOP_P_MAX = 1.0


class CodingCapableProvider(Protocol):
    name: str

    def coding_chat(self, request: CodingChatRequest) -> CodingChatResponse: ...


def _new_response_id() -> str:
    return f"coding_{uuid.uuid4().hex[:20]}"


def validate_coding_request(request: CodingChatRequest) -> None:
    if request.model_alias not in CODING_MODEL_ALIASES:
        raise ProviderInputError(
            f"Unsupported model_alias {request.model_alias!r}; "
            f"allowed: {sorted(CODING_MODEL_ALIASES)}"
        )

    if not request.messages:
        raise ProviderInputError("messages must be non-empty")

    last = request.messages[-1]
    if last.role != "user":
        raise ProviderInputError("last message must have role=user")

    prev_role: str | None = None
    for msg in request.messages:
        if prev_role == msg.role:
            raise ProviderInputError(
                f"invalid message ordering: consecutive {msg.role!r} roles"
            )
        prev_role = msg.role

    if request.max_tokens is not None:
        if request.max_tokens < CODING_MAX_NEW_TOKENS_MIN:
            raise ProviderInputError(
                f"max_tokens must be >= {CODING_MAX_NEW_TOKENS_MIN}"
            )
        if request.max_tokens > CODING_MAX_NEW_TOKENS_CAP:
            raise ProviderInputError(
                f"max_tokens exceeds server maximum {CODING_MAX_NEW_TOKENS_CAP}"
            )

    if request.temperature is not None and not (
        CODING_TEMPERATURE_MIN <= request.temperature <= CODING_TEMPERATURE_MAX
    ):
        raise ProviderInputError(
            f"temperature must be in [{CODING_TEMPERATURE_MIN}, {CODING_TEMPERATURE_MAX}]"
        )

    if request.top_p is not None and not (
        CODING_TOP_P_MIN <= request.top_p <= CODING_TOP_P_MAX
    ):
        raise ProviderInputError(
            f"top_p must be in [{CODING_TOP_P_MIN}, {CODING_TOP_P_MAX}]"
        )

    # Metadata is transport-only; never inspect into prompts.
    _ = request.metadata


def flatten_coding_text(content: str | list[CodingTextBlock]) -> str:
    if isinstance(content, str):
        return content
    return "".join(block.text for block in content)


def build_coding_history(
    request: CodingChatRequest,
) -> tuple[str, list[ConversationTurn], str]:
    """Return (system, prior_turns, latest_user_message)."""
    coding_shell = build_coding_system_prompt()
    caller_system = (request.system or "").strip()
    if caller_system:
        system = f"{coding_shell}\n\n# Caller system instructions\n{caller_system}"
    else:
        system = coding_shell

    prior = request.messages[:-1]
    history = [
        ConversationTurn(
            role=ChatRole(msg.role),
            content=flatten_coding_text(msg.content),
        )
        for msg in prior
    ]
    latest = flatten_coding_text(request.messages[-1].content)
    return system, history, latest


def resolve_coding_generation(
    request: CodingChatRequest,
    *,
    settings: Settings,
    config_supports_top_p: bool,
) -> dict[str, Any]:
    """Map request generation fields to backend overrides.

    ``top_p`` is applied only when the GenerationConfig supports it; otherwise
    any non-default request value is rejected.
    """
    max_new_tokens = (
        request.max_tokens
        if request.max_tokens is not None
        else min(settings.max_new_tokens, CODING_MAX_NEW_TOKENS_CAP)
    )
    max_new_tokens = max(
        CODING_MAX_NEW_TOKENS_MIN,
        min(max_new_tokens, CODING_MAX_NEW_TOKENS_CAP),
    )

    temperature = (
        request.temperature
        if request.temperature is not None
        else CODING_DEFAULT_TEMPERATURE
    )

    overrides: dict[str, Any] = {
        "max_new_tokens": max_new_tokens,
        "temperature": temperature,
    }

    if request.top_p is not None:
        # Treat omitted as unset; explicit values require backend support.
        if not config_supports_top_p:
            raise ProviderInputError(
                "top_p is not supported by the current OpenVINO GenerationConfig"
            )
        overrides["top_p"] = request.top_p

    return overrides


def run_coding_chat(
    request: CodingChatRequest,
    *,
    provider: CodingCapableProvider,
) -> CodingChatResponse:
    validate_coding_request(request)
    logger.info(
        "coding_chat provider=%s model_alias=%s message_count=%d system_len=%d",
        provider.name,
        request.model_alias,
        len(request.messages),
        len(request.system or ""),
    )
    return provider.coding_chat(request)


def coding_chat_with_backend(
    request: CodingChatRequest,
    *,
    settings: Settings | None = None,
    backend: Any | None = None,
) -> CodingChatResponse:
    """Shared OpenVINO/mock path used by providers."""
    resolved = settings or get_settings()
    validate_coding_request(request)

    slot_manager = get_slot_manager()
    acquired = slot_manager.acquire("coding_fast")
    if backend is None:
        if acquired.backend is None:
            raise ProviderNotReadyError(
                "coding_fast backend unavailable (mock path should use MockProvider)"
            )
        backend = acquired.backend

    # Structural guarantee: same physical pipeline as companion_fast.
    companion = slot_manager.acquire("companion_fast")
    if (
        acquired.backend is not None
        and companion.backend is not None
        and acquired.backend is not companion.backend
    ):
        raise ProviderNotReadyError(
            "coding_fast must share the companion_fast OpenVINO backend instance"
        )

    system, history, message = build_coding_history(request)

    supports_top_p = bool(
        getattr(backend, "supports_generation_top_p", lambda: False)()
    )
    overrides = resolve_coding_generation(
        request,
        settings=resolved,
        config_supports_top_p=supports_top_p,
    )

    generate = getattr(backend, "generate_chat", None)
    if generate is None:
        raise ProviderNotReadyError("backend does not support generate_chat")

    try:
        raw = generate(
            system=system,
            history=history,
            message=message,
            generation_overrides=overrides,
        )
    except TypeError:
        # Backends that do not yet accept overrides (should not happen post-Slice A).
        raw = generate(system=system, history=history, message=message)

    text = sanitize_raw_lab_text(str(raw or ""))
    if not text.strip():
        raise ProviderNotReadyError("coding model returned empty output")

    return CodingChatResponse(
        id=_new_response_id(),
        model_alias=request.model_alias,
        content=[CodingTextBlock(type="text", text=text)],
        stop_reason="end_turn",
        usage=CodingUsage(input_tokens=0, output_tokens=0),
    )
