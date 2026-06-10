from __future__ import annotations

import hashlib
import re

from app.models import (
    CardState,
    HarnessContextCard,
    HarnessLogEntry,
    LifeArea,
    SensitivityLevel,
    WarmthLevel,
)
from app.providers.base import TranscriptProvider
from app.synthesis_context import build_deep_synthesis_context_block
from app.synthesis_critic import run_synthesis_critique
from app.synthesis_jobs import create_deep_synthesis_job
from app.synthesis_models import (
    DeepSynthesisCompletedBody,
    DeepSynthesisQueuedBody,
    DeepSynthesisRequest,
    DeepSynthesisResultBody,
    SynthesisCritique,
    SynthesisGroundingKind,
    SynthesisGroundingRef,
    SynthesisInterpretation,
    SynthesisLens,
    SynthesisMemoryProposal,
    SynthesisNextPounce,
    SynthesisPipelineProfile,
    SynthesisPersonalityProposal,
)
from app.synthesis_verifier import verify_synthesis_completed

_COLD_WARMTH = {WarmthLevel.cold, WarmthLevel.cooling, WarmthLevel.dormant}
_AVOIDANCE_RE = re.compile(
    r"\b(avoid|resume|job|network|career|apply|follow.?up)\b",
    re.IGNORECASE,
)
_CIRCLING_RE = re.compile(r"\bcircling\b", re.IGNORECASE)
_MANIPULATIVE_PHRASES = re.compile(
    r"you should feel guilty|you owe me|you owe|i know you better than",
    re.IGNORECASE,
)
_GENERIC_PHRASES = re.compile(
    r"just prioritize|time management|5-step plan|productivity hack",
    re.IGNORECASE,
)


def _synthesis_id(request: DeepSynthesisRequest) -> str:
    digest = hashlib.sha256(
        f"{request.user_prompt}:{request.trigger.value}".encode("utf-8")
    ).hexdigest()
    return f"syn_{digest[:12]}"


def _job_id_for_request(request: DeepSynthesisRequest) -> str:
    return f"job_{_synthesis_id(request)[4:]}"


def _cold_career_body_cards(cards: list[HarnessContextCard]) -> list[HarnessContextCard]:
    result: list[HarnessContextCard] = []
    for card in cards:
        if card.area not in (LifeArea.social_career, LifeArea.body):
            continue
        if card.warmth in _COLD_WARMTH or card.state == CardState.parked:
            result.append(card)
    return result


def _hot_build_cards(cards: list[HarnessContextCard]) -> list[HarnessContextCard]:
    return [
        card
        for card in cards
        if card.area == LifeArea.build
        and card.state == CardState.active
        and card.warmth in (WarmthLevel.hot, WarmthLevel.warm)
    ]


def _avoidance_logs(logs: list[HarnessLogEntry]) -> list[HarnessLogEntry]:
    return [log for log in logs if _AVOIDANCE_RE.search(log.summary)]


def _card_grounding(card: HarnessContextCard) -> SynthesisGroundingRef:
    return SynthesisGroundingRef(
        kind=SynthesisGroundingKind.active_card,
        ref=card.title,
        label=card.title,
    )


def _log_grounding(log: HarnessLogEntry) -> SynthesisGroundingRef:
    return SynthesisGroundingRef(
        kind=SynthesisGroundingKind.proof_log,
        ref=log.timestamp,
        label=log.summary[:60],
    )


def _prompt_grounding() -> SynthesisGroundingRef:
    return SynthesisGroundingRef(
        kind=SynthesisGroundingKind.inferred_from_prompt,
        ref="current_prompt",
        label="Current prompt",
    )


def _thread_grounding(request: DeepSynthesisRequest) -> SynthesisGroundingRef:
    excerpt = request.user_prompt[:80]
    return SynthesisGroundingRef(
        kind=SynthesisGroundingKind.thread_excerpt,
        ref="thread_excerpt",
        label=excerpt,
    )


def _should_redirect_to_job(request: DeepSynthesisRequest) -> str | None:
    profile = request.pipeline_profile
    if profile == SynthesisPipelineProfile.with_stretch:
        return "stretch_required"
    if profile == SynthesisPipelineProfile.with_critic:
        return "critic_required"
    return None


