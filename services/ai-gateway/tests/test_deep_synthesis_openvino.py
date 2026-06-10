import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.deep_synthesis_openvino import run_openvino_fast_only
from app.main import app
from app.providers.base import ProviderNotReadyError
from app.synthesis_jobs import clear_synthesis_jobs_for_tests
from app.synthesis_models import DeepSynthesisCompletedBody, DeepSynthesisRequest
from app.synthesis_verifier import verify_synthesis_completed

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
DRAFT_FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "deep_synthesis_model_draft.json"
)


@pytest.fixture
def synthesis_request() -> DeepSynthesisRequest:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="What are we circling between build work and career?",
        context=data,
        pipeline_profile="fast_only",
    )


@pytest.fixture
def valid_draft_json() -> str:
    return DRAFT_FIXTURE_PATH.read_text(encoding="utf-8")


def test_openvino_invalid_json_returns_degraded_fallback(synthesis_request):
    result = run_openvino_fast_only(
        synthesis_request,
        generate=lambda _prompt: "not valid json {{{",
        max_input_chars=500_000,
    )
    assert result.status == "completed"
    DeepSynthesisCompletedBody.model_validate(result.model_dump())
    assert any("fallback" in note.lower() for note in result.degraded_notes)
    assert not verify_synthesis_completed(result)


def test_openvino_timeout_returns_degraded_fallback(synthesis_request):
    def _raise_timeout(_prompt: str) -> str:
        raise ProviderNotReadyError("Inference timed out after 30s")

    result = run_openvino_fast_only(
        synthesis_request,
        generate=_raise_timeout,
        max_input_chars=500_000,
    )
    assert result.status == "completed"
    assert any("fallback" in note.lower() for note in result.degraded_notes)
    assert any("timed out" in note.lower() for note in result.degraded_notes)


def test_openvino_repair_then_success(synthesis_request, valid_draft_json):
    calls: list[str] = []

    def _generate(prompt: str) -> str:
        calls.append(prompt)
        if len(calls) == 1:
            return "broken json"
        return valid_draft_json

    result = run_openvino_fast_only(
        synthesis_request,
        generate=_generate,
        max_input_chars=500_000,
    )
    assert len(calls) == 2
    assert result.status == "completed"
    assert not result.degraded_notes
    assert result.circling.startswith("You are circling")
    for proposal in result.memory_proposals:
        assert proposal.requires_approval is True


def test_openvino_happy_path_parses_model_draft(synthesis_request, valid_draft_json):
    result = run_openvino_fast_only(
        synthesis_request,
        generate=lambda _prompt: valid_draft_json,
        max_input_chars=500_000,
    )
    assert result.status == "completed"
    assert not result.degraded_notes
    assert result.pipeline_profile_used == "fast_only"
    assert result.phases_completed == ["digest", "interpretations", "format"]
    assert not verify_synthesis_completed(result)


def test_openvino_verifier_failure_falls_back(synthesis_request, valid_draft_json):
    with patch(
        "app.deep_synthesis_openvino.verify_synthesis_completed",
        return_value=["circling_grounding is required"],
    ):
        result = run_openvino_fast_only(
            synthesis_request,
            generate=lambda _prompt: valid_draft_json,
            max_input_chars=500_000,
        )
    assert result.status == "completed"
    assert any("fallback" in note.lower() for note in result.degraded_notes)


@pytest.fixture
def client():
    clear_synthesis_jobs_for_tests()
    yield TestClient(app)
    clear_synthesis_jobs_for_tests()


@pytest.fixture
def synthesis_payload() -> dict:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return {
        "trigger": "user_prompt",
        "sensitivity": "S1",
        "user_prompt": "What are we circling between build work and career?",
        "context": data,
        "pipeline_profile": "fast_only",
    }


def test_http_openvino_provider_routes_fast_only(client, synthesis_payload, valid_draft_json):
    fake_provider = MagicMock()
    fake_provider.name = "openvino"
    fake_provider.deep_synthesis_fast_only.return_value = DeepSynthesisCompletedBody(
        status="completed",
        synthesis_id="syn_test",
        pipeline_profile_used="fast_only",
        degraded_notes=[],
        phases_completed=["digest", "interpretations", "format"],
        circling="Test circling read from model.",
        strongest_idea="Test strongest idea.",
        hidden_risk="Test hidden risk.",
        connections=["a", "b"],
        circling_grounding=[
            {"kind": "inferred_from_prompt", "ref": "current_prompt", "label": "Prompt"}
        ],
        strongest_idea_grounding=[
            {"kind": "inferred_from_prompt", "ref": "current_prompt", "label": "Prompt"}
        ],
        hidden_risk_grounding=[
            {"kind": "inferred_from_prompt", "ref": "current_prompt", "label": "Prompt"}
        ],
        next_pounce={
            "title": "One move",
            "smallest_action": "Write one line",
            "grounding": {
                "kind": "inferred_from_prompt",
                "ref": "current_prompt",
                "label": "Prompt",
            },
        },
        interpretations=[],
        memory_proposals=[],
        personality_proposals=[],
        confidence_notes=["Scout read only — I am a local AI, not human, not conscious."],
        safety_notes=[],
    )

    with patch("app.main.get_provider", return_value=fake_provider):
        response = client.post("/ai/deep-synthesis", json=synthesis_payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["circling"] == "Test circling read from model."
    fake_provider.deep_synthesis_fast_only.assert_called_once()


def test_with_critic_still_queues_under_openvino_provider(client, synthesis_payload):
    fake_provider = MagicMock()
    fake_provider.name = "openvino"
    payload = {**synthesis_payload, "pipeline_profile": "with_critic"}

    with patch("app.main.get_provider", return_value=fake_provider):
        response = client.post("/ai/deep-synthesis", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    fake_provider.deep_synthesis_fast_only.assert_not_called()

    poll = client.get(body["poll_url"])
    assert poll.status_code == 200
    assert poll.json()["status"] == "completed"


def test_chat_harness_still_works(client):
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    payload = {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": data,
        "conversation_history": [],
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    assert "answer" in response.json()
