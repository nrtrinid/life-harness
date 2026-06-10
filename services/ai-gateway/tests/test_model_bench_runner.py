import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.bench_models import (
    BenchCaseStatus,
    BenchProfile,
    BenchRunResult,
    ModelPromotionTier,
)
from app.bench_runner import (
    BENCH_TARGETS,
    bench_result_to_json,
    case_target_compatible,
    parse_targets,
    run_bench,
    summarize_case_results,
    write_bench_result,
)
from app.eval_runner import execute_and_score_eval_case, load_eval_cases, run_eval_case
from app.eval_runner import SYNTHESIS_EVALS_DIR
from app.main import app
from app.synthesis_jobs import clear_synthesis_jobs_for_tests

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"


@pytest.fixture
def client():
    clear_synthesis_jobs_for_tests()
    yield TestClient(app)
    clear_synthesis_jobs_for_tests()


@pytest.fixture
def harness_context() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_parse_targets_valid():
    targets = parse_targets("mock_fast_only,mock_with_critic")
    assert [t.target_id for t in targets] == ["mock_fast_only", "mock_with_critic"]
    assert targets[0].pipeline_profile == "fast_only"


def test_parse_targets_unknown_raises():
    with pytest.raises(ValueError, match="unknown bench target"):
        parse_targets("mock_fast_only,not_a_target")


def test_default_bench_targets_exclude_real_phi4():
    assert "real_phi4_with_critic" in BENCH_TARGETS
    default_ids = parse_targets("mock_fast_only,mock_with_critic,mock_with_stretch")
    assert "real_phi4_with_critic" not in [t.target_id for t in default_ids]


def test_case_target_compatible_s3_rejected_skipped():
    cases = load_eval_cases(SYNTHESIS_EVALS_DIR / "s3_rejected.json")
    case = cases[0]
    target = BENCH_TARGETS["mock_fast_only"]
    compatible, reason = case_target_compatible(case, target)
    assert not compatible
    assert reason is not None


def test_case_target_compatible_sync_redirect_requires_stretch():
    cases = load_eval_cases(SYNTHESIS_EVALS_DIR / "sync_redirect_to_job.json")
    case = cases[0]
    stretch_ok, _ = case_target_compatible(case, BENCH_TARGETS["mock_with_stretch"])
    fast_ok, reason = case_target_compatible(case, BENCH_TARGETS["mock_fast_only"])
    assert stretch_ok
    assert not fast_ok
    assert "with_stretch" in (reason or "")


def test_execute_and_score_matches_run_eval_case(client, harness_context):
    cases = load_eval_cases(SYNTHESIS_EVALS_DIR / "valid_synthesis_schema.json")
    case = cases[0]
    run_ok, run_detail = run_eval_case(client, case, harness_context)
    execution = execute_and_score_eval_case(client, case, harness_context)
    assert execution.passed == run_ok
    if not run_ok:
        assert execution.failure_reason == run_detail


def test_run_bench_single_target_shape(client, harness_context):
    result = run_bench(
        profile=BenchProfile.synthesis_depth,
        targets=[BENCH_TARGETS["mock_fast_only"]],
        client=client,
        context=harness_context,
        run_id="bench-test-1",
    )
    assert isinstance(result, BenchRunResult)
    assert result.run_id == "bench-test-1"
    assert result.profile == BenchProfile.synthesis_depth
    assert "mock_fast_only" in result.summary
    assert result.summary["mock_fast_only"].total >= 1


def test_run_bench_three_targets_summaries(client, harness_context):
    targets = parse_targets("mock_fast_only,mock_with_critic,mock_with_stretch")
    post_counts: list[int] = []

    class CountingClient:
        def post(self, path, **kwargs):
            post_counts.append(1)
            return client.post(path, **kwargs)

        def get(self, path, **kwargs):
            return client.get(path, **kwargs)

    result = run_bench(
        profile=BenchProfile.synthesis_depth,
        targets=targets,
        client=CountingClient(),
        context=harness_context,
    )
    assert len(result.summary) == 3
    executed = [r for r in result.case_results if r.status != BenchCaseStatus.skipped]
    assert len(post_counts) == len(executed)


def test_run_bench_summary_fields(client, harness_context):
    result = run_bench(
        profile=BenchProfile.synthesis_depth,
        targets=[BENCH_TARGETS["mock_fast_only"]],
        client=client,
        context=harness_context,
    )
    summary = result.summary["mock_fast_only"]
    assert summary.total >= 0
    assert summary.passed + summary.failed + summary.skipped + summary.degraded == summary.total


