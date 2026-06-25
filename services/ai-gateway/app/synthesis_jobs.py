from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.synthesis_models import (
    AiJobKind,
    AiJobStatus,
    AiJobStatusResponse,
    DeepSynthesisJobEnqueueResponse,
    DeepSynthesisRequest,
    DeepSynthesisResultBody,
)

_JOBS: dict[str, "_JobRecord"] = {}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class _JobRecord:
    job_id: str
    job_kind: AiJobKind
    status: AiJobStatus
    phase: str
    created_at: str
    completed_at: str | None = None
    poll_count: int = 0
    redirect_reason: str | None = None
    result: DeepSynthesisResultBody | None = None
    error: str | None = None


def clear_synthesis_jobs_for_tests() -> None:
    _JOBS.clear()


def create_deep_synthesis_job(
    request: DeepSynthesisRequest,
    *,
    redirect_reason: str | None = None,
) -> DeepSynthesisJobEnqueueResponse:
    from app.deep_synthesis import (
        _job_id_for_request,
        build_mock_deep_synthesis_result,
        run_with_critic_pipeline,
        run_with_stretch_pipeline,
    )
    from app.synthesis_models import SynthesisPipelineProfile

    job_id = _job_id_for_request(request)
    created_at = _utc_now_iso()
    if request.pipeline_profile == SynthesisPipelineProfile.with_critic:
        result = run_with_critic_pipeline(request)
    elif request.pipeline_profile == SynthesisPipelineProfile.with_stretch:
        result = run_with_stretch_pipeline(request)
    else:
        result = build_mock_deep_synthesis_result(request)

    _JOBS[job_id] = _JobRecord(
        job_id=job_id,
        job_kind=AiJobKind.deep_synthesis,
        status=AiJobStatus.queued,
        phase="queued",
        created_at=created_at,
        redirect_reason=redirect_reason,
        result=result,
    )

    return DeepSynthesisJobEnqueueResponse(
        job_id=job_id,
        status="queued",
        job_kind=AiJobKind.deep_synthesis,
        poll_url=f"/ai/jobs/{job_id}",
        created_at=created_at,
        phase="queued",
    )


def get_ai_job(job_id: str) -> AiJobStatusResponse | None:
    record = _JOBS.get(job_id)
    if record is None:
        return None

    record.poll_count += 1
    if record.status == AiJobStatus.queued:
        record.status = AiJobStatus.completed
        record.phase = "formatting"
        record.completed_at = _utc_now_iso()

    return AiJobStatusResponse(
        job_id=record.job_id,
        job_kind=record.job_kind,
        status=record.status,
        phase=record.phase,
        created_at=record.created_at,
        completed_at=record.completed_at,
        result=record.result if record.status == AiJobStatus.completed else None,
        error=record.error,
    )
