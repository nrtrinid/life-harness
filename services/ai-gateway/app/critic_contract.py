from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal

from app.context_packet_render import (
    resolve_critic_context_bundle_for_prompt,
    resolve_critic_context_max_chars,
)
from app.models import (
    ChatHarnessCriticVerdict,
    ChatHarnessRequest,
    CriticCheckEntry,
    CriticCheckId,
    RawLabDeepPlusJudgeVerdict,
    StrictModel,
)
from app.synthesis_models import SynthesisCritique


@dataclass(frozen=True)
class CriticEvidencePacket:
    rendered_bundle: str
    char_count: int
    max_chars: int
    source: Literal["packet", "legacy"]


def build_critic_evidence_packet(
    request: ChatHarnessRequest,
    *,
    max_chars: int | None = None,
) -> CriticEvidencePacket:
    bundle = resolve_critic_context_bundle_for_prompt(request, max_chars=max_chars)
    budget = resolve_critic_context_max_chars(max_chars)
    source: Literal["packet", "legacy"] = "packet" if request.context_packet is not None else "legacy"
    return CriticEvidencePacket(
        rendered_bundle=bundle,
        char_count=len(bundle),
        max_chars=budget,
        source=source,
    )


class UnifiedCriticCheckId(str, Enum):
    too_many_tasks = "too_many_tasks"
    too_broad = "too_broad"
    ignores_life_harness_state = "ignores_life_harness_state"
    enables_avoidance = "enables_avoidance"
    emotionally_weird_or_manipulative = "emotionally_weird_or_manipulative"
    contradicts_context = "contradicts_context"
    invalid_or_unstructured_output = "invalid_or_unstructured_output"
    no_issue = "no_issue"
    shallow_generic = "shallow_generic"
    missing_grounding = "missing_grounding"
    weak_candidates = "weak_candidates"


class UnifiedCriticCheckEntry(StrictModel):
    id: UnifiedCriticCheckId
    severity: Literal["info", "warn", "error"]
    message: str


class UnifiedCriticVerdict(StrictModel):
    needs_revision: bool
    checks: list[UnifiedCriticCheckEntry]
    revision_instruction: str
    meta: dict[str, Any] = {}


_CHAT_TO_UNIFIED: dict[CriticCheckId, UnifiedCriticCheckId] = {
    CriticCheckId.too_many_tasks: UnifiedCriticCheckId.too_many_tasks,
    CriticCheckId.too_broad: UnifiedCriticCheckId.too_broad,
    CriticCheckId.ignores_life_harness_state: UnifiedCriticCheckId.ignores_life_harness_state,
    CriticCheckId.enables_avoidance: UnifiedCriticCheckId.enables_avoidance,
    CriticCheckId.emotionally_weird_or_manipulative: UnifiedCriticCheckId.emotionally_weird_or_manipulative,
    CriticCheckId.contradicts_context: UnifiedCriticCheckId.contradicts_context,
    CriticCheckId.invalid_or_unstructured_output: UnifiedCriticCheckId.invalid_or_unstructured_output,
    CriticCheckId.no_issue: UnifiedCriticCheckId.no_issue,
}

_UNIFIED_TO_CHAT: dict[UnifiedCriticCheckId, CriticCheckId] = {
    unified: chat for chat, unified in _CHAT_TO_UNIFIED.items()
}


def from_chat_harness_verdict(verdict: ChatHarnessCriticVerdict) -> UnifiedCriticVerdict:
    checks = [
        UnifiedCriticCheckEntry(
            id=_CHAT_TO_UNIFIED[check.id],
            severity=check.severity,
            message=check.message,
        )
        for check in verdict.checks
    ]
    return UnifiedCriticVerdict(
        needs_revision=verdict.needs_revision,
        checks=checks,
        revision_instruction=verdict.revision_instruction,
        meta={},
    )


def to_chat_harness_verdict(verdict: UnifiedCriticVerdict) -> ChatHarnessCriticVerdict:
    checks = [
        CriticCheckEntry(
            id=_UNIFIED_TO_CHAT[check.id],
            severity=check.severity,
            message=check.message,
        )
        for check in verdict.checks
    ]
    return ChatHarnessCriticVerdict(
        needs_revision=verdict.needs_revision,
        checks=checks,
        revision_instruction=verdict.revision_instruction,
    )


