from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Callable

from app.backends.pipeline_ownership import PipelineOwnership
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

STREAM_QUEUE_SIZE = 32
STREAM_PUT_TIMEOUT_SECONDS = 1.0


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


def _generate_supports_streamer_arg() -> tuple[bool, str]:
    """Confirm ``LLMPipeline.generate`` can take ``streamer=`` without opaque TypeError.

    Compiled OpenVINO bindings often lack a reliable ``inspect.signature``. Prefer
    an explicit parameter when visible; otherwise accept only when the GenAI
    TextStreamer + StreamingStatus surface is present (documented streaming API).
    Unconfirmable cases fail closed for the coding stream path.
    """
    assert ov_genai is not None
    pipeline_cls = getattr(ov_genai, "LLMPipeline", None)
    if pipeline_cls is None:
        return False, "LLMPipeline missing"
    generate = getattr(pipeline_cls, "generate", None)
    if generate is None:
        return False, "LLMPipeline.generate missing"

    try:
        import inspect

        sig = inspect.signature(generate)
        if "streamer" in sig.parameters:
            return True, "ok"
        return False, "LLMPipeline.generate signature has no streamer parameter"
    except (TypeError, ValueError):
        # No reliable Python signature (common for pybind/native bindings).
        doc = (getattr(generate, "__doc__", None) or "").lower()
        if "streamer" in doc:
            return True, "ok"
        if hasattr(ov_genai, "TextStreamer") and hasattr(ov_genai, "StreamingStatus"):
            # Documented GenAI streaming surface; do not claim a specific version.
            return True, "ok"
        return False, "LLMPipeline.generate streamer support unconfirmable"


def detect_streaming_capability() -> tuple[bool, str]:
    """Feature-detect GenAI streaming APIs (proven on 2026.2; not assumed for 2025.1)."""
    if not _OPENVINO_IMPORTABLE or ov_genai is None:
        return False, "openvino_genai is not importable"
    missing: list[str] = []
    if not hasattr(ov_genai, "TextStreamer"):
        missing.append("TextStreamer")
    if not hasattr(ov_genai, "StreamingStatus"):
        missing.append("StreamingStatus")
    else:
        status = ov_genai.StreamingStatus
        for name in ("RUNNING", "STOP", "CANCEL"):
            if not hasattr(status, name):
                missing.append(f"StreamingStatus.{name}")
    if not hasattr(ov_genai, "LLMPipeline"):
        missing.append("LLMPipeline")
    if missing:
        return False, "missing streaming APIs: " + ", ".join(missing)

    ok, msg = _generate_supports_streamer_arg()
    if not ok:
        return False, msg
    return True, "ok"


