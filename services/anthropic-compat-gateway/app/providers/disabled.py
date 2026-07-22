from __future__ import annotations

from typing import Any, Iterator

from app.models import MessagesRequest, MessagesResponse
from app.providers.base import MockPlan, PreStreamProviderError


class DisabledRealProvider:
    """Fail-closed seam for a future real provider. Never produces completions."""

    name = "disabled_real"

    def plan(self, request: MessagesRequest, *, scenario: str) -> MockPlan:
        raise PreStreamProviderError(
            "DisabledRealProvider is fail-closed: real inference is not enabled "
            "(use ACGW_PROVIDER=mock)",
            error_type="api_error",
            status_code=500,
        )

    def complete(self, request: MessagesRequest, *, scenario: str) -> MessagesResponse:
        raise PreStreamProviderError(
            "DisabledRealProvider is fail-closed: real inference is not enabled "
            "(use ACGW_PROVIDER=mock)",
            error_type="api_error",
            status_code=500,
        )

    def stream_events(
        self, request: MessagesRequest, *, scenario: str
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        raise PreStreamProviderError(
            "DisabledRealProvider is fail-closed: real inference is not enabled "
            "(use ACGW_PROVIDER=mock)",
            error_type="api_error",
            status_code=500,
        )
