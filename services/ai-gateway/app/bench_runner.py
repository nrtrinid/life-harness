from __future__ import annotations

import argparse
import json
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.bench_models import (
    PLACEHOLDER_BENCH_PROFILES,
    BenchCaseResult,
    BenchCaseStatus,
    BenchMetricSummary,
    BenchProfile,
    BenchRunResult,
    BenchTarget,
    ModelPromotionTier,
)
from app.bench_real_phi4 import (
    bench_target_runtime,
    check_real_phi4_critic_available,
)
from app.config import Settings
from app.eval_runner import (
    DEFAULT_CONTEXT_FIXTURE,
    SYNTHESIS_EVALS_DIR,
    EvalHttpClient,
    execute_and_score_eval_case,
    iter_eval_cases,
    load_default_context,
)
from app.synthesis_jobs import clear_synthesis_jobs_for_tests

SERVICE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = "http://127.0.0.1:8111"

BENCH_TARGETS: dict[str, BenchTarget] = {
    "mock_fast_only": BenchTarget(
        target_id="mock_fast_only",
        pipeline_profile="fast_only",
        promotion_tier=ModelPromotionTier.frozen_core,
    ),
    "mock_with_critic": BenchTarget(
        target_id="mock_with_critic",
        pipeline_profile="with_critic",
        promotion_tier=ModelPromotionTier.frozen_core,
    ),
    "mock_with_stretch": BenchTarget(
        target_id="mock_with_stretch",
        pipeline_profile="with_stretch",
        promotion_tier=ModelPromotionTier.frozen_core,
    ),
    "real_phi4_with_critic": BenchTarget(
        target_id="real_phi4_with_critic",
        pipeline_profile="with_critic",
        label="Phi-4 critic via local llama.cpp",
        requires_external=True,
        promotion_tier=ModelPromotionTier.research_candidate,
    ),
}


def parse_targets(raw: str) -> list[BenchTarget]:
    ids = [part.strip() for part in raw.split(",") if part.strip()]
    if not ids:
        raise ValueError("at least one target id is required")
    targets: list[BenchTarget] = []
    for target_id in ids:
        if target_id not in BENCH_TARGETS:
            raise ValueError(f"unknown bench target: {target_id!r}")
        targets.append(BENCH_TARGETS[target_id])
    return targets


def _case_expects_profile(case: dict[str, Any]) -> str | None:
    fixture_profile = case.get("pipeline_profile")
    if isinstance(fixture_profile, str) and fixture_profile:
        return fixture_profile
    expect_fields = case.get("expect_json_fields") or {}
    used = expect_fields.get("pipeline_profile_used")
    if isinstance(used, list) and len(used) == 1:
        return str(used[0])
    return None


def _case_has_profile_locked_expectations(case: dict[str, Any]) -> bool:
    expect_fields = case.get("expect_json_fields") or {}
    if "pipeline_profile_used" in expect_fields:
        return True
    if "sync_queued_redirect" in case.get("heuristic_checks", []):
        return True
    status_expect = expect_fields.get("status")
    if isinstance(status_expect, list) and "queued" in status_expect:
        return True
    if "critique" in expect_fields or "critique.overall" in expect_fields:
        return True
    return False


def case_target_compatible(
    case: dict[str, Any],
    target: BenchTarget,
    *,
    bench_profile: BenchProfile | None = None,
) -> tuple[bool, str | None]:
    if case.get("endpoint") != "deep-synthesis":
        return False, "bench v0.1 supports deep-synthesis eval cases only"

    expected_http = case.get("expect_http_status", 200)
    if expected_http != 200:
        return False, f"fixture expects HTTP {expected_http}"

    if "sync_queued_redirect" in case.get("heuristic_checks", []):
        if target.pipeline_profile != "with_stretch":
            return False, "sync_queued_redirect requires with_stretch target"

    fixture_profile = case.get("pipeline_profile")
    if isinstance(fixture_profile, str) and fixture_profile:
        if fixture_profile != target.pipeline_profile and _case_has_profile_locked_expectations(case):
            return False, (
                f"fixture pipeline_profile={fixture_profile!r} "
                f"incompatible with target {target.pipeline_profile!r}"
            )

    expect_fields = case.get("expect_json_fields") or {}
    status_expect = expect_fields.get("status")
    if isinstance(status_expect, list) and "queued" in status_expect:
        if target.pipeline_profile == "fast_only":
            return False, "queued status expectation incompatible with fast_only target"

    if bench_profile == BenchProfile.critic_quality and target.pipeline_profile == "fast_only":
        if "critique" in expect_fields or "critique.overall" in expect_fields:
            return False, "critic_quality case requires with_critic target"

    return True, None


def _bench_synthesis_cases() -> list[tuple[str, str, dict[str, Any]]]:
    return [
        (eval_file, eval_case, case)
        for eval_file, eval_case, case in iter_eval_cases(SYNTHESIS_EVALS_DIR)
        if case.get("skip_phase") != "0"
        and case.get("endpoint") != "overnight-brain"
        and "phase_1b" not in case.get("tags", [])
    ]


