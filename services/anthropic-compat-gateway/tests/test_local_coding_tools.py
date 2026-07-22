"""CI-safe tests for ACGW local coding structured tools (Slice C1)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.models import ContentBlock, Message, MessagesRequest, ToolDefinition
from app.providers.base import PreStreamProviderError
from app.providers.local_coding import LocalCodingProvider
from app.translate.coding_tools import translate_messages_to_coding
from tests.conftest import make_settings


def _tool(name: str = "get_test_value") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description="Return a deterministic test value.",
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
    )


def _provider_with_handler(handler) -> LocalCodingProvider:
    transport = httpx.MockTransport(handler)
    from app.upstream.coding_client import CodingClient

    client = CodingClient(
        base_url="http://127.0.0.1:8111",
        timeout=5.0,
        connect_timeout=1.0,
        max_response_bytes=65536,
        transport=transport,
    )
    settings = make_settings(provider="local_coding", enable_local_coding=True)
    return LocalCodingProvider(settings, client=client)


def test_tool_definition_translation() -> None:
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[Message(role="user", content="hi")],
        tools=[_tool()],
        tool_choice={"type": "auto"},
    )
    body = translate_messages_to_coding(req)
    assert body.tools is not None
    assert body.tools[0].name == "get_test_value"
    assert body.tool_choice is None


def test_tool_use_response_translation() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/ai/coding/chat"
        payload = {
            "id": "coding_1",
            "model_alias": "coding_fast",
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_test123",
                    "name": "get_test_value",
                    "input": {},
                }
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
        return httpx.Response(200, json=payload)

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[Message(role="user", content="__CODING_TOOL_CALL__")],
        tools=[_tool()],
    )
    resp = provider.complete(req, scenario="local")
    provider.close()
    assert resp.stop_reason == "tool_use"
    assert resp.content[0]["type"] == "tool_use"
    assert resp.content[0]["id"] == "toolu_test123"


def test_tool_loop_smoke_shape() -> None:
    tool_id = "toolu_loop1"

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        messages = body.get("messages") or []
        last = messages[-1]
        content = last.get("content")
        if isinstance(content, list) and any(
            b.get("type") == "tool_result" for b in content
        ):
            payload = {
                "id": "coding_2",
                "model_alias": "coding_fast",
                "content": [{"type": "text", "text": "Final answer: 42"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            }
        else:
            payload = {
                "id": "coding_1",
                "model_alias": "coding_fast",
                "content": [
                    {
                        "type": "tool_use",
                        "id": tool_id,
                        "name": "get_test_value",
                        "input": {},
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            }
        return httpx.Response(200, json=payload)

    provider = _provider_with_handler(handler)
    req1 = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[Message(role="user", content="use get_test_value")],
        tools=[_tool()],
    )
    first = provider.complete(req1, scenario="local")
    assert first.stop_reason == "tool_use"

    req2 = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        tools=[_tool()],
        messages=[
            Message(role="user", content="use get_test_value"),
            Message(
                role="assistant",
                content=[
                    ContentBlock(
                        type="tool_use",
                        id=tool_id,
                        name="get_test_value",
                        input={},
                    )
                ],
            ),
            Message(
                role="user",
                content=[
                    ContentBlock(
                        type="tool_result",
                        tool_use_id=tool_id,
                        content="42",
                    )
                ],
            ),
        ],
    )
    second = provider.complete(req2, scenario="local")
    provider.close()
    assert second.stop_reason == "end_turn"
    assert "42" in second.content[0]["text"]


def test_tools_stream_rejected() -> None:
    provider = _provider_with_handler(lambda r: httpx.Response(500))
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        stream=True,
        messages=[Message(role="user", content="hi")],
        tools=[_tool()],
    )
    with pytest.raises(PreStreamProviderError, match="tool streaming is deferred"):
        provider.plan(req, scenario="local")
    provider.close()


def test_unknown_tool_result_rejected() -> None:
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[
            Message(
                role="user",
                content=[
                    ContentBlock(
                        type="tool_result",
                        tool_use_id="toolu_missing",
                        content="x",
                    )
                ],
            )
        ],
        tools=[_tool()],
    )
    with pytest.raises(PreStreamProviderError, match="unknown tool_use_id"):
        translate_messages_to_coding(req)


def test_no_raw_lab_path() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(
            200,
            json={
                "id": "c1",
                "model_alias": "coding_fast",
                "content": [{"type": "text", "text": "ok"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    provider = _provider_with_handler(handler)
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[Message(role="user", content="hi")],
        tools=[_tool()],
    )
    provider.complete(req, scenario="local")
    provider.close()
    assert seen == ["/ai/coding/chat"]


def test_tool_id_round_trip_through_all_boundaries() -> None:
    """Preserve exact tool_use id from fake upstream through ACGW and back."""
    fixed_id = "toolu_roundtrip_fixed_001"
    captured: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        captured.append(body)
        messages = body.get("messages") or []
        last = messages[-1]
        content = last.get("content")
        if isinstance(content, list) and any(
            b.get("type") == "tool_result" for b in content
        ):
            for block in content:
                if block.get("type") == "tool_result":
                    assert block.get("tool_use_id") == fixed_id
            return httpx.Response(
                200,
                json={
                    "id": "coding_2",
                    "model_alias": "coding_fast",
                    "content": [{"type": "text", "text": f"seen id {fixed_id}"}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            )
        return httpx.Response(
            200,
            json={
                "id": "coding_1",
                "model_alias": "coding_fast",
                "content": [
                    {
                        "type": "tool_use",
                        "id": fixed_id,
                        "name": "get_test_value",
                        "input": {},
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )

    provider = _provider_with_handler(handler)
    req1 = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        messages=[Message(role="user", content="call tool")],
        tools=[_tool()],
    )
    first = provider.complete(req1, scenario="local")
    anthropic_tool = next(b for b in first.content if b["type"] == "tool_use")
    assert anthropic_tool["id"] == fixed_id

    req2 = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        tools=[_tool()],
        messages=[
            Message(role="user", content="call tool"),
            Message(role="assistant", content=[ContentBlock(**anthropic_tool)]),
            Message(
                role="user",
                content=[
                    ContentBlock(
                        type="tool_result",
                        tool_use_id=fixed_id,
                        content="42",
                    )
                ],
            ),
        ],
    )
    second = provider.complete(req2, scenario="local")
    provider.close()
    assert fixed_id in second.content[0]["text"]
    assert len(captured) == 2
    second_upstream = captured[1]
    assistant_blocks = second_upstream["messages"][1]["content"]
    assert assistant_blocks[0]["id"] == fixed_id
    result_blocks = second_upstream["messages"][2]["content"]
    assert result_blocks[0]["tool_use_id"] == fixed_id


def test_duplicate_tool_result_rejected_at_acgw() -> None:
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=64,
        tools=[_tool()],
        messages=[
            Message(role="user", content="x"),
            Message(
                role="assistant",
                content=[
                    ContentBlock(
                        type="tool_use",
                        id="toolu_x",
                        name="get_test_value",
                        input={},
                    )
                ],
            ),
            Message(
                role="user",
                content=[
                    ContentBlock(type="tool_result", tool_use_id="toolu_x", content="1"),
                    ContentBlock(type="tool_result", tool_use_id="toolu_x", content="2"),
                ],
            ),
        ],
    )
    with pytest.raises(PreStreamProviderError, match="duplicate tool_result"):
        translate_messages_to_coding(req)
