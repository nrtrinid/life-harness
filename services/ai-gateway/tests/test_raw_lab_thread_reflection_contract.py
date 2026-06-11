import os

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app, get_provider
from app.models import RawLabThreadReflectionResponse, RawLabThreadState
from app.prompt_loader import build_raw_lab_thread_reflection_prompt

os.environ.setdefault("SCOUT_PROVIDER", "mock")


@pytest.fixture(autouse=True)
def _reset_provider_cache():
    get_provider.cache_clear()
    os.environ["SCOUT_PROVIDER"] = "mock"
    yield
    get_provider.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_raw_lab_thread_reflection_accepts_default_missing_state(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "Raw Lab personality keeps coming up."},
                {"role": "user", "content": "What were we circling?"},
            ],
            "thread_state": {},
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    assert parsed.used_context is False
    assert parsed.proposals.self_observations
    assert parsed.proposals.questions_to_revisit


def test_raw_lab_thread_reflection_rejects_unknown_fields(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [],
            "thread_state": {},
            "companion_self_memories": [],
            "board_context": {"cards": []},
        },
    )
    assert response.status_code == 422


def test_raw_lab_thread_reflection_mock_avoids_forbidden_claims(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "Don't keep saying entity sauce."},
                {"role": "user", "content": "I want Raw Lab identity to feel coherent."},
            ],
            "thread_state": {
                "recurring_topics": ["identity/personality"],
                "user_steering": ["be more direct"],
                "open_loops": ["How do we keep reflection inspectable?"],
                "do_not_repeat": ["entity sauce"],
            },
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined = str(parsed.model_dump()).lower()
    assert parsed.proposals.do_not_repeat
    assert parsed.proposals.user_steering == ["be more direct"]
    assert "board context" not in joined
    assert "memory bank" not in joined
    assert "conscious" not in joined
    assert "diagnos" not in joined
    assert parsed.used_context is False


def test_raw_lab_thread_reflection_prompt_names_temporary_bounds():
    prompt = build_raw_lab_thread_reflection_prompt(
        recent_turns=[],
        thread_state=RawLabThreadState(),
        companion_self_memories=[],
    ).lower()
    assert "temporary" in prompt
    assert "not durable memory" in prompt
    assert "do not expose chain-of-thought" in prompt
    assert "do not claim consciousness" in prompt
    assert "board facts" in prompt


def test_raw_lab_thread_reflection_fails_soft_for_unsupported_provider(monkeypatch, client):
    class MinimalProvider:
        name = "minimal"

    monkeypatch.setattr(main_module, "get_provider", lambda: MinimalProvider())
    response = client.post(
        "/raw-lab/reflect-thread",
        json={"recent_turns": [], "thread_state": {}, "companion_self_memories": []},
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    assert parsed.proposals.self_observations == []
    assert parsed.used_context is False
    assert "unavailable" in parsed.safety_notes[0].lower()
