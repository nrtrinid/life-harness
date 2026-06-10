import os
from dataclasses import dataclass
from typing import Literal

ProviderName = Literal["mock", "openvino"]

DEFAULT_MODEL_PATH = "models/qwen3-8b-int4-ov"
DEFAULT_MODEL_ID = "OpenVINO/Qwen3-8B-int4-ov"


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class Settings:
    provider: ProviderName
    host: str
    port: int
    model_path: str
    model_id: str
    device: str
    max_new_tokens: int
    timeout_seconds: float
    max_input_chars: int
    temperature: float
    raw_lab_max_new_tokens: int
    raw_lab_temperature: float
    raw_lab_repetition_penalty: float
    dev_cors: bool
    deep_enabled: bool
    chat_harness_native_chat: bool
    deep_max_extra_passes: int

    @classmethod
    def from_env(cls) -> "Settings":
        raw_provider = os.getenv("SCOUT_PROVIDER", "mock").lower()
        provider: ProviderName = "openvino" if raw_provider == "openvino" else "mock"
        return cls(
            provider=provider,
            host=os.getenv("SCOUT_HOST", "127.0.0.1"),
            port=int(os.getenv("SCOUT_PORT", "8111")),
            model_path=os.getenv("SCOUT_MODEL_PATH", DEFAULT_MODEL_PATH),
            model_id=DEFAULT_MODEL_ID,
            device=os.getenv("SCOUT_DEVICE", "GPU"),
            max_new_tokens=int(os.getenv("SCOUT_MAX_NEW_TOKENS", "1024")),
            timeout_seconds=float(os.getenv("SCOUT_TIMEOUT_SECONDS", "120")),
            max_input_chars=int(os.getenv("SCOUT_MAX_INPUT_CHARS", "12000")),
            temperature=float(os.getenv("SCOUT_TEMPERATURE", "0.2")),
            raw_lab_max_new_tokens=int(os.getenv("SCOUT_RAW_LAB_MAX_NEW_TOKENS", "2048")),
            raw_lab_temperature=float(os.getenv("SCOUT_RAW_LAB_TEMPERATURE", "0.7")),
            raw_lab_repetition_penalty=float(
                os.getenv("SCOUT_RAW_LAB_REPETITION_PENALTY", "1.12")
            ),
            dev_cors=_env_flag("SCOUT_DEV_CORS", True),
            deep_enabled=_env_flag("SCOUT_DEEP_ENABLED", True),
            chat_harness_native_chat=_env_flag("SCOUT_CHAT_HARNESS_NATIVE_CHAT", False),
            deep_max_extra_passes=int(os.getenv("SCOUT_DEEP_MAX_EXTRA_PASSES", "2")),
        )


def get_settings() -> Settings:
    return Settings.from_env()
