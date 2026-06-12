import os
from pathlib import Path

import pytest

from app.config import Settings
from app.models import AnalysisMode, AnalyzeTranscriptRequest, SensitivityLevel
from app.providers.base import ProviderInputError, ProviderNotReadyError, parse_model_json
from app.providers.openvino_provider import OpenVinoProvider, _model_path_ready

MISSING_MODEL_PATH = "/nonexistent/scout-model-path-phase1"


@pytest.fixture
def openvino_settings(monkeypatch):
    monkeypatch.setenv("SCOUT_PROVIDER", "openvino")
    monkeypatch.setenv("SCOUT_MODEL_PATH", MISSING_MODEL_PATH)
    return Settings.from_env()


def test_model_path_ready_false_for_missing_dir():
    assert _model_path_ready(MISSING_MODEL_PATH) is False


def test_openvino_health_degraded_when_model_missing(openvino_settings):
    provider = OpenVinoProvider(openvino_settings)
    health = provider.health()
    assert health.status.value == "degraded"
    assert health.provider_ready is False
    assert health.message
    lowered = health.message.lower()
    assert (
        "not installed" in lowered
        or "not found" in lowered
        or MISSING_MODEL_PATH in health.message
    )


def test_openvino_analyze_raises_not_ready_when_model_missing(openvino_settings):
    provider = OpenVinoProvider(openvino_settings)
    request = AnalyzeTranscriptRequest(
        text="short synthetic note",
        mode=AnalysisMode.operator,
        sensitivity=SensitivityLevel.S1,
    )
    with pytest.raises(ProviderNotReadyError) as exc:
        provider.analyze(request)
    assert exc.value.message


def test_openvino_rejects_overlong_input(openvino_settings):
    openvino_settings = Settings(
        provider=openvino_settings.provider,
        host=openvino_settings.host,
        port=openvino_settings.port,
        model_path=openvino_settings.model_path,
        model_id=openvino_settings.model_id,
        device=openvino_settings.device,
        max_new_tokens=openvino_settings.max_new_tokens,
        timeout_seconds=openvino_settings.timeout_seconds,
        max_input_chars=50,
        raw_lab_max_input_chars=openvino_settings.raw_lab_max_input_chars,
        temperature=openvino_settings.temperature,
        raw_lab_max_new_tokens=openvino_settings.raw_lab_max_new_tokens,
        raw_lab_temperature=openvino_settings.raw_lab_temperature,
        raw_lab_repetition_penalty=openvino_settings.raw_lab_repetition_penalty,
        dev_cors=openvino_settings.dev_cors,
        deep_enabled=openvino_settings.deep_enabled,
        chat_harness_native_chat=openvino_settings.chat_harness_native_chat,
        deep_max_extra_passes=openvino_settings.deep_max_extra_passes,
        models_config_path=openvino_settings.models_config_path,
        warm_slots=openvino_settings.warm_slots,
        critic_slot=openvino_settings.critic_slot,
        critic_model_path=openvino_settings.critic_model_path,
        llama_base_url=openvino_settings.llama_base_url,
        llama_timeout_seconds=openvino_settings.llama_timeout_seconds,
        llama_api_key=openvino_settings.llama_api_key,
        llama_base_url_explicit=openvino_settings.llama_base_url_explicit,
        critic_runtime=openvino_settings.critic_runtime,
        critic_base_url=openvino_settings.critic_base_url,
        critic_model=openvino_settings.critic_model,
        critic_timeout_seconds=openvino_settings.critic_timeout_seconds,
        critic_heavy=openvino_settings.critic_heavy,
        debug_thinking_trace=openvino_settings.debug_thinking_trace,
        real_model_bench_enabled=openvino_settings.real_model_bench_enabled,
    )
    provider = OpenVinoProvider(openvino_settings)
    request = AnalyzeTranscriptRequest(
        text="x" * 51,
        mode=AnalysisMode.operator,
        sensitivity=SensitivityLevel.S1,
    )
    with pytest.raises(ProviderInputError) as exc:
        provider.analyze(request)
    assert "SCOUT_MAX_INPUT_CHARS" in exc.value.message


