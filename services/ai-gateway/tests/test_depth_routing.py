import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app, get_provider
from app.models import ReasoningDepth
from app.orchestrator.depth_routing import (
    SLOT_PLAN_DEPTH_NOTE,
    STRETCH_MOCK_NOTE,
    DepthRoutePlan,
    GatewayRouteEndpoint,
    resolve_depth_route,
)
from app.synthesis_models import SynthesisPipelineProfile


def _settings(**overrides) -> Settings:
    base = Settings.from_env()
    return Settings(
        provider=overrides.get("provider", base.provider),
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
        deep_enabled=overrides.get("deep_enabled", base.deep_enabled),
        chat_harness_native_chat=base.chat_harness_native_chat,
        deep_max_extra_passes=base.deep_max_extra_passes,
        models_config_path=base.models_config_path,
        warm_slots=base.warm_slots,
        critic_slot=overrides.get("critic_slot", base.critic_slot),
        critic_model_path=base.critic_model_path,
        llama_base_url=base.llama_base_url,
        llama_timeout_seconds=base.llama_timeout_seconds,
        llama_api_key=base.llama_api_key,
        llama_base_url_explicit=base.llama_base_url_explicit,
        critic_runtime=overrides.get("critic_runtime", base.critic_runtime),
        critic_base_url=base.critic_base_url,
        critic_model=base.critic_model,
        critic_timeout_seconds=base.critic_timeout_seconds,
        critic_heavy=base.critic_heavy,
        debug_thinking_trace=overrides.get("debug_thinking_trace", base.debug_thinking_trace),
        critic_context_max_chars=base.critic_context_max_chars,
        real_model_bench_enabled=base.real_model_bench_enabled,
        memory_rag_enabled=base.memory_rag_enabled,
    )


@pytest.mark.parametrize(
    "depth,orchestrator_path,critic_slot",
    [
        (ReasoningDepth.fast, "chat_harness_impl", None),
        (ReasoningDepth.deliberate, "chat_harness_impl", None),
        (ReasoningDepth.deep, "chat_harness_deep", "same"),
    ],
)
def test_chat_harness_depth_routing(depth, orchestrator_path, critic_slot):
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.chat_harness,
        settings=_settings(),
        reasoning_depth=depth,
    )
    assert route.primary_slots == ("companion_fast",)
    assert route.orchestrator_path == orchestrator_path
    assert route.critic_slot == critic_slot
    assert SLOT_PLAN_DEPTH_NOTE in route.notes


def test_chat_harness_deep_disabled_falls_back_to_impl():
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.chat_harness,
        settings=_settings(deep_enabled=False),
        reasoning_depth=ReasoningDepth.deep,
    )
    assert route.orchestrator_path == "chat_harness_impl"
    assert route.critic_slot is None
    assert any("SCOUT_DEEP_ENABLED=false" in note for note in route.notes)


def test_chat_harness_secondary_critic_slot():
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.chat_harness,
        settings=_settings(critic_slot="secondary"),
        reasoning_depth=ReasoningDepth.deep,
    )
    assert route.critic_slot == "secondary"


@pytest.mark.parametrize(
    "depth,orchestrator_path",
    [
        (ReasoningDepth.fast, "raw_lab_standard"),
        (ReasoningDepth.deliberate, "raw_lab_standard"),
        (ReasoningDepth.deep, "raw_lab_deep_standard"),
        (ReasoningDepth.deep_plus, "raw_lab_deep_plus"),
    ],
)
def test_raw_lab_depth_routing(depth, orchestrator_path):
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.raw_lab,
        settings=_settings(),
        reasoning_depth=depth,
    )
    assert route.primary_slots == ("companion_fast",)
    assert route.orchestrator_path == orchestrator_path
    assert route.critic_slot is None
    assert SLOT_PLAN_DEPTH_NOTE in route.notes


@pytest.mark.parametrize(
    "profile,orchestrator_path",
    [
        (SynthesisPipelineProfile.fast_only, "deep_synthesis_fast_only"),
        (SynthesisPipelineProfile.auto, "deep_synthesis_fast_only"),
        (SynthesisPipelineProfile.with_critic, "deep_synthesis_queued_redirect"),
        (SynthesisPipelineProfile.with_stretch, "deep_synthesis_queued_redirect"),
    ],
)
def test_deep_synthesis_sync_routing(profile, orchestrator_path):
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.deep_synthesis,
        settings=_settings(),
        pipeline_profile=profile,
    )
    assert route.orchestrator_path == orchestrator_path
    assert route.reasoning_depth is None
    assert route.pipeline_profile == profile.value


@pytest.mark.parametrize(
    "profile,orchestrator_path,expected_critic_runtime,expected_stretch",
    [
        (SynthesisPipelineProfile.fast_only, "synthesis_mock_fast", None, None),
        (SynthesisPipelineProfile.with_critic, "synthesis_with_critic_pipeline", "mock", None),
        (SynthesisPipelineProfile.with_stretch, "synthesis_mock_stretch", None, "stretch_batch"),
    ],
)
def test_deep_synthesis_job_routing(
    profile, orchestrator_path, expected_critic_runtime, expected_stretch
):
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.deep_synthesis_job,
        settings=_settings(),
        pipeline_profile=profile,
    )
    assert route.orchestrator_path == orchestrator_path
    assert route.synthesis_critic_runtime == expected_critic_runtime
    assert route.stretch_slot == expected_stretch


def test_deep_synthesis_job_stretch_note():
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.deep_synthesis_job,
        settings=_settings(),
        pipeline_profile=SynthesisPipelineProfile.with_stretch,
    )
    assert STRETCH_MOCK_NOTE in route.notes


def test_depth_route_plan_to_dict_is_json_serializable():
    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.chat_harness,
        settings=_settings(),
        reasoning_depth=ReasoningDepth.deep,
    )
    assert isinstance(route, DepthRoutePlan)
    payload = route.to_dict()
    json.dumps(payload)
    assert payload["endpoint"] == "chat_harness"
    assert payload["orchestrator_path"] == "chat_harness_deep"


def test_chat_harness_depth_route_emitted_when_debug_trace(harness_context, caplog):
    os.environ["SCOUT_DEBUG_THINKING_TRACE"] = "true"
    get_provider.cache_clear()
    try:
        with caplog.at_level(logging.INFO):
            response = TestClient(app).post(
                "/chat-harness",
                json={
                    "message": "hello",
                    "mode": "general",
                    "sensitivity": "S1",
                    "context": harness_context,
                    "conversation_history": [],
                    "reasoning_depth": "deep",
                },
            )
        assert response.status_code == 200
        route_records = [
            record.message
            for record in caplog.records
            if "chat_harness_depth_route" in record.message
        ]
        assert len(route_records) == 1
        payload = json.loads(route_records[0].split(" ", 1)[1])
        assert payload["orchestrator_path"] == "chat_harness_deep"
    finally:
        os.environ.pop("SCOUT_DEBUG_THINKING_TRACE", None)
        get_provider.cache_clear()
