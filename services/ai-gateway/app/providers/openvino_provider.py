from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Any

from app.config import Settings
from app.models import (
    AnalyzeTranscriptRequest,
    AnalyzeTranscriptResponse,
    AskHarnessRequest,
    AskHarnessResponse,
    ChatHarnessRequest,
    ChatHarnessResponse,
    HealthStatus,
    ProviderHealth,
    ConversationTurn,
    RawLabRequest,
    RawLabResponse,
)
from app.prompt_loader import (
    build_analysis_prompt,
    build_ask_harness_prompt,
    build_chat_harness_prompt,
    build_raw_lab_system_prompt,
    estimate_raw_lab_input_chars,
)
from app.raw_lab_utils import (
    is_hedged_response,
    is_repetitive_response,
    raw_lab_hedging_repair_instruction,
    raw_lab_repair_instruction,
)
from app.providers.base import (
    CHAT_HARNESS_PARSE_FALLBACK,
    RAW_LAB_EMPTY_FALLBACK,
    ProviderInputError,
    ProviderNotReadyError,
    ProviderParseError,
    parse_model_json,
    parse_strict_json,
    sanitize_raw_lab_text,
)

logger = logging.getLogger(__name__)

try:
    import openvino_genai as ov_genai

    _OPENVINO_IMPORTABLE = True
except ImportError:
    ov_genai = None  # type: ignore[assignment,misc]
    _OPENVINO_IMPORTABLE = False

_REPAIR_PROMPT = """\
The previous answer was not valid JSON for the required schema.
Return ONLY a corrected JSON object matching the schema. No markdown fences, no commentary.

Broken output:
{broken}
"""

_ASK_HARNESS_REPAIR_PROMPT = """\
The previous answer was not valid JSON for the Ask Harness schema.
Return ONLY a corrected JSON object. No markdown fences, no commentary, no thinking tags.

Required top-level fields (all must be present):
- answer (string, 2-6 substantive sentences)
- grounding (array of objects with source_type, label, summary)
- patterns_detected (array of strings)
- suggested_next_actions (array of strings)
- proposed_card_updates (array of objects; each must have requires_approval: true)
- confidence_notes (array of strings — NOT a single string)
- safety_notes (array of strings — NOT a single string)

source_type must be one of: card, log, proof, analysis, decision, conversation, none

Broken output:
{broken}
"""

_CHAT_HARNESS_REPAIR_PROMPT = """\
The previous answer was not valid JSON for the Chat Harness schema.
Return ONLY a corrected JSON object. No markdown fences, no commentary, no thinking tags.

Required top-level fields (all must be present):
- answer (string, 2-8 substantive sentences)
- used_context (boolean true or false)
- confidence_notes (array of strings — NOT a single string)
- safety_notes (array of strings — NOT a single string)

Broken output:
{broken}
"""

def _model_path_ready(model_path: str) -> bool:
    path = Path(model_path)
    if not path.is_dir():
        return False
    markers = ("openvino_model.xml", "openvino_tokenizer.xml", "openvino_detokenizer.xml")
    return any((path / name).is_file() for name in markers) or any(path.iterdir())


def _missing_deps_message() -> str:
    return (
        "OpenVINO GenAI is not installed. "
        "Install with: pip install -e \".[openvino]\" "
        "(requires openvino-genai and huggingface_hub)."
    )


def _missing_model_message(settings: Settings) -> str:
    return (
        f"Model not found at {settings.model_path}. "
        f"Download {settings.model_id} to that directory, e.g. "
        "huggingface-cli download OpenVINO/Qwen3-8B-int4-ov "
        f"--local-dir {settings.model_path}"
    )


