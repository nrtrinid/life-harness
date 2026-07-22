from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from app.config import Settings

logger = logging.getLogger("acgw")

_SENSITIVE_KEY_FRAGMENTS = (
    "authorization",
    "api-key",
    "api_key",
    "auth_token",
    "x-api-key",
    "password",
    "secret",
    "credential",
)


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower().replace("_", "-")
    return any(fragment in lowered for fragment in _SENSITIVE_KEY_FRAGMENTS)


def redact(value: Any) -> Any:
    """Redact authorization headers / API keys from nested metadata.

    Never includes credential material in returned structures. Safe for
    metadata-only logging.
    """
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if _is_sensitive_key(str(key)):
                out[str(key)] = "[REDACTED]"
            else:
                out[str(key)] = redact(item)
        return out
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:12]}"


def log_request_meta(
    settings: Settings,
    *,
    request_id: str,
    model: str,
    scenario: str,
    stream: bool,
    input_chars: int,
    message_count: int,
    tool_count: int,
    status: int | str,
    event_types: list[str] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "request_id": request_id,
        "model": model,
        "scenario": scenario,
        "stream": stream,
        "input_chars": input_chars,
        "message_count": message_count,
        "tool_count": tool_count,
        "status": status,
    }
    if event_types is not None:
        payload["event_types"] = event_types
    if extra:
        payload.update(redact(extra))
    if settings.log_bodies:
        payload["bodies_logged"] = True
    logger.info("acgw_request %s", redact(payload))


class Timer:
    def __init__(self) -> None:
        self._start = time.perf_counter()

    def ms(self) -> int:
        return int((time.perf_counter() - self._start) * 1000)
