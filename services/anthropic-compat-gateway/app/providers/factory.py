from __future__ import annotations

from app.config import Settings
from app.providers.base import MessagesProvider
from app.providers.disabled import DisabledRealProvider
from app.providers.local_ai_gateway import LocalAiGatewayProvider
from app.providers.mock import MockProvider
from app.upstream.loopback import validate_loopback_base_url


class ProviderConfigError(Exception):
    """Raised at startup for unsupported or contradictory provider config."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def create_provider(settings: Settings) -> MessagesProvider:
    # Fail-closed: real backends remain unsupported regardless of provider name.
    if settings.enable_real:
        raise ProviderConfigError(
            "ACGW_ENABLE_REAL=1 is unsupported; real providers are fail-closed "
            "(DisabledRealProvider seam exists but does not run inference). "
            "Set ACGW_ENABLE_REAL=0."
        )
    if settings.provider == "mock":
        return MockProvider()
    if settings.provider == "disabled_real":
        return DisabledRealProvider()
    if settings.provider == "local_ai_gateway":
        if not settings.enable_local_ai_gateway:
            raise ProviderConfigError(
                "ACGW_PROVIDER=local_ai_gateway requires ACGW_ENABLE_LOCAL_AI_GATEWAY=1"
            )
        try:
            base = validate_loopback_base_url(settings.local_ai_gateway_base_url)
        except ValueError as exc:
            raise ProviderConfigError(str(exc)) from exc
        return LocalAiGatewayProvider(settings, base_url=base)
    raise ProviderConfigError(
        f"Unsupported ACGW_PROVIDER={settings.provider!r}; expected 'mock', "
        "'disabled_real', or 'local_ai_gateway'."
    )
