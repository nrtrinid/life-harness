#!/usr/bin/env python3
"""In-process smoke: non-streaming, streaming, and tool-use loop via TestClient."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running as `python scripts/smoke_http.py` from the service root.
_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))


def _parse_sse(raw: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        event_name: str | None = None
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_name = line[len("event: ") :]
            elif line.startswith("data: "):
                data_lines.append(line[len("data: ") :])
        if event_name is None or not data_lines:
            raise AssertionError(f"Malformed SSE block: {block!r}")
        events.append((event_name, json.loads("\n".join(data_lines))))
    return events


def main() -> int:
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import build_app

    settings = Settings(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
        enable_local_ai_gateway=False,
        local_ai_gateway_base_url="http://127.0.0.1:8111",
        local_ai_gateway_timeout_seconds=120.0,
        local_ai_gateway_connect_timeout_seconds=5.0,
        local_ai_gateway_max_response_bytes=1_048_576,
        local_ai_gateway_model_alias="local-qwen",
    )
    app = build_app(settings)

    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200, health.text
        print("ok: health")

        text = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-text",
                "max_tokens": 64,
                "messages": [{"role": "user", "content": "Hello"}],
            },
        )
        assert text.status_code == 200, text.text
        assert "nonce=ACGW_MOCK_NONCE_7f3a91c2" in text.json()["content"][0]["text"]
        print("ok: non-streaming text")

        stream = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-stream",
                "max_tokens": 64,
                "stream": True,
                "messages": [{"role": "user", "content": "Hello stream"}],
            },
        )
        assert stream.status_code == 200, stream.text
        events = _parse_sse(stream.text)
        assert events[0][0] == "message_start"
        assert events[-1][0] == "message_stop"
        print("ok: streaming text")

        tools = [
            {
                "name": "Read",
                "description": "Read a file",
                "input_schema": {
                    "type": "object",
                    "properties": {"file_path": {"type": "string"}},
                    "required": ["file_path"],
                },
            }
        ]
        first = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-tool",
                "max_tokens": 128,
                "stream": True,
                "messages": [{"role": "user", "content": "Read package.json"}],
                "tools": tools,
            },
        )
        assert first.status_code == 200, first.text
        tool_events = _parse_sse(first.text)
        tool_start = next(
            p
            for n, p in tool_events
            if n == "content_block_start" and p["content_block"]["type"] == "tool_use"
        )
        tool_id = tool_start["content_block"]["id"]
        partials = [
            p["delta"]["partial_json"]
            for n, p in tool_events
            if n == "content_block_delta" and p["delta"]["type"] == "input_json_delta"
        ]
        tool_input = json.loads("".join(partials))

        second = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-tool-continue",
                "max_tokens": 128,
                "messages": [
                    {"role": "user", "content": "Read package.json"},
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
                                "content": '{"name":"life-harness"}',
                            }
                        ],
                    },
                ],
                "tools": tools,
            },
        )
        assert second.status_code == 200, second.text
        assert second.json()["stop_reason"] == "end_turn"
        print("ok: tool-use loop")

    print("smoke_http: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