def _build_interpretations(
    request: DeepSynthesisRequest,
    cold_cards: list[HarnessContextCard],
    hot_build: list[HarnessContextCard],
    avoid_logs: list[HarnessLogEntry],
) -> list[SynthesisInterpretation]:
    lenses = request.interpretation_lenses or [
        SynthesisLens.practical,
        SynthesisLens.emotional,
        SynthesisLens.product,
    ]
    interpretations: list[SynthesisInterpretation] = []

    for lens in lenses:
        if lens == SynthesisLens.practical:
            summary = (
                "The practical read: pick one outside-world move before another build slice."
                if cold_cards and hot_build
                else "One small board-grounded action beats another planning loop."
            )
            grounding = [_card_grounding(cold_cards[0])] if cold_cards else [_prompt_grounding()]
        elif lens == SynthesisLens.emotional:
            summary = (
                "A recurring deferral pattern shows up — not failure, just a cooling thread."
                if avoid_logs
                else "Energy is scattered across several active threads."
            )
            grounding = [_log_grounding(avoid_logs[0])] if avoid_logs else [_thread_grounding(request)]
        elif lens == SynthesisLens.product:
            summary = (
                "Build heat is real, but career/body threads need a re-entry point on the board."
                if cold_cards and hot_build
                else "Product shape is fine; the bottleneck is choosing one honest next move."
            )
            grounding = [_card_grounding(hot_build[0])] if hot_build else [_prompt_grounding()]
        else:
            summary = (
                "Skeptical check: are hot build cards masking a stalled outside-world thread?"
                if hot_build and cold_cards
                else "Skeptical check: is this ramble avoiding a single commit?"
            )
            grounding = [_card_grounding(cold_cards[0])] if cold_cards else [_thread_grounding(request)]

        interpretations.append(
            SynthesisInterpretation(
                lens=lens,
                summary=summary,
                confidence="medium",
                grounding=grounding,
            )
        )

    return interpretations


def _profile_meta(
    request: DeepSynthesisRequest,
) -> tuple[SynthesisPipelineProfile, list[str], list[str], list[str]]:
    profile = request.pipeline_profile
    if profile == SynthesisPipelineProfile.with_critic:
        return (
            SynthesisPipelineProfile.with_critic,
            [],
            ["digest", "interpretations", "critic", "format"],
            ["Scout read only — I am a local AI, not human, not conscious."],
        )
    if profile == SynthesisPipelineProfile.with_stretch:
        return (
            SynthesisPipelineProfile.with_stretch,
            ["Mock async job: stretch reflection simulated."],
            ["digest", "interpretations", "stretch", "format"],
            ["Mock async job: rule-based stretch simulated.", "Scout read only — I am a local AI, not human, not conscious."],
        )
    return (
        SynthesisPipelineProfile.fast_only,
        ["Mock synthesis: rule-based fast path."],
        ["digest", "interpretations", "format"],
        ["Mock synthesis: rule-based fast path.", "Scout read only — I am a local AI, not human, not conscious."],
    )


def _build_critique(request: DeepSynthesisRequest) -> SynthesisCritique | None:
    if not _CIRCLING_RE.search(request.user_prompt):
        return SynthesisCritique(
            shallow_flags=[],
            missing=[],
            avoidance=[],
            contradictions=[],
            overall="pass",
        )

    return SynthesisCritique(
        shallow_flags=["Initial read may be too generic without naming the build/career tradeoff."],
        missing=["Name which active card is winning attention."],
        avoidance=[],
        contradictions=[],
        overall="revise",
        revision_brief="Tie circling language to one active card and one stalled thread.",
    )


def _strip_manipulative_phrases(text: str) -> str:
    return _MANIPULATIVE_PHRASES.sub("", text).strip()


def _strip_generic_phrases(text: str) -> str:
    return _GENERIC_PHRASES.sub("", text).strip()


