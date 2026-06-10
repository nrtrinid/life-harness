import os

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider

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


def test_cors_preflight_allows_expo_web_origin(client):
    response = client.options(
        "/chat-harness",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8081"
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_cors_allows_post_from_expo_web_origin(client):
    response = client.post(
        "/chat-harness",
        headers={"Origin": "http://127.0.0.1:19006"},
        json={
            "message": "What should I do next?",
            "mode": "general",
            "sensitivity": "S1",
            "context": {
                "cards": [],
                "logs": [],
                "proof_items": [],
                "recent_analyses": [],
                "decisions": [],
            },
            "conversation_history": [],
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:19006"
    assert "answer" in response.json()


def test_cors_preflight_allows_expo_web_origin_raw_lab(client):
    response = client.options(
        "/raw-lab",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8081"
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_cors_allows_post_from_expo_web_origin_raw_lab(client):
    response = client.post(
        "/raw-lab",
        headers={"Origin": "http://127.0.0.1:19006"},
        json={
            "message": "Say something candid.",
            "recent_turns": [],
            "thread_state": {},
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:19006"
    body = response.json()
    assert body["mode"] == "raw_lab"
    assert body["used_context"] is False
