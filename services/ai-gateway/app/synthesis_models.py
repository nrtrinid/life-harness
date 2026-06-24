from __future__ import annotations

import logging
from enum import Enum
from typing import TYPE_CHECKING, Annotated, Any, Literal, Union

from pydantic import Field, ValidationError, field_validator, model_validator

from app.models import (
    ChatHarnessThreadState,
    ConversationTurn,
    HarnessContext,
    SensitivityLevel,
    StrictModel,
)

if TYPE_CHECKING:
    from app.context_packet import AiContextPacketWire

logger = logging.getLogger(__name__)

CIRCLING_MAX_WORDS = 120
STRONGEST_IDEA_MAX_WORDS = 120
HIDDEN_RISK_MAX_WORDS = 100
CONNECTIONS_MAX = 5
DEEP_SYNTHESIS_POUNCES_MAX = 1


def _word_count(text: str) -> int:
    return len(text.split())


class DeepSynthesisTrigger(str, Enum):
    user_prompt = "user_prompt"
    selected_ramble = "selected_ramble"
    thread_excerpt = "thread_excerpt"
    project_question = "project_question"


class SynthesisLens(str, Enum):
    practical = "practical"
    emotional = "emotional"
    product = "product"
    skeptical = "skeptical"


class SynthesisPipelineProfile(str, Enum):
    auto = "auto"
    fast_only = "fast_only"
    with_critic = "with_critic"
    with_stretch = "with_stretch"


class SynthesisGroundingKind(str, Enum):
    active_card = "active_card"
    proof_log = "proof_log"
    memory = "memory"
    thread_excerpt = "thread_excerpt"
    project_doc = "project_doc"
    inferred_from_prompt = "inferred_from_prompt"


class SynthesisGroundingRef(StrictModel):
    kind: SynthesisGroundingKind
    ref: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)


class SynthesisInterpretation(StrictModel):
    lens: SynthesisLens
    summary: str = Field(..., min_length=1)
    confidence: Literal["low", "medium", "high"]
    grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)


class SynthesisCritique(StrictModel):
    shallow_flags: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    avoidance: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    overall: Literal["pass", "revise"]
    revision_brief: str | None = None


class SynthesisNextPounce(StrictModel):
    title: str = Field(..., min_length=1)
    smallest_action: str = Field(..., min_length=1)
    card_hint: str | None = None
    grounding: SynthesisGroundingRef


class SynthesisMemoryProposal(StrictModel):
    kind: Literal["pattern", "preference", "trap", "identity", "project_fact", "decision", "rule"]
    text: str = Field(..., min_length=1)
    requires_approval: Literal[True]
    source_synthesis_id: str = Field(..., min_length=1)


class SynthesisPersonalityProposal(StrictModel):
    field: Literal["voice_traits", "stance", "growth_notes", "conversational_instincts"]
    proposed: str = Field(..., min_length=1)
    requires_approval: Literal[True]
    rationale: str = Field(..., min_length=1)


class SynthesisMemoryProposalDraft(StrictModel):
    kind: Literal["pattern", "preference", "trap", "identity", "project_fact", "decision", "rule"]
    text: str = Field(..., min_length=1)
    requires_approval: bool = True


class SynthesisPersonalityProposalDraft(StrictModel):
    field: Literal["voice_traits", "stance", "growth_notes", "conversational_instincts"]
    proposed: str = Field(..., min_length=1)
    requires_approval: bool = True
    rationale: str = Field(..., min_length=1)


class DeepSynthesisModelDraft(StrictModel):
    """Model-produced fields only — server injects synthesis_id and profile metadata."""

    circling: str = Field(..., min_length=1)
    strongest_idea: str = Field(..., min_length=1)
    hidden_risk: str = Field(..., min_length=1)
    connections: list[str] = Field(default_factory=list)
    circling_grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)
    strongest_idea_grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)
    hidden_risk_grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)
    next_pounce: SynthesisNextPounce
    interpretations: list[SynthesisInterpretation] = Field(default_factory=list)
    critique: SynthesisCritique | None = None
    memory_proposals: list[SynthesisMemoryProposalDraft] = Field(default_factory=list)
    personality_proposals: list[SynthesisPersonalityProposalDraft] = Field(default_factory=list)
    confidence_notes: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)


