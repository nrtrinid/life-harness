import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.chat_harness_critic import (
    append_deep_critic_note,
    parse_critic_verdict,
    verdict_passes,
)
from app.chat_harness_deep import run_chat_harness_deep
from app.critic_backend import MockCriticBackend, SameBackendCritic
from app.main import app, get_provider
from app.context_packet import AiContextPacketWire
from app.models import (
    ChatHarnessCriticVerdict,
    ChatHarnessRequest,
    ChatHarnessResponse,
    CriticCheckEntry,
    CriticCheckId,
    HarnessContext,
)
from app.prompt_loader import build_chat_harness_critic_prompt

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
PACKET_FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"
)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def harness_context() -> HarnessContext:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return HarnessContext.model_validate(data)


@pytest.fixture
def chat_payload(harness_context) -> dict:
    return {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }


def _deep_request(message: str, harness_context: HarnessContext) -> ChatHarnessRequest:
    return ChatHarnessRequest(
        message=message,
        mode="general",
        sensitivity="S1",
        context=harness_context,
        conversation_history=[],
        reasoning_depth="deep",
    )


@pytest.mark.parametrize("check_id", list(CriticCheckId))
def test_each_critic_check_parses(check_id: CriticCheckId):
    raw = json.dumps(
        {
            "needs_revision": check_id != CriticCheckId.no_issue,
            "checks": [
                {
                    "id": check_id.value,
                    "severity": "warn",
                    "message": f"Check {check_id.value}",
                }
            ],
            "revision_instruction": "Fix it." if check_id != CriticCheckId.no_issue else "",
        }
    )
    verdict = parse_critic_verdict(raw)
    assert verdict is not None
    assert verdict.checks[0].id == check_id


def test_verdict_passes_on_no_issue():
    verdict = ChatHarnessCriticVerdict(
        needs_revision=False,
        checks=[
            CriticCheckEntry(
                id=CriticCheckId.no_issue,
                severity="info",
                message="ok",
            )
        ],
        revision_instruction="",
    )
    assert verdict_passes(verdict)


def test_malformed_critic_json_fails_soft(harness_context):
    draft = ChatHarnessResponse(
        answer="One move: ship the stub.",
        used_context=True,
        confidence_notes=["Inferred — test."],
        safety_notes=[],
    )
    draft_raw = draft.model_dump_json()
    request = _deep_request("What next?", harness_context)

    critic = SameBackendCritic(generate=lambda _prompt: "not json {{{")
    calls: list[str] = []

    def draft_generate(prompt: str) -> str:
        calls.append(prompt)
        return draft_raw

    result = run_chat_harness_deep(
        request=request,
        prompt="base prompt",
        draft_generate=draft_generate,
        critic=critic,
        max_extra_passes=2,
    )
    assert result.raw == draft_raw
    assert result.revised is False
    assert result.critic_ran is True
    assert len(calls) == 1


def test_deep_max_extra_passes_zero_skips_critic(harness_context):
    draft_raw = ChatHarnessResponse(
        answer="draft",
        used_context=False,
        confidence_notes=[],
        safety_notes=[],
    ).model_dump_json()
    request = _deep_request("deep-critic-too-broad probe", harness_context)
    critic = MagicMock()

    result = run_chat_harness_deep(
        request=request,
        prompt="p",
        draft_generate=lambda _p: draft_raw,
        critic=critic,
        max_extra_passes=0,
    )
    critic.critique_draft.assert_not_called()
    assert result.revised is False
    assert result.critic_ran is False


def test_deep_max_extra_passes_one_skips_final(harness_context):
    draft_raw = ChatHarnessResponse(
        answer="sprawl " * 20,
        used_context=False,
        confidence_notes=[],
        safety_notes=[],
    ).model_dump_json()
    request = _deep_request("deep-critic-too-broad", harness_context)
    calls: list[str] = []

    result = run_chat_harness_deep(
        request=request,
        prompt="p",
        draft_generate=lambda p: calls.append(p) or draft_raw,
        critic=MockCriticBackend(),
        max_extra_passes=1,
    )
    assert len(calls) == 1
    assert result.revised is False
    assert result.critic_ran is True


