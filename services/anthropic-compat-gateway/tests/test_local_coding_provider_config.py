from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import build_app
from app.providers.factory import ProviderConfigError, create_provider
from app.providers.local_coding import LocalCodingProvider
from tests.conftest import make_settings


def test_coding_not_default_provider() -> None:
    settings = make_settings()
    provider = create_provider(settings)
    assert provider.name == "mock"


def test_coding_requires_enable_flag() -> None:
    settings = make_settings(provider="local_coding", enable_local_coding=False)
    with pytest.raises(ProviderConfigError, match="ACGW_ENABLE_LOCAL_CODING"):
        create_provider(settings)


def test_coding_rejects_non_loopback() -> None:
    settings = make_settings(
        provider="local_coding",
        enable_local_coding=True,
        local_coding_base_url="http://192.168.1.10:8111",
    )
    with pytest.raises(ProviderConfigError):
        create_provider(settings)


def test_coding_provider_created() -> None:
    settings = make_settings(provider="local_coding", enable_local_coding=True)
    provider = create_provider(settings)
    assert isinstance(provider, LocalCodingProvider)
    assert provider.name == "local_coding"
    provider.close()


def test_coding_startup_fails_without_enable() -> None:
    settings = make_settings(provider="local_coding", enable_local_coding=False)
    with pytest.raises(RuntimeError, match="ACGW_ENABLE_LOCAL_CODING"):
        with TestClient(build_app(settings)):
            pass
