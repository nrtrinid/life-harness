from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
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
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pipeline: Any | None = None
        self._load_error: str | None = None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def pipeline_loaded(self) -> bool:
        return self._pipeline is not None

    def is_model_path_ready(self) -> bool:
        return model_path_ready(self._settings.model_path)

    def is_importable(self) -> bool:
        return _OPENVINO_IMPORTABLE

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

        def _run() -> str:
            result = self._pipeline.generate(chat_history, config)
            return str(result)

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run)
            try:
                return future.result(timeout=self._settings.timeout_seconds)
            except FuturesTimeoutError as exc:
                raise ProviderNotReadyError(
                    f"Inference timed out after {self._settings.timeout_seconds}s"
                ) from exc

    def generate_chat(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
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
        chat_history.append({"role": "user", "content": message})

        def _run() -> str:
            result = self._pipeline.generate(chat_history, config)
            return str(result)

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run)
            try:
                return future.result(timeout=self._settings.timeout_seconds)
            except FuturesTimeoutError as exc:
                raise ProviderNotReadyError(
                    f"Inference timed out after {self._settings.timeout_seconds}s"
                ) from exc

    def generate(self, prompt: str) -> str:
        self.ensure_ready()
        assert self._pipeline is not None
        assert ov_genai is not None

        config = self.generation_config()

        history = ov_genai.ChatHistory()
        history.set_extra_context({"enable_thinking": False})
        history.append({"role": "user", "content": prompt})

        def _run() -> str:
            result = self._pipeline.generate(history, config)
            return str(result)

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run)
            try:
                return future.result(timeout=self._settings.timeout_seconds)
            except FuturesTimeoutError as exc:
                raise ProviderNotReadyError(
                    f"Inference timed out after {self._settings.timeout_seconds}s"
                ) from exc
