from __future__ import annotations

import pytest

from app.models import ContentBlock, Message, MessagesRequest, ToolDefinition
from app.providers.base import PreStreamProviderError
from app.providers.local_ai_gateway import LocalAiGatewayProvider
from tests.conftest import make_settings


def _provider() -> LocalAiGatewayProvider:
    # No real HTTP client needed for plan/stream reject paths.
    class _FakeClient:
        def close(self) -> None:
            return None

    settings = make_settings(provider="local_ai_gateway", enable_local_ai_gateway=True)
    return LocalAiGatewayProvider(settings, client=_FakeClient())  # type: ignore[arg-type]


def test_stream_true_rejected_in_plan() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        stream=True,
        messages=[Message(role="user", content="hi")],
    )
    with pytest.raises(PreStreamProviderError, match="Streaming is not enabled") as exc:
        provider.plan(req, scenario="local")
    assert exc.value.status_code == 400
    assert exc.value.error_type == "invalid_request_error"


def test_stream_events_always_rejects() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        stream=False,
        messages=[Message(role="user", content="hi")],
    )
    with pytest.raises(PreStreamProviderError, match="Streaming is not enabled"):
        next(provider.stream_events(req, scenario="local"))


def test_tools_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
        tools=[ToolDefinition(name="Read", input_schema={"type": "object"})],
    )
    with pytest.raises(PreStreamProviderError, match="does not support tools"):
        provider.plan(req, scenario="local")


def test_default_tool_choice_omitted_accepted() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
    )
    plan = provider.plan(req, scenario="local")
    assert plan.kind == "text"


def test_default_tool_choice_auto_accepted() -> None:
    provider = _provider()
    for choice in (None, "auto", {"type": "auto"}, {}):
        req = MessagesRequest(
            model="local-qwen",
            max_tokens=16,
            messages=[Message(role="user", content="hi")],
            tool_choice=choice,
        )
        plan = provider.plan(req, scenario="local")
        assert plan.kind == "text"


def test_non_default_tool_choice_rejected() -> None:
    provider = _provider()
    for choice in (
        {"type": "any"},
        {"type": "none"},
        {"type": "tool", "name": "Read"},
        "any",
        "none",
    ):
        req = MessagesRequest(
            model="local-qwen",
            max_tokens=16,
            messages=[Message(role="user", content="hi")],
            tool_choice=choice,
        )
        with pytest.raises(PreStreamProviderError, match="non-default"):
            provider.plan(req, scenario="local")


def test_stop_sequences_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
        stop_sequences=["END"],
    )
    with pytest.raises(PreStreamProviderError, match="stop_sequences"):
        provider.plan(req, scenario="local")


def test_tool_result_content_rejected() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        messages=[
            Message(
                role="user",
                content=[
                    ContentBlock(
                        type="tool_result",
                        tool_use_id="toolu_1",
                        content="ok",
                    )
                ],
            )
        ],
    )
    with pytest.raises(PreStreamProviderError, match="tool_use/tool_result"):
        provider.plan(req, scenario="local")


def test_last_message_must_be_user() -> None:
    provider = _provider()
    req = MessagesRequest(
        model="local-qwen",
        max_tokens=16,
        messages=[Message(role="assistant", content="hi")],
    )
    with pytest.raises(PreStreamProviderError, match="last message must have role=user"):
        provider.plan(req, scenario="local")
