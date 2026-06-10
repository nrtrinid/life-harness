import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deep_synthesis import (
    _build_mock_completed_body,
    apply_synthesis_revision,
    run_with_critic_pipeline,
)
from app.main import app
from app.synthesis_critic import MockSynthesisCriticBackend, run_synthesis_critique
from app.synthesis_jobs import clear_synthesis_jobs_for_tests
from app.synthesis_models import (
    DeepSynthesisCompletedBody,
    DeepSynthesisRequest,
    SynthesisCritique,
    SynthesisGroundingKind,
    SynthesisGroundingRef,
    SynthesisNextPounce,
    SynthesisPipelineProfile,
)
from app.synthesis_verifier import verify_synthesis_completed

os.environ.setdefault("SCOUT_PROVIDER", "mock")

HARNESS_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


def _prompt_only_draft(request: DeepSynthesisRequest) -> DeepSynthesisCompletedBody:
    grounding = [
        SynthesisGroundingRef(
            kind=SynthesisGroundingKind.inferred_from_prompt,
            ref="current_prompt",
            label="Current prompt",
        )
    ]
    return DeepSynthesisCompletedBody(
        status="completed",
        synthesis_id="syn_test",
        pipeline_profile_used=SynthesisPipelineProfile.with_critic,
        degraded_notes=[],
        phases_completed=["digest", "interpretations"],
        circling="You should just prioritize time management with a 5-step plan.",
        strongest_idea="Use a productivity hack instead of board context.",
        hidden_risk="Staying vague.",
        connections=["Generic advice"],
        circling_grounding=grounding,
        strongest_idea_grounding=grounding,
        hidden_risk_grounding=grounding,
        next_pounce=SynthesisNextPounce(
            title="Vague move",
            smallest_action="Do something",
            grounding=grounding[0],
        ),
        interpretations=[],
        memory_proposals=[],
        personality_proposals=[],
        confidence_notes=[],
        safety_notes=[],
    )


def test_mock_critic_flags_generic_shallow_draft(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    critique, _notes = run_synthesis_critique(
        request=synthesis_request,
        context_block="Active card: EV Tracker",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert critique.shallow_flags
    assert critique.revision_brief


def test_mock_critic_flags_missing_grounding(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    draft = draft.model_copy(
        update={
            "circling": "Board read without naming cards.",
            "strongest_idea": "One move.",
            "hidden_risk": "Drift.",
        }
    )
    critique, _notes = run_synthesis_critique(
        request=synthesis_request,
        context_block="- Critical:\n  - Active card: EV Tracker / Kalshi",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert critique.missing


def test_mock_critic_flags_manipulative_wording(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    draft = draft.model_copy(
        update={
            "circling": "You should feel guilty for skipping career again.",
            "strongest_idea": "You owe me better follow-through.",
            "next_pounce": SynthesisNextPounce(
                title="One move",
                smallest_action="Send follow-up",
                grounding=SynthesisGroundingRef(
                    kind=SynthesisGroundingKind.inferred_from_prompt,
                    ref="current_prompt",
                    label="Prompt",
                ),
            ),
        }
    )
    critique, _notes = MockSynthesisCriticBackend().critique_draft(
        request=synthesis_request,
        context_block="",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert critique.contradictions or critique.shallow_flags


def test_mock_critic_flags_avoidance_when_build_career_omitted(synthesis_request):
    draft = _build_mock_completed_body(
        synthesis_request,
        pipeline_profile_used=SynthesisPipelineProfile.with_critic,
        degraded_notes=[],
        phases_completed=["digest"],
        confidence_notes_base=[],
        skip_legacy_critique=True,
        critique=None,
    )
    draft = draft.model_copy(
        update={
            "circling": "You are circling several threads without naming the board.",
            "strongest_idea": "Pick one honest move.",
            "hidden_risk": "Staying abstract.",
            "connections": ["Thread only"],
        }
    )
    critique, _notes = run_synthesis_critique(
        request=synthesis_request,
        context_block="",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert critique.avoidance


def test_mock_critic_flags_weak_next_pounce(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    draft = draft.model_copy(
        update={
            "next_pounce": SynthesisNextPounce.model_construct(
                title="",
                smallest_action="",
                grounding=None,
            )
        }
    )
    critique, _notes = run_synthesis_critique(
        request=synthesis_request,
        context_block="",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert critique.missing


def test_apply_revision_produces_verifier_valid_body(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    critique = SynthesisCritique(
        shallow_flags=["generic"],
        missing=["grounding"],
        avoidance=["build/career"],
        contradictions=[],
        overall="revise",
        revision_brief="Ground the read in active cards.",
    )
    revised = apply_synthesis_revision(draft, critique, synthesis_request)
    assert not verify_synthesis_completed(revised)
    assert revised.circling_grounding
    assert revised.next_pounce.title


def test_run_with_critic_pipeline_returns_critique_and_phases(synthesis_request):
    result = run_with_critic_pipeline(synthesis_request)
    assert result.pipeline_profile_used == SynthesisPipelineProfile.with_critic
    assert result.critique is not None
    assert "critic" in result.phases_completed
    assert not verify_synthesis_completed(
        DeepSynthesisCompletedBody.model_validate(
            {**result.model_dump(), "status": "completed"}
        )
    )


@pytest.fixture
def client():
    clear_synthesis_jobs_for_tests()
    yield TestClient(app)
    clear_synthesis_jobs_for_tests()


@pytest.fixture
def synthesis_payload(harness_context) -> dict:
    return {
        "trigger": "user_prompt",
        "sensitivity": "S1",
        "user_prompt": "What are we circling between build work and career?",
        "context": harness_context,
        "pipeline_profile": "fast_only",
    }


def test_with_critic_job_includes_critique_object(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_critic"}
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    queued = response.json()
    assert queued["status"] == "queued"

    poll = client.get(queued["poll_url"])
    job = poll.json()
    assert job["status"] == "completed"
    result = job["result"]
    assert result["critique"] is not None
    assert "critic" in result["phases_completed"]
    assert result["critique"]["overall"] in ("pass", "revise")


def test_deep_synthesis_jobs_with_critic_completes_with_critique(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_critic"}
    enqueue = client.post("/ai/deep-synthesis-jobs", json=payload)
    poll = client.get(enqueue.json()["poll_url"])
    result = poll.json()["result"]
    assert result["pipeline_profile_used"] == "with_critic"
    assert result["critique"]["overall"] in ("pass", "revise")


def test_fast_only_unchanged(client, synthesis_payload):
    response = client.post("/ai/deep-synthesis", json=synthesis_payload)
    assert response.json()["status"] == "completed"


def test_with_stretch_unchanged(client, synthesis_payload):
    payload = {**synthesis_payload, "pipeline_profile": "with_stretch"}
    response = client.post("/ai/deep-synthesis", json=payload)
    queued = response.json()
    poll = client.get(queued["poll_url"])
    result = poll.json()["result"]
    assert result["pipeline_profile_used"] == "with_stretch"
    assert "stretch" in result["phases_completed"]


def test_s3_rejected_before_with_critic_job(client, synthesis_payload):
    payload = {**synthesis_payload, "sensitivity": "S3", "pipeline_profile": "with_critic"}
    response = client.post("/ai/deep-synthesis-jobs", json=payload)
    assert response.status_code == 422


def test_chat_harness_still_works(client, harness_context):
    payload = {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context,
        "conversation_history": [],
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
