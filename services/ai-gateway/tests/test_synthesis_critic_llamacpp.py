import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.backends.llamacpp_backend import LlamaCppConnectionError, LlamaCppHttpError
from app.config import Settings
from app.main import app
from app.synthesis_critic import (
    LlamaCppSynthesisCriticBackend,
    MockSynthesisCriticBackend,
    get_synthesis_critic_backend,
    parse_synthesis_critique,
    run_synthesis_critique,
)
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

os.environ.setdefault("SCOUT_PROVIDER", "mock")

HARNESS_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


@pytest.fixture
def harness_context() -> dict:
    return json.loads(HARNESS_FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def synthesis_request(harness_context) -> DeepSynthesisRequest:
    return DeepSynthesisRequest(
        trigger="user_prompt",
        sensitivity="S1",
        user_prompt="What are we circling between build work and career?",
        context=harness_context,
        pipeline_profile="with_critic",
    )


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

_CRITIC_SETTINGS = dict(
    critic_runtime="llamacpp",
    critic_base_url="http://127.0.0.1:8120/v1",
    critic_model="phi-4-reasoning-plus",
    critic_timeout_seconds=30.0,
    critic_heavy=False,
)


def _settings_with_critic(**overrides) -> Settings:
    base = Settings.from_env()
    critic_fields = {**_CRITIC_SETTINGS, **overrides}
    return Settings(
        provider=base.provider,
        host=base.host,
        port=base.port,
        model_path=base.model_path,
        model_id=base.model_id,
        device=base.device,
        max_new_tokens=base.max_new_tokens,
        timeout_seconds=base.timeout_seconds,
        max_input_chars=base.max_input_chars,
        raw_lab_max_input_chars=base.raw_lab_max_input_chars,
        temperature=base.temperature,
        raw_lab_max_new_tokens=base.raw_lab_max_new_tokens,
        raw_lab_temperature=base.raw_lab_temperature,
        raw_lab_repetition_penalty=base.raw_lab_repetition_penalty,
        dev_cors=base.dev_cors,
        deep_enabled=base.deep_enabled,
        chat_harness_native_chat=base.chat_harness_native_chat,
        deep_max_extra_passes=base.deep_max_extra_passes,
        models_config_path=base.models_config_path,
        warm_slots=base.warm_slots,
        critic_slot=base.critic_slot,
        critic_model_path=base.critic_model_path,
        llama_base_url=base.llama_base_url,
        llama_timeout_seconds=base.llama_timeout_seconds,
        llama_api_key=base.llama_api_key,
        llama_base_url_explicit=base.llama_base_url_explicit,
        critic_runtime=critic_fields["critic_runtime"],
        critic_base_url=critic_fields["critic_base_url"],
        critic_model=critic_fields["critic_model"],
        critic_timeout_seconds=critic_fields["critic_timeout_seconds"],
        critic_heavy=critic_fields["critic_heavy"],
    )


def _valid_critique_json(**overrides) -> str:
    payload = {
        "shallow_flags": ["generic advice"],
        "missing": [],
        "avoidance": [],
        "contradictions": [],
        "overall": "revise",
        "revision_brief": "Ground in active cards.",
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_parse_synthesis_critique_valid():
    parsed = parse_synthesis_critique(_valid_critique_json())
    assert parsed is not None
    assert parsed.overall == "revise"
    assert parsed.shallow_flags == ["generic advice"]


def test_parse_synthesis_critique_invalid_returns_none():
    assert parse_synthesis_critique("not json") is None
    assert parse_synthesis_critique('{"overall": "maybe"}') is None


def test_parse_synthesis_critique_extracts_fenced_json():
    raw = (
        "Verdict:\n```json\n"
        '{"shallow_flags":[],"missing":[],"avoidance":[],"contradictions":[],'
        '"overall":"pass"}\n```'
    )
    parsed = parse_synthesis_critique(raw)
    assert parsed is not None
    assert parsed.overall == "pass"


def test_parse_synthesis_critique_strips_thinking_tags():
    raw = (
        "internal reasoning\n"
        '{"shallow_flags":["generic"],"missing":[],"avoidance":[],"contradictions":[],'
        '"overall":"revise","revision_brief":"Ground the read."}'
    )
    parsed = parse_synthesis_critique(raw)
    assert parsed is not None
    assert parsed.overall == "revise"
    assert parsed.shallow_flags == ["generic"]


def test_llamacpp_critic_uses_parsed_json(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    settings = _settings_with_critic()

    def generate(_prompt: str) -> str:
        return _valid_critique_json(missing=["board grounding"])

    backend = LlamaCppSynthesisCriticBackend(settings=settings, generate=generate)
    critique, notes = backend.critique_draft(
        request=synthesis_request,
        context_block="Active card: EV Tracker",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert critique.missing == ["board grounding"]
    assert notes == []


def test_llamacpp_critic_falls_back_on_invalid_json(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    settings = _settings_with_critic()
    backend = LlamaCppSynthesisCriticBackend(
        settings=settings,
        generate=lambda _p: "not valid json",
    )
    critique, notes = backend.critique_draft(
        request=synthesis_request,
        context_block="Active card: EV Tracker",
        draft=draft,
    )
    assert critique.overall == "revise"
    assert any("parse failed" in note.lower() for note in notes)


def test_llamacpp_critic_falls_back_on_connection_error(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    settings = _settings_with_critic()

    def raise_connection(_prompt: str) -> str:
        raise LlamaCppConnectionError("connection refused")

    backend = LlamaCppSynthesisCriticBackend(settings=settings, generate=raise_connection)
    critique, notes = backend.critique_draft(
        request=synthesis_request,
        context_block="",
        draft=draft,
    )
    mock_critique, _ = MockSynthesisCriticBackend().critique_draft(
        request=synthesis_request,
        context_block="",
        draft=draft,
    )
    assert critique.overall == mock_critique.overall
    assert any("llamacpp unavailable" in note.lower() for note in notes)


def test_llamacpp_critic_falls_back_on_http_error(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    settings = _settings_with_critic()

    def raise_http(_prompt: str) -> str:
        raise LlamaCppHttpError(503, "down")

    backend = LlamaCppSynthesisCriticBackend(settings=settings, generate=raise_http)
    _critique, notes = backend.critique_draft(
        request=synthesis_request,
        context_block="",
        draft=draft,
    )
    assert any("llamacpp unavailable" in note.lower() for note in notes)


def test_get_synthesis_critic_backend_routes_llamacpp():
    settings = _settings_with_critic()
    backend = get_synthesis_critic_backend(settings)
    assert backend.name == "llamacpp_synthesis_critic"


def test_get_synthesis_critic_backend_defaults_mock():
    settings = _settings_with_critic(critic_runtime="mock")
    backend = get_synthesis_critic_backend(settings)
    assert backend.name == "mock_rules"


def test_run_synthesis_critique_returns_tuple(synthesis_request):
    draft = _prompt_only_draft(synthesis_request)
    critique, notes = run_synthesis_critique(
        request=synthesis_request,
        context_block="",
        draft=draft,
        settings=_settings_with_critic(critic_runtime="mock"),
    )
    assert isinstance(critique, SynthesisCritique)
    assert isinstance(notes, list)


@pytest.fixture
def client():
    clear_synthesis_jobs_for_tests()
    yield TestClient(app)
    clear_synthesis_jobs_for_tests()


def test_with_critic_job_completes_when_llama_critic_fails(client, synthesis_request):
    harness_context = json.loads(HARNESS_FIXTURE.read_text(encoding="utf-8"))
    payload = {
        "trigger": "user_prompt",
        "sensitivity": "S1",
        "user_prompt": synthesis_request.user_prompt,
        "context": harness_context,
        "pipeline_profile": "with_critic",
    }
    settings = _settings_with_critic()

    def failing_generate(_prompt: str) -> str:
        raise LlamaCppConnectionError("down")

    with patch(
        "app.synthesis_critic.get_synthesis_critic_backend",
        return_value=LlamaCppSynthesisCriticBackend(
            settings=settings,
            generate=failing_generate,
        ),
    ):
        enqueue = client.post("/ai/deep-synthesis-jobs", json=payload)
        assert enqueue.status_code == 200
        poll = client.get(enqueue.json()["poll_url"])
        job = poll.json()
        assert job["status"] == "completed"
        result = job["result"]
        assert result["critique"]["overall"] in ("pass", "revise")
        notes = result.get("degraded_notes", []) + result.get("confidence_notes", [])
        assert any("mock rules critic" in note.lower() for note in notes)
