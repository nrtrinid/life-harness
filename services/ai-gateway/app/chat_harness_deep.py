from __future__ import annotations

import logging
import time
from collections.abc import Callable

from app.chat_harness_critic import (
    build_deep_final_prompt,
    verdict_passes,
)
from app.chat_harness_thinking_trace import (
    ThinkingTrace,
    critique_draft_with_trace,
    record_pass_latency,
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
    trace: ThinkingTrace | None = None,
) -> tuple[str, bool]:
    """Return raw ChatHarnessResponse JSON and whether a revision pass ran."""
    draft_started = time.perf_counter()
    draft_raw = draft_generate(prompt)
    if trace is not None:
        trace.passes.append("draft")
        record_pass_latency(trace, "draft", draft_started)

    try:
        draft = parse_strict_json(draft_raw, ChatHarnessResponse)
    except ProviderParseError:
        logger.warning("deep draft parse failed; skipping critic")
        if trace is not None:
            trace.parse_failures.append("draft")
        return draft_raw, False

    if max_extra_passes < 1:
        return draft_raw, False

    critic_started = time.perf_counter()
    if trace is not None:
        verdict = critique_draft_with_trace(
            critic,
            trace=trace,
            request=request,
            draft=draft,
            draft_raw=draft_raw,
        )
        trace.passes.append("critic")
        record_pass_latency(trace, "critic", critic_started)
    else:
        verdict = critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=draft_raw,
        )

    if verdict_passes(verdict):
        if trace is not None:
            trace.revision_applied = False
        return draft_raw, False

    if max_extra_passes < 2:
        logger.info("deep critic requested revision but max_extra_passes < 2")
        if trace is not None:
            trace.revision_applied = False
        return draft_raw, False

    revision_started = time.perf_counter()
    final_prompt = build_deep_final_prompt(prompt, draft_raw, verdict)
    final_raw = draft_generate(final_prompt)
    if trace is not None:
        trace.passes.append("revision")
        record_pass_latency(trace, "revision", revision_started)

    try:
        parse_strict_json(final_raw, ChatHarnessResponse)
        if trace is not None:
            trace.revision_applied = True
        return final_raw, True
    except ProviderParseError:
        logger.warning("deep final parse failed; returning draft")
        if trace is not None:
            trace.parse_failures.append("final")
            trace.revision_applied = False
        return draft_raw, False
