from __future__ import annotations

import hashlib
import hmac

from fastapi import HTTPException

from app.config import Settings
from app.models import anthropic_error


def _tokens_equal(provided: str, expected: str) -> bool:
    """Constant-time token compare via SHA-256 digests (length-independent)."""
    provided_digest = hashlib.sha256(provided.encode("utf-8")).digest()
    expected_digest = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(provided_digest, expected_digest)


def require_auth(
    settings: Settings,
    *,
    authorization: str | None,
    x_api_key: str | None,
) -> None:
    expected = settings.auth_token.strip()
    if not expected:
        if settings.allow_no_auth:
            return
        raise HTTPException(
            status_code=401,
            detail=anthropic_error(
                type_="authentication_error",
                message=(
                    "Authentication required: set ACGW_AUTH_TOKEN, or "
                    "ACGW_ALLOW_NO_AUTH=1 for local tests only"
                ),
            ),
        )

    bearer: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    provided = bearer or (x_api_key.strip() if x_api_key else None)
    if provided is None or not _tokens_equal(provided, expected):
        raise HTTPException(
            status_code=401,
            detail=anthropic_error(
                type_="authentication_error",
                message="Invalid or missing authentication token",
            ),
        )
