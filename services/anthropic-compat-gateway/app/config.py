from __future__ import annotations

import os
from dataclasses import dataclass


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes")


DEFAULT_MAX_INPUT_CHARS = 100_000


@dataclass(frozen=True)
class Settings:
    provider: str
    host: str
    port: int
    auth_token: str
    allow_no_auth: bool
    enable_real: bool
    log_bodies: bool
    max_input_chars: int

    @classmethod
    def from_env(cls) -> Settings:
        """Load settings from ACGW_* environment variables.

        Empty ``auth_token`` without ``allow_no_auth`` is invalid: startup must
        fail unless ``ACGW_ALLOW_NO_AUTH=1`` (local tests only).
        """
        return cls(
            provider=os.getenv("ACGW_PROVIDER", "mock").strip().lower() or "mock",
            host=os.getenv("ACGW_HOST", "127.0.0.1"),
            port=int(os.getenv("ACGW_PORT", "8131")),
            auth_token=os.getenv("ACGW_AUTH_TOKEN", ""),
            allow_no_auth=_env_flag("ACGW_ALLOW_NO_AUTH", False),
            enable_real=_env_flag("ACGW_ENABLE_REAL", False),
            log_bodies=_env_flag("ACGW_LOG_BODIES", False),
            max_input_chars=int(
                os.getenv("ACGW_MAX_INPUT_CHARS", str(DEFAULT_MAX_INPUT_CHARS))
            ),
        )


def get_settings() -> Settings:
    return Settings.from_env()
