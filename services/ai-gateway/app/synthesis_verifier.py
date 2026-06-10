from __future__ import annotations

from app.synthesis_models import (
    CIRCLING_MAX_WORDS,
    CONNECTIONS_MAX,
    DEEP_SYNTHESIS_POUNCES_MAX,
    HIDDEN_RISK_MAX_WORDS,
    STRONGEST_IDEA_MAX_WORDS,
    DeepSynthesisCompletedBody,
    SynthesisGroundingRef,
)


def _word_count(text: str) -> int:
    return len(text.split())


def _has_grounding(refs: list[SynthesisGroundingRef]) -> bool:
    return len(refs) >= 1


def verify_synthesis_completed(body: DeepSynthesisCompletedBody) -> list[str]:
    issues: list[str] = []

    if _word_count(body.circling) > CIRCLING_MAX_WORDS:
        issues.append(f"circling exceeds {CIRCLING_MAX_WORDS} words")
    if _word_count(body.strongest_idea) > STRONGEST_IDEA_MAX_WORDS:
        issues.append(f"strongest_idea exceeds {STRONGEST_IDEA_MAX_WORDS} words")
    if _word_count(body.hidden_risk) > HIDDEN_RISK_MAX_WORDS:
        issues.append(f"hidden_risk exceeds {HIDDEN_RISK_MAX_WORDS} words")
    if len(body.connections) > CONNECTIONS_MAX:
        issues.append(f"connections exceeds max {CONNECTIONS_MAX}")

    if body.next_pounce is None:
        issues.append("next_pounce is required")
    elif DEEP_SYNTHESIS_POUNCES_MAX != 1:
        issues.append("deep synthesis must have exactly one pounce")

    if not _has_grounding(body.circling_grounding):
        issues.append("circling_grounding is required")
    if not _has_grounding(body.strongest_idea_grounding):
        issues.append("strongest_idea_grounding is required")
    if not _has_grounding(body.hidden_risk_grounding):
        issues.append("hidden_risk_grounding is required")
    if body.next_pounce and not body.next_pounce.grounding:
        issues.append("next_pounce.grounding is required")

    for index, interpretation in enumerate(body.interpretations):
        if not interpretation.grounding:
            issues.append(f"interpretations[{index}].grounding is required")

    for proposal in body.memory_proposals:
        if proposal.requires_approval is not True:
            issues.append(f"memory proposal missing requires_approval: {proposal!r}")
    for proposal in body.personality_proposals:
        if proposal.requires_approval is not True:
            issues.append(f"personality proposal missing requires_approval: {proposal!r}")

    return issues


def truncate_to_word_budget(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words])