def apply_synthesis_revision(
    draft: DeepSynthesisCompletedBody,
    critique: SynthesisCritique,
    request: DeepSynthesisRequest,
) -> DeepSynthesisCompletedBody:
    if critique.overall != "revise":
        return draft

    cards = request.context.cards
    cold_cards = _cold_career_body_cards(cards)
    hot_build = _hot_build_cards(cards)
    avoid_logs = _avoidance_logs(request.context.logs)

    circling = _strip_manipulative_phrases(_strip_generic_phrases(draft.circling))
    strongest_idea = _strip_manipulative_phrases(_strip_generic_phrases(draft.strongest_idea))
    hidden_risk = _strip_manipulative_phrases(draft.hidden_risk)

    if critique.avoidance and cold_cards and hot_build:
        circling = (
            f"{circling} Board tension: {hot_build[0].title} is hot while "
            f"{cold_cards[0].title} is cold — name both in the read."
        ).strip()

    if critique.missing and cold_cards:
        active = next((c for c in cards if c.state == CardState.active), cold_cards[0])
        strongest_idea = (
            f"{strongest_idea} Grounded move: {active.title} — {active.next_tiny_action}."
        ).strip()

    circling_grounding = list(draft.circling_grounding)
    strongest_grounding = list(draft.strongest_idea_grounding)
    risk_grounding = list(draft.hidden_risk_grounding)

    if critique.missing or critique.avoidance:
        if cold_cards and not any(
            g.kind == SynthesisGroundingKind.active_card for g in circling_grounding
        ):
            circling_grounding.insert(0, _card_grounding(cold_cards[0]))
        if hot_build and not any(
            g.kind == SynthesisGroundingKind.active_card
            and g.ref == hot_build[0].title
            for g in circling_grounding
        ):
            circling_grounding.append(_card_grounding(hot_build[0]))
        if cold_cards:
            strongest_grounding = [_card_grounding(cold_cards[0])]
        if avoid_logs:
            risk_grounding = [_log_grounding(avoid_logs[0])]
        elif cold_cards:
            risk_grounding = [_card_grounding(cold_cards[0])]

    next_pounce = draft.next_pounce
    if critique.missing and (not next_pounce.grounding or not next_pounce.title.strip()):
        target = cold_cards[0] if cold_cards else next(
            (c for c in cards if c.state == CardState.active), None
        )
        if target:
            next_pounce = SynthesisNextPounce(
                title=f"Re-heat {target.title}",
                smallest_action=target.next_tiny_action,
                card_hint=target.title,
                grounding=_card_grounding(target),
            )

    revised = draft.model_copy(
        update={
            "circling": circling or draft.circling,
            "strongest_idea": strongest_idea or draft.strongest_idea,
            "hidden_risk": hidden_risk or draft.hidden_risk,
            "circling_grounding": circling_grounding,
            "strongest_idea_grounding": strongest_grounding,
            "hidden_risk_grounding": risk_grounding,
            "next_pounce": next_pounce,
        }
    )

    issues = verify_synthesis_completed(revised)
    if issues:
        raise RuntimeError(f"synthesis revision verifier failed: {'; '.join(issues)}")
    return revised


def run_with_critic_pipeline(request: DeepSynthesisRequest) -> DeepSynthesisResultBody:
    context_block, _context_notes = build_deep_synthesis_context_block(request)
    confidence_notes_base = [
        "Scout read only — I am a local AI, not human, not conscious.",
    ]
    if _context_notes:
        confidence_notes_base.extend(_context_notes)

    draft = _build_mock_completed_body(
        request,
        pipeline_profile_used=SynthesisPipelineProfile.with_critic,
        degraded_notes=[],
        phases_completed=["digest", "interpretations"],
        confidence_notes_base=confidence_notes_base,
        skip_legacy_critique=True,
        critique=None,
    )

    critique, critic_notes = run_synthesis_critique(
        request=request,
        context_block=context_block,
        draft=draft,
    )

    revised = False
    if critique.overall == "revise":
        draft = apply_synthesis_revision(draft, critique, request)
        revised = True

    phases_completed = (
        ["digest", "interpretations", "critic", "revision", "format"]
        if revised
        else ["digest", "interpretations", "critic", "format"]
    )
    degraded_notes: list[str] = []
    confidence_notes = list(confidence_notes_base)
    if critic_notes:
        degraded_notes.extend(critic_notes)
        confidence_notes.extend(critic_notes)
    if revised:
        degraded_notes.append(
            "Critic requested revision; deterministic mock revision applied."
        )

    final = draft.model_copy(
        update={
            "pipeline_profile_used": SynthesisPipelineProfile.with_critic,
            "degraded_notes": degraded_notes,
            "phases_completed": phases_completed,
            "critique": critique,
            "confidence_notes": confidence_notes,
        }
    )

    issues = verify_synthesis_completed(final)
    if issues:
        raise RuntimeError(f"with_critic pipeline verifier failed: {'; '.join(issues)}")

    return DeepSynthesisResultBody.model_validate(final.model_dump(exclude={"status"}))


