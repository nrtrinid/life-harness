import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deep_synthesis import _job_id_for_request
from app.main import app
from app.synthesis_jobs import clear_synthesis_jobs_for_tests
from app.synthesis_models import (
    AiJobStatusResponse,
    DeepSynthesisJobEnqueueResponse,
    DeepSynthesisRequest,
    DeepSynthesisResultBody,
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


def test_fast_only_sync_still_completes(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["synthesis_id"]


def test_with_critic_sync_queues_pollable_job(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_critic"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["redirect_reason"] == "critic_required"

    poll = client.get(body["poll_url"])
    assert poll.status_code == 200
    job = poll.json()
    assert job["status"] == "completed"
    assert job["job_kind"] == "deep_synthesis"
    AiJobStatusResponse.model_validate(job)
    DeepSynthesisResultBody.model_validate(job["result"])
    assert job["result"]["pipeline_profile_used"] == "with_critic"
    assert job["result"]["critique"] is not None
    assert "critic" in job["result"]["phases_completed"]


def test_with_stretch_sync_queues_pollable_job(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_stretch"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["redirect_reason"] == "stretch_required"

    poll = client.get(body["poll_url"])
    assert poll.status_code == 200
    job = poll.json()
    assert job["status"] == "completed"
    assert job["result"]["pipeline_profile_used"] == "with_stretch"
    assert job["result"]["stretch_slot_status"] == "slot_unavailable"


def test_deep_synthesis_jobs_enqueue_response(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_critic"}
    response = client.post("/ai/deep-synthesis-jobs", json=payload)
    assert response.status_code == 200
    body = response.json()
    DeepSynthesisJobEnqueueResponse.model_validate(body)
    assert body["job_id"]
    assert body["poll_url"] == f"/ai/jobs/{body['job_id']}"
    assert body["created_at"]
    assert body["phase"] == "queued"
    assert body["job_kind"] == "deep_synthesis"


def test_get_job_returns_completed_mock_result(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_stretch"}
    enqueue = client.post("/ai/deep-synthesis-jobs", json=payload)
    job_id = enqueue.json()["job_id"]

    response = client.get(f"/ai/jobs/{job_id}")
    assert response.status_code == 200
    job = response.json()
    AiJobStatusResponse.model_validate(job)
    assert job["status"] == "completed"
    assert job["completed_at"]
    result = job["result"]
    DeepSynthesisResultBody.model_validate(result)
    for proposal in result.get("memory_proposals", []):
        assert proposal["requires_approval"] is True
    for proposal in result.get("personality_proposals", []):
        assert proposal["requires_approval"] is True


def test_with_stretch_slot_ready_not_wired_sets_status(client, synthesis_payload, monkeypatch):
    class _FakeManager:
        def acquire(self, _slot_id: str):
            return object()

    monkeypatch.setattr("app.slots.manager.get_slot_manager", lambda: _FakeManager())

    payload = {**synthesis_payload, "pipeline_profile": "with_stretch"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    body = response.json()
    poll = client.get(body["poll_url"])
    job = poll.json()
    assert job["status"] == "completed"
    assert job["result"]["pipeline_profile_used"] == "with_stretch"
    assert job["result"]["stretch_slot_status"] == "slot_ready_not_wired"


def test_unknown_job_returns_404(client):
    response = client.get("/ai/jobs/job_does_not_exist")
    assert response.status_code == 404


def test_s3_rejected_before_job_creation(client, synthesis_payload):
    payload = {**synthesis_payload, "sensitivity": "S3", "pipeline_profile": "with_critic"}
    response = client.post("/ai/deep-synthesis-jobs", json=payload)
    assert response.status_code == 422
    assert "S3" in response.json()["detail"]

    request = DeepSynthesisRequest.model_validate(payload)
    job_id = _job_id_for_request(request)
    poll = client.get(f"/ai/jobs/{job_id}")
    assert poll.status_code == 404


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
