import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.backends.llamacpp_backend import LlamaCppConnectionError
from app.bench_models import BenchCaseStatus, BenchProfile, BenchRunResult
from app.bench_runner import (
    BENCH_TARGETS,
    bench_result_to_json,
    parse_targets,
    run_bench,
)
from app.main import app
from app.synthesis_jobs import clear_synthesis_jobs_for_tests

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


def _valid_critique_json(**overrides) -> str:
    payload = {
        "shallow_flags": ["generic advice"],
        "missing": [],
        "avoidance": [],
        "contradictions": [],
        "overall": "revise",
        "revision_brief": "Ground in active cards.",
    }
    payload.update(overrides)
    return json.dumps(payload)


@pytest.fixture
def client():
    clear_synthesis_jobs_for_tests()
    yield TestClient(app)
    clear_synthesis_jobs_for_tests()


@pytest.fixture
def harness_context() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_parse_targets_recognizes_real_phi4_with_critic():
    targets = parse_targets("real_phi4_with_critic")
    assert targets[0].target_id == "real_phi4_with_critic"
    assert targets[0].pipeline_profile == "with_critic"
    assert targets[0].requires_external is True


@patch(
    "app.bench_runner.check_real_phi4_critic_available",
    return_value=(False, "SCOUT_REAL_MODEL_BENCH not enabled"),
)
def test_unavailable_real_target_skips_all_cases(mock_check, client, harness_context):
    result = run_bench(
        profile=BenchProfile.critic_quality,
        targets=[BENCH_TARGETS["real_phi4_with_critic"]],
        client=client,
        context=harness_context,
    )
    assert all(r.status == BenchCaseStatus.skipped for r in result.case_results)
    note = result.summary["real_phi4_with_critic"].summary_note
    assert note is not None
    assert "real_phi4_with_critic unavailable" in note
    assert "SCOUT_REAL_MODEL_BENCH not enabled" in note


@patch(
    "app.bench_runner.check_real_phi4_critic_available",
    return_value=(False, "critic server unreachable at http://127.0.0.1:8120"),
)
def test_mixed_run_mock_executes_real_skipped(mock_check, client, harness_context):
    result = run_bench(
        profile=BenchProfile.critic_quality,
        targets=parse_targets("mock_with_critic,real_phi4_with_critic"),
        client=client,
        context=harness_context,
    )
    mock_rows = [r for r in result.case_results if r.target_id == "mock_with_critic"]
    real_rows = [r for r in result.case_results if r.target_id == "real_phi4_with_critic"]
    assert mock_rows
    assert any(r.status != BenchCaseStatus.skipped for r in mock_rows)
    assert real_rows
    assert all(r.status == BenchCaseStatus.skipped for r in real_rows)
    assert result.summary["real_phi4_with_critic"].summary_note is not None


@patch("app.bench_runner.check_real_phi4_critic_available", return_value=(True, None))
@patch(
    "app.backends.llamacpp_backend.LlamaCppBackend.generate",
    return_value=_valid_critique_json(),
)
def test_available_fake_real_target_runs_with_critic(
    mock_generate,
    mock_available,
    client,
    harness_context,
):
    result = run_bench(
        profile=BenchProfile.critic_quality,
        targets=[BENCH_TARGETS["real_phi4_with_critic"]],
        client=client,
        context=harness_context,
    )
    executed = [r for r in result.case_results if r.status != BenchCaseStatus.skipped]
    assert executed, "expected at least one executed critic_quality case"
    assert all(r.pipeline_profile == "with_critic" for r in executed)
    assert result.summary["real_phi4_with_critic"].failed == 0 or result.summary[
        "real_phi4_with_critic"
    ].passed >= 0


@patch("app.bench_runner.check_real_phi4_critic_available", return_value=(True, None))
def test_degraded_fallback_counted_when_fake_backend_fails(
    mock_available,
    client,
    harness_context,
):
    def raise_connection(_prompt: str) -> str:
        raise LlamaCppConnectionError("connection refused")

    with patch(
        "app.backends.llamacpp_backend.LlamaCppBackend.generate",
        side_effect=raise_connection,
    ):
        result = run_bench(
            profile=BenchProfile.critic_quality,
            targets=[BENCH_TARGETS["real_phi4_with_critic"]],
            client=client,
            context=harness_context,
        )

    executed = [r for r in result.case_results if r.status != BenchCaseStatus.skipped]
    degraded = [r for r in executed if r.status == BenchCaseStatus.degraded]
    assert degraded, "llamacpp critic fallback should surface degraded_notes"
    assert any(
        "mock" in note.lower() or "llamacpp" in note.lower()
        for row in degraded
        for note in row.degraded_notes
    )
    assert result.summary["real_phi4_with_critic"].degraded >= 1


@patch(
    "app.bench_runner.check_real_phi4_critic_available",
    return_value=(False, "SCOUT_REAL_MODEL_BENCH not enabled"),
)
def test_bench_result_json_validates_with_unavailable_real(
    mock_check,
    client,
    harness_context,
):
    result = run_bench(
        profile=BenchProfile.critic_quality,
        targets=parse_targets("mock_with_critic,real_phi4_with_critic"),
        client=client,
        context=harness_context,
    )
    payload = json.loads(bench_result_to_json(result))
    BenchRunResult.model_validate(payload)


def test_check_real_phi4_critic_available_requires_bench_flag():
    from app.bench_real_phi4 import check_real_phi4_critic_available
    from app.config import Settings

    base = Settings.from_env()
    settings = Settings(
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
        chat_harness_native_chat=base.chat_harness_native_chat,
        deep_max_extra_passes=base.deep_max_extra_passes,
        models_config_path=base.models_config_path,
        warm_slots=base.warm_slots,
        critic_slot=base.critic_slot,
        critic_model_path=base.critic_model_path,
        llama_base_url=base.llama_base_url,
        llama_timeout_seconds=base.llama_timeout_seconds,
        llama_api_key=base.llama_api_key,
        llama_base_url_explicit=base.llama_base_url_explicit,
        critic_runtime="llamacpp",
        critic_base_url="http://127.0.0.1:8120/v1",
        critic_model="phi-4-reasoning-plus",
        critic_timeout_seconds=30.0,
        critic_heavy=False,
        debug_thinking_trace=False,
        critic_context_max_chars=1800,
        real_model_bench_enabled=False,
    )
    ok, reason = check_real_phi4_critic_available(settings)
    assert not ok
    assert reason == "SCOUT_REAL_MODEL_BENCH not enabled"
