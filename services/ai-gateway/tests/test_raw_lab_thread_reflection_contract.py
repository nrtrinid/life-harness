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


def test_raw_lab_thread_reflection_distills_no_handoff_steering(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "Don't ask me handoff questions. Be more independent."},
                {
                    "role": "assistant",
                    "content": "Got it, no handoffs. I'm ready. Let's see where this goes.",
                },
                {
                    "role": "user",
                    "content": "Carry the thread forward instead of asking what's next.",
                },
            ],
            "thread_state": {
                "provisional_stances": ["Got it, no handoffs. What should I do next?"]
            },
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined = str(parsed.model_dump()).lower()
    assert "avoid reflexive handoff questions" in parsed.proposals.user_steering
    assert "carry one relevant thread forward" in parsed.proposals.user_steering
    assert "got it, no handoffs" not in joined
    assert "i'm ready" not in joined
    assert parsed.used_context is False


def test_raw_lab_thread_reflection_independence_adds_bounded_steering(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "Be more independent in this scene thread."},
                {"role": "assistant", "content": "What's your take on the harbor scene?"},
            ],
            "thread_state": {},
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined = str(parsed.model_dump()).lower()
    assert "respecting explicit boundaries" in joined
    assert "i don't wait for permission" in parsed.proposals.do_not_repeat
    assert "i just do" in parsed.proposals.do_not_repeat


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


def test_raw_lab_thread_reflection_single_deferral_does_not_distill(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "show me the code for the mansion rooms"},
                {
                    "role": "assistant",
                    "content": "Ready to see how it looks?",
                },
            ],
            "thread_state": {},
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined = str(parsed.model_dump()).lower()
    assert "ask permission when i should produce" not in joined
    assert "ready to see how it looks" not in joined


def test_raw_lab_thread_reflection_repeated_deferral_distills_self_observation(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "show me the code for the mansion rooms"},
                {
                    "role": "assistant",
                    "content": "Ready to see how it looks?",
                },
                {"role": "user", "content": "yes"},
                {
                    "role": "assistant",
                    "content": "Would you like to start with the room setup?",
                },
            ],
            "thread_state": {},
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    observations = " ".join(parsed.proposals.self_observations).lower()
    do_not_repeat = [item.lower() for item in parsed.proposals.do_not_repeat]
    assert "ask permission when i should produce" in observations
    assert "ready to see how it looks?" not in observations
    assert "ready to see how it looks" in do_not_repeat


def test_raw_lab_thread_reflection_rejects_assistant_echoes_in_observations(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "Don't ask handoff questions."},
                {
                    "role": "assistant",
                    "content": "Ready to see it? I'm all ears. What's next?",
                },
            ],
            "thread_state": {
                "provisional_stances": ["Ready to see how it looks?"],
                "self_observations": ["I'm all ears when you steer."],
            },
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined_obs = " ".join(parsed.proposals.self_observations).lower()
    joined_stances = " ".join(parsed.proposals.provisional_stances).lower()
    assert "i'm all ears" not in joined_obs
    assert "ready to see" not in joined_stances
    do_not_repeat = [item.lower() for item in parsed.proposals.do_not_repeat]
    assert any("what's next" in item or "i'm all ears" in item for item in do_not_repeat)


def test_raw_lab_thread_reflection_naming_distills_raw_lab_candidate(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "Can I call you Luna for this Raw Lab thread?"},
            ],
            "thread_state": {},
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined = str(parsed.model_dump()).lower()
    assert "potential temporary name candidate for raw lab: luna" in joined
    assert "user is luna" not in joined


def test_raw_lab_thread_reflection_rejects_malformed_exploring_stance(client):
    response = client.post(
        "/raw-lab/reflect-thread",
        json={
            "recent_turns": [
                {"role": "user", "content": "I think exploring whether you're dumb is fine."},
            ],
            "thread_state": {
                "provisional_stances": [
                    "Provisional stance: exploring whether you're dumb"
                ],
            },
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    parsed = RawLabThreadReflectionResponse.model_validate(response.json())
    joined = " ".join(parsed.proposals.provisional_stances).lower()
    assert "exploring whether" not in joined
    assert "you're dumb" not in joined


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
