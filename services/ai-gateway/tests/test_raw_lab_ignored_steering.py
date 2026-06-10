import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.thread_verifier import VerificationResult

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


def test_raw_lab_ignored_steering_repair_shortens_answer(client):
    payload = {
        "message": "make it shorter",
        "recent_turns": [
            {"role": "user", "content": "Tell me something."},
            {"role": "assistant", "content": "Short prior answer."},
        ],
        "thread_state": {},
    }

    with patch(
        "app.providers.mock.verify_raw_lab_response",
        return_value=VerificationResult(
            ok=False,
            check="ignored_steering",
            repair_instruction="Rewrite more concisely.",
        ),
    ):
        response = client.post("/raw-lab", json=payload)

    assert response.status_code == 200
    answer = response.json()["answer"]
    assert len(answer) < 200


def test_raw_lab_repair_not_in_request_recent_turns(client):
    payload = {
        "message": "make it shorter",
        "recent_turns": [
            {"role": "assistant", "content": "A moderately long prior assistant answer here."},
        ],
        "thread_state": {},
    }

    with patch(
        "app.providers.mock.verify_raw_lab_response",
        return_value=VerificationResult(
            ok=False,
            check="ignored_steering",
            repair_instruction="Rewrite more concisely.",
        ),
    ):
        response = client.post("/raw-lab", json=payload)

    assert response.status_code == 200
    assert "Rewrite more concisely" not in response.json()["answer"]


@pytest.mark.parametrize(
    "forbidden_field",
    [
        "context",
        "board_context",
        "memory_context",
        "conversation_history",
        "proposed_card_updates",
        "tools_enabled",
        "save_summary",
    ],
)
def test_raw_lab_still_rejects_forbidden_fields(client, forbidden_field):
    payload = {
        "message": "hello",
        "recent_turns": [],
        "thread_state": {},
        forbidden_field: "nope",
    }
    response = client.post("/raw-lab", json=payload)
    assert response.status_code == 422
