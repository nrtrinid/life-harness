import os
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, get_provider
from app.models import (
    AnalyzeTranscriptResponse,
    CardState,
    LifeArea,
    PossibleCard,
)
from app.providers.mock import INFERRED_PREFIX, MockProvider

os.environ.setdefault("SCOUT_PROVIDER", "mock")

MESSY_TRANSCRIPT = """
um so like I keep saying I'll fix my resume but instead I watched three videos
about notion setups and now it's 11pm and the day feels ruined anyway
I still need to text Alex back about coffee and I haven't gone to the gym
maybe I should research a better job board app before applying anywhere
"""


@pytest.fixture(autouse=True)
def _reset_provider_cache():
    get_provider.cache_clear()
    os.environ["SCOUT_PROVIDER"] = "mock"
    yield
    get_provider.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_health_mock_provider(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["provider"] == "mock"
    assert body["provider_ready"] is True


def test_analyze_transcript_mock_returns_strict_json(client):
    response = client.post(
        "/analyze-transcript",
        json={"text": MESSY_TRANSCRIPT, "mode": "operator", "sensitivity": "S1"},
    )
    assert response.status_code == 200
    body = response.json()
    parsed = AnalyzeTranscriptResponse.model_validate(body)
    assert parsed.summary
    assert len(parsed.themes) >= 1
    assert len(parsed.possible_cards) >= 1
    assert all(card.state == CardState.inbox for card in parsed.possible_cards)
    assert parsed.pounce_mission
    assert any(INFERRED_PREFIX in note for note in parsed.confidence_notes)


def test_s3_rejected_before_provider(client, monkeypatch):
    spy = MagicMock(side_effect=AssertionError("analyze should not be called for S3"))
    mock_provider = MockProvider()
    mock_provider.analyze = spy  # type: ignore[method-assign]
    monkeypatch.setattr("app.main.get_provider", lambda: mock_provider)

    response = client.post(
        "/analyze-transcript",
        json={"text": "therapy reflection note", "sensitivity": "S3"},
    )
    assert response.status_code == 422
    assert "S3" in response.json()["detail"]
    spy.assert_not_called()


def test_empty_text_rejected(client):
    response = client.post("/analyze-transcript", json={"text": ""})
    assert response.status_code == 422


def test_response_rejects_unknown_fields():
    valid = AnalyzeTranscriptResponse(
        summary="s",
        themes=["t"],
        possible_cards=[
            PossibleCard(
                title="T",
                area=LifeArea.build,
                state=CardState.inbox,
                next_tiny_action="a",
                why_it_matters="w",
            )
        ],
        next_actions=["a"],
        pounce_mission="p",
        things_to_park=["x"],
        patterns_detected=["p"],
        confidence_notes=["c"],
    )
    data = valid.model_dump()
    data["extra_field"] = "nope"
    with pytest.raises(ValidationError):
        AnalyzeTranscriptResponse.model_validate(data)


def test_openvino_stub_degraded_health(client):
    os.environ["SCOUT_PROVIDER"] = "openvino"
    get_provider.cache_clear()
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openvino"
    assert body["status"] == "degraded"
    assert body["provider_ready"] is False
    assert body["message"]


def test_openvino_stub_analyze_returns_503(client):
    os.environ["SCOUT_PROVIDER"] = "openvino"
    get_provider.cache_clear()
    response = client.post(
        "/analyze-transcript",
        json={"text": MESSY_TRANSCRIPT, "sensitivity": "S1"},
    )
    assert response.status_code == 503
    assert "detail" in response.json()
