#!/usr/bin/env python3
"""In-process smoke: fake incremental coding stream → ACGW Anthropic SSE."""

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
    from tests.conftest import parse_sse

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/ai/coding/chat/stream"
        assert request.url.path != "/raw-lab/stream"
        events = [
            {"type": "start", "id": "coding_smoke", "model_alias": "coding_fast"},
            {"type": "delta", "text": "Alpha"},
            {"type": "delta", "text": "Bravo"},
            {"type": "delta", "text": "Charlie"},
            {
                "type": "done",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        ]
        body = "".join(f"data: {json.dumps(e)}\n\n" for e in events).encode("utf-8")
        return httpx.Response(
            200, content=body, headers={"content-type": "text/event-stream"}
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
        max_response_bytes=65_536,
        transport=httpx.MockTransport(handler),
    )
    provider = LocalCodingProvider(settings, client=client)
    app = build_app(settings)

    with TestClient(app) as http:
        http.app.state.provider = provider
        response = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen-coding",
                "max_tokens": 64,
                "stream": True,
                "messages": [{"role": "user", "content": "Say fragments."}],
            },
        )
        assert response.status_code == 200, response.text
        assert "text/event-stream" in response.headers["content-type"]
        events = parse_sse(response.text)
        names = [n for n, _ in events]
        assert names[0] == "message_start"
        deltas = [p["delta"]["text"] for n, p in events if n == "content_block_delta"]
        assert deltas == ["Alpha", "Bravo", "Charlie"]
        assert len(deltas) >= 2, "must see multiple deltas before completion"
        assert names[-1] == "message_stop"
        print("ok: multiple Anthropic text deltas before done")

    provider.close()
    print("smoke_local_coding_stream_fake: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