def from_synthesis_critique(critique: SynthesisCritique) -> UnifiedCriticVerdict:
    checks: list[UnifiedCriticCheckEntry] = []

    for item in critique.shallow_flags:
        if item.strip():
            checks.append(
                UnifiedCriticCheckEntry(
                    id=UnifiedCriticCheckId.shallow_generic,
                    severity="warn",
                    message=item,
                )
            )

    for item in critique.missing:
        if item.strip():
            checks.append(
                UnifiedCriticCheckEntry(
                    id=UnifiedCriticCheckId.missing_grounding,
                    severity="warn",
                    message=item,
                )
            )

    for item in critique.avoidance:
        if item.strip():
            checks.append(
                UnifiedCriticCheckEntry(
                    id=UnifiedCriticCheckId.enables_avoidance,
                    severity="error",
                    message=item,
                )
            )

    for item in critique.contradictions:
        if item.strip():
            checks.append(
                UnifiedCriticCheckEntry(
                    id=UnifiedCriticCheckId.contradicts_context,
                    severity="error",
                    message=item,
                )
            )

    needs_revision = critique.overall == "revise"
    if not checks and not needs_revision:
        checks.append(
            UnifiedCriticCheckEntry(
                id=UnifiedCriticCheckId.no_issue,
                severity="info",
                message="Draft passes structured critic checks.",
            )
        )

    return UnifiedCriticVerdict(
        needs_revision=needs_revision,
        checks=checks,
        revision_instruction=(critique.revision_brief or "") if needs_revision else "",
        meta={},
    )


def to_synthesis_critique(verdict: UnifiedCriticVerdict) -> SynthesisCritique:
    shallow_flags: list[str] = []
    missing: list[str] = []
    avoidance: list[str] = []
    contradictions: list[str] = []

    for check in verdict.checks:
        if check.id == UnifiedCriticCheckId.no_issue:
            continue
        if check.id == UnifiedCriticCheckId.shallow_generic:
            shallow_flags.append(check.message)
        elif check.id == UnifiedCriticCheckId.missing_grounding:
            missing.append(check.message)
        elif check.id == UnifiedCriticCheckId.enables_avoidance:
            avoidance.append(check.message)
        elif check.id == UnifiedCriticCheckId.contradicts_context:
            contradictions.append(check.message)

    overall: Literal["pass", "revise"] = "revise" if verdict.needs_revision else "pass"
    needs_revision = bool(shallow_flags or missing or avoidance or contradictions)
    if needs_revision:
        overall = "revise"

    revision_brief = (verdict.revision_instruction.strip() or None) if overall == "revise" else None

    return SynthesisCritique(
        shallow_flags=shallow_flags,
        missing=missing,
        avoidance=avoidance,
        contradictions=contradictions,
        overall=overall,
        revision_brief=revision_brief,
    )


def normalize_synthesis_critique(critique: SynthesisCritique) -> SynthesisCritique:
    return to_synthesis_critique(from_synthesis_critique(critique))


def from_raw_lab_judge(verdict: RawLabDeepPlusJudgeVerdict) -> UnifiedCriticVerdict:
    checks: list[UnifiedCriticCheckEntry] = []

    for item in verdict.failure_flags:
        if not item.strip():
            continue
        checks.append(
            UnifiedCriticCheckEntry(
                id=UnifiedCriticCheckId.shallow_generic,
                severity="warn",
                message=item,
            )
        )
        break

    if verdict.all_candidates_weak:
        checks.append(
            UnifiedCriticCheckEntry(
                id=UnifiedCriticCheckId.weak_candidates,
                severity="warn",
                message="All answer candidates were weak.",
            )
        )

    if not checks and not verdict.needs_revision:
        checks.append(
            UnifiedCriticCheckEntry(
                id=UnifiedCriticCheckId.no_issue,
                severity="info",
                message="Draft passes structured critic checks.",
            )
        )

    return UnifiedCriticVerdict(
        needs_revision=verdict.needs_revision,
        checks=checks,
        revision_instruction=verdict.revision_instruction if verdict.needs_revision else "",
        meta={
            "selected_index": verdict.selected_index,
            "all_candidates_weak": verdict.all_candidates_weak,
            "scores_count": len(verdict.scores),
        },
    )

