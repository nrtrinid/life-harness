#!/usr/bin/env python3
"""Deterministic local coding tool-loop smoke (Slice C1; no tool execution)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))


def main() -> int:
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import build_app
    from app.providers.local_coding import LocalCodingProvider
    from app.upstream.coding_client import CodingClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/ai/coding/chat"
        body = json.loads(request.content.decode("utf-8"))
        messages = body.get("messages") or []
        last = messages[-1]
        content = last.get("content")
        if isinstance(content, list) and any(
            b.get("type") == "tool_result" for b in content
        ):
            return httpx.Response(
                200,
                json={
                    "id": "coding_2",
                    "model_alias": "coding_fast",
                    "content": [
                        {"type": "text", "text": "The test value is 42."},
                    ],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            )
        tid = "toolu_smoke123"
        return httpx.Response(
            200,
            json={
                "id": "coding_1",
                "model_alias": "coding_fast",
                "content": [
                    {
                        "type": "tool_use",
                        "id": tid,
                        "name": "get_test_value",
                        "input": {},
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    settings = Settings(
        provider="local_coding",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
        enable_local_coding=True,
        local_coding_base_url="http://127.0.0.1:8111",
        local_coding_timeout_seconds=120.0,
        local_coding_connect_timeout_seconds=5.0,
        local_coding_max_response_bytes=1_048_576,
        local_coding_model_alias="local-qwen-coding",
    )
    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=65536,
        transport=httpx.MockTransport(handler),
    )
    provider = LocalCodingProvider(settings, client=client)
    app = build_app(settings)

    tool_def = {
        "name": "get_test_value",
        "description": "Return a deterministic test value.",
        "input_schema": {"type": "object", "additionalProperties": False},
    }

    with TestClient(app) as http:
        http.app.state.provider = provider

        r1 = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen-coding",
                "max_tokens": 64,
                "tools": [tool_def],
                "messages": [
                    {"role": "user", "content": "Please call get_test_value."},
                ],
            },
        )
        if r1.status_code != 200:
            print(f"fail: first turn HTTP {r1.status_code} {r1.text}")
            return 1
        data1 = r1.json()
        if data1.get("stop_reason") != "tool_use":
            print(f"fail: expected tool_use, got {data1.get('stop_reason')}")
            return 1
        tool_block = next(b for b in data1["content"] if b["type"] == "tool_use")
        tool_id = tool_block["id"]
        print("ok: Anthropic tool_use from fake upstream")

        r2 = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen-coding",
                "max_tokens": 64,
                "tools": [tool_def],
                "messages": [
                    {"role": "user", "content": "Please call get_test_value."},
                    {"role": "assistant", "content": [tool_block]},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": tool_id,
                                "content": "42",
                            }
                        ],
                    },
                ],
            },
        )
        if r2.status_code != 200:
            print(f"fail: continuation HTTP {r2.status_code} {r2.text}")
            return 1
        data2 = r2.json()
        if data2.get("stop_reason") != "end_turn":
            print(f"fail: expected end_turn, got {data2.get('stop_reason')}")
            return 1
        final_text = data2["content"][0]["text"]
        if "42" not in final_text:
            print(f"fail: final text missing result: {final_text!r}")
            return 1
        print("ok: final text after deterministic tool_result (client supplied)")

    provider.close()
    print("smoke_local_coding_tools_fake: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
