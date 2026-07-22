#!/usr/bin/env python3
"""In-process smoke for local_coding with a fake /ai/coding/chat via MockTransport."""

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
        assert request.url.path != "/raw-lab"
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["model_alias"] == "coding_fast"
        assert "messages" in payload
        assert "recent_turns" not in payload
        return httpx.Response(
            200,
            json={
                "id": "coding_smoke",
                "model_alias": "coding_fast",
                "content": [
                    {
                        "type": "text",
                        "text": "fake-coding: " + payload["messages"][-1]["content"][:40],
                    }
                ],
                "stop_reason": "end_turn",
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
        max_response_bytes=65_536,
        transport=httpx.MockTransport(handler),
    )
    provider = LocalCodingProvider(settings, client=client)

    app = build_app(settings)

    with TestClient(app) as http:
        http.app.state.provider = provider

        health = http.get("/health")
        assert health.status_code == 200, health.text
        assert health.json()["provider"] == "local_coding"
        print("ok: health")

        text = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen-coding",
                "max_tokens": 64,
                "system": "Be brief.",
                "messages": [
                    {"role": "user", "content": "What is a list?"},
                ],
            },
        )
        assert text.status_code == 200, text.text
        body = text.json()
        assert body["content"][0]["text"].startswith("fake-coding:")
        print("ok: coding non-streaming text")

        stream = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen-coding",
                "max_tokens": 64,
                "stream": True,
                "messages": [{"role": "user", "content": "no stream"}],
            },
        )
        assert stream.status_code == 400, stream.text
        print("ok: stream rejected")

    provider.close()
    print("smoke_local_coding_fake: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
