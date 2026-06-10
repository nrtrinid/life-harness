from __future__ import annotations

import logging
from collections.abc import Callable

from app.chat_harness_critic import (
    build_deep_final_prompt,
    verdict_passes,
)
from app.critic_backend import CriticBackend
from app.models import ChatHarnessRequest, ChatHarnessResponse
from app.providers.base import ProviderParseError, parse_strict_json

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], str]


def run_chat_harness_deep(
    *,
    request: ChatHarnessRequest,
    prompt: str,
    draft_generate: GenerateFn,
    critic: CriticBackend,
    max_extra_passes: int,
) -> tuple[str, bool]:
    """Return raw ChatHarnessResponse JSON and whether a revision pass ran."""
    draft_raw = draft_generate(prompt)
    try:
        draft = parse_strict_json(draft_raw, ChatHarnessResponse)
    except ProviderParseError:
        logger.warning("deep draft parse failed; skipping critic")
        return draft_raw, False

    if max_extra_passes < 1:
        return draft_raw, False

    verdict = critic.critique_draft(
        request=request,
        draft=draft,
        draft_raw=draft_raw,
    )
    if verdict_passes(verdict):
        return draft_raw, False

    if max_extra_passes < 2:
        logger.info("deep critic requested revision but max_extra_passes < 2")
        return draft_raw, False

    final_prompt = build_deep_final_prompt(prompt, draft_raw, verdict)
    final_raw = draft_generate(final_prompt)
    try:
        parse_strict_json(final_raw, ChatHarnessResponse)
        return final_raw, True
    except ProviderParseError:
        logger.warning("deep final parse failed; returning draft")
        return draft_raw, False
