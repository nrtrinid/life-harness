import os

from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.models import SlotHealthStatus

client = TestClient(app)


def test_health_includes_companion_fast_slot_mock():
    os.environ["SCOUT_PROVIDER"] = "mock"
    os.environ.pop("SCOUT_MAX_INPUT_CHARS", None)
    os.environ.pop("SCOUT_RAW_LAB_MAX_INPUT_CHARS", None)
    os.environ.pop("SCOUT_TIMEOUT_SECONDS", None)
    get_provider.cache_clear()
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "slots" in body
    assert body["slots"]["companion_fast"]["enabled"] is True
    assert body["slots"]["companion_fast"]["state"] == SlotHealthStatus.ready.value
    assert body["budget"]["max_input_chars"] == 18_000
    assert body["budget"]["raw_lab_max_input_chars"] == 32_000
    assert body["budget"]["timeout_seconds"] == 180.0


def test_health_slots_include_disabled_stretch_entries():
    os.environ["SCOUT_PROVIDER"] = "mock"
    get_provider.cache_clear()
    response = client.get("/health")
    body = response.json()
    assert body["slots"]["critic_small"]["enabled"] is False
    assert body["slots"]["critic_small"]["state"] == SlotHealthStatus.disabled.value
    assert body["slots"]["stretch_batch"]["enabled"] is False


def test_health_companion_fast_degraded_when_openvino_model_missing():
    os.environ["SCOUT_PROVIDER"] = "openvino"
    os.environ["SCOUT_MODEL_PATH"] = "/nonexistent/scout-model-path-health-slots"
    get_provider.cache_clear()
    from app.slots.manager import get_slot_manager

    get_slot_manager.cache_clear()
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["slots"]["companion_fast"]["state"] == SlotHealthStatus.degraded.value


def test_mock_startup_with_default_warm_on_start_does_not_fail():
    os.environ["SCOUT_PROVIDER"] = "mock"
    get_provider.cache_clear()
    with TestClient(app) as startup_client:
        response = startup_client.get("/health")
        assert response.status_code == 200
