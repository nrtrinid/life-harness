import logging
import os

from dataclasses import dataclass

from functools import lru_cache

from pathlib import Path

from typing import Literal

logger = logging.getLogger(__name__)



from app.slots.registry import ModelSlotRegistry, load_slot_registry



ProviderName = Literal["mock", "openvino"]
CriticSlotName = Literal["same", "secondary"]
CriticRuntimeName = Literal["mock", "llamacpp"]

DEFAULT_CRITIC_BASE_URL = "http://127.0.0.1:8120/v1"
DEFAULT_CRITIC_MODEL = "phi-4-reasoning-plus"
DEFAULT_CRITIC_TIMEOUT_SECONDS = 30.0



DEFAULT_MODEL_PATH = "models/qwen3-8b-int4-ov"

DEFAULT_MODEL_ID = "OpenVINO/Qwen3-8B-int4-ov"

DEFAULT_MODELS_CONFIG_PATH = "models.yaml"

DEFAULT_LLAMA_BASE_URL = "http://127.0.0.1:8120"



SERVICE_ROOT = Path(__file__).resolve().parent.parent





def _env_flag(name: str, default: bool) -> bool:

    raw = os.getenv(name)

    if raw is None:

        return default

    return raw.lower() in ("1", "true", "yes")





def _parse_warm_slots(raw: str | None) -> tuple[str, ...]:

    if raw is None or not raw.strip():

        return ()

    return tuple(part.strip() for part in raw.split(",") if part.strip())





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

    raw_lab_max_input_chars: int

    temperature: float

    raw_lab_max_new_tokens: int

    raw_lab_temperature: float

    raw_lab_repetition_penalty: float

    dev_cors: bool

    deep_enabled: bool

    chat_harness_native_chat: bool

    deep_max_extra_passes: int

    models_config_path: str

    warm_slots: tuple[str, ...]

    critic_slot: CriticSlotName

    critic_model_path: str | None

    llama_base_url: str

    llama_timeout_seconds: float

    llama_api_key: str | None

    llama_base_url_explicit: bool

    critic_runtime: CriticRuntimeName

    critic_base_url: str

    critic_model: str

    critic_timeout_seconds: float

    critic_heavy: bool

    debug_thinking_trace: bool

    real_model_bench_enabled: bool

    @classmethod

    def from_env(cls) -> "Settings":

        raw_provider = os.getenv("SCOUT_PROVIDER", "mock").lower()

        provider: ProviderName = "openvino" if raw_provider == "openvino" else "mock"

        max_input_chars = int(os.getenv("SCOUT_MAX_INPUT_CHARS", "12000"))

        raw_lab_env = os.getenv("SCOUT_RAW_LAB_MAX_INPUT_CHARS")

        raw_lab_max_input_chars = (

            int(raw_lab_env) if raw_lab_env is not None and raw_lab_env.strip() else max_input_chars

        )

        raw_critic_runtime = os.getenv("SCOUT_CRITIC_RUNTIME", "mock").lower()
        if raw_critic_runtime == "llamacpp":
            critic_runtime: CriticRuntimeName = "llamacpp"
        elif raw_critic_runtime != "mock":
            logger.warning(
                "Invalid SCOUT_CRITIC_RUNTIME=%r; falling back to mock",
                raw_critic_runtime,
            )
            critic_runtime = "mock"
        else:
            critic_runtime = "mock"

        return cls(

            provider=provider,

            host=os.getenv("SCOUT_HOST", "127.0.0.1"),

            port=int(os.getenv("SCOUT_PORT", "8111")),

            model_path=os.getenv("SCOUT_MODEL_PATH", DEFAULT_MODEL_PATH),

            model_id=DEFAULT_MODEL_ID,

            device=os.getenv("SCOUT_DEVICE", "GPU"),

            max_new_tokens=int(os.getenv("SCOUT_MAX_NEW_TOKENS", "1024")),

            timeout_seconds=float(os.getenv("SCOUT_TIMEOUT_SECONDS", "120")),

            max_input_chars=max_input_chars,

            raw_lab_max_input_chars=raw_lab_max_input_chars,

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

            models_config_path=os.getenv("SCOUT_MODELS_CONFIG", DEFAULT_MODELS_CONFIG_PATH),

            warm_slots=_parse_warm_slots(os.getenv("SCOUT_WARM_SLOTS")),

            critic_slot=(
                "secondary"
                if os.getenv("SCOUT_CRITIC_SLOT", "same").lower() == "secondary"
                else "same"
            ),

            critic_model_path=os.getenv("SCOUT_CRITIC_MODEL_PATH") or None,

            llama_base_url=os.getenv("SCOUT_LLAMA_BASE_URL", DEFAULT_LLAMA_BASE_URL),

            llama_timeout_seconds=float(os.getenv("SCOUT_LLAMA_TIMEOUT_SECONDS", "60")),

            llama_api_key=os.getenv("SCOUT_LLAMA_API_KEY") or None,

            llama_base_url_explicit=os.getenv("SCOUT_LLAMA_BASE_URL") is not None,

            critic_runtime=critic_runtime,

            critic_base_url=os.getenv("SCOUT_CRITIC_BASE_URL", DEFAULT_CRITIC_BASE_URL),

            critic_model=os.getenv("SCOUT_CRITIC_MODEL", DEFAULT_CRITIC_MODEL),

            critic_timeout_seconds=float(
                os.getenv("SCOUT_CRITIC_TIMEOUT_SECONDS", str(DEFAULT_CRITIC_TIMEOUT_SECONDS))
            ),

            critic_heavy=_env_flag("SCOUT_CRITIC_HEAVY", False),

            debug_thinking_trace=_env_flag("SCOUT_DEBUG_THINKING_TRACE", False),

            real_model_bench_enabled=_env_flag("SCOUT_REAL_MODEL_BENCH", False),

        )





def get_settings() -> Settings:

    return Settings.from_env()





def resolve_models_config_path(settings: Settings) -> Path:

    path = Path(settings.models_config_path)

    if path.is_absolute():

        return path

    return SERVICE_ROOT / path





@lru_cache

def get_slot_registry() -> ModelSlotRegistry:

    settings = get_settings()

    return load_slot_registry(resolve_models_config_path(settings), settings=settings)





def raw_lab_input_char_limit(settings: Settings) -> int:

    return settings.raw_lab_max_input_chars


