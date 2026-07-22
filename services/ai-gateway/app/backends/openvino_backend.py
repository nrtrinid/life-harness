from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from threading import Lock
from typing import Any

from app.config import Settings
from app.models import ConversationTurn
from app.providers.base import ProviderNotReadyError

logger = logging.getLogger(__name__)

try:
    import openvino_genai as ov_genai

    _OPENVINO_IMPORTABLE = True
except ImportError:
    ov_genai = None  # type: ignore[assignment,misc]
    _OPENVINO_IMPORTABLE = False


def model_path_ready(model_path: str) -> bool:
    path = Path(model_path)
    if not path.is_dir():
        return False
    markers = ("openvino_model.xml", "openvino_tokenizer.xml", "openvino_detokenizer.xml")
    return any((path / name).is_file() for name in markers) or any(path.iterdir())


def missing_deps_message() -> str:
    return (
        "OpenVINO GenAI is not installed. "
        "Install with: pip install -e \".[openvino]\" "
        "(requires openvino-genai and huggingface_hub)."
    )


def missing_model_message(settings: Settings) -> str:
    return (
        f"Model not found at {settings.model_path}. "
        f"Download {settings.model_id} to that directory, e.g. "
        "huggingface-cli download OpenVINO/Qwen3-8B-int4-ov "
        f"--local-dir {settings.model_path}"
    )


class OpenVinoBackend:
    """Shared OpenVINO GenAI pipeline backend.

    All ``generate*`` entry points take ``_generation_lock`` so companion, Raw Lab,
    coding, and other consumers of this physical ``LLMPipeline`` cannot overlap.
    Health/readiness checks do not acquire the lock.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pipeline: Any | None = None
        self._load_error: str | None = None
        # Narrowest shared guard for this physical pipeline instance.
        self._generation_lock = Lock()

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def pipeline_loaded(self) -> bool:
        return self._pipeline is not None

    @property
    def generation_lock(self) -> Lock:
        """Exposed for tests that assert shared serialization across lanes."""
        return self._generation_lock

    def is_model_path_ready(self) -> bool:
        return model_path_ready(self._settings.model_path)

    def is_importable(self) -> bool:
        return _OPENVINO_IMPORTABLE

    def supports_generation_top_p(self) -> bool:
        """True when installed GenAI GenerationConfig exposes ``top_p``."""
        if not _OPENVINO_IMPORTABLE or ov_genai is None:
            return False
        try:
            probe = ov_genai.GenerationConfig()
        except Exception:
            return False
        return hasattr(probe, "top_p")

    def ensure_ready(self) -> None:
        if self._pipeline is not None:
            return

        if not _OPENVINO_IMPORTABLE:
            raise ProviderNotReadyError(missing_deps_message())

        if not self.is_model_path_ready():
            raise ProviderNotReadyError(missing_model_message(self._settings))

        try:
            logger.info(
                "openvino loading pipeline path=%s device=%s",
                self._settings.model_path,
                self._settings.device,
            )
            assert ov_genai is not None
            self._pipeline = ov_genai.LLMPipeline(
                self._settings.model_path,
                self._settings.device,
            )
        except Exception as exc:
            self._load_error = f"Failed to load OpenVINO pipeline: {exc}"
            logger.error("openvino pipeline load failed: %s", exc)
            raise ProviderNotReadyError(self._load_error) from exc

    def generation_config(self) -> Any:
        assert ov_genai is not None
        config = ov_genai.GenerationConfig()
        config.max_new_tokens = self._settings.max_new_tokens
        if hasattr(config, "temperature"):
            config.temperature = self._settings.temperature
        if hasattr(config, "apply_chat_template"):
            config.apply_chat_template = True
        return config

    def raw_lab_generation_config(self) -> Any:
        assert ov_genai is not None
        config = ov_genai.GenerationConfig()
        config.max_new_tokens = self._settings.raw_lab_max_new_tokens
        if hasattr(config, "temperature"):
            config.temperature = self._settings.raw_lab_temperature
        if hasattr(config, "repetition_penalty"):
            config.repetition_penalty = self._settings.raw_lab_repetition_penalty
        if hasattr(config, "apply_chat_template"):
            config.apply_chat_template = True
        return config

    def coding_generation_config(self, overrides: dict[str, Any] | None = None) -> Any:
        assert ov_genai is not None
        config = ov_genai.GenerationConfig()
        overrides = overrides or {}
        config.max_new_tokens = int(
            overrides.get("max_new_tokens", self._settings.max_new_tokens)
        )
        if hasattr(config, "temperature"):
            config.temperature = float(
                overrides.get("temperature", self._settings.temperature)
            )
        if "top_p" in overrides and hasattr(config, "top_p"):
            config.top_p = float(overrides["top_p"])
        if hasattr(config, "apply_chat_template"):
            config.apply_chat_template = True
        return config

    def _run_generate(self, chat_history: Any, config: Any) -> str:
        assert self._pipeline is not None

        def _run() -> str:
            result = self._pipeline.generate(chat_history, config)
            return str(result)

        with self._generation_lock:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_run)
                try:
                    return future.result(timeout=self._settings.timeout_seconds)
                except FuturesTimeoutError as exc:
                    raise ProviderNotReadyError(
                        f"Inference timed out after {self._settings.timeout_seconds}s"
                    ) from exc

    def generate_chat_repair(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        draft: str,
        message: str,
        repair_instruction: str,
    ) -> str:
        self.ensure_ready()
        assert self._pipeline is not None
        assert ov_genai is not None

        config = self.raw_lab_generation_config()

        chat_history = ov_genai.ChatHistory()
        chat_history.set_extra_context({"enable_thinking": False})
        chat_history.append({"role": "system", "content": system})
        for turn in history:
            chat_history.append({"role": turn.role.value, "content": turn.content})
        chat_history.append({"role": "assistant", "content": draft})
        chat_history.append({"role": "user", "content": repair_instruction})
        chat_history.append({"role": "user", "content": message})

        return self._run_generate(chat_history, config)

    def generate_chat(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
        generation_overrides: dict[str, Any] | None = None,
    ) -> str:
        self.ensure_ready()
        assert self._pipeline is not None

        if generation_overrides is not None:
            if ov_genai is None:
                # Test doubles may inject a fake pipeline without GenAI installed.
                config: Any = generation_overrides
            else:
                config = self.coding_generation_config(generation_overrides)
        else:
            if ov_genai is None:
                raise ProviderNotReadyError(missing_deps_message())
            # Preserve existing Raw Lab / companion chat config path.
            config = self.raw_lab_generation_config()

        if ov_genai is not None:
            chat_history = ov_genai.ChatHistory()
            chat_history.set_extra_context({"enable_thinking": False})
            chat_history.append({"role": "system", "content": system})
            for turn in history:
                chat_history.append({"role": turn.role.value, "content": turn.content})
            chat_history.append({"role": "user", "content": message})
        else:
            # Fake-pipeline path for CI serialization tests.
            chat_history = {
                "system": system,
                "history": history,
                "message": message,
            }

        return self._run_generate(chat_history, config)

    def generate(self, prompt: str) -> str:
        self.ensure_ready()
        assert self._pipeline is not None
        assert ov_genai is not None

        config = self.generation_config()

        history = ov_genai.ChatHistory()
        history.set_extra_context({"enable_thinking": False})
        history.append({"role": "user", "content": prompt})

        return self._run_generate(history, config)
