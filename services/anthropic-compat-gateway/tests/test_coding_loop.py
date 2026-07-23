from __future__ import annotations

import json

from tests.conftest import load_fixture, parse_sse


def test_mini_coding_loop(client) -> None:
    first = load_fixture("coding_loop_mini.json")
    response1 = client.post("/v1/messages", json=first)
    assert response1.status_code == 200
    assert response1.headers["content-type"].startswith("text/event-stream")

    events = parse_sse(response1.text)
    assert events[0][0] == "message_start"
    tool_start = next(
        p for n, p in events if n == "content_block_start" and p["content_block"]["type"] == "tool_use"
    )
    assert tool_start["content_block"]["name"] == "Read"
    tool_id = tool_start["content_block"]["id"]

    partials = [
        p["delta"]["partial_json"]
        for n, p in events
        if n == "content_block_delta" and p["delta"]["type"] == "input_json_delta"
    ]
    tool_input = json.loads("".join(partials))
    assert tool_input["file_path"] == "package.json"
    assert events[-1][0] == "message_stop"

    second = {
        "model": "acgw-mock-coding",
        "max_tokens": 128,
        "stream": False,
        "messages": [
            {"role": "user", "content": "Read package.json and report the package name"},
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": tool_id,
                        "name": "Read",
                        "input": tool_input,
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": '{"name":"life-harness","version":"0.1.0"}',
                    }
                ],
            },
        ],
        "tools": first["tools"],
    }
    response2 = client.post("/v1/messages", json=second)
    assert response2.status_code == 200
    body = response2.json()
    assert body["stop_reason"] == "end_turn"
    assert "life-harness" in body["content"][0]["text"]
    assert client.app.state.request_count == 2
