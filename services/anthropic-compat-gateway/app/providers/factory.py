from __future__ import annotations

from app.config import Settings
from app.providers.base import MessagesProvider
from app.providers.disabled import DisabledRealProvider
from app.providers.mock import MockProvider


class ProviderConfigError(Exception):
    """Raised at startup for unsupported or contradictory provider config."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def create_provider(settings: Settings) -> MessagesProvider:
    if settings.enable_real:
        raise ProviderConfigError(
            "ACGW_ENABLE_REAL=1 is unsupported in Slice 1; real providers are fail-closed "
            "(DisabledRealProvider seam exists but does not run inference). "
            "Set ACGW_ENABLE_REAL=0 and ACGW_PROVIDER=mock."
        )
    if settings.provider == "mock":
        return MockProvider()
    if settings.provider == "disabled_real":
        return DisabledRealProvider()
    raise ProviderConfigError(
        f"Unsupported ACGW_PROVIDER={settings.provider!r}; only 'mock' is implemented "
        "in Slice 1 (provider 'disabled_real' returns DisabledRealProvider for seam tests)."
    )
