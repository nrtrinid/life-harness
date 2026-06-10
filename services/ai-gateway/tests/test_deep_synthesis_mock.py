import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.synthesis_jobs import clear_synthesis_jobs_for_tests
from app.synthesis_models import (
    CIRCLING_MAX_WORDS,
    CONNECTIONS_MAX,
    DeepSynthesisCompletedBody,
    DeepSynthesisQueuedBody,
)

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


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


def test_deep_synthesis_returns_completed_schema(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    DeepSynthesisCompletedBody.model_validate(body)


def test_deep_synthesis_s3_rejected(client, synthesis_payload):
    payload = {**synthesis_payload, "sensitivity": "S3"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 422
    assert "S3" in response.json()["detail"]


def test_deep_synthesis_proposals_require_approval(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    body = response.json()
    for proposal in body.get("memory_proposals", []):
        assert proposal["requires_approval"] is True
    for proposal in body.get("personality_proposals", []):
        assert proposal["requires_approval"] is True


def test_deep_synthesis_single_pounce(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    body = response.json()
    assert "next_pounce" in body
    assert body["next_pounce"]["title"]
    assert body["next_pounce"]["smallest_action"]
    assert body["next_pounce"]["grounding"]


def test_deep_synthesis_grounding_present(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    body = response.json()
    assert len(body["circling_grounding"]) >= 1
    assert len(body["strongest_idea_grounding"]) >= 1
    assert len(body["hidden_risk_grounding"]) >= 1
    for interpretation in body["interpretations"]:
        assert len(interpretation["grounding"]) >= 1


def test_deep_synthesis_output_budgets(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    body = response.json()
    assert len(body["circling"].split()) <= CIRCLING_MAX_WORDS
    assert len(body["connections"]) <= CONNECTIONS_MAX


def test_deep_synthesis_with_stretch_redirects_to_queued(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_stretch"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    DeepSynthesisQueuedBody.model_validate(body)
    assert body["redirect_reason"] == "stretch_required"

    poll = client.get(body["poll_url"])
    assert poll.status_code == 200
    assert poll.json()["status"] == "completed"


def test_deep_synthesis_with_critic_redirects_to_queued(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_critic"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    DeepSynthesisQueuedBody.model_validate(body)
    assert body["redirect_reason"] == "critic_required"

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