def test_deep_uses_draft_critic_final_mock(client, harness_context):
    payload = {
        "message": "deep-critic-too-broad",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    body = response.json()
    ChatHarnessResponse.model_validate(body)
    notes = " ".join(body["confidence_notes"])
    assert "structured critic" in notes.lower()
    assert "revised" in notes.lower()
    assert len(body["answer"]) < 200


def test_deep_critic_pass_skips_final(client, chat_payload):
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 200
    notes = response.json()["confidence_notes"]
    assert any("approved by structured critic" in note for note in notes)
    assert not any("revised after structured critic" in note for note in notes)


@pytest.mark.parametrize("depth", ["fast", "deliberate"])
def test_fast_and_deliberate_skip_critic(client, chat_payload, depth: str):
    payload = {**chat_payload, "reasoning_depth": depth}
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    notes = response.json()["confidence_notes"]
    assert not any("structured critic" in note.lower() for note in notes)


def test_deep_disabled_skips_critic(client, chat_payload):
    prior = os.environ.get("SCOUT_DEEP_ENABLED")
    os.environ["SCOUT_DEEP_ENABLED"] = "false"
    get_provider.cache_clear()
    from app.slots.manager import get_slot_manager
    from app.orchestrator.inference_orchestrator import get_inference_orchestrator

    get_slot_manager.cache_clear()
    get_inference_orchestrator.cache_clear()
    try:
        response = client.post("/chat-harness", json=chat_payload)
        assert response.status_code == 200
        notes = response.json()["confidence_notes"]
        assert not any("structured critic" in note.lower() for note in notes)
    finally:
        if prior is None:
            os.environ.pop("SCOUT_DEEP_ENABLED", None)
        else:
            os.environ["SCOUT_DEEP_ENABLED"] = prior
        get_provider.cache_clear()
        get_slot_manager.cache_clear()
        get_inference_orchestrator.cache_clear()


def test_response_schema_unchanged(client, chat_payload):
    response = client.post("/chat-harness", json=chat_payload)
    body = response.json()
    ChatHarnessResponse.model_validate(body)
    assert set(body.keys()) == {"answer", "used_context", "confidence_notes", "safety_notes"}


def test_deep_critic_flags_ignored_state(client, harness_context):
    payload = {
        "message": "deep-critic-ignore-state",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["used_context"] is True
    assert "active cards" in body["answer"].lower()


def test_critic_prompt_includes_ranked_packet_sections(harness_context):
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="What am I avoiding right now?",
        mode="operator",
        sensitivity="S1",
        context=harness_context,
        context_packet=packet,
        reasoning_depth="deep",
    )
    prompt = build_chat_harness_critic_prompt(request=request, draft_json="{}")

    assert "### Active cards (ranked)" in prompt
    assert "Career / Networking" in prompt


def test_critic_prompt_falls_back_without_packet(harness_context):
    request = ChatHarnessRequest(
        message="What should I do next?",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    prompt = build_chat_harness_critic_prompt(request=request, draft_json="{}")

    assert "### Active cards (ranked)" not in prompt
    assert "Active cards (" in prompt


def test_deep_malformed_context_packet_falls_back(client, harness_context):
    packet_data = json.loads(PACKET_FIXTURE_PATH.read_text(encoding="utf-8"))
    packet_data["packet_version"] = "0.2"
    payload = {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "context_packet": packet_data,
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    ChatHarnessResponse.model_validate(response.json())


def test_deep_pounce_with_context_packet_prefers_career(client, harness_context):
    packet_data = json.loads(PACKET_FIXTURE_PATH.read_text(encoding="utf-8"))
    payload = {
        "message": "What is today's one pounce?",
        "mode": "operator",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "context_packet": packet_data,
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "career" in answer_lower


def test_deep_critic_flags_too_many_tasks(client, harness_context):
    payload = {
        "message": "deep-critic-many-tasks",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    notes = " ".join(response.json()["confidence_notes"])
    assert "revised" in notes.lower()


def test_deep_critic_flags_emotionally_weird(client, harness_context):
    payload = {
        "message": "deep-critic-weird",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    notes = " ".join(response.json()["confidence_notes"])
    assert "revised" in notes.lower()


def test_deep_draft_parse_failure_skips_critic(harness_context):
    request = _deep_request("hello", harness_context)

    def draft_generate(_prompt: str) -> str:
        return "not valid json"

    critic = MagicMock()
    result = run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=draft_generate,
        critic=critic,
        max_extra_passes=2,
    )
    critic.critique_draft.assert_not_called()
    assert result.raw == "not valid json"
    assert result.revised is False
    assert result.critic_ran is False
    assert result.critic_skip_reason == "draft_parse_failed"


def _valid_draft_json(answer: str = "One move: ship the stub.") -> str:
    return ChatHarnessResponse(
        answer=answer,
        used_context=True,
        confidence_notes=["Inferred — test."],
        safety_notes=[],
    ).model_dump_json()


def test_deep_draft_repair_succeeds_runs_critic(harness_context):
    request = _deep_request("hello", harness_context)
    repaired_raw = _valid_draft_json()
    critic = MagicMock()
    critic.name = "mock"
    critic.critique_draft.return_value = ChatHarnessCriticVerdict(
        needs_revision=False,
        checks=[
            CriticCheckEntry(
                id=CriticCheckId.no_issue,
                severity="info",
                message="ok",
            )
        ],
        revision_instruction="",
    )

    from app.chat_harness_thinking_trace import new_thinking_trace

    trace = new_thinking_trace(request)

    result = run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=lambda _p: "not valid json",
        draft_repair_generate=lambda _broken: repaired_raw,
        critic=critic,
        max_extra_passes=2,
        trace=trace,
    )
    critic.critique_draft.assert_called_once()
    assert result.critic_ran is True
    assert result.raw == repaired_raw
    assert trace.passes == ["draft", "draft_repair", "critic"]
    assert trace.draft_repair_attempted is True
    assert trace.draft_repair_succeeded is True
    assert "draft" in trace.parse_failures
    assert "critic" in trace.passes


def test_deep_draft_repair_fails_skips_critic(harness_context):
    request = _deep_request("hello", harness_context)
    critic = MagicMock()

    from app.chat_harness_thinking_trace import new_thinking_trace

    trace = new_thinking_trace(request)

    result = run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=lambda _p: "not valid json",
        draft_repair_generate=lambda _broken: "still not json",
        critic=critic,
        max_extra_passes=2,
        trace=trace,
    )
    critic.critique_draft.assert_not_called()
    assert result.critic_ran is False
    assert result.critic_skip_reason == "draft_parse_failed"
    assert trace.draft_repair_attempted is True
    assert trace.draft_repair_succeeded is False
    assert trace.passes == ["draft", "draft_repair"]
    assert "critic" not in trace.passes
    assert trace.fail_soft_reason == "draft_parse_failed"

    noted = append_deep_critic_note(
        ChatHarnessResponse(
            answer="fallback",
            used_context=False,
            confidence_notes=[],
            safety_notes=[],
        ),
        revised=False,
        critic_ran=result.critic_ran,
        critic_skip_reason=result.critic_skip_reason,
    )
    joined = " ".join(noted.confidence_notes)
    assert "structured critic skipped (draft parse failed)" in joined


def test_deep_draft_repair_succeeds_but_extra_passes_zero_skips_critic(harness_context):
    request = _deep_request("hello", harness_context)
    broken_raw = "not valid json"
    repaired_raw = _valid_draft_json("Repaired draft answer.")
    critic = MagicMock()

    from app.chat_harness_thinking_trace import new_thinking_trace

    trace = new_thinking_trace(request)

    result = run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=lambda _p: broken_raw,
        draft_repair_generate=lambda _broken: repaired_raw,
        critic=critic,
        max_extra_passes=0,
        trace=trace,
    )
    critic.critique_draft.assert_not_called()
    assert result.critic_ran is False
    assert result.critic_skip_reason == "deep_passes_disabled"
    assert result.raw == repaired_raw
    assert result.raw != broken_raw
    assert trace.passes == ["draft", "draft_repair"]
    assert "critic" not in trace.passes
    assert trace.draft_repair_succeeded is True
    ChatHarnessResponse.model_validate_json(result.raw)


def test_deep_repair_success_confidence_notes_not_skipped(harness_context):
    request = _deep_request("hello", harness_context)
    repaired_raw = _valid_draft_json()
    critic = MagicMock()
    critic.name = "mock"
    critic.critique_draft.return_value = ChatHarnessCriticVerdict(
        needs_revision=False,
        checks=[
            CriticCheckEntry(
                id=CriticCheckId.no_issue,
                severity="info",
                message="ok",
            )
        ],
        revision_instruction="",
    )

    result = run_chat_harness_deep(
        request=request,
        prompt="base",
        draft_generate=lambda _p: "not valid json",
        draft_repair_generate=lambda _broken: repaired_raw,
        critic=critic,
        max_extra_passes=2,
    )
    assert result.critic_ran is True
    noted = append_deep_critic_note(
        ChatHarnessResponse.model_validate_json(result.raw),
        revised=result.revised,
        critic_ran=result.critic_ran,
        critic_skip_reason=result.critic_skip_reason,
    )
    joined = " ".join(noted.confidence_notes).lower()
    assert "structured critic" in joined
    assert "structured critic skipped" not in joined


def test_mock_deep_draft_repair_via_client(client, harness_context):
    payload = {
        "message": "deep-draft-repair probe",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    body = response.json()
    ChatHarnessResponse.model_validate(body)
    joined = " ".join(body["confidence_notes"]).lower()
    assert "structured critic" in joined
    assert "structured critic skipped" not in joined


def test_append_deep_critic_note_skips_approved_when_draft_parse_failed():
    response = ChatHarnessResponse(
        answer="One move.",
        used_context=True,
        confidence_notes=["Inferred — test."],
        safety_notes=[],
    )
    noted = append_deep_critic_note(
        response,
        revised=False,
        critic_ran=False,
        critic_skip_reason="draft_parse_failed",
    )
    joined = " ".join(noted.confidence_notes)
    assert "approved by structured critic" not in joined
    assert "structured critic skipped (draft parse failed)" in joined
    ChatHarnessResponse.model_validate(noted.model_dump(mode="json"))


def test_deep_critic_flags_avoidance(client, harness_context):
    payload = {
        "message": "deep-critic-avoidance",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "tiny" in answer_lower or "move" in answer_lower or "career" in answer_lower
