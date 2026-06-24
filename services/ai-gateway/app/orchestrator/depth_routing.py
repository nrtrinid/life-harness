from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.config import Settings
from app.models import ReasoningDepth
from app.synthesis_models import SynthesisPipelineProfile

SLOT_PLAN_DEPTH_NOTE = "reasoning_depth does not change slot_plan today"
STRETCH_MOCK_NOTE = "stretch_batch slot disabled; mock simulated"


class GatewayRouteEndpoint(str, Enum):
    chat_harness = "chat_harness"
    raw_lab = "raw_lab"
    deep_synthesis = "deep_synthesis"
    deep_synthesis_job = "deep_synthesis_job"


@dataclass(frozen=True)
class DepthRoutePlan:
    endpoint: GatewayRouteEndpoint
    reasoning_depth: str | None
    pipeline_profile: str | None
    provider: str
    primary_slots: tuple[str, ...]
    orchestrator_path: str
    critic_slot: str | None
    synthesis_critic_runtime: str | None
    stretch_slot: str | None
    notes: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "endpoint": self.endpoint.value,
            "reasoning_depth": self.reasoning_depth,
            "pipeline_profile": self.pipeline_profile,
            "provider": self.provider,
            "primary_slots": list(self.primary_slots),
            "orchestrator_path": self.orchestrator_path,
            "critic_slot": self.critic_slot,
            "synthesis_critic_runtime": self.synthesis_critic_runtime,
            "stretch_slot": self.stretch_slot,
            "notes": list(self.notes),
        }


def _normalize_reasoning_depth(
    reasoning_depth: ReasoningDepth | str | None,
) -> ReasoningDepth | None:
    if reasoning_depth is None:
        return None
    if isinstance(reasoning_depth, ReasoningDepth):
        return reasoning_depth
    return ReasoningDepth(reasoning_depth)


def _normalize_pipeline_profile(
    pipeline_profile: SynthesisPipelineProfile | str | None,
) -> SynthesisPipelineProfile | None:
    if pipeline_profile is None:
        return None
    if isinstance(pipeline_profile, SynthesisPipelineProfile):
        return pipeline_profile
    return SynthesisPipelineProfile(pipeline_profile)


def _resolve_chat_harness_route(
    *,
    settings: Settings,
    reasoning_depth: ReasoningDepth | None,
) -> DepthRoutePlan:
    depth = reasoning_depth or ReasoningDepth.fast
    notes: list[str] = [SLOT_PLAN_DEPTH_NOTE]

    if depth == ReasoningDepth.deliberate:
        notes.append("deliberate is prompt-only; same slot plan as fast")

    if depth == ReasoningDepth.deep and settings.deep_enabled:
        notes.append("draft → critic → optional revision")
        if settings.chat_harness_native_chat:
            notes.append("native chat used for deep draft when flag enabled")
        return DepthRoutePlan(
            endpoint=GatewayRouteEndpoint.chat_harness,
            reasoning_depth=depth.value,
            pipeline_profile=None,
            provider=settings.provider,
            primary_slots=("companion_fast",),
            orchestrator_path="chat_harness_deep",
            critic_slot=settings.critic_slot,
            synthesis_critic_runtime=None,
            stretch_slot=None,
            notes=tuple(notes),
        )

    if depth == ReasoningDepth.deep and not settings.deep_enabled:
        notes.append("SCOUT_DEEP_ENABLED=false; deep suffix only, no multi-pass")

    return DepthRoutePlan(
        endpoint=GatewayRouteEndpoint.chat_harness,
        reasoning_depth=depth.value,
        pipeline_profile=None,
        provider=settings.provider,
        primary_slots=("companion_fast",),
        orchestrator_path="chat_harness_impl",
        critic_slot=None,
        synthesis_critic_runtime=None,
        stretch_slot=None,
        notes=tuple(notes),
    )