def test_run_bench_stretch_target_counts_degraded(client, harness_context):
    result = run_bench(
        profile=BenchProfile.stretch_reflection,
        targets=[BENCH_TARGETS["mock_with_stretch"]],
        client=client,
        context=harness_context,
    )
    executed = [r for r in result.case_results if r.status != BenchCaseStatus.skipped]
    degraded = [r for r in executed if r.status == BenchCaseStatus.degraded]
    assert degraded, "mock_with_stretch should surface degraded_notes from stretch simulation"


def test_run_bench_failure_isolation(client, harness_context):
    cases = load_eval_cases(SYNTHESIS_EVALS_DIR / "valid_synthesis_schema.json")
    good_case = cases[0]

    class FlakyClient:
        def post(self, path, **kwargs):
            payload = kwargs.get("json") or {}
            if path == "/ai/deep-synthesis" and payload.get("user_prompt") == "__force_fail__":
                raise RuntimeError("injected bench failure")
            return client.post(path, **kwargs)

        def get(self, path, **kwargs):
            return client.get(path, **kwargs)

    flaky_client = FlakyClient()
    bad_case = {**good_case, "user_prompt": "__force_fail__"}

    with patch(
        "app.bench_runner.filter_cases_for_profile",
        return_value=[("valid_synthesis_schema.json", "forced_fail", bad_case)],
    ):
        result = run_bench(
            profile=BenchProfile.synthesis_depth,
            targets=[BENCH_TARGETS["mock_fast_only"]],
            client=flaky_client,
            context=harness_context,
        )
    assert result.summary["mock_fast_only"].failed >= 1


def test_job_state_isolation_between_queued_cases(client, harness_context):
    clear_calls: list[int] = []

    original_clear = clear_synthesis_jobs_for_tests

    def counting_clear():
        clear_calls.append(1)
        original_clear()

    cases = load_eval_cases(SYNTHESIS_EVALS_DIR / "critique_flags_shallow.json")
    critic_case = next(c for c in cases if c.get("pipeline_profile") == "with_critic")

    with patch("app.bench_runner.clear_synthesis_jobs_for_tests", side_effect=counting_clear):
        with patch(
            "app.bench_runner.filter_cases_for_profile",
            return_value=[
                ("critique_flags_shallow.json", "critic_a", critic_case),
                ("critique_flags_shallow.json", "critic_b", critic_case),
            ],
        ):
            run_bench(
                profile=BenchProfile.critic_quality,
                targets=[BENCH_TARGETS["mock_with_critic"]],
                client=client,
                context=harness_context,
            )
    assert len(clear_calls) >= 2


def test_placeholder_profile_not_implemented(client, harness_context):
    result = run_bench(
        profile=BenchProfile.code_work,
        targets=[BENCH_TARGETS["mock_fast_only"]],
        client=client,
        context=harness_context,
    )
    assert result.case_results == []
    assert result.summary["mock_fast_only"].summary_note == "not_implemented_v0.1"
    assert result.summary["mock_fast_only"].total == 0


def test_write_bench_result_round_trip(tmp_path, harness_context):
    result = run_bench(
        profile=BenchProfile.synthesis_depth,
        targets=[BENCH_TARGETS["mock_fast_only"]],
        client=TestClient(app),
        context=harness_context,
        run_id="round-trip",
    )
    out = tmp_path / "bench.json"
    write_bench_result(result, out)
    parsed = BenchRunResult.model_validate(json.loads(out.read_text(encoding="utf-8")))
    assert parsed.run_id == "round-trip"


def test_bench_result_json_validates(client, harness_context):
    result = run_bench(
        profile=BenchProfile.synthesis_depth,
        targets=[BENCH_TARGETS["mock_fast_only"]],
        client=client,
        context=harness_context,
    )
    payload = json.loads(bench_result_to_json(result))
    BenchRunResult.model_validate(payload)


def test_summarize_case_results_rates():
    rows = [
        summarize_case_results([]),
    ]
    assert rows[0].total == 0
    assert rows[0].verifier_valid_rate is None


def test_bench_targets_declare_promotion_tiers():
    assert BENCH_TARGETS["mock_fast_only"].promotion_tier == ModelPromotionTier.frozen_core
    assert BENCH_TARGETS["mock_with_critic"].promotion_tier == ModelPromotionTier.frozen_core
    assert BENCH_TARGETS["mock_with_stretch"].promotion_tier == ModelPromotionTier.frozen_core
    assert (
        BENCH_TARGETS["real_phi4_with_critic"].promotion_tier
        == ModelPromotionTier.research_candidate
    )
