from __future__ import annotations

import json

from tests.conftest import load_fixture, parse_sse


READ_TOOL = {
    "name": "Read",
    "description": "Read a file",
    "input_schema": {
        "type": "object",
        "properties": {"file_path": {"type": "string"}},
        "required": ["file_path"],
    },
}

GLOB_TOOL = {
    "name": "Glob",
    "description": "Find files",
    "input_schema": {
        "type": "object",
        "properties": {"pattern": {"type": "string"}},
        "required": ["pattern"],
    },
}

BASH_ONLY = {
    "name": "Bash",
    "description": "Shell",
    "input_schema": {
        "type": "object",
        "properties": {"command": {"type": "string"}},
        "required": ["command"],
    },
}


def test_tool_use_prefers_read_and_validates_schema(client) -> None:
    payload = load_fixture("tool_call_once.json")
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["stop_reason"] == "tool_use"
    block = body["content"][0]
    assert block["type"] == "tool_use"
    assert block["name"] == "Read"
    assert block["input"]["file_path"] == "package.json"


def test_tool_use_falls_back_to_glob_when_read_missing(client) -> None:
    payload = {
        "model": "acgw-mock-tool",
        "max_tokens": 64,
        "messages": [{"role": "user", "content": "find package.json"}],
        "tools": [GLOB_TOOL, BASH_ONLY],
        "stream": False,
    }
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    block = response.json()["content"][0]
    assert block["name"] == "Glob"
    assert block["input"]["pattern"] == "package.json"


def test_no_safe_tool_returns_clear_error(client) -> None:
    payload = {
        "model": "acgw-mock-tool",
        "max_tokens": 64,
        "messages": [{"role": "user", "content": "run something"}],
        "tools": [BASH_ONLY],
        "stream": False,
    }
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "error"
    assert "No supported harmless tool" in body["error"]["message"]


def test_streaming_tool_use_input_json_deltas_accumulate(client) -> None:
    payload = load_fixture("tool_call_once.json")
    payload["stream"] = True
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = parse_sse(response.text)
    names = [n for n, _ in events]
    assert names[0] == "message_start"
    assert names[1] == "content_block_start"
    assert events[1][1]["content_block"]["type"] == "tool_use"
    assert events[1][1]["content_block"]["name"] == "Read"

    json_deltas = [
        p["delta"]["partial_json"]
        for n, p in events
        if n == "content_block_delta" and p["delta"]["type"] == "input_json_delta"
    ]
    assert len(json_deltas) >= 2
    accumulated = "".join(json_deltas)
    parsed = json.loads(accumulated)
    assert parsed["file_path"] == "package.json"

    assert names[-1] == "message_stop"
    message_delta = next(p for n, p in events if n == "message_delta")
    assert message_delta["delta"]["stop_reason"] == "tool_use"


def test_tool_result_continuation(client) -> None:
    payload = load_fixture("tool_result_continue.json")
    response = client.post("/v1/messages", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["stop_reason"] == "end_turn"
    assert body["content"][0]["type"] == "text"
    assert "life-harness" in body["content"][0]["text"]
