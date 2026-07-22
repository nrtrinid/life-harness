from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.providers.factory import ProviderConfigError, create_provider
from app.providers.local_ai_gateway import LocalAiGatewayProvider
from tests.conftest import make_settings


def test_local_requires_enable_flag() -> None:
    cfg = make_settings(provider="local_ai_gateway", enable_local_ai_gateway=False)
    with pytest.raises(ProviderConfigError, match="ACGW_ENABLE_LOCAL_AI_GATEWAY"):
        create_provider(cfg)


def test_local_rejects_non_loopback_base_url() -> None:
    cfg = make_settings(
        provider="local_ai_gateway",
        enable_local_ai_gateway=True,
        local_ai_gateway_base_url="http://192.168.0.5:8111",
    )
    with pytest.raises(ProviderConfigError, match="127.0.0.1 or localhost"):
        create_provider(cfg)


def test_local_rejects_https_base_url() -> None:
    cfg = make_settings(
        provider="local_ai_gateway",
        enable_local_ai_gateway=True,
        local_ai_gateway_base_url="https://127.0.0.1:8111",
    )
    with pytest.raises(ProviderConfigError, match="http scheme"):
        create_provider(cfg)


def test_local_provider_created_when_enabled() -> None:
    cfg = make_settings(
        provider="local_ai_gateway",
        enable_local_ai_gateway=True,
        local_ai_gateway_base_url="http://127.0.0.1:8111/",
    )
    provider = create_provider(cfg)
    assert isinstance(provider, LocalAiGatewayProvider)
    assert provider.name == "local_ai_gateway"
    provider.close()


def test_app_startup_fails_without_enable_flag() -> None:
    cfg = make_settings(provider="local_ai_gateway", enable_local_ai_gateway=False)
    app = __import__("app.main", fromlist=["build_app"]).build_app(cfg)
    with pytest.raises(RuntimeError, match="startup failed"):
        with TestClient(app):
            pass


def test_enable_real_still_fail_closed_with_local_name() -> None:
    cfg = make_settings(
        provider="local_ai_gateway",
        enable_local_ai_gateway=True,
        enable_real=True,
    )
    with pytest.raises(ProviderConfigError, match="ACGW_ENABLE_REAL"):
        create_provider(cfg)