def _resolve_raw_lab_route(
    *,
    settings: Settings,
    reasoning_depth: ReasoningDepth | None,
) -> DepthRoutePlan:
    depth = reasoning_depth or ReasoningDepth.fast
    notes: list[str] = [SLOT_PLAN_DEPTH_NOTE]

    if depth in (ReasoningDepth.fast, ReasoningDepth.deliberate):
        if depth == ReasoningDepth.deliberate:
            notes.append("deliberate is prompt-only; same inference path as fast")
        orchestrator_path = "raw_lab_standard"
    elif depth == ReasoningDepth.deep:
        orchestrator_path = "raw_lab_deep_standard"
    else:
        notes.append("fallback to raw_lab_deep_standard on deep_plus failure or timeout")
        orchestrator_path = "raw_lab_deep_plus"

    return DepthRoutePlan(
        endpoint=GatewayRouteEndpoint.raw_lab,
        reasoning_depth=depth.value,
        pipeline_profile=None,
        provider=settings.provider,
        primary_slots=("companion_fast",),
        orchestrator_path=orchestrator_path,
        critic_slot=None,
        synthesis_critic_runtime=None,
        stretch_slot=None,
        notes=tuple(notes),
    )


def _resolve_deep_synthesis_route(
    *,
    settings: Settings,
    pipeline_profile: SynthesisPipelineProfile | None,
) -> DepthRoutePlan:
    profile = pipeline_profile or SynthesisPipelineProfile.auto
    notes: list[str] = []

    if profile in (SynthesisPipelineProfile.with_critic, SynthesisPipelineProfile.with_stretch):
        notes.append(f"redirect_reason={profile.value}_required")
        orchestrator_path = "deep_synthesis_queued_redirect"
    else:
        orchestrator_path = "deep_synthesis_fast_only"

    return DepthRoutePlan(
        endpoint=GatewayRouteEndpoint.deep_synthesis,
        reasoning_depth=None,
        pipeline_profile=profile.value,
        provider=settings.provider,
        primary_slots=("companion_fast",),
        orchestrator_path=orchestrator_path,
        critic_slot=None,
        synthesis_critic_runtime=None,
        stretch_slot=None,
        notes=tuple(notes),
    )


def _resolve_deep_synthesis_job_route(
    *,
    settings: Settings,
    pipeline_profile: SynthesisPipelineProfile | None,
) -> DepthRoutePlan:
    profile = pipeline_profile or SynthesisPipelineProfile.auto
    notes: list[str] = []
    stretch_slot: str | None = None
    synthesis_critic_runtime: str | None = None

    if profile == SynthesisPipelineProfile.with_critic:
        orchestrator_path = "synthesis_with_critic_pipeline"
        synthesis_critic_runtime = settings.critic_runtime
    elif profile == SynthesisPipelineProfile.with_stretch:
        orchestrator_path = "synthesis_mock_stretch"
        stretch_slot = "stretch_batch"
        notes.append(STRETCH_MOCK_NOTE)
    else:
        orchestrator_path = "synthesis_mock_fast"

    return DepthRoutePlan(
        endpoint=GatewayRouteEndpoint.deep_synthesis_job,
        reasoning_depth=None,
        pipeline_profile=profile.value,
        provider=settings.provider,
        primary_slots=("companion_fast",),
        orchestrator_path=orchestrator_path,
        critic_slot=None,
        synthesis_critic_runtime=synthesis_critic_runtime,
        stretch_slot=stretch_slot,
        notes=tuple(notes),
    )


def resolve_depth_route(
    *,
    endpoint: GatewayRouteEndpoint,
    settings: Settings,
    reasoning_depth: ReasoningDepth | str | None = None,
    pipeline_profile: SynthesisPipelineProfile | str | None = None,
) -> DepthRoutePlan:
    if endpoint == GatewayRouteEndpoint.chat_harness:
        return _resolve_chat_harness_route(
            settings=settings,
            reasoning_depth=_normalize_reasoning_depth(reasoning_depth),
        )
    if endpoint == GatewayRouteEndpoint.raw_lab:
        return _resolve_raw_lab_route(
            settings=settings,
            reasoning_depth=_normalize_reasoning_depth(reasoning_depth),
        )
    if endpoint == GatewayRouteEndpoint.deep_synthesis:
        return _resolve_deep_synthesis_route(
            settings=settings,
            pipeline_profile=_normalize_pipeline_profile(pipeline_profile),
        )
    if endpoint == GatewayRouteEndpoint.deep_synthesis_job:
        return _resolve_deep_synthesis_job_route(
            settings=settings,
            pipeline_profile=_normalize_pipeline_profile(pipeline_profile),
        )
    raise ValueError(f"unsupported endpoint: {endpoint}")
