from __future__ import annotations

import json

import httpx
import pytest

from app.models import Message, MessagesRequest
from app.providers.base import PreStreamProviderError
from app.providers.local_ai_gateway import LocalAiGatewayProvider
from app.upstream.raw_lab_client import (
    RawLabClient,
    RawLabRequestBody,
    UpstreamEmptyAnswerError,
    UpstreamHttpError,
    UpstreamOfflineError,
    UpstreamProtocolError,
    UpstreamResponseTooLargeError,
    UpstreamTimeoutError,
)
from tests.conftest import make_settings


def _provider_with_handler(handler) -> LocalAiGatewayProvider:
    transport = httpx.MockTransport(handler)
    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=transport,
    )
    settings = make_settings(
        provider="local_ai_gateway",
        enable_local_ai_gateway=True,
    )
    return LocalAiGatewayProvider(settings, client=client)


def _text_request(model: str = "local-qwen") -> MessagesRequest:
    return MessagesRequest(
        model=model,
        max_tokens=32,
        messages=[Message(role="user", content="ping")],
    )


def test_success_maps_answer_and_zero_usage() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/raw-lab"
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["message"] == "ping"
        assert payload["reasoning_depth"] == "fast"
        return httpx.Response(
            200,
            json={
                "answer": "pong from raw lab",
                "mode": "raw_lab",
                "safety_notes": [],
                "used_context": False,
                "extra_ignored": True,
            },
        )

    provider = _provider_with_handler(handler)
    try:
        response = provider.complete(_text_request(), scenario="local")
    finally:
        provider.close()

    assert response.content[0]["text"] == "pong from raw lab"
    assert response.model == "local-qwen"
    assert response.stop_reason == "end_turn"
    assert response.usage.input_tokens == 0
    assert response.usage.output_tokens == 0
    assert response.id.startswith("msg_")


def test_acgw_local_qwen_alias_accepted() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"answer": "ok"})

    provider = _provider_with_handler(handler)
    try:
        response = provider.complete(
            _text_request(model="acgw-local-qwen"), scenario="local"
        )
    finally:
        provider.close()
    assert response.model == "acgw-local-qwen"
    assert response.content[0]["text"] == "ok"


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
        return httpx.Response(200, json={"answer": "   "})

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamEmptyAnswerError):
        client.post_raw_lab(RawLabRequestBody(message="x"))
    client.close()


def test_invalid_json_protocol_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=b"not-json", headers={"content-type": "text/plain"}
        )

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamProtocolError):
        client.post_raw_lab(RawLabRequestBody(message="x"))
    client.close()


def test_content_length_too_large() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b'{"answer":"tiny"}',
            headers={"content-length": "99999", "content-type": "application/json"},
        )

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=100,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamResponseTooLargeError):
        client.post_raw_lab(RawLabRequestBody(message="x"))
    client.close()


def test_streamed_body_too_large() -> None:
    big = b'{"answer":"' + (b"a" * 200) + b'"}'

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=big)

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=50,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamResponseTooLargeError):
        client.post_raw_lab(RawLabRequestBody(message="x"))
    client.close()


def test_connect_error_maps_offline() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamOfflineError):
        client.post_raw_lab(RawLabRequestBody(message="x"))
    client.close()


def test_timeout_maps() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamTimeoutError):
        client.post_raw_lab(RawLabRequestBody(message="x"))
    client.close()


def test_http_error_carries_status() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(418, text="teapot")

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=1024,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(UpstreamHttpError) as excinfo:
        client.post_raw_lab(RawLabRequestBody(message="x"))
    assert excinfo.value.status == 418
    client.close()


def test_unknown_model_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"answer": "nope"})

    provider = _provider_with_handler(handler)
    try:
        with pytest.raises(PreStreamProviderError, match="Unsupported model"):
            provider.plan(_text_request(model="gpt-4"), scenario="local")
    finally:
        provider.close()
