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
        temperature=openvino_settings.temperature,
        raw_lab_max_new_tokens=openvino_settings.raw_lab_max_new_tokens,
        raw_lab_temperature=openvino_settings.raw_lab_temperature,
        raw_lab_repetition_penalty=openvino_settings.raw_lab_repetition_penalty,
        dev_cors=openvino_settings.dev_cors,
        deep_enabled=openvino_settings.deep_enabled,
        chat_harness_native_chat=openvino_settings.chat_harness_native_chat,
        deep_max_extra_passes=openvino_settings.deep_max_extra_passes,
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
    class FakeConfig:
        max_new_tokens = 0
        temperature = 0.0
        repetition_penalty = 1.0
        apply_chat_template = False

    provider = OpenVinoProvider(openvino_settings)
    openvino_settings = Settings(
        provider=openvino_settings.provider,
        host=openvino_settings.host,
        port=openvino_settings.port,
        model_path=openvino_settings.model_path,
        model_id=openvino_settings.model_id,
        device=openvino_settings.device,
        max_new_tokens=openvino_settings.max_new_tokens,
        timeout_seconds=openvino_settings.timeout_seconds,
        max_input_chars=openvino_settings.max_input_chars,
        temperature=openvino_settings.temperature,
        raw_lab_max_new_tokens=512,
        raw_lab_temperature=0.6,
        raw_lab_repetition_penalty=1.25,
        dev_cors=openvino_settings.dev_cors,
        deep_enabled=openvino_settings.deep_enabled,
        chat_harness_native_chat=openvino_settings.chat_harness_native_chat,
        deep_max_extra_passes=openvino_settings.deep_max_extra_passes,
    )
    provider = OpenVinoProvider(openvino_settings)

    import app.providers.openvino_provider as openvino_module

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