def test_raw_lab_generation_config_sets_repetition_penalty_when_supported(openvino_settings):
    import os

    class FakeConfig:
        max_new_tokens = 0
        temperature = 0.0
        repetition_penalty = 1.0
        apply_chat_template = False

    from app.config import get_settings
    from app.slots.manager import get_slot_manager

    os.environ["SCOUT_RAW_LAB_MAX_NEW_TOKENS"] = "512"
    os.environ["SCOUT_RAW_LAB_TEMPERATURE"] = "0.6"
    os.environ["SCOUT_RAW_LAB_REPETITION_PENALTY"] = "1.25"
    get_slot_manager.cache_clear()
    provider = OpenVinoProvider(get_settings())

    import app.backends.openvino_backend as openvino_module

    original_genai = openvino_module.ov_genai
    class FakeGenAI:
        @staticmethod
        def GenerationConfig() -> FakeConfig:
            return FakeConfig()

    fake_genai = FakeGenAI()
    openvino_module.ov_genai = fake_genai
    try:
        config = provider._raw_lab_generation_config()
    finally:
        openvino_module.ov_genai = original_genai

    assert config.max_new_tokens == 512
    assert config.temperature == 0.6
    assert config.repetition_penalty == 1.25


def test_parse_model_json_strips_markdown_fences():
    raw = """```json
{
  "summary": "s",
  "themes": ["t"],
  "possible_cards": [],
  "next_actions": ["a"],
  "pounce_mission": "p",
  "things_to_park": [],
  "patterns_detected": [],
  "confidence_notes": ["c"]
}
```"""
    parsed = parse_model_json(raw)
    assert parsed.summary == "s"


def test_parse_model_json_extracts_embedded_object():
    raw = 'Here is JSON:\\n{"summary":"s","themes":["t"],"possible_cards":[],"next_actions":["a"],"pounce_mission":"p","things_to_park":[],"patterns_detected":[],"confidence_notes":["c"]}'
    parsed = parse_model_json(raw)
    assert parsed.themes == ["t"]


def test_openvino_raw_lab_finalize_runs_after_verifier_repair(openvino_settings, monkeypatch):
    from app.models import ChatRole, RawLabRequest, RawLabThreadState, RawLabTurn
    from app.thread_verifier import has_handoff_ending

    provider = OpenVinoProvider(openvino_settings)
    finalize_calls: list[str] = []

    def _track_finalize(answer, thread_state, user_message="", recent_turns=None):
        from app.thread_verifier import apply_raw_lab_steering_repairs

        finalize_calls.append(answer)
        return apply_raw_lab_steering_repairs(
            answer,
            thread_state,
            user_message,
            recent_turns=recent_turns,
        )

    monkeypatch.setattr(
        "app.providers.openvino_provider.finalize_raw_lab_answer",
        _track_finalize,
    )
    monkeypatch.setattr(provider, "_generate_chat", lambda **_: "Draft point. What's next?")
    monkeypatch.setattr(
        provider,
        "_generate_chat_repair",
        lambda **_: "Repaired point. What's on your mind?",
    )
    monkeypatch.setattr(provider, "_ensure_pipeline", lambda: None)

    request = RawLabRequest(
        message="stop asking handoff questions",
        recent_turns=[],
        thread_state=RawLabThreadState(
            user_steering=["avoid reflexive handoff questions"],
            do_not_repeat=["what's next", "what's on your mind"],
        ),
    )
    response = provider.raw_lab(request)
    assert len(finalize_calls) >= 2
    assert not has_handoff_ending(
        response.answer,
        do_not_repeat=request.thread_state.do_not_repeat,
    )


def test_openvino_raw_lab_deep_plus_branch_called_early(openvino_settings, monkeypatch):
    from app.models import (
        RawLabDeepPlusMetadata,
        RawLabRequest,
        RawLabTaskKind,
        ReasoningDepth,
    )

    provider = OpenVinoProvider(openvino_settings)
    monkeypatch.setattr(provider, "_ensure_pipeline", lambda: None)
    monkeypatch.setattr(
        provider,
        "_generate_chat",
        lambda **_: (_ for _ in ()).throw(AssertionError("normal draft skipped")),
    )

    metadata = RawLabDeepPlusMetadata(
        deep_plus_used=True,
        deep_plus_task_kind=RawLabTaskKind.technical,
        deep_plus_contract_confidence="high",
        deep_plus_selected_index=1,
        deep_plus_revised=True,
        deep_plus_fallback_reason=None,
        deep_plus_latency_ms=12,
    )

    def _fake_deep_plus(request, **kwargs):
        assert request.reasoning_depth == ReasoningDepth.deep_plus
        assert kwargs["system"]
        assert kwargs["history"] == []
        return "deep plus answer", metadata

    monkeypatch.setattr(
        "app.providers.openvino_provider.run_raw_lab_deep_plus",
        _fake_deep_plus,
    )

    response = provider.raw_lab(
        RawLabRequest(message="use deep plus", reasoning_depth=ReasoningDepth.deep_plus)
    )

    assert response.answer == "deep plus answer"
    assert response.deep_plus == metadata
