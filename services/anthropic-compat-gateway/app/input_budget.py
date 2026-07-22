from __future__ import annotations

import json
from typing import Any

from app.models import MessagesRequest


def _system_to_serializable(system: str | list[dict[str, Any]] | None) -> Any:
    if system is None:
        return None
    return system


def serialize_input_for_budget(request: MessagesRequest) -> str:
    """Deterministic JSON serialization used for ACGW_MAX_INPUT_CHARS.

    Character count = len(serialize_input_for_budget(request)).

    Includes: system, messages (including tool_result content), and tools
    (including each tool's input_schema). Uses sorted keys and compact separators.
    """
    payload: dict[str, Any] = {
        "system": _system_to_serializable(request.system),
        "messages": [m.model_dump(mode="json") for m in request.messages],
        "tools": (
            [t.model_dump(mode="json", by_alias=True) for t in request.tools]
            if request.tools
            else None
        ),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def input_char_count(request: MessagesRequest) -> int:
    return len(serialize_input_for_budget(request))
