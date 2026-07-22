from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import build_app
from app.models import Message, MessagesRequest
from app.providers.base import PreStreamProviderError
from app.providers.disabled import DisabledRealProvider
from app.providers.factory import ProviderConfigError, create_provider


def _settings(**overrides: object) -> Settings:
    base = dict(
        provider="mock",
        host="127.0.0.1",
        port=8131,
        auth_token="",
        allow_no_auth=True,
        enable_real=False,
        log_bodies=False,
        max_input_chars=100_000,
        enable_local_ai_gateway=False,
        local_ai_gateway_base_url="http://127.0.0.1:8111",
        local_ai_gateway_timeout_seconds=120.0,
        local_ai_gateway_connect_timeout_seconds=5.0,
        local_ai_gateway_max_response_bytes=1_048_576,
        local_ai_gateway_model_alias="local-qwen",
    )
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _sample_request() -> MessagesRequest:
    return MessagesRequest(
        model="acgw-mock-text",
        max_tokens=16,
        messages=[Message(role="user", content="hi")],
    )


def test_create_provider_rejects_non_mock() -> None:
    cfg = _settings(provider="openvino")
    with pytest.raises(ProviderConfigError, match="Unsupported ACGW_PROVIDER"):
        create_provider(cfg)


def test_create_provider_rejects_enable_real() -> None:
    cfg = _settings(enable_real=True)
    with pytest.raises(ProviderConfigError, match="ACGW_ENABLE_REAL"):
        create_provider(cfg)


def test_create_provider_disabled_real_seam() -> None:
    cfg = _settings(provider="disabled_real")
    provider = create_provider(cfg)
    assert isinstance(provider, DisabledRealProvider)
    assert provider.name == "disabled_real"


def test_disabled_real_provider_methods_raise() -> None:
    provider = DisabledRealProvider()
    request = _sample_request()
    with pytest.raises(PreStreamProviderError, match="fail-closed"):
        provider.plan(request, scenario="text")
    with pytest.raises(PreStreamProviderError, match="fail-closed"):
        provider.complete(request, scenario="text")
    with pytest.raises(PreStreamProviderError, match="fail-closed"):
        next(provider.stream_events(request, scenario="text"))


def test_app_startup_fails_for_bad_provider() -> None:
    cfg = _settings(provider="llamacpp")
    app = build_app(cfg)
    with pytest.raises(RuntimeError, match="startup failed"):
        with TestClient(app):
            pass


def test_app_startup_fails_for_enable_real() -> None:
    cfg = _settings(enable_real=True)
    app = build_app(cfg)
    with pytest.raises(RuntimeError, match="startup failed"):
        with TestClient(app):
            pass


def test_app_startup_allows_disabled_real_provider() -> None:
    cfg = _settings(provider="disabled_real")
    app = build_app(cfg)
    with TestClient(app) as client:
        response = client.post(
            "/v1/messages",
            json={
                "model": "acgw-mock-text",
                "max_tokens": 16,
                "messages": [{"role": "user", "content": "hi"}],
            },
        )
    assert response.status_code == 500
    assert response.json()["error"]["type"] == "api_error"
    assert "fail-closed" in response.json()["error"]["message"]
