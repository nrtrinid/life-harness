import os

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.models import RawLabCompanionSelfMemory, RawLabResponse
from app.prompt_loader import build_raw_lab_system_prompt

os.environ.setdefault("SCOUT_PROVIDER", "mock")

DIRECTION_SELF_MEMORY_TEXT = (
    "I want to learn to choose a direction myself and stop asking the user for what's next."
)


@pytest.fixture(autouse=True)
def _reset_provider_cache():
    get_provider.cache_clear()
    os.environ["SCOUT_PROVIDER"] = "mock"
    yield
    get_provider.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


def _direction_self_memory() -> RawLabCompanionSelfMemory:
    return RawLabCompanionSelfMemory(
        id="mem-direction-1",
        kind="self_observation",
        subject="companion_self",
        scope="raw_lab",
        text=DIRECTION_SELF_MEMORY_TEXT,
        confidence=0.8,
        sensitivity="S0",
    )


def test_raw_lab_prompt_includes_runtime_awareness():
    prompt = build_raw_lab_system_prompt().lower()
    assert "## runtime awareness" in prompt
    assert "companion self-memories" in prompt
    assert "memory bank" in prompt
    assert "you cannot directly save or modify memory yourself" in prompt
    assert "you cannot save memory" not in prompt
    assert "hidden memory" in prompt
    assert "shell tools" in prompt


def test_build_raw_lab_system_prompt_self_memory_count_zero():
    prompt = build_raw_lab_system_prompt(companion_self_memories=[])
    assert "Active Companion Self-Memories in this request: 0" in prompt
    assert "No approved companion self-memories were provided" in prompt
    assert "These are approved self-memories you may reference" not in prompt


def test_build_raw_lab_system_prompt_self_memory_count_nonzero():
    memories = [_direction_self_memory(), _direction_self_memory().model_copy(update={"id": "mem-2"})]
    prompt = build_raw_lab_system_prompt(companion_self_memories=memories)
    assert "Active Companion Self-Memories in this request: 2" in prompt
    assert "These are approved self-memories you may reference as Raw Lab." in prompt
    assert DIRECTION_SELF_MEMORY_TEXT in prompt


def test_raw_lab_acknowledges_direction_self_memory_on_capability_question(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "What memories do you have access to?",
            "recent_turns": [],
            "thread_state": {},
            "companion_self_memories": [_direction_self_memory().model_dump(mode="json")],
        },
    )
    assert response.status_code == 200
    parsed = RawLabResponse.model_validate(response.json())
    assert parsed.used_context is False
    answer_lower = parsed.answer.lower()
    assert "companion self-memor" in answer_lower
    assert "approved" in answer_lower
    assert "choose a direction" in answer_lower or "what's next" in answer_lower
    assert "memory bank" not in answer_lower or "not memory bank" in answer_lower
    assert "no memories at all" not in answer_lower
    assert "hidden memory" not in answer_lower or "not hidden memory" in answer_lower
    assert "board context" not in answer_lower or "not board" in answer_lower


def test_raw_lab_mock_no_false_memory_when_empty(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "What memories do you have access to?",
            "recent_turns": [],
            "thread_state": {},
            "companion_self_memories": [],
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "no approved companion self-memories were provided" in answer_lower
    assert "choose a direction" not in answer_lower


@pytest.mark.parametrize(
    "forbidden_field",
    [
        "board_context",
        "memory_context",
        "context",
        "proposed_card_updates",
        "tools_enabled",
        "save_summary",
        "conversation_history",
    ],
)
def test_raw_lab_still_rejects_forbidden_fields(client, forbidden_field):
    payload = {
        "message": "hello",
        "recent_turns": [],
        "thread_state": {},
        "companion_self_memories": [],
    }
    payload[forbidden_field] = {"anything": True}
    response = client.post("/raw-lab", json=payload)
    assert response.status_code == 422
