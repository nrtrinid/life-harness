from __future__ import annotations

import json
import logging

from app.models import (
    ChatHarnessCriticVerdict,
    ChatHarnessResponse,
    CriticCheckEntry,
    CriticCheckId,
)
from app.providers.base import ProviderParseError, parse_strict_json

logger = logging.getLogger(__name__)

DEEP_CRITIC_PASS_NOTE = "Deep mode: draft approved by structured critic."
DEEP_CRITIC_REVISE_NOTE = "Deep mode: revised after structured critic."
DEEP_CRITIC_SKIPPED_DRAFT_PARSE_NOTE = (
    "Deep mode: structured critic skipped (draft parse failed)."
)
DEEP_CRITIC_SKIPPED_NOTE = "Deep mode: structured critic skipped."
DEEP_REVISED_CONFIDENCE_NOTE = "Inferred — deep mode revised after critic."


def parse_critic_verdict(raw: str) -> ChatHarnessCriticVerdict | None:
    try:
        return parse_strict_json(raw, ChatHarnessCriticVerdict)
    except ProviderParseError:
        return None


def pass_verdict() -> ChatHarnessCriticVerdict:
    return ChatHarnessCriticVerdict(
        needs_revision=False,
        checks=[
            CriticCheckEntry(
                id=CriticCheckId.no_issue,
                severity="info",
                message="Draft passes structured critic checks.",
            )
        ],
        revision_instruction="",
    )


def verdict_passes(verdict: ChatHarnessCriticVerdict) -> bool:
    if not verdict.needs_revision:
        return True
    failing = [
        check
        for check in verdict.checks
        if check.id != CriticCheckId.no_issue
    ]
    return len(failing) == 0


def build_deep_final_prompt(
    base_prompt: str,
    draft_raw: str,
    verdict: ChatHarnessCriticVerdict,
) -> str:
    verdict_json = json.dumps(
        verdict.model_dump(mode="json"),
        indent=2,
        ensure_ascii=False,
    )
    flagged = ", ".join(check.id.value for check in verdict.checks if check.id != CriticCheckId.no_issue)
    return (
        f"{base_prompt}\n\n"
        f"Prior draft JSON:\n{draft_raw[:2000]}\n\n"
        f"Critic verdict:\n{verdict_json}\n\n"
        f"Flagged checks: {flagged or 'none'}\n"
        f"Revision instruction: {verdict.revision_instruction}\n\n"
        "Revise only what the critic flagged. Return ONLY the final ChatHarnessResponse JSON.\n"
        f'When materially changed, include "{DEEP_REVISED_CONFIDENCE_NOTE}" in confidence_notes.'
    )


def append_deep_critic_note(
    response: ChatHarnessResponse,
    *,
    revised: bool,
    critic_ran: bool = True,
    critic_skip_reason: str | None = None,
) -> ChatHarnessResponse:
    notes = list(response.confidence_notes)
    if not critic_ran:
        if critic_skip_reason == "draft_parse_failed":
            skip_note = DEEP_CRITIC_SKIPPED_DRAFT_PARSE_NOTE
        else:
            skip_note = DEEP_CRITIC_SKIPPED_NOTE
        if not any("structured critic skipped" in existing for existing in notes):
            notes.append(skip_note)
        return ChatHarnessResponse(
            answer=response.answer,
            used_context=response.used_context,
            confidence_notes=notes,
            safety_notes=list(response.safety_notes),
        )

    note = DEEP_CRITIC_REVISE_NOTE if revised else DEEP_CRITIC_PASS_NOTE
    if not any("structured critic" in existing for existing in notes):
        notes.append(note)
    if revised and not any(DEEP_REVISED_CONFIDENCE_NOTE in existing for existing in notes):
        notes.append(DEEP_REVISED_CONFIDENCE_NOTE)
    return ChatHarnessResponse(
        answer=response.answer,
        used_context=response.used_context,
        confidence_notes=notes,
        safety_notes=list(response.safety_notes),
    )
