import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, get_provider
from app.models import (
    AskHarnessRequest,
    AskHarnessResponse,
    HarnessContext,
    ProposedCardUpdate,
)
from app.providers.mock import INFERRED_PREFIX, MockProvider

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
DEFAULT_QUESTION = "What am I avoiding right now?"


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
def harness_context() -> HarnessContext:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return HarnessContext.model_validate(data)


@pytest.fixture
def ask_payload(harness_context: HarnessContext) -> dict:
    return {
        "question": DEFAULT_QUESTION,
        "mode": "operator",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
    }


def test_synthetic_harness_context_fixture_loads():
    assert FIXTURE_PATH.is_file()
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    ctx = HarnessContext.model_validate(data)
    assert len(ctx.cards) == 6
    assert len(ctx.logs) >= 4


def test_ask_harness_mock_returns_strict_json(client, ask_payload):
    response = client.post("/ask-harness", json=ask_payload)
    assert response.status_code == 200
    parsed = AskHarnessResponse.model_validate(response.json())
    assert parsed.answer
    assert len(parsed.grounding) >= 1
    assert any(INFERRED_PREFIX in note for note in parsed.confidence_notes)


def test_ask_harness_avoiding_question_grounded_in_career_body(client, ask_payload):
    response = client.post("/ask-harness", json=ask_payload)
    assert response.status_code == 200
    body = response.json()
    answer_lower = body["answer"].lower()
    assert "career" in answer_lower or "networking" in answer_lower
    assert "body" in answer_lower or "fitness" in answer_lower or "cooling" in answer_lower
    source_types = {g["source_type"] for g in body["grounding"]}
    assert source_types & {"card", "log"}


def test_s3_rejected_before_ask_harness_provider(client, monkeypatch, ask_payload):
    spy = MagicMock(side_effect=AssertionError("ask_harness should not be called for S3"))
    mock_provider = MockProvider()
    mock_provider.ask_harness = spy  # type: ignore[method-assign]
    monkeypatch.setattr("app.main.get_provider", lambda: mock_provider)

    ask_payload["sensitivity"] = "S3"
    response = client.post("/ask-harness", json=ask_payload)
    assert response.status_code == 422
    assert "S3" in response.json()["detail"]
    spy.assert_not_called()


def test_empty_question_rejected(client, ask_payload):
    ask_payload["question"] = ""
    response = client.post("/ask-harness", json=ask_payload)
    assert response.status_code == 422


def test_ask_harness_request_rejects_unknown_fields(ask_payload):
    ask_payload["extra_field"] = "nope"
    with pytest.raises(ValidationError):
        AskHarnessRequest.model_validate(ask_payload)


def test_ask_harness_response_rejects_false_requires_approval():
    data = {
        "answer": "test",
        "grounding": [{"source_type": "none", "label": "x", "summary": "y"}],
        "patterns_detected": ["p"],
        "suggested_next_actions": ["a"],
        "proposed_card_updates": [
            {
                "card_title": "Career / Networking",
                "proposed_change": "Unpark",
                "requires_approval": False,
            }
        ],
        "confidence_notes": ["c"],
        "safety_notes": [],
    }
    with pytest.raises(ValidationError):
        AskHarnessResponse.model_validate(data)


def test_proposed_card_update_literal_requires_approval():
    update = ProposedCardUpdate(
        card_title="Test",
        proposed_change="Change",
        requires_approval=True,
    )
    assert update.requires_approval is True


def test_openvino_ask_harness_returns_503_when_model_missing(client, ask_payload):
    os.environ["SCOUT_PROVIDER"] = "openvino"
    os.environ["SCOUT_MODEL_PATH"] = "/nonexistent/scout-model-path-phase18"
    get_provider.cache_clear()
    response = client.post("/ask-harness", json=ask_payload)
    assert response.status_code == 503
    assert "detail" in response.json()


def test_ask_harness_response_rejects_extra_fields():
    valid = AskHarnessResponse(
        answer="a",
        grounding=[],
        patterns_detected=[],
        suggested_next_actions=[],
        proposed_card_updates=[],
        confidence_notes=[],
        safety_notes=[],
    )
    data = valid.model_dump()
    data["extra"] = "nope"
    with pytest.raises(ValidationError):
        AskHarnessResponse.model_validate(data)
