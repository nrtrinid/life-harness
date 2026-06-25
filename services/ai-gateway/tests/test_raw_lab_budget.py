import logging

from app.config import Settings, raw_lab_input_char_limit
from app.models import RawLabPersonalityState, RawLabRequest, RawLabThreadState, RawLabTurn
from app.prompt_loader import build_raw_lab_system_prompt, estimate_raw_lab_input_chars
from app.raw_lab_budget import (
    _compact_thread_state,
    compact_raw_lab_request_for_budget,
    prepare_raw_lab_request,
)
from app.models import ChatRole


def _settings(
    max_input_chars: int = 12_000,
    raw_lab_max_input_chars: int | None = None,
) -> Settings:
    return Settings(
        provider="mock",
        host="127.0.0.1",
        port=8111,
        model_path="models/qwen3-8b-int4-ov",
        model_id="OpenVINO/Qwen3-8B-int4-ov",
        device="GPU",
        max_new_tokens=1024,
        timeout_seconds=180,
        max_input_chars=max_input_chars,
        raw_lab_max_input_chars=(
            raw_lab_max_input_chars
            if raw_lab_max_input_chars is not None
            else 32_000
        ),
        temperature=0.2,
        raw_lab_max_new_tokens=2048,
        raw_lab_temperature=0.7,
        raw_lab_repetition_penalty=1.12,
        dev_cors=True,
        deep_enabled=True,
        chat_harness_native_chat=False,
        deep_max_extra_passes=2,
        models_config_path="models.yaml",
        warm_slots=(),
        critic_slot="same",
        critic_model_path=None,
        llama_base_url="http://127.0.0.1:8120",
        llama_timeout_seconds=60,
        llama_api_key=None,
        llama_base_url_explicit=False,
        critic_runtime="mock",
        critic_base_url="http://127.0.0.1:8120/v1",
        critic_model="phi-4-reasoning-plus",
        critic_timeout_seconds=30.0,
        critic_heavy=False,
        debug_thinking_trace=False,
        critic_context_max_chars=1800,
        real_model_bench_enabled=False,
    )


def test_estimate_includes_system_prompt_length():
    request = RawLabRequest(message="hi")
    system = build_raw_lab_system_prompt(thread_state=request.thread_state)
    total = estimate_raw_lab_input_chars(system=system, request=request)
    assert total >= len(system)


def test_compact_trims_old_turns():
    turns = [
        RawLabTurn(role=ChatRole.user, content=f"Turn {index} " + "x" * 400)
        for index in range(18)
    ]
    request = RawLabRequest(message="latest", recent_turns=turns)
    original = request.model_copy(deep=True)
    result = compact_raw_lab_request_for_budget(request=request, max_chars=9_000)
    assert len(result.request.recent_turns) < len(turns)
    assert len(original.recent_turns) == len(turns)
    assert result.level in {"trim_history", "compact_state", "aggressive"}
    assert len(result.request.recent_turns) < len(turns)


def test_compact_trims_personality_growth_notes():
    state = RawLabThreadState(
        personality=RawLabPersonalityState(
            voice_traits=["a", "b", "c", "d"],
            growth_notes=["one", "two", "three", "four"],
        )
    )
    turns = [
        RawLabTurn(role=ChatRole.assistant, content="Verbose " * 300)
        for _ in range(12)
    ]
    request = RawLabRequest(message="ok", recent_turns=turns, thread_state=state)
    result = compact_raw_lab_request_for_budget(request=request, max_chars=7_000)
    assert len(result.request.thread_state.personality.growth_notes) <= 2
    assert result.level in {"compact_state", "aggressive"}