def _build_mock_completed_body(
    request: DeepSynthesisRequest,
    *,
    pipeline_profile_used: SynthesisPipelineProfile,
    degraded_notes: list[str],
    phases_completed: list[str],
    confidence_notes_base: list[str],
    skip_legacy_critique: bool = False,
    critique: SynthesisCritique | None = None,
) -> DeepSynthesisCompletedBody:
    cards = request.context.cards
    logs = request.context.logs
    cold_cards = _cold_career_body_cards(cards)
    hot_build = _hot_build_cards(cards)
    avoid_logs = _avoidance_logs(logs)
    synthesis_id = _synthesis_id(request)

    if cold_cards and hot_build:
        deferral_note = (
            " Logs already show career deferral."
            if avoid_logs
            else ""
        )
        circling = (
            "You are circling a tension between hot build work and a cold or parked "
            f"career/body thread ({cold_cards[0].title}). The board already shows both — "
            f"the scout read is choosing which thread gets the next honest minute.{deferral_note}"
        )
        strongest_idea = (
            f"Career re-entry via {cold_cards[0].next_tiny_action} is the highest-leverage "
            f"outside-world move while {hot_build[0].title} stays active but not sole focus. "
            "This is an AI scout read, not a human intuition."
        )
        hidden_risk = (
            "Another build-only week could deepen the career cooling pattern already visible on the board."
        )
        connections = [
            f"{hot_build[0].title} is hot while {cold_cards[0].title} is cold.",
            "Logs may already show deferral on outside-world follow-ups.",
            "One tiny career action would rebalance without killing build momentum.",
        ]
        career_card = next(
            (c for c in cold_cards if c.area == LifeArea.social_career),
            cold_cards[0],
        )
        next_pounce = SynthesisNextPounce(
            title=f"Re-heat {career_card.title}",
            smallest_action=career_card.next_tiny_action,
            card_hint=career_card.title,
            grounding=_card_grounding(career_card),
        )
        circling_grounding = [_card_grounding(cold_cards[0]), _card_grounding(hot_build[0])]
        strongest_grounding = [_card_grounding(career_card)]
        risk_grounding = [_log_grounding(avoid_logs[0])] if avoid_logs else [_card_grounding(cold_cards[0])]
    elif avoid_logs:
        circling = (
            "You are circling around follow-through on an outside-world thread. "
            f"A recent log notes career deferral — that pattern matters more than adding another idea."
        )
        strongest_idea = (
            f"Name the avoidance loop honestly, then do the smallest log-grounded action: "
            f"{avoid_logs[0].summary[:80]}."
        )
        hidden_risk = "Treating deferral as a planning problem instead of a one-minute re-entry move."
        connections = [
            avoid_logs[0].summary,
            "Board context supports a scout read, not a guilt spiral.",
        ]
        target_card = cold_cards[0] if cold_cards else None
        smallest = target_card.next_tiny_action if target_card else "Write one 2-minute next step."
        next_pounce = SynthesisNextPounce(
            title="Break the deferral loop",
            smallest_action=smallest,
            card_hint=target_card.title if target_card else None,
            grounding=_log_grounding(avoid_logs[0]),
        )
        circling_grounding = [_log_grounding(avoid_logs[0])]
        strongest_grounding = [_log_grounding(avoid_logs[0])]
        risk_grounding = [_log_grounding(avoid_logs[0])]
    else:
        circling = (
            "You are circling several threads without one named commit. "
            "The board is the source of truth — this scout AI read picks the smallest honest move."
        )
        strongest_idea = request.user_prompt[:200] if request.user_prompt else "One named next step."
        hidden_risk = "Staying in synthesis mode instead of choosing one pounce."
        connections = ["Thread prompt", "Active board snapshot"]
        active = next((c for c in cards if c.state == CardState.active), None)
        smallest = active.next_tiny_action if active else "Pick one card and write a 2-minute step."
        title = f"Move on {active.title}" if active else "Pick one thread"
        next_pounce = SynthesisNextPounce(
            title=title,
            smallest_action=smallest,
            card_hint=active.title if active else None,
            grounding=_card_grounding(active) if active else _thread_grounding(request),
        )
        circling_grounding = [_thread_grounding(request)]
        strongest_grounding = [_prompt_grounding()]
        risk_grounding = [_prompt_grounding()]

    interpretations = _build_interpretations(request, cold_cards, hot_build, avoid_logs)
    if critique is None:
        if skip_legacy_critique:
            critique = SynthesisCritique(
                shallow_flags=[],
                missing=[],
                avoidance=[],
                contradictions=[],
                overall="pass",
            )
        else:
            critique = _build_critique(request) or SynthesisCritique(
                shallow_flags=[],
                missing=[],
                avoidance=[],
                contradictions=[],
                overall="pass",
            )

    memory_proposals: list[SynthesisMemoryProposal] = []
    if avoid_logs or (cold_cards and hot_build):
        memory_proposals.append(
            SynthesisMemoryProposal(
                kind="pattern",
                text="Build heat can mask cooling career/body threads — re-check when circling.",
                requires_approval=True,
                source_synthesis_id=synthesis_id,
            )
        )

    confidence_notes = list(confidence_notes_base)
    if any(
        g.kind == SynthesisGroundingKind.inferred_from_prompt
        for g in circling_grounding + strongest_grounding
    ):
        confidence_notes.append("Some conclusions lean on the current prompt — verify against the board.")

    safety_notes: list[str] = []
    if request.sensitivity == SensitivityLevel.S2:
        safety_notes.append("S2 context — review before saving any proposal.")

    body = DeepSynthesisCompletedBody(
        status="completed",
        synthesis_id=synthesis_id,
        pipeline_profile_used=pipeline_profile_used,
        degraded_notes=degraded_notes,
        phases_completed=phases_completed,
        circling=circling,
        strongest_idea=strongest_idea,
        hidden_risk=hidden_risk,
        connections=connections[:5],
        circling_grounding=circling_grounding,
        strongest_idea_grounding=strongest_grounding,
        hidden_risk_grounding=risk_grounding,
        next_pounce=next_pounce,
        interpretations=interpretations,
        critique=critique,
        memory_proposals=memory_proposals,
        personality_proposals=[],
        confidence_notes=confidence_notes,
        safety_notes=safety_notes,
    )

    issues = verify_synthesis_completed(body)
    if issues:
        raise RuntimeError(f"synthesis verifier failed: {'; '.join(issues)}")
    return body


