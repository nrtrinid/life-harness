import json
import logging
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.chat_harness_deep import run_chat_harness_deep
from app.chat_harness_thinking_trace import (
    ThinkingTrace,
    critique_draft_with_trace,
    emit_thinking_trace,
    new_thinking_trace,
)
from dataclasses import replace

from app.config import get_settings
from app.critic_backend import MockCriticBackend, SameBackendCritic
from app.main import app, get_provider
from app.models import (
    ChatHarnessRequest,
    ChatHarnessResponse,
    HarnessContext,
)

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


@pytest.fixture
def harness_context() -> HarnessContext:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return HarnessContext.model_validate(data)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_trace_env():
    prior = os.environ.get("SCOUT_DEBUG_THINKING_TRACE")
    os.environ.pop("SCOUT_DEBUG_THINKING_TRACE", None)
    get_provider.cache_clear()
    yield
    if prior is None:
        os.environ.pop("SCOUT_DEBUG_THINKING_TRACE", None)
    else:
        os.environ["SCOUT_DEBUG_THINKING_TRACE"] = prior
    get_provider.cache_clear()


def _deep_payload(harness_context: HarnessContext, message: str) -> dict:
    return {
        "message": message,
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }


def test_no_trace_log_when_flag_unset(client, harness_context, caplog):
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/chat-harness",
            json=_deep_payload(harness_context, "deep-critic-too-broad"),
        )
    assert response.status_code == 200
    assert not any(
        "chat_harness_thinking_trace" in record.message for record in caplog.records
    )


def test_no_trace_log_when_flag_false(client, harness_context, caplog):
    os.environ["SCOUT_DEBUG_THINKING_TRACE"] = "false"
    get_provider.cache_clear()
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/chat-harness",
            json=_deep_payload(harness_context, "What should I do next?"),
        )
        response2 = client.post(
            "/chat-harness",
            json=_deep_payload(harness_context, "deep-critic-too-broad"),
        )
    assert response.status_code == 200
    assert response2.status_code == 200
    assert not any(
        "chat_harness_thinking_trace" in record.message for record in caplog.records
    )


def test_trace_log_when_flag_true(client, harness_context, caplog):
    os.environ["SCOUT_DEBUG_THINKING_TRACE"] = "true"
    get_provider.cache_clear()
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/chat-harness",
            json=_deep_payload(harness_context, "deep-critic-too-broad"),
        )
    assert response.status_code == 200
    trace_records = [
        record.message
        for record in caplog.records
        if "chat_harness_thinking_trace" in record.message
    ]
    assert len(trace_records) == 1
    payload = json.loads(trace_records[0].split(" ", 1)[1])
    assert payload["reasoning_depth"] == "deep"
    assert "draft" in payload["passes"]
    assert "critic" in payload["passes"]
    assert payload["critic_verdict_parsed"] is True
    assert "too_broad" in payload["critic_checks"]
    assert payload["revision_applied"] is True
    assert "draft" in payload["latency_ms"]
    ChatHarnessResponse.model_validate(response.json())


def test_trace_malformed_critic_parse_metadata(harness_context):
    draft = ChatHarnessResponse(
        answer="One move.",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    )
    draft_raw = draft.model_dump_json()
    request = ChatHarnessRequest(
        message="hello",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    trace = new_thinking_trace(request)
    critic = SameBackendCritic(generate=lambda _prompt: "not json {{{")

    verdict = critique_draft_with_trace(
        critic,
        trace=trace,
        request=request,
        draft=draft,
        draft_raw=draft_raw,
    )
    assert verdict.needs_revision is False
    assert trace.critic_verdict_parsed is False
    assert trace.fail_soft_reason == "critic_parse_failed"


def test_trace_clean_pass_parsed_not_conflated_with_fail_soft(harness_context):
    request = ChatHarnessRequest(
        message="What next?",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    draft = ChatHarnessResponse(
        answer="One tiny move.",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    )
    trace = new_thinking_trace(request)
    verdict = critique_draft_with_trace(
        MockCriticBackend(),
        trace=trace,
        request=request,
        draft=draft,
        draft_raw=draft.model_dump_json(),
    )
    assert verdict.needs_revision is False
    assert trace.critic_verdict_parsed is True
    assert trace.critic_checks == []
    assert trace.fail_soft_reason is None


def test_trace_draft_parse_failure(harness_context):
    request = ChatHarnessRequest(
        message="hello",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    trace = new_thinking_trace(request)
    result = run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=lambda _p: "not json",
        critic=MockCriticBackend(),
        max_extra_passes=2,
        trace=trace,
    )
    assert result.revised is False
    assert result.critic_ran is False
    assert result.critic_skip_reason == "draft_parse_failed"
    assert "draft" in trace.parse_failures
    assert "critic" not in trace.passes
    assert trace.fail_soft_reason == "draft_parse_failed"
    assert trace.fallback_used is True
    assert trace.draft_repair_attempted is False
    assert trace.draft_repair_succeeded is False


def test_trace_draft_repair_fields_when_repair_runs(harness_context, caplog):
    request = ChatHarnessRequest(
        message="hello",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    trace = new_thinking_trace(request)
    repaired = ChatHarnessResponse(
        answer="Repaired draft.",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    ).model_dump_json()

    run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=lambda _p: "not json",
        draft_repair_generate=lambda _broken: repaired,
        critic=MockCriticBackend(),
        max_extra_passes=2,
        trace=trace,
    )

    with caplog.at_level(logging.INFO):
        emit_thinking_trace(
            replace(get_settings(), debug_thinking_trace=True),
            trace,
        )

    trace_records = [
        record.message
        for record in caplog.records
        if "chat_harness_thinking_trace" in record.message
    ]
    assert len(trace_records) == 1
    payload = json.loads(trace_records[0].split(" ", 1)[1])
    assert payload["draft_repair_attempted"] is True
    assert payload["draft_repair_succeeded"] is True
    assert "draft_repair" in payload["passes"]


def test_mock_deep_draft_repair_trace_via_client(client, harness_context, caplog):
    os.environ["SCOUT_DEBUG_THINKING_TRACE"] = "true"
    get_provider.cache_clear()
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/chat-harness",
            json={
                "message": "deep-draft-repair trace",
                "mode": "general",
                "sensitivity": "S1",
                "context": harness_context.model_dump(mode="json"),
                "conversation_history": [],
                "reasoning_depth": "deep",
            },
        )
    assert response.status_code == 200
    trace_records = [
        record.message
        for record in caplog.records
        if "chat_harness_thinking_trace" in record.message
    ]
    assert len(trace_records) == 1
    payload = json.loads(trace_records[0].split(" ", 1)[1])
    assert payload["draft_repair_attempted"] is True
    assert payload["draft_repair_succeeded"] is True
    assert "draft_repair" in payload["passes"]
    assert "critic" in payload["passes"]
