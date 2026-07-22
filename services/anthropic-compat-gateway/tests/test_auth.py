from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import build_app
from tests.conftest import load_fixture


def _authed_settings(**overrides: object) -> Settings:
    base = dict(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="secret-token",
        allow_no_auth=False,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
    )
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_auth_not_required_when_allow_no_auth(client) -> None:
    response = client.post("/v1/messages", json=load_fixture("plain_text.json"))
    assert response.status_code == 200


def test_allow_no_auth_false_empty_token_fails_startup() -> None:
    cfg = Settings(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=False,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
    )
    app = build_app(cfg)
    with pytest.raises(RuntimeError, match="ACGW_AUTH_TOKEN is required"):
        with TestClient(app):
            pass


def test_auth_bearer_accepted() -> None:
    app = build_app(_authed_settings())
    with TestClient(app) as client:
        response = client.post(
            "/v1/messages",
            json=load_fixture("plain_text.json"),
            headers={"Authorization": "Bearer secret-token"},
        )
    assert response.status_code == 200


def test_auth_x_api_key_accepted() -> None:
    app = build_app(_authed_settings())
    with TestClient(app) as client:
        response = client.post(
            "/v1/messages",
            json=load_fixture("plain_text.json"),
            headers={"x-api-key": "secret-token"},
        )
    assert response.status_code == 200


def test_auth_required_when_configured() -> None:
    app = build_app(_authed_settings())
    with TestClient(app) as client:
        response = client.post("/v1/messages", json=load_fixture("plain_text.json"))
    assert response.status_code == 401
    assert response.json()["type"] == "error"
    assert response.json()["error"]["type"] == "authentication_error"


def test_auth_invalid_credential() -> None:
    app = build_app(_authed_settings())
    with TestClient(app) as client:
        response = client.post(
            "/v1/messages",
            json=load_fixture("plain_text.json"),
            headers={"Authorization": "Bearer wrong-token"},
        )
    assert response.status_code == 401
    body = response.json()
    assert body["type"] == "error"
    assert body["error"]["type"] == "authentication_error"
    assert "wrong-token" not in response.text
    assert "secret-token" not in response.text


def test_auth_secret_not_in_response_or_logs(caplog: pytest.LogCaptureFixture) -> None:
    secret = "super-secret-acgw-token-xyz"
    app = build_app(_authed_settings(auth_token=secret))
    with caplog.at_level(logging.INFO, logger="acgw"):
        with TestClient(app) as client:
            response = client.post(
                "/v1/messages",
                json=load_fixture("plain_text.json"),
                headers={"Authorization": f"Bearer {secret}-wrong"},
            )
    assert response.status_code == 401
    assert secret not in response.text
    assert secret not in caplog.text
