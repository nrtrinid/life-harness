from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import build_app

FIXTURES = Path(__file__).parent / "fixtures"

ALLOWED_FIXTURES = frozenset(
    {
        "backend_error.json",
        "coding_loop_mini.json",
        "empty_provider.json",
        "plain_text.json",
        "provider_malformed_tool.json",
        "stream_text.json",
        "tool_call_once.json",
        "tool_result_continue.json",
    }
)

# Explicit defaults for Settings(...) constructions in tests (Slice 2A fields).
LOCAL_GATEWAY_SETTINGS_DEFAULTS = dict(
    enable_local_ai_gateway=False,
    local_ai_gateway_base_url="http://127.0.0.1:8111",
    local_ai_gateway_timeout_seconds=120.0,
    local_ai_gateway_connect_timeout_seconds=5.0,
    local_ai_gateway_max_response_bytes=1_048_576,
    local_ai_gateway_model_alias="local-qwen",
)


def make_settings(**overrides: object) -> Settings:
    base = dict(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
        **LOCAL_GATEWAY_SETTINGS_DEFAULTS,
    )
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def load_fixture(name: str) -> dict:
    if "/" in name or "\\" in name or ".." in name or name != Path(name).name:
        raise ValueError(f"Rejected fixture path: {name!r}")
    if name not in ALLOWED_FIXTURES:
        raise ValueError(f"Unknown fixture name: {name!r}")
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def settings() -> Settings:
    return Settings(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,  # explicit test-only no-auth
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


@pytest.fixture
def client(settings: Settings) -> TestClient:
    application = build_app(settings)
    with TestClient(application) as test_client:
        yield test_client


def parse_sse(raw: str) -> list[tuple[str, dict]]:
    """Parse Anthropic SSE wire format into (event_name, data_object) pairs."""
    events: list[tuple[str, dict]] = []
    blocks = raw.split("\n\n")
    for block in blocks:
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
        payload = json.loads("\n".join(data_lines))
        events.append((event_name, payload))
    return events
