import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider

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
def chat_payload() -> dict:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": data,
        "conversation_history": [],
    }


def test_chat_harness_defaults_reasoning_depth_to_fast(client, chat_payload):
    response = client.post("/chat-harness", json=chat_payload)
    assert response.status_code == 200
    notes = response.json().get("confidence_notes", [])
    assert not any("Deliberate mode" in note for note in notes)
    assert not any("Deep mode" in note for note in notes)


@pytest.mark.parametrize("depth", ["fast", "deliberate", "deep"])
def test_chat_harness_accepts_reasoning_depth(client, chat_payload, depth: str):
    payload = {**chat_payload, "reasoning_depth": depth}
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200


def test_chat_harness_deliberate_includes_confidence_note(client, chat_payload):
    payload = {**chat_payload, "reasoning_depth": "deliberate"}
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    notes = response.json().get("confidence_notes", [])
    assert any("Deliberate mode" in note for note in notes)


def test_chat_harness_deep_includes_confidence_note(client, chat_payload):
    payload = {**chat_payload, "reasoning_depth": "deep"}
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    notes = response.json().get("confidence_notes", [])
    assert any("Deep mode" in note for note in notes)


def test_chat_harness_rejects_invalid_reasoning_depth(client, chat_payload):
    payload = {**chat_payload, "reasoning_depth": "turbo"}
    response = client.post("/chat-harness", json=payload)
    assert response.status_code == 422