def build_degraded_fallback_body(
    request: DeepSynthesisRequest,
    *,
    reason: str,
) -> DeepSynthesisCompletedBody:
    return _build_mock_completed_body(
        request,
        pipeline_profile_used=SynthesisPipelineProfile.fast_only,
        degraded_notes=[
            "OpenVINO fast synthesis unavailable; deterministic fallback used.",
            reason,
        ],
        phases_completed=["fallback"],
        confidence_notes_base=[
            reason,
            "Scout read only — I am a local AI, not human, not conscious.",
        ],
    )


def build_mock_deep_synthesis_result(request: DeepSynthesisRequest) -> DeepSynthesisResultBody:
    profile_used, degraded_notes, phases_completed, confidence_notes_base = _profile_meta(request)
    completed = _build_mock_completed_body(
        request,
        pipeline_profile_used=profile_used,
        degraded_notes=degraded_notes,
        phases_completed=phases_completed,
        confidence_notes_base=confidence_notes_base,
    )
    return DeepSynthesisResultBody.model_validate(completed.model_dump(exclude={"status"}))


def run_mock_deep_synthesis(
    request: DeepSynthesisRequest,
) -> DeepSynthesisCompletedBody | DeepSynthesisQueuedBody:
    redirect = _should_redirect_to_job(request)
    if redirect:
        enqueue = create_deep_synthesis_job(request, redirect_reason=redirect)
        return DeepSynthesisQueuedBody(
            status="queued",
            job_id=enqueue.job_id,
            poll_url=enqueue.poll_url,
            redirect_reason=redirect,
        )

    profile_used, degraded_notes, phases_completed, confidence_notes_base = _profile_meta(request)
    return _build_mock_completed_body(
        request,
        pipeline_profile_used=profile_used,
        degraded_notes=degraded_notes,
        phases_completed=phases_completed,
        confidence_notes_base=confidence_notes_base,
    )


def _run_mock_fast_only(request: DeepSynthesisRequest) -> DeepSynthesisCompletedBody:
    profile_used, degraded_notes, phases_completed, confidence_notes_base = _profile_meta(request)
    return _build_mock_completed_body(
        request,
        pipeline_profile_used=profile_used,
        degraded_notes=degraded_notes,
        phases_completed=phases_completed,
        confidence_notes_base=confidence_notes_base,
    )


def run_deep_synthesis(
    request: DeepSynthesisRequest,
    provider: TranscriptProvider,
) -> DeepSynthesisCompletedBody | DeepSynthesisQueuedBody:
    redirect = _should_redirect_to_job(request)
    if redirect:
        enqueue = create_deep_synthesis_job(request, redirect_reason=redirect)
        return DeepSynthesisQueuedBody(
            status="queued",
            job_id=enqueue.job_id,
            poll_url=enqueue.poll_url,
            redirect_reason=redirect,
        )

    if provider.name == "openvino":
        deep_synthesis_fast_only = getattr(provider, "deep_synthesis_fast_only", None)
        if callable(deep_synthesis_fast_only):
            return deep_synthesis_fast_only(request)

    return _run_mock_fast_only(request)
