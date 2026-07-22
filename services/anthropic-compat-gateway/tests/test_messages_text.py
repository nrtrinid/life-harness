from __future__ import annotations

from tests.conftest import load_fixture


def test_plain_text_messages(client) -> None:
    payload = load_fixture("plain_text.json")
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "message"
    assert body["role"] == "assistant"
    assert body["stop_reason"] == "end_turn"
    assert body["content"][0]["type"] == "text"
    assert "Mock assistant reply" in body["content"][0]["text"]
    assert "nonce=ACGW_MOCK_NONCE_7f3a91c2" in body["content"][0]["text"]
    assert "usage" in body
    assert body["usage"]["output_tokens"] >= 1


def test_beta_query_accepted(client) -> None:
    payload = load_fixture("plain_text.json")
    response = client.post("/v1/messages?beta=true", json=payload)
    assert response.status_code == 200
    assert response.json()["type"] == "message"


def test_unknown_request_fields_tolerated(client) -> None:
    payload = load_fixture("plain_text.json")
    payload["thinking"] = {"type": "adaptive"}
    payload["metadata"] = {"user_id": "dev"}
    payload["extra_claude_field"] = {"nested": True}
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    assert response.json()["type"] == "message"


def test_invalid_role_rejected(client) -> None:
    response = client.post(
        "/v1/messages",
        json={
            "model": "acgw-mock-text",
            "max_tokens": 16,
            "messages": [{"role": "system", "content": "nope"}],
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "error"
    assert body["error"]["type"] == "invalid_request_error"


def test_invalid_content_block_rejected(client) -> None:
    response = client.post(
        "/v1/messages",
        json={
            "model": "acgw-mock-text",
            "max_tokens": 16,
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "image", "source": {"type": "base64"}}],
                }
            ],
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "error"
    assert body["error"]["type"] == "invalid_request_error"


def test_missing_text_field_rejected(client) -> None:
    response = client.post(
        "/v1/messages",
        json={
            "model": "acgw-mock-text",
            "max_tokens": 16,
            "messages": [
                {"role": "user", "content": [{"type": "text"}]}
            ],
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["type"] == "invalid_request_error"


def test_system_prompt_string_and_blocks(client) -> None:
    as_string = {
        "model": "acgw-mock-text",
        "max_tokens": 32,
        "system": "You are a mock scout.",
        "messages": [{"role": "user", "content": "Hello"}],
    }
    response = client.post("/v1/messages", json=as_string)
    assert response.status_code == 200

    as_blocks = {
        "model": "acgw-mock-text",
        "max_tokens": 32,
        "system": [{"type": "text", "text": "You are a mock scout."}],
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "Hello via blocks"}],
            }
        ],
    }
    response2 = client.post("/v1/messages", json=as_blocks)
    assert response2.status_code == 200
    assert "nonce=ACGW_MOCK_NONCE_7f3a91c2" in response2.json()["content"][0]["text"]


def test_string_vs_blocks_content(client) -> None:
    string_payload = {
        "model": "acgw-mock-text",
        "max_tokens": 16,
        "messages": [{"role": "user", "content": "plain string"}],
    }
    blocks_payload = {
        "model": "acgw-mock-text",
        "max_tokens": 16,
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "block text"}]}
        ],
    }
    assert client.post("/v1/messages", json=string_payload).status_code == 200
    assert client.post("/v1/messages", json=blocks_payload).status_code == 200
