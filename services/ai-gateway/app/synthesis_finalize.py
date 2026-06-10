from __future__ import annotations

from app.models import SensitivityLevel
from app.synthesis_models import (
    CIRCLING_MAX_WORDS,
    CONNECTIONS_MAX,
    HIDDEN_RISK_MAX_WORDS,
    STRONGEST_IDEA_MAX_WORDS,
    DeepSynthesisCompletedBody,
    DeepSynthesisModelDraft,
    SynthesisMemoryProposal,
    SynthesisPersonalityProposal,
    SynthesisPipelineProfile,
)
from app.synthesis_verifier import truncate_to_word_budget


def finalize_synthesis_draft(
    draft: DeepSynthesisModelDraft,
    *,
    synthesis_id: str,
    pipeline_profile_used: SynthesisPipelineProfile = SynthesisPipelineProfile.fast_only,
    degraded_notes: list[str] | None = None,
    phases_completed: list[str] | None = None,
    extra_confidence_notes: list[str] | None = None,
    sensitivity: SensitivityLevel = SensitivityLevel.S1,
) -> DeepSynthesisCompletedBody:
    memory_proposals = [
        SynthesisMemoryProposal(
            kind=proposal.kind,
            text=proposal.text,
            requires_approval=True,
            source_synthesis_id=synthesis_id,
        )
        for proposal in draft.memory_proposals
    ]
    personality_proposals = [
        SynthesisPersonalityProposal(
            field=proposal.field,
            proposed=proposal.proposed,
            requires_approval=True,
            rationale=proposal.rationale,
        )
        for proposal in draft.personality_proposals
    ]

    confidence_notes = list(draft.confidence_notes)
    if extra_confidence_notes:
        confidence_notes.extend(extra_confidence_notes)

    safety_notes = list(draft.safety_notes)
    if sensitivity == SensitivityLevel.S2 and not any(
        "S2" in note for note in safety_notes
    ):
        safety_notes.append("S2 context — review before saving any proposal.")

    return DeepSynthesisCompletedBody(
        status="completed",
        synthesis_id=synthesis_id,
        pipeline_profile_used=pipeline_profile_used,
        degraded_notes=list(degraded_notes or []),
        phases_completed=list(phases_completed or ["digest", "interpretations", "format"]),
        circling=truncate_to_word_budget(draft.circling, CIRCLING_MAX_WORDS),
        strongest_idea=truncate_to_word_budget(draft.strongest_idea, STRONGEST_IDEA_MAX_WORDS),
        hidden_risk=truncate_to_word_budget(draft.hidden_risk, HIDDEN_RISK_MAX_WORDS),
        connections=draft.connections[:CONNECTIONS_MAX],
        circling_grounding=draft.circling_grounding,
        strongest_idea_grounding=draft.strongest_idea_grounding,
        hidden_risk_grounding=draft.hidden_risk_grounding,
        next_pounce=draft.next_pounce,
        interpretations=draft.interpretations,
        critique=draft.critique,
        memory_proposals=memory_proposals,
        personality_proposals=personality_proposals,
        confidence_notes=confidence_notes,
        safety_notes=safety_notes,
    )
