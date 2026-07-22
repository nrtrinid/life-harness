from __future__ import annotations

import json

from tests.conftest import load_fixture, parse_sse


def test_streaming_text_wire_format_and_incremental(client) -> None:
    payload = load_fixture("stream_text.json")
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    raw = response.text
    assert "\n\n" in raw
    events = parse_sse(raw)
    names = [name for name, _ in events]

    assert names[0] == "message_start"
    assert names[1] == "content_block_start"
    assert "content_block_delta" in names
    assert names.count("content_block_delta") >= 2
    assert "content_block_stop" in names
    assert "message_delta" in names
    assert names[-1] == "message_stop"

    for name, payload_obj in events:
        assert payload_obj["type"] == name

    message_start = events[0][1]
    assert message_start["message"]["usage"]["input_tokens"] >= 1
    assert message_start["message"]["stop_reason"] is None

    deltas = [p for n, p in events if n == "content_block_delta"]
    texts = [d["delta"]["text"] for d in deltas]
    assert all(isinstance(t, str) and t for t in texts)
    joined = "".join(texts)
    assert "Mock assistant reply from anthropic-compat-gateway." in joined
    assert "nonce=ACGW_MOCK_NONCE_7f3a91c2" in joined

    message_delta = next(p for n, p in events if n == "message_delta")
    assert message_delta["delta"]["stop_reason"] == "end_turn"
    assert message_delta["usage"]["output_tokens"] >= 1

    # Exact framing sample: event/data lines present
    assert "event: message_start\ndata: " in raw
    assert "event: message_stop\ndata: " in raw