class OpenVinoProvider:
    name = "openvino"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pipeline: Any | None = None
        self._load_error: str | None = None

    def health(self) -> ProviderHealth:
        model = self._settings.model_id
        device = self._settings.device

        if not _OPENVINO_IMPORTABLE:
            return ProviderHealth(
                status=HealthStatus.degraded,
                provider_ready=False,
                model=model,
                device=device,
                message=_missing_deps_message(),
            )

        if not _model_path_ready(self._settings.model_path):
            return ProviderHealth(
                status=HealthStatus.degraded,
                provider_ready=False,
                model=model,
                device=device,
                message=_missing_model_message(self._settings),
            )

        if self._load_error:
            return ProviderHealth(
                status=HealthStatus.degraded,
                provider_ready=False,
                model=model,
                device=device,
                message=self._load_error,
            )

        if self._pipeline is not None:
            return ProviderHealth(
                status=HealthStatus.ok,
                provider_ready=True,
                model=model,
                device=device,
                message=None,
            )

        return ProviderHealth(
            status=HealthStatus.ok,
            provider_ready=True,
            model=model,
            device=device,
            message="Model path ready; pipeline loads on first analyze request.",
        )

    def analyze(self, request: AnalyzeTranscriptRequest) -> AnalyzeTranscriptResponse:
        if len(request.text) > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Input length {len(request.text)} exceeds SCOUT_MAX_INPUT_CHARS="
                f"{self._settings.max_input_chars}"
            )

        self._ensure_pipeline()
        prompt = build_analysis_prompt(
            mode=request.mode,
            sensitivity=request.sensitivity,
            transcript=request.text,
        )

        raw = self._generate(prompt)
        try:
            return parse_model_json(raw)
        except ProviderParseError:
            logger.warning("openvino parse failed; attempting one JSON repair pass")
            repaired = self._generate(_REPAIR_PROMPT.format(broken=raw[:4000]))
            try:
                return parse_model_json(repaired)
            except ProviderParseError as exc:
                raise ProviderParseError(
                    "Model output could not be parsed as valid scout JSON after repair"
                ) from exc

    def ask_harness(self, request: AskHarnessRequest) -> AskHarnessResponse:
        self._ensure_pipeline()
        prompt = build_ask_harness_prompt(request=request)
        if len(prompt) > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Serialized prompt length {len(prompt)} exceeds SCOUT_MAX_INPUT_CHARS="
                f"{self._settings.max_input_chars}"
            )

        raw = self._generate(prompt)
        try:
            return parse_strict_json(raw, AskHarnessResponse)
        except ProviderParseError:
            logger.warning("openvino ask_harness parse failed; attempting one JSON repair pass")
            repaired = self._generate(_ASK_HARNESS_REPAIR_PROMPT.format(broken=raw[:4000]))
            try:
                return parse_strict_json(repaired, AskHarnessResponse)
            except ProviderParseError as exc:
                raise ProviderParseError(
                    "Model output could not be parsed as valid ask-harness JSON after repair"
                ) from exc

    def chat_harness(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        self._ensure_pipeline()
        prompt = build_chat_harness_prompt(request=request)
        if len(prompt) > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Serialized prompt length {len(prompt)} exceeds SCOUT_MAX_INPUT_CHARS="
                f"{self._settings.max_input_chars}"
            )

        raw = self._generate(prompt)
        try:
            return parse_strict_json(raw, ChatHarnessResponse)
        except ProviderParseError:
            logger.warning("openvino chat_harness parse failed; attempting one JSON repair pass")
            repaired = self._generate(_CHAT_HARNESS_REPAIR_PROMPT.format(broken=raw[:4000]))
            try:
                return parse_strict_json(repaired, ChatHarnessResponse)
            except ProviderParseError:
                logger.warning("openvino chat_harness parse failed after repair; returning fallback")
                return CHAT_HARNESS_PARSE_FALLBACK

    def raw_lab(self, request: RawLabRequest) -> RawLabResponse:
        self._ensure_pipeline()
        system = build_raw_lab_system_prompt(thread_state=request.thread_state)
        input_chars = estimate_raw_lab_input_chars(system=system, request=request)
        if input_chars > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Serialized input length {input_chars} exceeds SCOUT_MAX_INPUT_CHARS="
                f"{self._settings.max_input_chars}"
            )

        history = [
            ConversationTurn(role=turn.role, content=turn.content)
            for turn in request.recent_turns
        ]
        raw = self._generate_chat(
            system=system,
            history=history,
            message=request.message,
        )
        answer = sanitize_raw_lab_text(raw)
        if answer and is_hedged_response(
            answer, request.message, request.recent_turns
        ):
            hedging_repaired_raw = self._generate_chat_repair(
                system=system,
                history=history,
                draft=answer,
                message=request.message,
                repair_instruction=raw_lab_hedging_repair_instruction(),
            )
            hedging_repaired = sanitize_raw_lab_text(hedging_repaired_raw)
            if hedging_repaired and not is_hedged_response(
                hedging_repaired, request.message, request.recent_turns
            ):
                answer = hedging_repaired

        if answer and is_repetitive_response(answer, request.recent_turns):
            repaired_raw = self._generate_chat_repair(
                system=system,
                history=history,
                draft=answer,
                message=request.message,
                repair_instruction=raw_lab_repair_instruction(),
            )
            repaired = sanitize_raw_lab_text(repaired_raw)
            if repaired and not is_repetitive_response(repaired, request.recent_turns):
                answer = repaired

        if not answer:
            logger.warning("openvino raw_lab returned empty text; using fallback")
            return RAW_LAB_EMPTY_FALLBACK

        return RawLabResponse(
            answer=answer,
            mode="raw_lab",
            safety_notes=[],
            used_context=False,
        )

    def _ensure_pipeline(self) -> None:
        if self._pipeline is not None:
            return

        if not _OPENVINO_IMPORTABLE:
            raise ProviderNotReadyError(_missing_deps_message())

        if not _model_path_ready(self._settings.model_path):
            raise ProviderNotReadyError(_missing_model_message(self._settings))

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

    def _generation_config(self) -> Any:
        assert ov_genai is not None
        config = ov_genai.GenerationConfig()
        config.max_new_tokens = self._settings.max_new_tokens
        if hasattr(config, "temperature"):
            config.temperature = self._settings.temperature
        if hasattr(config, "apply_chat_template"):
            config.apply_chat_template = True
        return config

    def _raw_lab_generation_config(self) -> Any:
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

    def _generate_chat_repair(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        draft: str,
        message: str,
        repair_instruction: str | None = None,
    ) -> str:
        """Internal repair pass only — repair prompts never enter recent_turns or UI."""
        self._ensure_pipeline()
        assert self._pipeline is not None
        assert ov_genai is not None

        config = self._raw_lab_generation_config()
        repair_instruction = repair_instruction or raw_lab_repair_instruction()

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

    def _generate_chat(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
    ) -> str:
        self._ensure_pipeline()
        assert self._pipeline is not None
        assert ov_genai is not None

        config = self._raw_lab_generation_config()

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

    def _generate(self, prompt: str) -> str:
        self._ensure_pipeline()
        assert self._pipeline is not None
        assert ov_genai is not None

        config = self._generation_config()

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
