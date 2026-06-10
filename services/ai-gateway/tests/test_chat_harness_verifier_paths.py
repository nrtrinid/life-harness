import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.models import ChatHarnessResponse
from app.thread_verifier import VerificationResult

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


@pytest.fixture(autouse=True)
def _reset_provider_cache():
    get_provider.cache_clear()
    os.environ["SCOUT_PROVIDER"] = "mock"
    yield
    get_provider.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def harness_context() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_continue_path_invokes_verifier(client, harness_context):
    payload = {
        "message": "continue",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context,
        "conversation_history": [
            {"role": "user", "content": "What next?"},
            {"role": "assistant", "content": "Try one tiny move on your hottest build card."},
        ],
    }

    with patch("app.chat_harness_finalize.verify_chat_harness_response") as verify_mock:
        verify_mock.return_value = VerificationResult(ok=True, check="ok")
        response = client.post("/chat-harness", json=payload)

    assert response.status_code == 200
    verify_mock.assert_called_once()


def test_shorter_path_can_trigger_ignored_steering_repair(client, harness_context):
    long_answer = " ".join(["word"] * 80)
    payload = {
        "message": "make it shorter",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context,
        "conversation_history": [
            {"role": "assistant", "content": long_answer},
        ],
    }

    with patch("app.chat_harness_finalize.verify_chat_harness_response") as verify_mock:
        verify_mock.return_value = VerificationResult(
            ok=False,
            check="ignored_steering",
            repair_instruction="Rewrite more concisely.",
        )
        response = client.post("/chat-harness", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert any("repaired ignored_steering" in note for note in data["confidence_notes"])
    assert len(data["answer"]) < len(long_answer)


def test_finalize_repair_called_at_most_once(client, harness_context):
    payload = {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context,
        "conversation_history": [],
    }

    with patch("app.providers.mock.MockProvider._repair_chat_harness_mock") as repair_mock:
        repair_mock.side_effect = lambda verification, request, response: response
        with patch("app.chat_harness_finalize.verify_chat_harness_response") as verify_mock:
            verify_mock.return_value = VerificationResult(
                ok=False,
                check="board_mutation_claim",
                repair_instruction="Do not claim board updates.",
            )
            response = client.post("/chat-harness", json=payload)

    assert response.status_code == 200
    repair_mock.assert_called_once()


def test_repaired_response_matches_schema(client, harness_context):
    payload = {
        "message": "continue",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context,
        "conversation_history": [
            {"role": "assistant", "content": "Prior answer about thread state."},
        ],
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    ChatHarnessResponse.model_validate(response.json())
