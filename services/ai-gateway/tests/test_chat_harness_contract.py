import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, get_provider
from app.models import ChatHarnessRequest, ChatHarnessResponse, HarnessContext
from app.providers.base import CHAT_HARNESS_PARSE_FALLBACK
from app.providers.mock import MockProvider
from app.providers.openvino_provider import OpenVinoProvider

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
DEFAULT_MESSAGE = "What am I avoiding right now?"


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
def chat_payload(harness_context: HarnessContext) -> dict:
    return {
        "message": DEFAULT_MESSAGE,
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
    }


def test_chat_harness_mock_returns_strict_json(client, chat_payload):
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 200
    parsed = ChatHarnessResponse.model_validate(response.json())
    assert parsed.answer
    assert parsed.used_context is True
    assert len(parsed.confidence_notes) >= 1


def test_chat_harness_avoiding_mentions_career_body_or_build(client, chat_payload):
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    mentions_career_body = (
        "career" in answer_lower
        or "networking" in answer_lower
        or "body" in answer_lower
        or "fitness" in answer_lower
        or "cooling" in answer_lower
    )
    mentions_build_pattern = "build" in answer_lower
    assert mentions_career_body or mentions_build_pattern


def test_s3_rejected_before_chat_harness_provider(client, monkeypatch, chat_payload):
    spy = MagicMock(side_effect=AssertionError("chat_harness should not be called for S3"))
    mock_provider = MockProvider()
    mock_provider.chat_harness = spy  # type: ignore[method-assign]
    monkeypatch.setattr("app.main.get_provider", lambda: mock_provider)

    chat_payload["sensitivity"] = "S3"
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 422
    assert "S3" in response.json()["detail"]
    spy.assert_not_called()


def test_empty_message_rejected(client, chat_payload):
    chat_payload["message"] = ""
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 422


def test_chat_harness_request_rejects_unknown_fields(chat_payload):
    chat_payload["extra_field"] = "nope"
    with pytest.raises(ValidationError):
        ChatHarnessRequest.model_validate(chat_payload)


def test_chat_harness_response_rejects_extra_fields():
    valid = ChatHarnessResponse(
        answer="a",
        used_context=True,
        confidence_notes=["c"],
        safety_notes=[],
    )
    data = valid.model_dump()
    data["extra"] = "nope"
    with pytest.raises(ValidationError):
        ChatHarnessResponse.model_validate(data)


def test_openvino_chat_harness_returns_503_when_model_missing(client, chat_payload):
    os.environ["SCOUT_PROVIDER"] = "openvino"
    os.environ["SCOUT_MODEL_PATH"] = "/nonexistent/scout-model-path-phase18b"
    get_provider.cache_clear()
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 503
    assert "detail" in response.json()


def test_chat_harness_accepts_conversation_history(client, chat_payload):
    chat_payload["conversation_history"] = [
        {"role": "user", "content": "Give me three options."},
        {
            "role": "assistant",
            "content": "Option A: thread state\nOption B: multi-pass reasoning\nOption C: streaming",
        },
    ]
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 200
    ChatHarnessResponse.model_validate(response.json())


def test_chat_harness_mock_second_option_uses_history(client, harness_context):
    payload = {
        "message": "do the second one",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [
            {"role": "user", "content": "What should we build?"},
            {
                "role": "assistant",
                "content": "Option A: thread state\nOption B: multi-pass reasoning\nOption C: streaming",
            },
        ],
    }
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    answer_lower = response.json()["answer"].lower()
    assert "option b" in answer_lower or "multi-pass" in answer_lower


def test_openvino_chat_harness_parse_failure_returns_fallback_not_502(
    client, chat_payload, harness_context
):
    from app.config import get_settings

    provider = OpenVinoProvider(get_settings())
    provider._pipeline = object()
    provider._load_error = None

    request = ChatHarnessRequest(
        message=DEFAULT_MESSAGE,
        mode="general",
        sensitivity="S1",
        context=harness_context,
        conversation_history=[],
    )

    with patch.object(provider, "_generate", return_value="not valid json {{{"):
        result = provider.chat_harness(request)

        assert result.used_context is False
        assert any("Formatting failed after repair" in note for note in result.confidence_notes)
        assert result.answer == CHAT_HARNESS_PARSE_FALLBACK.answer

        with patch("app.main.get_provider", return_value=provider):
            response = client.post("/chat-harness", json=chat_payload)

    assert response.status_code == 200
    body = response.json()
    assert body["used_context"] is False
    assert any("Formatting failed after repair" in n for n in body["confidence_notes"])
