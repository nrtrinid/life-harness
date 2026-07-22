"""CI-safe tests for Coding Slice C1 structured tools."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.coding_chat import assert_openvino_tools_not_requested, validate_coding_request
from app.coding_models import (
    CodingChatRequest,
    CodingMessage,
    CodingToolDefinition,
    CodingToolUseBlock,
    CodingToolResultBlock,
    CodingTextBlock,
    CodingToolChoice,
)
from app.coding_tools_schema import validate_tool_definitions
from app.main import app
from app.providers.base import ProviderInputError, ProviderNotReadyError


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _tool(name: str = "get_test_value", **schema: object) -> dict:
    base = {"type": "object", "properties": {}, "additionalProperties": False}
    base.update(schema)
    return {
        "name": name,
        "description": "Return a deterministic test value.",
        "input_schema": base,
    }


def _body(**overrides: object) -> dict:
    base: dict = {
        "model_alias": "coding_fast",
        "messages": [{"role": "user", "content": "__CODING_TOOL_CALL__"}],
        "tools": [_tool()],
    }
    base.update(overrides)
    return base


def test_valid_single_tool_call(client: TestClient) -> None:
    response = client.post("/ai/coding/chat", json=_body())
    assert response.status_code == 200
    data = response.json()
    assert data["stop_reason"] == "tool_use"
    blocks = data["content"]
    assert any(b["type"] == "tool_use" for b in blocks)
    tool = next(b for b in blocks if b["type"] == "tool_use")
    assert tool["name"] == "get_test_value"
    assert tool["id"].startswith("toolu_")


def test_duplicate_tool_names_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(tools=[_tool(), _tool()]),
    )
    assert response.status_code == 422


def test_invalid_tool_name_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(tools=[{"name": "9bad", "input_schema": {"type": "object"}}]),
    )
    assert response.status_code == 422


def test_forced_unknown_tool_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(tool_choice={"type": "tool", "name": "missing"}),
    )
    assert response.status_code == 422


def test_unknown_emitted_tool_fails_closed(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(messages=[{"role": "user", "content": "__CODING_TOOL_UNKNOWN__"}]),
    )
    assert response.status_code == 422


def test_schema_invalid_arguments_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(
            messages=[{"role": "user", "content": "__CODING_TOOL_SCHEMA_FAIL__"}],
            tools=[
                _tool(
                    properties={"required_key": {"type": "string"}},
                    required=["required_key"],
                    additionalProperties=False,
                )
            ],
        ),
    )
    assert response.status_code == 422


def test_tool_result_continuation(client: TestClient) -> None:
    first = client.post("/ai/coding/chat", json=_body())
    assert first.status_code == 200
    tool = next(
        b for b in first.json()["content"] if b["type"] == "tool_use"
    )
    second = client.post(
        "/ai/coding/chat",
        json={
            "model_alias": "coding_fast",
            "tools": [_tool()],
            "messages": [
                {"role": "user", "content": "__CODING_TOOL_CALL__"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": tool["id"],
                            "name": tool["name"],
                            "input": tool["input"],
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool["id"],
                            "content": "42",
                        }
                    ],
                },
            ],
        },
    )
    assert second.status_code == 200
    text = second.json()["content"][0]["text"]
    assert "CONTINUATION_OK" in text
    assert tool["id"] in text


def test_unresolved_tool_before_new_prompt(client: TestClient) -> None:
    first = client.post("/ai/coding/chat", json=_body())
    tool = next(b for b in first.json()["content"] if b["type"] == "tool_use")
    response = client.post(
        "/ai/coding/chat",
        json={
            "model_alias": "coding_fast",
            "tools": [_tool()],
            "messages": [
                {"role": "user", "content": "__CODING_TOOL_CALL__"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": tool["id"],
                            "name": tool["name"],
                            "input": tool["input"],
                        }
                    ],
                },
                {"role": "user", "content": "new question without result"},
            ],
        },
    )
    assert response.status_code == 422


def test_tool_stream_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat/stream",
        json=_body(stream=True),
    )
    assert response.status_code == 422


def test_openvino_tools_rejected_before_generation() -> None:
    req = CodingChatRequest.model_validate(_body())
    with pytest.raises(ProviderNotReadyError, match="OpenVINO"):
        assert_openvino_tools_not_requested(req)


def test_text_only_unchanged(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json={
            "model_alias": "coding_fast",
            "messages": [{"role": "user", "content": "plain text please"}],
        },
    )
    assert response.status_code == 200
    assert response.json()["stop_reason"] == "end_turn"
    assert "CODING_MOCK_OK" in response.json()["content"][0]["text"]


def test_tool_blocks_in_schema() -> None:
    msg = CodingMessage.model_validate(
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_abc",
                    "name": "get_test_value",
                    "input": {},
                }
            ],
        }
    )
    assert msg.content[0].type == "tool_use"


def test_tool_choice_none_with_tools(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(
            messages=[{"role": "user", "content": "__CODING_TOOL_TEXT__"}],
            tool_choice={"type": "none"},
        ),
    )
    assert response.status_code == 200
    assert response.json()["stop_reason"] == "end_turn"


def test_text_plus_tool_call(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(messages=[{"role": "user", "content": "__CODING_TOOL_TEXT_THEN_CALL__"}]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["stop_reason"] == "tool_use"
    types = [b["type"] for b in data["content"]]
    assert types == ["text", "tool_use"]


def test_validate_tool_definitions_deep_schema() -> None:
    deep = {"type": "object", "properties": {}}
    current = deep
    for _ in range(10):
        nested = {"type": "object", "properties": {"x": current}}
        current = nested
    with pytest.raises(ProviderInputError, match="nesting"):
        validate_tool_definitions(
            [{"name": "Deep", "input_schema": current}]
        )


def test_duplicate_tool_result_rejected(client: TestClient) -> None:
    first = client.post("/ai/coding/chat", json=_body())
    tool = next(b for b in first.json()["content"] if b["type"] == "tool_use")
    response = client.post(
        "/ai/coding/chat",
        json={
            "model_alias": "coding_fast",
            "tools": [_tool()],
            "messages": [
                {"role": "user", "content": "__CODING_TOOL_CALL__"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": tool["id"],
                            "name": tool["name"],
                            "input": tool["input"],
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool["id"],
                            "content": "a",
                        },
                        {
                            "type": "tool_result",
                            "tool_use_id": tool["id"],
                            "content": "b",
                        },
                    ],
                },
            ],
        },
    )
    assert response.status_code == 422


def test_assistant_two_tool_calls_in_history_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json={
            "model_alias": "coding_fast",
            "tools": [_tool()],
            "messages": [
                {"role": "user", "content": "x"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "toolu_a",
                            "name": "get_test_value",
                            "input": {},
                        },
                        {
                            "type": "tool_use",
                            "id": "toolu_b",
                            "name": "get_test_value",
                            "input": {},
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_a",
                            "content": "1",
                        }
                    ],
                },
            ],
        },
    )
    assert response.status_code == 422


def test_user_text_plus_tool_result_continuation(client: TestClient) -> None:
    first = client.post("/ai/coding/chat", json=_body())
    tool = next(b for b in first.json()["content"] if b["type"] == "tool_use")
    response = client.post(
        "/ai/coding/chat",
        json={
            "model_alias": "coding_fast",
            "tools": [_tool()],
            "messages": [
                {"role": "user", "content": "__CODING_TOOL_CALL__"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": tool["id"],
                            "name": tool["name"],
                            "input": tool["input"],
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Here is the result:"},
                        {
                            "type": "tool_result",
                            "tool_use_id": tool["id"],
                            "content": "42",
                        },
                    ],
                },
            ],
        },
    )
    assert response.status_code == 200
    assert "CONTINUATION_OK" in response.json()["content"][0]["text"]


def test_rejects_unsupported_schema_keyword(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_body(
            tools=[
                {
                    "name": "get_test_value",
                    "input_schema": {
                        "anyOf": [{"type": "object"}, {"type": "string"}],
                    },
                }
            ],
        ),
    )
    assert response.status_code == 422
