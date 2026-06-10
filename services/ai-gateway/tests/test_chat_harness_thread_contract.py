import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, get_provider
from app.models import ChatHarnessRequest, ChatHarnessResponse, HarnessContext
from app.prompt_loader import build_chat_harness_prompt

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
def harness_context() -> HarnessContext:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return HarnessContext.model_validate(data)


@pytest.fixture
def chat_payload(harness_context: HarnessContext) -> dict:
    return {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "thread_state": {
            "active_goal": "Design thread intelligence",
            "current_topic": "conversation continuity",
            "task_mode": "plan",
            "open_loops": ["Add multi-turn history"],
            "references": {"likely_reference": "conversation continuity"},
        },
    }


def test_chat_harness_accepts_thread_state(client, chat_payload):
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 200
    ChatHarnessResponse.model_validate(response.json())


def test_chat_harness_thread_state_defaults_validate():
    request = ChatHarnessRequest(
        message="Hello",
        mode="general",
        sensitivity="S1",
        context=HarnessContext(),
    )
    assert request.thread_state.active_goal == ""
    assert request.thread_state.task_mode.value == "casual"


def test_chat_harness_thread_state_rejects_unknown_nested_fields(chat_payload):
    chat_payload["thread_state"]["personality"] = {"voice_traits": ["playful"]}
    with pytest.raises(ValidationError):
        ChatHarnessRequest.model_validate(chat_payload)


def test_chat_harness_prompt_includes_thread_state_json(harness_context):
    request = ChatHarnessRequest(
        message="Continue",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        thread_state={
            "active_goal": "Ship thread state",
            "current_topic": "gateway schema",
        },
    )
    prompt = build_chat_harness_prompt(request=request)
    assert "Ship thread state" in prompt
    assert "gateway schema" in prompt
    assert '"thread_state"' not in prompt


def test_s3_rejected_before_chat_harness_with_thread_state(client, chat_payload):
    chat_payload["sensitivity"] = "S3"
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 422
    assert "S3" in response.json()["detail"]
