#!/usr/bin/env python3
"""Run uvicorn for anthropic-compat-gateway using Settings.from_env()."""

from __future__ import annotations

import sys


def main() -> int:
    from app.config import Settings

    settings = Settings.from_env()
    if not settings.auth_token.strip() and not settings.allow_no_auth:
        print(
            "ERROR: ACGW_AUTH_TOKEN is required "
            "(or set ACGW_ALLOW_NO_AUTH=1 for local tests only)",
            file=sys.stderr,
        )
        return 1
    if settings.allow_no_auth and not settings.auth_token.strip():
        print(
            "WARNING: ACGW_ALLOW_NO_AUTH=1: authentication DISABLED",
            file=sys.stderr,
        )

    print(f"Starting anthropic-compat-gateway on http://{settings.host}:{settings.port}")
    print(f"  provider={settings.provider} enable_real={settings.enable_real}")

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
