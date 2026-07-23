from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import build_app
from tests.conftest import load_fixture


def test_settings_from_env_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(__import__("os").environ):
        if key.startswith("ACGW_"):
            monkeypatch.delenv(key, raising=False)
    cfg = Settings.from_env()
    assert cfg.host == "127.0.0.1"
    assert cfg.port == 8131
    assert cfg.provider == "mock"
    assert cfg.allow_no_auth is False
    assert cfg.auth_token == ""
    assert cfg.enable_real is False


def test_importing_app_main_does_not_listen() -> None:
    import app.main as main_mod

    assert main_mod.app is not None
    assert callable(main_mod.build_app)


def test_build_app_allow_no_auth_warning(caplog: pytest.LogCaptureFixture) -> None:
    cfg = Settings(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
    )
    with caplog.at_level(logging.WARNING, logger="acgw"):
        with TestClient(build_app(cfg)):
            pass
    assert any(
        "ACGW_ALLOW_NO_AUTH=1: authentication DISABLED" in record.message
        for record in caplog.records
    )


def test_empty_provider_scenario(client) -> None:
    response = client.post("/v1/messages", json=load_fixture("empty_provider.json"))
    assert response.status_code == 500
    body = response.json()
    assert body["type"] == "error"
    assert body["error"]["type"] == "api_error"
    assert "empty" in body["error"]["message"].lower()
