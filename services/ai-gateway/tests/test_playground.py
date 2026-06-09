import json
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.models import HarnessContext

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


def test_playground_returns_html(client):
    response = client.get("/playground")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    body = response.text
    assert "Ask Harness Playground" in body
    assert "Dev sandbox" in body
    assert "no persistence" in body
    assert "localStorage" not in body
    assert "sessionStorage" not in body
    assert "innerHTML" not in body


def test_playground_redirect_alias(client):
    response = client.get("/ask-harness-playground", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/playground"


def test_playground_default_context(client):
    response = client.get("/playground/default-context")
    assert response.status_code == 200
    assert response.headers.get("cache-control") == "no-store"
    ctx = HarnessContext.model_validate(response.json())
    assert len(ctx.cards) == 6
