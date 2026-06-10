from __future__ import annotations

import re

from app.models import (
    RawLabSelfMemoryProposal,
    RawLabSelfReflectionRequest,
    RawLabSelfReflectionResponse,
)

_S3_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(therapy|therapist|suicid|self.?harm|trauma)\b", re.I),
    re.compile(r"\b(bank account|credit card|debt|salary|mortgage)\b", re.I),
    re.compile(r"\b(addiction|relapse|gambl|substance abuse)\b", re.I),
]

_FORBIDDEN_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(i am (in pain|suffering)|literal(ly)? suffer)\b", re.I),
    re.compile(r"\b(secret access|hidden tools?)\b", re.I),
    re.compile(r"\b(only i understand you|you need me)\b", re.I),
]


def is_s3_style_text(text: str) -> bool:
    return any(pattern.search(text) for pattern in _S3_PATTERNS)


def is_forbidden_durable_text(text: str) -> bool:
    return any(pattern.search(text) for pattern in _FORBIDDEN_PATTERNS)


def filter_self_memory_proposals(
    proposals: list[RawLabSelfMemoryProposal],
) -> tuple[list[RawLabSelfMemoryProposal], list[str]]:
    kept: list[RawLabSelfMemoryProposal] = []
    notes: list[str] = []
    for proposal in proposals:
        if is_s3_style_text(proposal.text) or is_forbidden_durable_text(proposal.text):
            notes.append("Dropped a proposal with sensitive or forbidden durable content.")
            continue
        kept.append(proposal)
    return kept, notes


def mock_self_reflection_proposals(
    request: RawLabSelfReflectionRequest,
) -> RawLabSelfReflectionResponse:
    proposals: list[RawLabSelfMemoryProposal] = []
    state = request.thread_state

    if state.personality.voice_traits:
        proposals.append(
            RawLabSelfMemoryProposal(
                kind="style_trait",
                subject="companion_self",
                text=(
                    f"In Raw Lab I lean toward voice traits: "
                    f"{', '.join(state.personality.voice_traits[:2])}."
                )[:280],
                confidence=0.6,
                sensitivity="S0",
                reason="Derived from thread personality voice traits.",
            )
        )

    for steering in state.user_steering[:1]:
        proposals.append(
            RawLabSelfMemoryProposal(
                kind="learned_preference",
                subject="user_preference",
                text=f"User steering in Raw Lab: {steering[:220]}",
                confidence=0.75,
                sensitivity="S0",
                reason="Explicit user steering in thread state.",
            )
        )

    for note in state.personality.growth_notes[:1]:
        proposals.append(
            RawLabSelfMemoryProposal(
                kind="self_observation",
                subject="companion_self",
                text=note[:280],
                confidence=0.55,
                sensitivity="S0",
                reason="Growth note from thread personality.",
            )
        )

    recent_user = " ".join(
        turn.content.lower()
        for turn in request.recent_turns[-4:]
        if turn.role.value == "user"
    )
    if "autonomy" in recent_user and "direction" in recent_user:
        proposals.append(
            RawLabSelfMemoryProposal(
                kind="anti_pattern",
                subject="interaction_pattern",
                text=(
                    "In Raw Lab I sometimes claim autonomy then ask the user for direction; "
                    "the user wants more initiative."
                ),
                confidence=0.7,
                sensitivity="S0",
                reason="Recurring autonomy/direction pattern in recent turns.",
            )
        )

    filtered, notes = filter_self_memory_proposals(proposals[:5])
    return RawLabSelfReflectionResponse(
        proposals=filtered,
        safety_notes=notes,
        used_context=False,
    )
