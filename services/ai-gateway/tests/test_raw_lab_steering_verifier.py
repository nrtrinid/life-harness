import os

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.models import RawLabThreadState
from app.thread_verifier import (
    apply_raw_lab_steering_repairs,
    ends_declaratively,
    finalize_raw_lab_answer,
    has_handoff_ending,
)

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


HANDOFF_THREAD_STATE = {
    "user_steering": ["avoid reflexive handoff questions"],
    "open_loops": [
        "Can Raw Lab become engaging through initiative instead of constant questions?"
    ],
    "do_not_repeat": [
        "what's next",
        "what's your take",
        "where should we go",
        "what should i do",
        "ready to pivot",
    ],
}

DECLARATIVE_MARKERS = (
    "carry this thread forward",
    "the next beat",
    "hold the thread",
    "thread i'm holding",
    "keep this thread centered",
    "the correction is",
    "standing constraint",
    "boundaries",
)


def test_apply_raw_lab_steering_repairs_strips_handoff_ending():
    state = RawLabThreadState.model_validate(HANDOFF_THREAD_STATE)
    repaired = apply_raw_lab_steering_repairs(
        "Raw Lab can test initiative. What's on your mind?",
        state,
        "Don't ask me handoff questions.",
    )
    assert not has_handoff_ending(repaired, do_not_repeat=state.do_not_repeat)
    assert ends_declaratively(repaired)


def test_raw_lab_mock_suppresses_handoff_questions_when_steered(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "Don't ask me handoff questions. Be more independent.",
            "recent_turns": [
                {
                    "role": "user",
                    "content": "Can Raw Lab become engaging through memory and self-observation?",
                },
                {"role": "assistant", "content": "Got it. What's your take?"},
            ],
            "thread_state": HANDOFF_THREAD_STATE,
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    forbidden_endings = (
        "what's next?",
        "what's your take?",
        "where should we go?",
        "what should i do?",
        "ready to pivot?",
        "what's on your mind?",
    )
    assert not any(answer_lower.rstrip().endswith(ending) for ending in forbidden_endings)
    assert not has_handoff_ending(
        response.json()["answer"],
        do_not_repeat=HANDOFF_THREAD_STATE["do_not_repeat"],
    )
    assert ends_declaratively(response.json()["answer"])
    assert "memory bank" not in answer_lower
    assert "hidden memory" not in answer_lower


def test_raw_lab_immediate_steering_empty_thread_state(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "i want you to stop asking handoff questions, you're killing the mood",
            "recent_turns": [],
            "thread_state": {},
        },
    )
    assert response.status_code == 200
    answer = response.json()["answer"].lower()
    assert "where do you want to begin" not in answer
    assert not has_handoff_ending(response.json()["answer"])


def test_raw_lab_reflection_no_terminal_handoff_when_steered(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "so what did you notice about yourself in this conversation?",
            "recent_turns": [
                {"role": "user", "content": "Don't ask handoff questions."},
                {"role": "assistant", "content": "What's your take?"},
            ],
            "thread_state": HANDOFF_THREAD_STATE,
        },
    )
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "what should i do next" not in answer_lower
    assert not has_handoff_ending(
        response.json()["answer"],
        do_not_repeat=HANDOFF_THREAD_STATE["do_not_repeat"],
    )


def test_raw_lab_roleplay_branch_runs_steering_finalize(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "roleplay a neutral scene by the harbor",
            "recent_turns": [],
            "thread_state": HANDOFF_THREAD_STATE,
        },
    )
    assert response.status_code == 200
    assert not has_handoff_ending(
        response.json()["answer"],
        do_not_repeat=HANDOFF_THREAD_STATE["do_not_repeat"],
    )


def test_finalize_raw_lab_answer_twice_no_duplicate_closers():
    state = RawLabThreadState.model_validate(HANDOFF_THREAD_STATE)
    once = finalize_raw_lab_answer("A point. What's next?", state, "stop checking in")
    twice = finalize_raw_lab_answer(once, state, "stop checking in")
    assert once == twice


def test_raw_lab_steering_repair_not_leaked_into_answer(client):
    response = client.post(
        "/raw-lab",
        json={
            "message": "Continue.",
            "recent_turns": [],
            "thread_state": HANDOFF_THREAD_STATE,
        },
    )
    assert response.status_code == 200
    answer = response.json()["answer"]
    assert "End declaratively without a reflexive handoff question" not in answer
    assert "Collapse unnecessary blank lines" not in answer
