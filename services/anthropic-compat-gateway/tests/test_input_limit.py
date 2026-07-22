from __future__ import annotations

from app.config import Settings
from app.input_budget import input_char_count, serialize_input_for_budget
from app.main import build_app
from app.models import Message, MessagesRequest, ToolDefinition
from fastapi.testclient import TestClient


def _base_request(*, message: str, tools: list[ToolDefinition] | None = None) -> MessagesRequest:
    return MessagesRequest(
        model="acgw-mock-text",
        max_tokens=32,
        messages=[Message(role="user", content=message)],
        tools=tools,
        stream=False,
    )


def test_input_budget_includes_system_messages_tools() -> None:
    tools = [
        ToolDefinition(
            name="Read",
            input_schema={
                "type": "object",
                "properties": {"file_path": {"type": "string"}},
                "required": ["file_path"],
            },
        )
    ]
    request = MessagesRequest(
        model="acgw-mock-text",
        max_tokens=32,
        system="SYSTEM_MARKER",
        messages=[
            Message(role="user", content="hello"),
            Message(
                role="user",
                content=[
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_1",
                        "content": "TOOL_RESULT_MARKER",
                    }
                ],
            ),
        ],
        tools=tools,
    )
    serialized = serialize_input_for_budget(request)
    assert "SYSTEM_MARKER" in serialized
    assert "TOOL_RESULT_MARKER" in serialized
    assert "file_path" in serialized
    assert input_char_count(request) == len(serialized)


def test_exactly_at_limit_accepted() -> None:
    fixed = _base_request(message="boundary")
    limit = input_char_count(fixed)
    cfg = Settings(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=limit,
    )
    app = build_app(cfg)
    with TestClient(app) as client:
        response = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-text",
                "max_tokens": 32,
                "messages": [{"role": "user", "content": "boundary"}],
            },
        )
    assert response.status_code == 200


def test_one_char_over_limit_rejected_before_provider() -> None:
    fixed = _base_request(message="boundary")
    limit = input_char_count(fixed)
    cfg = Settings(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=limit,
    )
    app = build_app(cfg)
    with TestClient(app) as client:
        response = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-text",
                "max_tokens": 32,
                "messages": [{"role": "user", "content": "boundary!"}],
            },
        )
    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "error"
    assert "ACGW_MAX_INPUT_CHARS" in body["error"]["message"]
