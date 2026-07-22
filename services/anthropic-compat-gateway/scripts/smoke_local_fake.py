#!/usr/bin/env python3
"""In-process smoke for local_ai_gateway with a fake Raw Lab via MockTransport."""

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
    from app.providers.local_ai_gateway import LocalAiGatewayProvider
    from app.upstream.raw_lab_client import RawLabClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/raw-lab"
        payload = json.loads(request.content.decode("utf-8"))
        assert "message" in payload
        return httpx.Response(
            200,
            json={
                "answer": "fake-raw-lab: " + payload["message"][:40],
                "mode": "raw_lab",
                "safety_notes": [],
                "used_context": False,
            },
        )

    settings = Settings(
        provider="local_ai_gateway",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
        enable_local_ai_gateway=True,
        local_ai_gateway_base_url="http://127.0.0.1:8111",
        local_ai_gateway_timeout_seconds=120.0,
        local_ai_gateway_connect_timeout_seconds=5.0,
        local_ai_gateway_max_response_bytes=1_048_576,
        local_ai_gateway_model_alias="local-qwen",
    )

    client = RawLabClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=65_536,
        transport=httpx.MockTransport(handler),
    )
    provider = LocalAiGatewayProvider(settings, client=client)

    app = build_app(settings)

    # Inject fake provider after lifespan would normally create one.
    with TestClient(app) as http:
        # Replace provider created by lifespan with our mocked one.
        http.app.state.provider = provider

        health = http.get("/health")
        assert health.status_code == 200, health.text
        print("ok: health")

        text = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen",
                "max_tokens": 64,
                "messages": [{"role": "user", "content": "Hello local"}],
            },
        )
        assert text.status_code == 200, text.text
        body = text.json()
        assert body["content"][0]["text"].startswith("fake-raw-lab:")
        assert body["usage"]["input_tokens"] == 0
        print("ok: local non-streaming text")

        stream = http.post(
            "/v1/messages",
            json={
                "model": "local-qwen",
                "max_tokens": 64,
                "stream": True,
                "messages": [{"role": "user", "content": "no stream"}],
            },
        )
        assert stream.status_code == 400, stream.text
        assert "Streaming is not enabled" in stream.json()["error"]["message"]
        print("ok: stream rejected")

    provider.close()
    print("smoke_local_fake: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
