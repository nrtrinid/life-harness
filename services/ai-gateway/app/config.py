import os
from dataclasses import dataclass
from typing import Literal

ProviderName = Literal["mock", "openvino"]


@dataclass(frozen=True)
class Settings:
    provider: ProviderName
    host: str
    port: int
    model_path: str
    device: str
    max_new_tokens: int

    @classmethod
    def from_env(cls) -> "Settings":
        raw_provider = os.getenv("SCOUT_PROVIDER", "mock").lower()
        provider: ProviderName = "openvino" if raw_provider == "openvino" else "mock"
        return cls(
            provider=provider,
            host=os.getenv("SCOUT_HOST", "127.0.0.1"),
            port=int(os.getenv("SCOUT_PORT", "8111")),
            model_path=os.getenv("SCOUT_MODEL_PATH", "./models/qwen3-8b-int4-ov"),
            device=os.getenv("SCOUT_DEVICE", "GPU"),
            max_new_tokens=int(os.getenv("SCOUT_MAX_NEW_TOKENS", "1024")),
        )


def get_settings() -> Settings:
    return Settings.from_env()