class OpenVinoBackend:
    """Shared OpenVINO GenAI pipeline backend.

    Generation ownership is worker-lifetime: only one ``pipeline.generate`` may
    run per instance. Health/readiness checks do not take ownership.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pipeline: Any | None = None
        self._load_error: str | None = None
        self._ownership = PipelineOwnership()
        self._streaming_capable: bool | None = None
        self._streaming_capability_message = "streaming capability not checked"

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def pipeline_loaded(self) -> bool:
        return self._pipeline is not None

    @property
    def generation_lock(self) -> Any:
        """Backward-compatible alias for tests that inspect ownership busy state."""
        return self._ownership

    @property
    def pipeline_busy(self) -> bool:
        return self._ownership.busy

    def is_model_path_ready(self) -> bool:
        return model_path_ready(self._settings.model_path)

    def is_importable(self) -> bool:
        return _OPENVINO_IMPORTABLE

    def supports_generation_top_p(self) -> bool:
        if not _OPENVINO_IMPORTABLE or ov_genai is None:
            return False
        try:
            probe = ov_genai.GenerationConfig()
        except Exception:
            return False
        return hasattr(probe, "top_p")

    def supports_streaming(self) -> bool:
        if self._streaming_capable is None:
            ok, msg = detect_streaming_capability()
            self._streaming_capable = ok
            self._streaming_capability_message = msg
        return bool(self._streaming_capable)

    def streaming_capability_message(self) -> str:
        self.supports_streaming()
        return self._streaming_capability_message

    def ensure_ready(self) -> None:
        if self._pipeline is not None:
            return

        if not _OPENVINO_IMPORTABLE:
            raise ProviderNotReadyError(missing_deps_message())

        if not self.is_model_path_ready():
            raise ProviderNotReadyError(missing_model_message(self._settings))

        # Detect streaming capability at init (fail clearly for stream endpoints).
        ok, msg = detect_streaming_capability()
        self._streaming_capable = ok
        self._streaming_capability_message = msg
        if ok:
            logger.info("openvino streaming capability: available")
        else:
            logger.warning("openvino streaming capability unavailable: %s", msg)

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

    def ensure_streaming_ready(self) -> None:
        self.ensure_ready()
        if not self.supports_streaming():
            raise ProviderNotReadyError(
                "Coding streaming requires OpenVINO GenAI streamer APIs "
                f"({self.streaming_capability_message()}). "
                "Non-streaming coding and companion lanes remain available."
            )

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

    def _build_chat_history(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
    ) -> Any:
        assert ov_genai is not None
        chat_history = ov_genai.ChatHistory()
        chat_history.set_extra_context({"enable_thinking": False})
        chat_history.append({"role": "system", "content": system})
        for turn in history:
            chat_history.append({"role": turn.role.value, "content": turn.content})
        chat_history.append({"role": "user", "content": message})
        return chat_history

    def _run_generate(self, chat_history: Any, config: Any) -> str:
        assert self._pipeline is not None
        cancel_event = threading.Event()

        def _worker() -> str:
            # If a cancel was already requested (timeout race), still run once;
            # real cancellation for stream uses streamer status.
            result = self._pipeline.generate(chat_history, config)
            return str(result)

        return self._ownership.run(
            worker=_worker,
            timeout_seconds=self._settings.timeout_seconds,
            cancel_event=cancel_event,
        )

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
        """Non-streaming chat — unchanged contract; not implemented via join(iter)."""
        self.ensure_ready()
        assert self._pipeline is not None

        if generation_overrides is not None:
            if ov_genai is None:
                config: Any = generation_overrides
            else:
                config = self.coding_generation_config(generation_overrides)
        else:
            if ov_genai is None:
                raise ProviderNotReadyError(missing_deps_message())
            config = self.raw_lab_generation_config()

        if ov_genai is not None:
            chat_history = self._build_chat_history(
                system=system, history=history, message=message
            )
        else:
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

    def generate_chat_iter(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
        generation_overrides: dict[str, Any] | None = None,
        cancel_event: threading.Event | None = None,
        on_fragment: Callable[[str], None] | None = None,
    ) -> Iterator[str]:
        """Yield decoded text fragments via OpenVINO streamer (coding stream only).

        Empty fragments are skipped. Does not redefine ``generate_chat``.
        """
        self.ensure_streaming_ready()
        assert self._pipeline is not None
        assert ov_genai is not None

        cancel_event = cancel_event or threading.Event()
        config = self.coding_generation_config(generation_overrides)
        chat_history = self._build_chat_history(
            system=system, history=history, message=message
        )

        import queue

        fragment_queue: queue.Queue[str | None] = queue.Queue(maxsize=STREAM_QUEUE_SIZE)
        worker_error: list[BaseException] = []
        # Completion/error are observable independent of text-queue capacity.
        worker_finished = threading.Event()

        def _streamer_callback(subword: str) -> Any:
            if cancel_event.is_set():
                return ov_genai.StreamingStatus.CANCEL
            text = str(subword or "")
            if not text:
                return ov_genai.StreamingStatus.RUNNING
            # Bounded put — sustained backpressure requests cancellation.
            try:
                fragment_queue.put(text, timeout=STREAM_PUT_TIMEOUT_SECONDS)
            except queue.Full:
                cancel_event.set()
                return ov_genai.StreamingStatus.CANCEL
            if on_fragment is not None:
                on_fragment(text)
            return ov_genai.StreamingStatus.RUNNING

        def _offer_sentinel() -> None:
            """Best-effort None marker; never block worker exit on a full queue."""
            try:
                fragment_queue.put_nowait(None)
            except queue.Full:
                pass

        def _worker() -> None:
            try:
                # Prefer TextStreamer when available; fall back to callable streamer.
                streamer: Any
                if hasattr(ov_genai, "TextStreamer"):
                    # TextStreamer(tokenizer, callback) — tokenizer from pipeline when present.
                    tokenizer = getattr(self._pipeline, "get_tokenizer", lambda: None)()
                    if tokenizer is not None:
                        streamer = ov_genai.TextStreamer(tokenizer, _streamer_callback)
                    else:
                        streamer = _streamer_callback
                else:
                    streamer = _streamer_callback
                self._pipeline.generate(chat_history, config, streamer=streamer)
            except BaseException as exc:  # noqa: BLE001 — surface via worker_error
                worker_error.append(exc)
            finally:
                worker_finished.set()
                _offer_sentinel()

        future = self._ownership.run_streaming_worker(worker=_worker)

        try:
            while True:
                if worker_finished.is_set() and fragment_queue.empty():
                    break
                if cancel_event.is_set() and worker_finished.is_set() and fragment_queue.empty():
                    break
                try:
                    item = fragment_queue.get(timeout=0.25)
                except queue.Empty:
                    if worker_finished.is_set() or future.done():
                        break
                    continue
                if item is None:
                    break
                if item:
                    yield item
        finally:
            cancel_event.set()
            # Wait for worker so ownership is released before returning.
            try:
                future.result(timeout=max(5.0, float(self._settings.timeout_seconds)))
            except Exception:
                # Propagate after drain; ownership still released in worker finally.
                pass

        if worker_error:
            raise worker_error[0]
        if future.exception() is not None:
            raise future.exception()  # type: ignore[misc]