def filter_cases_for_profile(profile: BenchProfile) -> list[tuple[str, str, dict[str, Any]]]:
    cases = _bench_synthesis_cases()

    if profile == BenchProfile.synthesis_depth or profile == BenchProfile.latency:
        return cases

    if profile == BenchProfile.critic_quality:
        return [
            row
            for row in cases
            if row[2].get("pipeline_profile") == "with_critic"
            or "with_critic" in row[2].get("tags", [])
            or "critique" in (row[2].get("expect_json_fields") or {})
            or "critique.overall" in (row[2].get("expect_json_fields") or {})
        ]

    if profile == BenchProfile.stretch_reflection:
        filtered: list[tuple[str, str, dict[str, Any]]] = []
        for row in cases:
            case = row[2]
            locked_profile = _case_expects_profile(case)
            if locked_profile in ("fast_only", "with_critic") and _case_has_profile_locked_expectations(
                case
            ):
                continue
            filtered.append(row)
        return filtered

    if profile == BenchProfile.verifier_validity:
        return [
            row
            for row in cases
            if row[2].get("expect_schema") == "DeepSynthesisCompletedBody"
            or "completed" in (row[2].get("expect_json_fields") or {}).get("status", [])
            or row[2].get("expect_http_status", 200) == 200
            and "sync_queued_redirect" not in row[2].get("heuristic_checks", [])
        ]

    if profile == BenchProfile.fallback_behavior:
        return [
            row
            for row in cases
            if "fallback" in row[0].lower()
            or "fallback" in row[1].lower()
            or "fallback" in row[2].get("tags", [])
        ]

    return cases


def _metrics_from_breakdown(breakdown: dict[str, Any]) -> dict[str, Any]:
    return {
        "verifier_valid": breakdown.get("verifier_valid"),
        "schema_valid": breakdown.get("schema_valid"),
        "pounce_count": breakdown.get("pounce_count"),
        "proposal_approval_valid": breakdown.get("proposal_approval_valid"),
        "grounding_valid": breakdown.get("grounding_valid"),
        "degraded_notes": list(breakdown.get("degraded_notes") or []),
    }


def _classify_case_status(
    *,
    passed: bool,
    breakdown: dict[str, Any],
    body: dict[str, Any] | None,
) -> BenchCaseStatus:
    if not passed:
        return BenchCaseStatus.failed

    degraded_notes = list(breakdown.get("degraded_notes") or [])
    if not degraded_notes and body:
        degraded_notes = list(body.get("degraded_notes") or [])
    if degraded_notes:
        return BenchCaseStatus.degraded
    return BenchCaseStatus.passed


def run_case_for_target(
    *,
    client: EvalHttpClient,
    context: dict[str, Any],
    eval_file: str,
    eval_case: str,
    case: dict[str, Any],
    target: BenchTarget,
    bench_profile: BenchProfile,
) -> BenchCaseResult:
    compatible, skip_reason = case_target_compatible(
        case, target, bench_profile=bench_profile
    )
    if not compatible:
        return BenchCaseResult(
            target_id=target.target_id,
            pipeline_profile=target.pipeline_profile,
            eval_file=eval_file,
            eval_case=eval_case,
            status=BenchCaseStatus.skipped,
            skip_reason=skip_reason,
        )

    clear_synthesis_jobs_for_tests()
    run_case = deepcopy(case)
    run_case["pipeline_profile"] = target.pipeline_profile

    try:
        with bench_target_runtime(target):
            execution = execute_and_score_eval_case(client, run_case, context)
    except Exception as exc:
        return BenchCaseResult(
            target_id=target.target_id,
            pipeline_profile=target.pipeline_profile,
            eval_file=eval_file,
            eval_case=eval_case,
            status=BenchCaseStatus.failed,
            failure_reason=str(exc),
        )

    breakdown = execution.score_breakdown
    metrics = _metrics_from_breakdown(breakdown)
    status = _classify_case_status(
        passed=execution.passed,
        breakdown=breakdown,
        body=execution.body,
    )

    return BenchCaseResult(
        target_id=target.target_id,
        pipeline_profile=target.pipeline_profile,
        eval_file=eval_file,
        eval_case=eval_case,
        status=status,
        latency_ms=round(execution.latency_ms, 3),
        verifier_valid=metrics["verifier_valid"],
        schema_valid=metrics["schema_valid"],
        pounce_count=metrics["pounce_count"],
        proposal_approval_valid=metrics["proposal_approval_valid"],
        grounding_valid=metrics["grounding_valid"],
        degraded_notes=metrics["degraded_notes"],
        score_breakdown=breakdown,
        failure_reason=execution.failure_reason,
    )


