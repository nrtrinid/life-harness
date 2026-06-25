from __future__ import annotations

from app.chat_harness_draft_generate import (
    REVISION_PROMPT_MARKER,
    build_chat_harness_deep_draft_generate,
)
from app.config import Settings
from app.models import AskHarnessMode, ChatHarnessRequest, HarnessContext, SensitivityLevel


def _settings(*, native: bool) -> Settings:
    base = Settings.from_env()
    return Settings(
        provider=base.provider,
        host=base.host,
        port=base.port,
        model_path=base.model_path,
        model_id=base.model_id,
        device=base.device,
        max_new_tokens=base.max_new_tokens,
        timeout_seconds=base.timeout_seconds,
        max_input_chars=base.max_input_chars,
        raw_lab_max_input_chars=base.raw_lab_max_input_chars,
        temperature=base.temperature,
        raw_lab_max_new_tokens=base.raw_lab_max_new_tokens,
        raw_lab_temperature=base.raw_lab_temperature,
        raw_lab_repetition_penalty=base.raw_lab_repetition_penalty,
        dev_cors=base.dev_cors,
        deep_enabled=base.deep_enabled,
        chat_harness_native_chat=native,
        deep_max_extra_passes=base.deep_max_extra_passes,
        models_config_path=base.models_config_path,
        warm_slots=base.warm_slots,
        critic_slot=base.critic_slot,
        critic_model_path=base.critic_model_path,
        llama_base_url=base.llama_base_url,
        llama_timeout_seconds=base.llama_timeout_seconds,
        llama_api_key=base.llama_api_key,
        llama_base_url_explicit=base.llama_base_url_explicit,
        critic_runtime=base.critic_runtime,
        critic_base_url=base.critic_base_url,
        critic_model=base.critic_model,
        critic_timeout_seconds=base.critic_timeout_seconds,
        critic_heavy=base.critic_heavy,
        debug_thinking_trace=base.debug_thinking_trace,
        critic_context_max_chars=base.critic_context_max_chars,
        real_model_bench_enabled=base.real_model_bench_enabled,
        memory_rag_enabled=base.memory_rag_enabled,
    )


def _request() -> ChatHarnessRequest:
    return ChatHarnessRequest(
        message="Hello",
        mode=AskHarnessMode.general,
        sensitivity=SensitivityLevel.S1,
        context=HarnessContext(cards=[], logs=[], proof_items=[], recent_analyses=[], decisions=[]),
        conversation_history=[],
        reasoning_depth="deep",
    )


def test_draft_uses_native_when_flag_on():
    request = _request()
    settings = _settings(native=True)
    calls: list[str] = []

    def generate(prompt: str) -> str:
        calls.append(f"generate:{prompt}")
        return "single"

    def generate_native(_request: ChatHarnessRequest, prompt: str) -> str:
        calls.append(f"native:{prompt}")
        return "native"

    draft_generate = build_chat_harness_deep_draft_generate(
        settings=settings,
        request=request,
        generate=generate,
        generate_native=generate_native,
    )
    assert draft_generate("base prompt") == "native"
    assert calls == ["native:base prompt"]


def test_draft_uses_single_prompt_when_flag_off():
    request = _request()
    settings = _settings(native=False)
    calls: list[str] = []

    def generate(prompt: str) -> str:
        calls.append(f"generate:{prompt}")
        return "single"

    def generate_native(_request: ChatHarnessRequest, prompt: str) -> str:
        calls.append(f"native:{prompt}")
        return "native"

    draft_generate = build_chat_harness_deep_draft_generate(
        settings=settings,
        request=request,
        generate=generate,
        generate_native=generate_native,
    )
    assert draft_generate("base prompt") == "single"
    assert calls == ["generate:base prompt"]


def test_revision_always_uses_single_prompt():
    request = _request()
    settings = _settings(native=True)
    calls: list[str] = []

    def generate(prompt: str) -> str:
        calls.append(f"generate:{prompt}")
        return "single"

    def generate_native(_request: ChatHarnessRequest, prompt: str) -> str:
        calls.append(f"native:{prompt}")
        return "native"

    draft_generate = build_chat_harness_deep_draft_generate(
        settings=settings,
        request=request,
        generate=generate,
        generate_native=generate_native,
    )
    assert draft_generate(f"something\n{REVISION_PROMPT_MARKER}\nverdict") == "single"
    assert calls == [f"generate:something\n{REVISION_PROMPT_MARKER}\nverdict"]


def test_native_none_falls_back_to_generate():
    request = _request()
    settings = _settings(native=True)
    calls: list[str] = []

    def generate(prompt: str) -> str:
        calls.append(f"generate:{prompt}")
        return "single"

    draft_generate = build_chat_harness_deep_draft_generate(
        settings=settings,
        request=request,
        generate=generate,
        generate_native=None,
    )
    assert draft_generate("base prompt") == "single"
    assert calls == ["generate:base prompt"]

