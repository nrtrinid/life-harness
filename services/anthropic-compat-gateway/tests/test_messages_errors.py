from __future__ import annotations

from tests.conftest import load_fixture, parse_sse


def test_backend_error_pre_stream_http(client) -> None:
    payload = load_fixture("backend_error.json")
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 500
    body = response.json()
    assert body["type"] == "error"
    assert body["error"]["type"] == "api_error"
    assert "pre-stream" in body["error"]["message"]


def test_backend_error_mid_stream_sse_event(client) -> None:
    payload = {
        "model": "acgw-mock-error-mid",
        "max_tokens": 32,
        "messages": [{"role": "user", "content": "fail mid stream"}],
        "stream": True,
    }
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    assert events[0][0] == "message_start"
    assert any(name == "error" for name, _ in events)
    error_payload = next(p for n, p in events if n == "error")
    assert error_payload["type"] == "error"
    assert "mid-stream" in error_payload["error"]["message"]


def test_malformed_tool_provider_failure_is_valid_anthropic_error(client) -> None:
    payload = load_fixture("provider_malformed_tool.json")
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 500
    body = response.json()
    assert body["type"] == "error"
    assert "valid tool output" in body["error"]["message"]


def test_forced_limit_alias(client) -> None:
    payload = {
        "model": "acgw-mock-limit",
        "max_tokens": 16,
        "messages": [{"role": "user", "content": "tiny"}],
    }
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 400
    assert response.json()["type"] == "error"