def summarize_case_results(results: list[BenchCaseResult]) -> BenchMetricSummary:
    executed = [r for r in results if r.status != BenchCaseStatus.skipped]
    total = len(results)
    passed = sum(1 for r in results if r.status == BenchCaseStatus.passed)
    failed = sum(1 for r in results if r.status == BenchCaseStatus.failed)
    skipped = sum(1 for r in results if r.status == BenchCaseStatus.skipped)
    degraded = sum(1 for r in results if r.status == BenchCaseStatus.degraded)

    latencies = [r.latency_ms for r in executed if r.latency_ms > 0]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

    def _rate(field: str) -> float | None:
        values = [
            getattr(r, field)
            for r in executed
            if getattr(r, field) is not None
        ]
        if not values:
            return None
        return sum(1 for v in values if v) / len(values)

    return BenchMetricSummary(
        total=total,
        passed=passed,
        failed=failed,
        skipped=skipped,
        degraded=degraded,
        avg_latency_ms=round(avg_latency, 3),
        verifier_valid_rate=_rate("verifier_valid"),
        schema_valid_rate=_rate("schema_valid"),
        approval_valid_rate=_rate("proposal_approval_valid"),
        grounding_valid_rate=_rate("grounding_valid"),
    )


def _skip_external_target_cases(
    *,
    target: BenchTarget,
    cases: list[tuple[str, str, dict[str, Any]]],
    reason: str,
) -> tuple[list[BenchCaseResult], BenchMetricSummary]:
    note = f"real_phi4_with_critic unavailable: {reason}"
    case_results = [
        BenchCaseResult(
            target_id=target.target_id,
            pipeline_profile=target.pipeline_profile,
            eval_file=eval_file,
            eval_case=eval_case,
            status=BenchCaseStatus.skipped,
            skip_reason=note,
        )
        for eval_file, eval_case, _case in cases
    ]
    summary = BenchMetricSummary(
        total=len(cases),
        skipped=len(cases),
        summary_note=note,
    )
    return case_results, summary


def run_bench(
    *,
    profile: BenchProfile,
    targets: list[BenchTarget],
    client: EvalHttpClient,
    context: dict[str, Any],
    run_id: str | None = None,
) -> BenchRunResult:
    if profile in PLACEHOLDER_BENCH_PROFILES:
        note = "not_implemented_v0.1"
        placeholder_summary = BenchMetricSummary(
            total=0,
            passed=0,
            failed=0,
            skipped=0,
            degraded=0,
            summary_note=note,
        )
        return BenchRunResult(
            run_id=run_id or uuid.uuid4().hex[:12],
            timestamp=datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            profile=profile,
            targets=[t.target_id for t in targets],
            case_results=[],
            summary={t.target_id: placeholder_summary for t in targets},
        )

    cases = filter_cases_for_profile(profile)
    case_results: list[BenchCaseResult] = []
    summary: dict[str, BenchMetricSummary] = {}

    for target in targets:
        if target.requires_external:
            available, reason = check_real_phi4_critic_available(Settings.from_env())
            if not available:
                skipped_rows, skipped_summary = _skip_external_target_cases(
                    target=target,
                    cases=cases,
                    reason=reason or "unavailable",
                )
                case_results.extend(skipped_rows)
                summary[target.target_id] = skipped_summary
                continue

        target_rows: list[BenchCaseResult] = []
        for eval_file, eval_case, case in cases:
            target_rows.append(
                run_case_for_target(
                    client=client,
                    context=context,
                    eval_file=eval_file,
                    eval_case=eval_case,
                    case=case,
                    target=target,
                    bench_profile=profile,
                )
            )
        case_results.extend(target_rows)
        summary[target.target_id] = summarize_case_results(target_rows)

    return BenchRunResult(
        run_id=run_id or uuid.uuid4().hex[:12],
        timestamp=datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        profile=profile,
        targets=[t.target_id for t in targets],
        case_results=case_results,
        summary=summary,
    )


def bench_result_to_json(result: BenchRunResult, *, compact_summary: bool = False) -> str:
    payload = result.model_dump(mode="json")
    if compact_summary:
        payload = {
            "run_id": result.run_id,
            "timestamp": result.timestamp,
            "profile": result.profile.value,
            "targets": result.targets,
            "summary": {
                key: value.model_dump(mode="json")
                for key, value in result.summary.items()
            },
        }
    return json.dumps(payload, indent=2)


def write_bench_result(result: BenchRunResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(bench_result_to_json(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run model bench harness")
    parser.add_argument(
        "--profile",
        default="synthesis_depth",
        choices=[p.value for p in BenchProfile],
    )
    parser.add_argument(
        "--targets",
        default="mock_fast_only,mock_with_critic,mock_with_stretch",
        help="Comma-separated bench target ids",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional path to write full bench JSON result",
    )
    parser.add_argument("--run-id", default=None)
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Gateway base URL when not using in-process client",
    )
    parser.add_argument(
        "--context-fixture",
        default=str(DEFAULT_CONTEXT_FIXTURE),
    )
    args = parser.parse_args(argv)

    profile = BenchProfile(args.profile)
    targets = parse_targets(args.targets)
    context = load_default_context(Path(args.context_fixture))

    with httpx.Client(base_url=args.base_url, timeout=120.0) as client:
        result = run_bench(
            profile=profile,
            targets=targets,
            client=client,
            context=context,
            run_id=args.run_id,
        )

    print(bench_result_to_json(result, compact_summary=args.output is None))
    if args.output:
        write_bench_result(result, Path(args.output))
    return 0
