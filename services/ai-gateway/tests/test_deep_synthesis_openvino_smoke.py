"""Manual OpenVINO smoke — skipped when model weights are not present."""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.backends.openvino_backend import model_path_ready
from app.config import get_settings
from app.main import app

os.environ.setdefault("SCOUT_PROVIDER", "openvino")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"

pytestmark = pytest.mark.skipif(
    not model_path_ready(get_settings().model_path),
    reason="OpenVINO model path not ready",
)


@pytest.fixture
def client():
    return TestClient(app)


def test_deep_synthesis_openvino_smoke(client):
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    payload = {
        "trigger": "user_prompt",
        "sensitivity": "S1",
        "user_prompt": "What are we circling between build work and career?",
        "context": data,
        "pipeline_profile": "fast_only",
    }
    response = client.post("/ai/deep-synthesis", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body.get("circling")
    assert body.get("next_pounce")
