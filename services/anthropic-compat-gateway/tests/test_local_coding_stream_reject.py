from __future__ import annotations

import pytest

from app.models import ContentBlock, Message, MessagesRequest, ToolDefinition
from app.providers.base import PreStreamProviderError
from app.providers.local_coding import LocalCodingProvider
from tests.conftest import make_settings


def _provider() -> LocalCodingProvider:
    class _FakeClient:
        def close(self) -> None:
            return None

    settings = make_settings(provider="local_coding", enable_local_coding=True)
    return LocalCodingProvider(settings, client=_FakeClient())  # type: ignore[arg-type]


def test_stream_plan_accepted_without_tools() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    plan = provider.plan(req, scenario="local")
    assert plan.kind == "text"


def test_tools_accepted_non_stream() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
        tools=[ToolDefinition(name="get_test_value", input_schema={"type": "object"})],
    )
    plan = provider.plan(req, scenario="local")
    assert plan.kind == "text"


def test_tools_stream_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
        tools=[ToolDefinition(name="get_test_value", input_schema={"type": "object"})],
    )
    with pytest.raises(PreStreamProviderError, match="tool streaming is deferred"):
        provider.plan(req, scenario="local")


def test_unknown_tool_result_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        messages=[
            Message(
                role="user",
                content=[
                    ContentBlock(type="tool_result", tool_use_id="t1", content="ok")
                ],
            )
        ],
        tools=[ToolDefinition(name="get_test_value", input_schema={"type": "object"})],
    )
    with pytest.raises(PreStreamProviderError, match="unknown tool_use_id"):
        provider.plan(req, scenario="local")


def test_unknown_model_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="claude-cloud",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
    )
    with pytest.raises(PreStreamProviderError, match="Unsupported model"):
        provider.plan(req, scenario="local")


def test_stop_sequences_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen-coding",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
        stop_sequences=["END"],
    )
    with pytest.raises(PreStreamProviderError, match="stop_sequences"):
        provider.plan(req, scenario="local")
