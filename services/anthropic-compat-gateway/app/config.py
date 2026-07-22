from __future__ import annotations

import os
from dataclasses import dataclass


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes")


DEFAULT_MAX_INPUT_CHARS = 100_000
DEFAULT_LOCAL_AI_GATEWAY_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_LOCAL_AI_GATEWAY_TIMEOUT_SECONDS = 120.0
DEFAULT_LOCAL_AI_GATEWAY_CONNECT_TIMEOUT_SECONDS = 5.0
DEFAULT_LOCAL_AI_GATEWAY_MAX_RESPONSE_BYTES = 1_048_576
DEFAULT_LOCAL_AI_GATEWAY_MODEL_ALIAS = "local-qwen"
DEFAULT_LOCAL_CODING_BASE_URL = "http://127.0.0.1:8111"
DEFAULT_LOCAL_CODING_TIMEOUT_SECONDS = 120.0
DEFAULT_LOCAL_CODING_CONNECT_TIMEOUT_SECONDS = 5.0
DEFAULT_LOCAL_CODING_MAX_RESPONSE_BYTES = 1_048_576
DEFAULT_LOCAL_CODING_MODEL_ALIAS = "local-qwen-coding"


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
    enable_local_ai_gateway: bool = False
    local_ai_gateway_base_url: str = DEFAULT_LOCAL_AI_GATEWAY_BASE_URL
    local_ai_gateway_timeout_seconds: float = DEFAULT_LOCAL_AI_GATEWAY_TIMEOUT_SECONDS
    local_ai_gateway_connect_timeout_seconds: float = (
        DEFAULT_LOCAL_AI_GATEWAY_CONNECT_TIMEOUT_SECONDS
    )
    local_ai_gateway_max_response_bytes: int = DEFAULT_LOCAL_AI_GATEWAY_MAX_RESPONSE_BYTES
    local_ai_gateway_model_alias: str = DEFAULT_LOCAL_AI_GATEWAY_MODEL_ALIAS
    enable_local_coding: bool = False
    local_coding_base_url: str = DEFAULT_LOCAL_CODING_BASE_URL
    local_coding_timeout_seconds: float = DEFAULT_LOCAL_CODING_TIMEOUT_SECONDS
    local_coding_connect_timeout_seconds: float = (
        DEFAULT_LOCAL_CODING_CONNECT_TIMEOUT_SECONDS
    )
    local_coding_max_response_bytes: int = DEFAULT_LOCAL_CODING_MAX_RESPONSE_BYTES
    local_coding_model_alias: str = DEFAULT_LOCAL_CODING_MODEL_ALIAS

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
            enable_local_ai_gateway=_env_flag("ACGW_ENABLE_LOCAL_AI_GATEWAY", False),
            local_ai_gateway_base_url=os.getenv(
                "ACGW_LOCAL_AI_GATEWAY_BASE_URL", DEFAULT_LOCAL_AI_GATEWAY_BASE_URL
            ),
            local_ai_gateway_timeout_seconds=float(
                os.getenv(
                    "ACGW_LOCAL_AI_GATEWAY_TIMEOUT_SECONDS",
                    str(DEFAULT_LOCAL_AI_GATEWAY_TIMEOUT_SECONDS),
                )
            ),
            local_ai_gateway_connect_timeout_seconds=float(
                os.getenv(
                    "ACGW_LOCAL_AI_GATEWAY_CONNECT_TIMEOUT_SECONDS",
                    str(DEFAULT_LOCAL_AI_GATEWAY_CONNECT_TIMEOUT_SECONDS),
                )
            ),
            local_ai_gateway_max_response_bytes=int(
                os.getenv(
                    "ACGW_LOCAL_AI_GATEWAY_MAX_RESPONSE_BYTES",
                    str(DEFAULT_LOCAL_AI_GATEWAY_MAX_RESPONSE_BYTES),
                )
            ),
            local_ai_gateway_model_alias=os.getenv(
                "ACGW_LOCAL_AI_GATEWAY_MODEL_ALIAS",
                DEFAULT_LOCAL_AI_GATEWAY_MODEL_ALIAS,
            ),
            enable_local_coding=_env_flag("ACGW_ENABLE_LOCAL_CODING", False),
            local_coding_base_url=os.getenv(
                "ACGW_LOCAL_CODING_BASE_URL", DEFAULT_LOCAL_CODING_BASE_URL
            ),
            local_coding_timeout_seconds=float(
                os.getenv(
                    "ACGW_LOCAL_CODING_TIMEOUT_SECONDS",
                    str(DEFAULT_LOCAL_CODING_TIMEOUT_SECONDS),
                )
            ),
            local_coding_connect_timeout_seconds=float(
                os.getenv(
                    "ACGW_LOCAL_CODING_CONNECT_TIMEOUT_SECONDS",
                    str(DEFAULT_LOCAL_CODING_CONNECT_TIMEOUT_SECONDS),
                )
            ),
            local_coding_max_response_bytes=int(
                os.getenv(
                    "ACGW_LOCAL_CODING_MAX_RESPONSE_BYTES",
                    str(DEFAULT_LOCAL_CODING_MAX_RESPONSE_BYTES),
                )
            ),
            local_coding_model_alias=os.getenv(
                "ACGW_LOCAL_CODING_MODEL_ALIAS",
                DEFAULT_LOCAL_CODING_MODEL_ALIAS,
            ),
        )


def get_settings() -> Settings:
    return Settings.from_env()