def test_aggressive_compaction_preserves_latest_steering_and_core_loops():
    state = RawLabThreadState(
        open_loops=["loop-a", "loop-b", "loop-c"],
        user_steering=["old steering", "middle steering", "latest steering"],
        do_not_repeat=["old phrase", "middle phrase", "latest phrase"],
        questions_to_revisit=["question-a", "question-b", "question-c"],
        self_observations=["obs-a", "obs-b", "obs-c"],
        personality=RawLabPersonalityState(
            voice_traits=["voice-a", "voice-b", "voice-c"],
            growth_notes=["growth-a", "growth-b", "growth-c"],
        ),
    )
    original = state.model_copy(deep=True)

    turns = [
        RawLabTurn(role=ChatRole.user, content="I want pushback on whether I am avoiding."),
        RawLabTurn(role=ChatRole.assistant, content="Reply"),
        RawLabTurn(role=ChatRole.user, content="Don't keep saying little scout."),
    ]

    compacted = _compact_thread_state(
        state,
        aggressive=True,
        turns=turns,
        turns_before=10,
    )

    assert compacted.user_steering == ["middle steering", "latest steering"]
    assert compacted.do_not_repeat == ["middle phrase", "latest phrase"]
    assert compacted.open_loops == ["loop-a", "loop-b"]
    assert compacted.questions_to_revisit == ["question-a", "question-b"]
    assert len(compacted.self_observations) == 1
    assert len(compacted.personality.growth_notes) == 1
    assert compacted.smart_compacted_context.do_not_repeat == [
        "middle phrase",
        "latest phrase",
    ]
    assert compacted.smart_compacted_context.user_steering == [
        "middle steering",
        "latest steering",
    ]
    assert compacted.smart_compacted_context.active_open_loops == ["loop-a", "loop-b"]
    assert compacted.smart_compacted_context.questions_to_revisit == [
        "question-a",
        "question-b",
    ]
    assert "avoidance" in compacted.smart_compacted_context.current_tension
    assert "7 older Raw Lab turns" in compacted.smart_compacted_context.discarded_noise_summary
    assert compacted.smart_compacted_context.important_recent_moments == [
        "user: I want pushback on whether I am avoiding.",
        "user: Don't keep saying little scout.",
    ]
    assert state == original


def test_prepare_logs_counts_not_raw_text(caplog):
    turns = [
        RawLabTurn(role=ChatRole.user, content="chunk " * 500),
        RawLabTurn(role=ChatRole.assistant, content="reply " * 500),
    ]
    request = RawLabRequest(
        message="latest question",
        recent_turns=turns * 8,
    )
    with caplog.at_level(logging.INFO):
        prepare_raw_lab_request(request, _settings(max_input_chars=6_000))
    joined = " ".join(record.message for record in caplog.records)
    assert "raw_lab budget_before=" in joined
    assert "latest question" not in joined
    assert "chunk" not in joined


def test_still_raises_when_message_alone_too_large():
    request = RawLabRequest(message="x" * 13_000)
    result = prepare_raw_lab_request(request, _settings(max_input_chars=12_000))
    assert (
        estimate_raw_lab_input_chars(
            system=result.system_prompt,
            request=result.request,
        )
        > 12_000
    )


def test_raw_lab_uses_higher_limit_when_configured():
    settings = _settings(max_input_chars=12_000, raw_lab_max_input_chars=32_000)
    assert raw_lab_input_char_limit(settings) == 32_000
    turns = [
        RawLabTurn(
            role=ChatRole.user if index % 2 == 0 else ChatRole.assistant,
            content=f"Long {index} " + "y" * 350,
        )
        for index in range(20)
    ]
    request = RawLabRequest(message="tools?", recent_turns=turns)
    result = prepare_raw_lab_request(request, settings)
    assert result.after_chars <= 32_000


def test_raw_lab_defaults_to_32k_when_unset():
    settings = _settings(max_input_chars=12_000)
    assert raw_lab_input_char_limit(settings) == 32_000


def test_from_env_raw_lab_defaults_to_32k_independent_of_harness_cap():
    import os

    from app.config import Settings

    os.environ.pop("SCOUT_RAW_LAB_MAX_INPUT_CHARS", None)
    os.environ.pop("SCOUT_TIMEOUT_SECONDS", None)
    os.environ["SCOUT_MAX_INPUT_CHARS"] = "12000"
    settings = Settings.from_env()
    assert settings.max_input_chars == 12_000
    assert settings.raw_lab_max_input_chars == 32_000
    assert settings.timeout_seconds == 180.0


def test_long_thread_short_message_fits_after_compaction():
    turns = [
        RawLabTurn(role=ChatRole.user if index % 2 == 0 else ChatRole.assistant, content=f"Long {index} " + "y" * 350)
        for index in range(16)
    ]
    request = RawLabRequest(message="tools?", recent_turns=turns)
    result = prepare_raw_lab_request(request, _settings())
    assert result.after_chars <= 32_000
    assert result.request.message == "tools?"
