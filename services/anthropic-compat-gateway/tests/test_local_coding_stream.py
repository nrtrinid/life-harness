from __future__ import annotations

import json

import httpx
import pytest

from app.models import Message, MessagesRequest
from app.providers.base import MidStreamProviderError, PreStreamProviderError
from app.providers.local_coding import LocalCodingProvider
from app.upstream.coding_client import CodingClient
from tests.conftest import make_settings, parse_sse


def _provider_with_handler(handler) -> LocalCodingProvider:
    transport = httpx.MockTransport(handler)
    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=65536,
        transport=transport,
    )
    settings = make_settings(provider="local_coding", enable_local_coding=True)
    return LocalCodingProvider(settings, client=client)


def _sse_bytes(events: list[dict]) -> bytes:
    parts = [f"data: {json.dumps(e, ensure_ascii=False)}\n\n".encode("utf-8") for e in events]
    return b"".join(parts)


def test_stream_events_anthropic_ordering() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/ai/coding/chat/stream"
        body = _sse_bytes(
            [
                {"type": "start", "id": "coding_1", "model_alias": "coding_fast"},
                {"type": "delta", "text": "Hello"},
                {"type": "delta", "text": " world"},
                {
                    "type": "done",
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            ]
        )
        return httpx.Response(
            200,
            content=body,
            headers={"content-type": "text/event-stream"},
        )

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=32,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    events = list(provider.stream_events(req, scenario="local"))
    provider.close()
    names = [name for name, _ in events]
    assert names == [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
    ]
    deltas = [p["delta"]["text"] for n, p in events if n == "content_block_delta"]
    assert deltas == ["Hello", " world"]


def test_zero_text_done_fails() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = _sse_bytes(
            [
                {"type": "start", "id": "coding_1", "model_alias": "coding_fast"},
                {
                    "type": "done",
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            ]
        )
        return httpx.Response(
            200, content=body, headers={"content-type": "text/event-stream"}
        )

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    with pytest.raises(MidStreamProviderError, match="zero text"):
        list(provider.stream_events(req, scenario="local"))
    provider.close()


def test_unknown_event_fails() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = _sse_bytes(
            [
                {"type": "start", "id": "coding_1", "model_alias": "coding_fast"},
                {"type": "surprise", "x": 1},
            ]
        )
        return httpx.Response(
            200, content=body, headers={"content-type": "text/event-stream"}
        )

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    with pytest.raises(MidStreamProviderError, match="unknown"):
        list(provider.stream_events(req, scenario="local"))
    provider.close()


def test_pre_stream_http_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="down")

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    with pytest.raises(PreStreamProviderError) as exc:
        list(provider.stream_events(req, scenario="local"))
    assert exc.value.status_code == 503
    provider.close()


def test_mid_stream_error_event() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = _sse_bytes(
            [
                {"type": "start", "id": "coding_1", "model_alias": "coding_fast"},
                {"type": "delta", "text": "partial"},
                {
                    "type": "error",
                    "error_type": "api_error",
                    "message": "boom",
                },
            ]
        )
        return httpx.Response(
            200, content=body, headers={"content-type": "text/event-stream"}
        )

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    events = list(provider.stream_events(req, scenario="local"))
    provider.close()
    assert events[-1][0] == "error"
    assert events[-1][1]["error"]["message"] == "boom"


def test_no_raw_lab_path_on_stream() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        body = _sse_bytes(
            [
                {"type": "start", "id": "coding_1", "model_alias": "coding_fast"},
                {"type": "delta", "text": "x"},
                {
                    "type": "done",
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            ]
        )
        return httpx.Response(
            200, content=body, headers={"content-type": "text/event-stream"}
        )

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    list(provider.stream_events(req, scenario="local"))
    provider.close()
    assert seen == ["/ai/coding/chat/stream"]
