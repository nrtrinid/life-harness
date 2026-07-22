from __future__ import annotations

import json

import httpx
import pytest

from app.models import Message, MessagesRequest
from app.providers.base import PreStreamProviderError
from app.providers.local_coding import LocalCodingProvider, UPSTREAM_MODEL_ALIAS
from app.upstream.coding_client import CodingClient, CodingRequestBody
from app.upstream.errors import (
    UpstreamEmptyAnswerError,
    UpstreamProtocolError,
    UpstreamResponseTooLargeError,
)
from tests.conftest import make_settings


def _provider_with_handler(handler) -> LocalCodingProvider:
    transport = httpx.MockTransport(handler)
    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=transport,
    )
    settings = make_settings(provider="local_coding", enable_local_coding=True)
    return LocalCodingProvider(settings, client=client)


def _text_request(model: str = "local-qwen-coding") -> MessagesRequest:
    return MessagesRequest(
        model=model,
        max_tokens=32,
        system="Be brief.",
        messages=[
            Message(role="user", content="one"),
            Message(role="assistant", content="two"),
            Message(role="user", content="three"),
        ],
    )


def test_success_maps_answer_and_usage() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/ai/coding/chat"
        assert "/raw-lab" not in str(request.url)
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["model_alias"] == UPSTREAM_MODEL_ALIAS
        assert payload["system"] == "Be brief."
        assert [m["role"] for m in payload["messages"]] == [
            "user",
            "assistant",
            "user",
        ]
        assert "recent_turns" not in payload
        assert "companion_self_memories" not in payload
        return httpx.Response(
            200,
            json={
                "id": "coding_abc",
                "model_alias": "coding_fast",
                "content": [{"type": "text", "text": "pong from coding"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    provider = _provider_with_handler(handler)
    try:
        response = provider.complete(_text_request(), scenario="local")
    finally:
        provider.close()

    assert response.content[0]["text"] == "pong from coding"
    assert response.model == "local-qwen-coding"
    assert response.usage.input_tokens == 0
    assert response.usage.output_tokens == 0
    assert response.id.startswith("msg_")


def test_acgw_local_coding_alias_accepted() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "id": "coding_1",
                "model_alias": "coding_fast",
                "content": [{"type": "text", "text": "ok"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    provider = _provider_with_handler(handler)
    try:
        response = provider.complete(
            _text_request(model="acgw-local-coding"), scenario="local"
        )
    finally:
        provider.close()
    assert response.model == "acgw-local-coding"


def test_http_error_status_mapped() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="unavailable")

    provider = _provider_with_handler(handler)
    try:
        with pytest.raises(PreStreamProviderError) as excinfo:
            provider.complete(_text_request(), scenario="local")
    finally:
        provider.close()
    assert excinfo.value.status_code == 503


def test_empty_answer_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "id": "coding_1",
                "model_alias": "coding_fast",
                "content": [{"type": "text", "text": "   "}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamEmptyAnswerError):
        client.post_coding_chat(
            CodingRequestBody(
                model_alias="coding_fast",
                messages=[{"role": "user", "content": "x"}],
            )
        )
    client.close()


def test_invalid_json_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not-json")

    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamProtocolError):
        client.post_coding_chat(
            CodingRequestBody(
                model_alias="coding_fast",
                messages=[{"role": "user", "content": "x"}],
            )
        )
    client.close()


def test_oversized_response_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * 2048)

    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=64,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamResponseTooLargeError):
        client.post_coding_chat(
            CodingRequestBody(
                model_alias="coding_fast",
                messages=[{"role": "user", "content": "x"}],
            )
        )
    client.close()


def test_offline_maps_to_502() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    provider = _provider_with_handler(handler)
    try:
        with pytest.raises(PreStreamProviderError) as excinfo:
            provider.complete(_text_request(), scenario="local")
    finally:
        provider.close()
    assert excinfo.value.status_code == 502
    assert "offline" in excinfo.value.message.lower()


def test_timeout_maps_to_504() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    provider = _provider_with_handler(handler)
    try:
        with pytest.raises(PreStreamProviderError) as excinfo:
            provider.complete(_text_request(), scenario="local")
    finally:
        provider.close()
    assert excinfo.value.status_code == 504


def test_no_raw_lab_path_used() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(
            200,
            json={
                "id": "coding_1",
                "model_alias": "coding_fast",
                "content": [{"type": "text", "text": "ok"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    provider = _provider_with_handler(handler)
    try:
        provider.complete(_text_request(), scenario="local")
    finally:
        provider.close()
    assert seen == ["/ai/coding/chat"]
