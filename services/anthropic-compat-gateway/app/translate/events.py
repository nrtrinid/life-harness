from __future__ import annotations

import json
from typing import Any, Iterator


def format_sse(event: str, data: dict[str, Any]) -> str:
    """Exact Anthropic SSE wire framing for one event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def iter_sse_bytes(events: Iterator[tuple[str, dict[str, Any]]]) -> Iterator[bytes]:
    for event_name, payload in events:
        yield format_sse(event_name, payload).encode("utf-8")


def message_start_event(
    *,
    message_id: str,
    model: str,
    input_tokens: int = 0,
) -> tuple[str, dict[str, Any]]:
    return (
        "message_start",
        {
            "type": "message_start",
            "message": {
                "id": message_id,
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": model,
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": input_tokens, "output_tokens": 0},
            },
        },
    )


def content_block_start_text(*, index: int = 0) -> tuple[str, dict[str, Any]]:
    return (
        "content_block_start",
        {
            "type": "content_block_start",
            "index": index,
            "content_block": {"type": "text", "text": ""},
        },
    )


def content_block_start_tool_use(
    *,
    index: int,
    tool_id: str,
    name: str,
) -> tuple[str, dict[str, Any]]:
    return (
        "content_block_start",
        {
            "type": "content_block_start",
            "index": index,
            "content_block": {
                "type": "tool_use",
                "id": tool_id,
                "name": name,
                "input": {},
            },
        },
    )


def content_block_delta_text(*, index: int, text: str) -> tuple[str, dict[str, Any]]:
    return (
        "content_block_delta",
        {
            "type": "content_block_delta",
            "index": index,
            "delta": {"type": "text_delta", "text": text},
        },
    )


def content_block_delta_input_json(*, index: int, partial_json: str) -> tuple[str, dict[str, Any]]:
    return (
        "content_block_delta",
        {
            "type": "content_block_delta",
            "index": index,
            "delta": {"type": "input_json_delta", "partial_json": partial_json},
        },
    )


def content_block_stop(*, index: int = 0) -> tuple[str, dict[str, Any]]:
    return ("content_block_stop", {"type": "content_block_stop", "index": index})


def message_delta(
    *,
    stop_reason: str,
    output_tokens: int,
) -> tuple[str, dict[str, Any]]:
    return (
        "message_delta",
        {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": {"output_tokens": output_tokens},
        },
    )


def message_stop() -> tuple[str, dict[str, Any]]:
    return ("message_stop", {"type": "message_stop"})


def error_event(*, error_type: str, message: str) -> tuple[str, dict[str, Any]]:
    return (
        "error",
        {
            "type": "error",
            "error": {"type": error_type, "message": message},
        },
    )


def chunk_text(text: str, *, chunk_size: int = 12) -> list[str]:
    if not text:
        return [""]
    chunks = [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]
    if len(chunks) == 1 and len(text) > 1:
        mid = max(1, len(text) // 2)
        return [text[:mid], text[mid:]]
    return chunks
