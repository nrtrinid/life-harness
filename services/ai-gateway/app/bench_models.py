from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import Field

from app.models import StrictModel


class BenchCaseStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    skipped = "skipped"
    degraded = "degraded"


class BenchProfile(str, Enum):
    synthesis_depth = "synthesis_depth"
    critic_quality = "critic_quality"
    stretch_reflection = "stretch_reflection"
    latency = "latency"
    verifier_validity = "verifier_validity"
    fallback_behavior = "fallback_behavior"
    code_work = "code_work"
    retrieval_quality = "retrieval_quality"


PLACEHOLDER_BENCH_PROFILES = frozenset({BenchProfile.code_work, BenchProfile.retrieval_quality})


class BenchTarget(StrictModel):
    target_id: str = Field(..., min_length=1)
    pipeline_profile: str = Field(..., min_length=1)
    label: str | None = None
    requires_external: bool = False


class BenchCaseResult(StrictModel):
    target_id: str
    pipeline_profile: str
    eval_file: str
    eval_case: str
    status: BenchCaseStatus
    latency_ms: float = 0.0
    verifier_valid: bool | None = None
    schema_valid: bool | None = None
    pounce_count: int | None = None
    proposal_approval_valid: bool | None = None
    grounding_valid: bool | None = None
    degraded_notes: list[str] = Field(default_factory=list)
    score_breakdown: dict[str, Any] = Field(default_factory=dict)
    failure_reason: str | None = None
    skip_reason: str | None = None


class BenchMetricSummary(StrictModel):
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    degraded: int = 0
    avg_latency_ms: float = 0.0
    verifier_valid_rate: float | None = None
    schema_valid_rate: float | None = None
    approval_valid_rate: float | None = None
    grounding_valid_rate: float | None = None
    summary_note: str | None = None


class BenchRunResult(StrictModel):
    run_id: str
    timestamp: str
    profile: BenchProfile
    targets: list[str]
    case_results: list[BenchCaseResult]
    summary: dict[str, BenchMetricSummary]
