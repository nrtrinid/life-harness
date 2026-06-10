from __future__ import annotations

import logging
from typing import Any

from app.backends.openvino_backend import (
    missing_deps_message,
    missing_model_message,
    model_path_ready,
)
from app.config import Settings
from app.slots.manager import get_slot_manager
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
    build_chat_harness_system_prompt,
    estimate_raw_lab_input_chars,
)
from app.chat_harness_finalize import finalize_chat_harness_response
from app.deep_synthesis_openvino import run_openvino_fast_only
from app.synthesis_models import DeepSynthesisCompletedBody, DeepSynthesisRequest
from app.thread_verifier import VerificationResult, verify_raw_lab_response
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
    ProviderParseError,
    parse_model_json,
    parse_strict_json,
    sanitize_raw_lab_text,
)

logger = logging.getLogger(__name__)

_model_path_ready = model_path_ready

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

_CHAT_HARNESS_CONTENT_REPAIR = """\
The previous answer failed a content check ({check}).
{instruction}
Return ONLY corrected JSON for the Chat Harness schema.

Broken answer text:
{answer}
"""

class OpenVinoProvider:
    name = "openvino"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._backend = get_slot_manager().companion_backend

    @property
    def _pipeline(self) -> Any | None:
        return self._backend._pipeline

    @_pipeline.setter
    def _pipeline(self, value: Any | None) -> None:
        self._backend._pipeline = value

    @property
    def _load_error(self) -> str | None:
        return self._backend.load_error

    @_load_error.setter
    def _load_error(self, value: str | None) -> None:
        self._backend._load_error = value

    def health(self) -> ProviderHealth:
        model = self._settings.model_id
        device = self._settings.device

        if not self._backend.is_importable():
            return ProviderHealth(
                status=HealthStatus.degraded,
                provider_ready=False,
                model=model,
                device=device,
                message=missing_deps_message(),
            )

        if not self._backend.is_model_path_ready():
            return ProviderHealth(
                status=HealthStatus.degraded,
                provider_ready=False,
                model=model,
                device=device,
                message=missing_model_message(self._settings),
            )

        if self._backend.load_error:
            return ProviderHealth(
                status=HealthStatus.degraded,
                provider_ready=False,
                model=model,
                device=device,
                message=self._backend.load_error,
            )

        if self._backend.pipeline_loaded:
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
        from app.orchestrator.inference_orchestrator import get_inference_orchestrator

        return get_inference_orchestrator().run_chat_harness(request)

    def _run_chat_harness_impl(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        self._ensure_pipeline()
        prompt = build_chat_harness_prompt(request=request)
        if len(prompt) > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Serialized prompt length {len(prompt)} exceeds SCOUT_MAX_INPUT_CHARS="
                f"{self._settings.max_input_chars}"
            )

        if self._settings.chat_harness_native_chat:
            raw = self._generate_chat_harness_native(request, prompt)
        else:
            raw = self._generate(prompt)

        response = self._parse_chat_harness_raw(raw)
        return self._apply_chat_harness_verifier(request, response)

    def _run_chat_harness_deep(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        from app.chat_harness_critic import append_deep_critic_note
        from app.chat_harness_deep import run_chat_harness_deep
        from app.critic_backend import get_critic_backend

        self._ensure_pipeline()
        prompt = build_chat_harness_prompt(request=request)
        if len(prompt) > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Serialized prompt length {len(prompt)} exceeds SCOUT_MAX_INPUT_CHARS="
                f"{self._settings.max_input_chars}"
            )

        from app.chat_harness_thinking_trace import emit_thinking_trace, new_thinking_trace

        trace = (
            new_thinking_trace(request) if self._settings.debug_thinking_trace else None
        )
        deep_result = run_chat_harness_deep(
            request=request,
            prompt=prompt,
            draft_generate=self._generate,
            critic=get_critic_backend(
                self._settings,
                self._generate,
                routing=trace,
            ),
            max_extra_passes=self._settings.deep_max_extra_passes,
            trace=trace,
        )
        emit_thinking_trace(self._settings, trace)
        response = append_deep_critic_note(
            self._parse_chat_harness_raw(deep_result.raw),
            revised=deep_result.revised,
            critic_ran=deep_result.critic_ran,
            critic_skip_reason=deep_result.critic_skip_reason,
        )
        return self._apply_chat_harness_verifier(request, response)

    def _generate_chat_harness_native(
        self, request: ChatHarnessRequest, fallback_prompt: str
    ) -> str:
        system = build_chat_harness_system_prompt(request=request)
        history = list(request.conversation_history)
        input_chars = len(system) + sum(len(turn.content) for turn in history) + len(
            request.message
        )
        if input_chars > self._settings.max_input_chars:
            raise ProviderInputError(
                f"Serialized native chat input length {input_chars} exceeds "
                f"SCOUT_MAX_INPUT_CHARS={self._settings.max_input_chars}"
            )
        try:
            raw = self._generate_chat(
                system=system,
                history=history,
                message=request.message,
            )
            parse_strict_json(raw, ChatHarnessResponse)
            return raw
        except ProviderParseError:
            logger.warning(
                "openvino chat_harness native chat parse failed; falling back to single prompt"
            )
            return self._generate(fallback_prompt)

    def _parse_chat_harness_raw(self, raw: str) -> ChatHarnessResponse:
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

    def _repair_chat_harness_openvino(
        self,
        verification: VerificationResult,
        request: ChatHarnessRequest,
        response: ChatHarnessResponse,
    ) -> ChatHarnessResponse:
        repair_prompt = _CHAT_HARNESS_CONTENT_REPAIR.format(
            check=verification.check,
            instruction=verification.repair_instruction,
            answer=response.answer[:2000],
        )
        repaired_raw = self._generate(repair_prompt)
        repaired = parse_strict_json(repaired_raw, ChatHarnessResponse)
        return ChatHarnessResponse(
            answer=repaired.answer,
            used_context=repaired.used_context,
            confidence_notes=[
                *repaired.confidence_notes,
                f"Inferred — repaired {verification.check}.",
            ],
            safety_notes=repaired.safety_notes,
        )

    def _apply_chat_harness_verifier(
        self,
        request: ChatHarnessRequest,
        response: ChatHarnessResponse,
    ) -> ChatHarnessResponse:
        return finalize_chat_harness_response(
            request=request,
            response=response,
            repair_once=self._repair_chat_harness_openvino,
        )

    def deep_synthesis_fast_only(
        self, request: DeepSynthesisRequest
    ) -> DeepSynthesisCompletedBody:
        self._ensure_pipeline()
        return run_openvino_fast_only(
            request,
            generate=self._generate,
            max_input_chars=self._settings.max_input_chars,
        )

    def raw_lab(self, request: RawLabRequest) -> RawLabResponse:
        self._ensure_pipeline()
        from app.raw_lab_budget import prepare_raw_lab_request

        from app.config import raw_lab_input_char_limit

        budget = prepare_raw_lab_request(request, self._settings)
        request = budget.request
        system = budget.system_prompt
        raw_lab_limit = raw_lab_input_char_limit(self._settings)
        input_chars = estimate_raw_lab_input_chars(system=system, request=request)
        if input_chars > raw_lab_limit:
            raise ProviderInputError(
                f"Serialized input length {input_chars} exceeds SCOUT_RAW_LAB_MAX_INPUT_CHARS="
                f"{raw_lab_limit}"
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

        verification = verify_raw_lab_response(
            answer=answer or "",
            user_message=request.message,
            conversation_history=history,
        )
        if answer and not verification.ok and verification.repair_instruction:
            verified_raw = self._generate_chat_repair(
                system=system,
                history=history,
                draft=answer,
                message=request.message,
                repair_instruction=verification.repair_instruction,
            )
            verified = sanitize_raw_lab_text(verified_raw)
            if verified:
                answer = verified

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
        self._backend.ensure_ready()

    def _raw_lab_generation_config(self) -> Any:
        return self._backend.raw_lab_generation_config()

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
        return self._backend.generate_chat_repair(
            system=system,
            history=history,
            draft=draft,
            message=message,
            repair_instruction=repair_instruction or raw_lab_repair_instruction(),
        )

    def _generate_chat(
        self,
        *,
        system: str,
        history: list[ConversationTurn],
        message: str,
    ) -> str:
        return self._backend.generate_chat(
            system=system,
            history=history,
            message=message,
        )

    def _generate(self, prompt: str) -> str:
        return self._backend.generate(prompt)