class DeepSynthesisRequest(StrictModel):
    trigger: DeepSynthesisTrigger = DeepSynthesisTrigger.user_prompt
    sensitivity: SensitivityLevel = SensitivityLevel.S1
    user_prompt: str = Field(..., min_length=1)
    context: HarnessContext
    conversation_history: list[ConversationTurn] = Field(default_factory=list)
    thread_state: ChatHarnessThreadState = Field(default_factory=ChatHarnessThreadState)
    interpretation_lenses: list[SynthesisLens] = Field(
        default_factory=lambda: [
            SynthesisLens.practical,
            SynthesisLens.emotional,
            SynthesisLens.product,
        ]
    )
    pipeline_profile: SynthesisPipelineProfile = SynthesisPipelineProfile.fast_only
    prefer_async_if_slow: bool = True
    context_packet: "AiContextPacketWire | None" = None

    @model_validator(mode="before")
    @classmethod
    def strip_invalid_context_packet(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw_packet = data.get("context_packet")
        if raw_packet is None:
            return data
        from app.context_packet import AiContextPacketWire

        try:
            AiContextPacketWire.model_validate(raw_packet)
        except ValidationError:
            logger.warning(
                "Invalid context_packet stripped from deep synthesis; falling back to legacy context"
            )
            data = dict(data)
            data["context_packet"] = None
        return data


class DeepSynthesisResultBody(StrictModel):
    synthesis_id: str = Field(..., min_length=1)
    pipeline_profile_used: SynthesisPipelineProfile
    degraded_notes: list[str] = Field(default_factory=list)
    phases_completed: list[str] = Field(default_factory=list)
    stretch_slot_status: (
        Literal["mock_simulated", "slot_unavailable", "slot_ready_not_wired"] | None
    ) = None
    circling: str = Field(..., min_length=1)
    strongest_idea: str = Field(..., min_length=1)
    hidden_risk: str = Field(..., min_length=1)
    connections: list[str] = Field(default_factory=list)
    circling_grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)
    strongest_idea_grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)
    hidden_risk_grounding: list[SynthesisGroundingRef] = Field(..., min_length=1)
    next_pounce: SynthesisNextPounce
    interpretations: list[SynthesisInterpretation] = Field(default_factory=list)
    critique: SynthesisCritique | None = None
    memory_proposals: list[SynthesisMemoryProposal] = Field(default_factory=list)
    personality_proposals: list[SynthesisPersonalityProposal] = Field(default_factory=list)
    confidence_notes: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)

    @field_validator("circling")
    @classmethod
    def validate_circling_words(cls, value: str) -> str:
        if _word_count(value) > CIRCLING_MAX_WORDS:
            raise ValueError(f"circling exceeds {CIRCLING_MAX_WORDS} words")
        return value

    @field_validator("strongest_idea")
    @classmethod
    def validate_strongest_idea_words(cls, value: str) -> str:
        if _word_count(value) > STRONGEST_IDEA_MAX_WORDS:
            raise ValueError(f"strongest_idea exceeds {STRONGEST_IDEA_MAX_WORDS} words")
        return value

    @field_validator("hidden_risk")
    @classmethod
    def validate_hidden_risk_words(cls, value: str) -> str:
        if _word_count(value) > HIDDEN_RISK_MAX_WORDS:
            raise ValueError(f"hidden_risk exceeds {HIDDEN_RISK_MAX_WORDS} words")
        return value

    @field_validator("connections")
    @classmethod
    def validate_connections_count(cls, value: list[str]) -> list[str]:
        if len(value) > CONNECTIONS_MAX:
            raise ValueError(f"connections exceeds max {CONNECTIONS_MAX}")
        return value


class DeepSynthesisCompletedBody(DeepSynthesisResultBody):
    status: Literal["completed"] = "completed"


class AiJobKind(str, Enum):
    deep_synthesis = "deep_synthesis"


class AiJobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class DeepSynthesisJobEnqueueResponse(StrictModel):
    job_id: str = Field(..., min_length=1)
    status: Literal["queued"] = "queued"
    job_kind: Literal[AiJobKind.deep_synthesis] = AiJobKind.deep_synthesis
    poll_url: str = Field(..., min_length=1)
    created_at: str = Field(..., min_length=1)
    phase: str = Field(..., min_length=1)


class AiJobStatusResponse(StrictModel):
    job_id: str = Field(..., min_length=1)
    job_kind: AiJobKind
    status: AiJobStatus
    phase: str | None = None
    created_at: str = Field(..., min_length=1)
    completed_at: str | None = None
    result: DeepSynthesisResultBody | None = None
    error: str | None = None


class DeepSynthesisQueuedBody(StrictModel):
    status: Literal["queued"] = "queued"
    job_id: str = Field(..., min_length=1)
    poll_url: str = Field(..., min_length=1)
    redirect_reason: str = Field(..., min_length=1)


DeepSynthesisResponse = Annotated[
    Union[DeepSynthesisCompletedBody, DeepSynthesisQueuedBody],
    Field(discriminator="status"),
]


def parse_deep_synthesis_response(payload: dict) -> DeepSynthesisCompletedBody | DeepSynthesisQueuedBody:
    status = payload.get("status")
    if status == "queued":
        return DeepSynthesisQueuedBody.model_validate(payload)
    return DeepSynthesisCompletedBody.model_validate(payload)
