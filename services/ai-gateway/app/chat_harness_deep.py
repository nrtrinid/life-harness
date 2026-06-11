from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

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

DRAFT_PARSE_FAIL_SOFT_REASON = "draft_parse_failed"


@dataclass(frozen=True)
class DeepRunResult:
    raw: str
    revised: bool
    critic_ran: bool
    critic_skip_reason: str | None = None


def _parse_draft_with_optional_repair(
    draft_raw: str,
    *,
    draft_repair_generate: GenerateFn | None,
    trace: ThinkingTrace | None,
) -> tuple[ChatHarnessResponse, str] | None:
    """Return (draft, effective_raw) or None if the draft cannot be recovered."""
    try:
        draft = parse_strict_json(draft_raw, ChatHarnessResponse)
        return draft, draft_raw
    except ProviderParseError:
        if trace is not None:
            trace.parse_failures.append("draft")

        if draft_repair_generate is None:
            logger.warning(
                "deep draft parse failed; critic skipped (%s)",
                DRAFT_PARSE_FAIL_SOFT_REASON,
            )
            return None

        if trace is not None:
            trace.draft_repair_attempted = True

        logger.warning("deep draft parse failed; attempting draft JSON repair")

        repair_started = time.perf_counter()
        if trace is not None:
            trace.passes.append("draft_repair")

        repaired_raw = draft_repair_generate(draft_raw)
        if trace is not None:
            record_pass_latency(trace, "draft_repair", repair_started)

        try:
            draft = parse_strict_json(repaired_raw, ChatHarnessResponse)
        except ProviderParseError:
            if trace is not None:
                trace.draft_repair_succeeded = False
            logger.warning(
                "deep draft repair failed; critic skipped (%s)",
                DRAFT_PARSE_FAIL_SOFT_REASON,
            )
            return None

        if trace is not None:
            trace.draft_repair_succeeded = True
        logger.info("deep draft repair succeeded")
        return draft, repaired_raw


def run_chat_harness_deep(
    *,
    request: ChatHarnessRequest,
    prompt: str,
    draft_generate: GenerateFn,
    draft_repair_generate: GenerateFn | None = None,
    critic: CriticBackend,
    max_extra_passes: int,
    trace: ThinkingTrace | None = None,
) -> DeepRunResult:
    """Return deep-mode raw JSON, revision flag, and whether the critic pass ran."""
    draft_started = time.perf_counter()
    draft_raw = draft_generate(prompt)
    if trace is not None:
        trace.passes.append("draft")
        record_pass_latency(trace, "draft", draft_started)

    parsed = _parse_draft_with_optional_repair(
        draft_raw,
        draft_repair_generate=draft_repair_generate,
        trace=trace,
    )
    if parsed is None:
        if trace is not None:
            trace.fail_soft_reason = trace.fail_soft_reason or DRAFT_PARSE_FAIL_SOFT_REASON
            trace.fallback_used = True
        return DeepRunResult(
            raw=draft_raw,
            revised=False,
            critic_ran=False,
            critic_skip_reason=DRAFT_PARSE_FAIL_SOFT_REASON,
        )

    draft, effective_raw = parsed

    if max_extra_passes < 1:
        if trace is not None and trace.draft_repair_succeeded:
            logger.info(
                "deep draft repair succeeded; critic skipped (deep_passes_disabled)"
            )
        return DeepRunResult(
            raw=effective_raw,
            revised=False,
            critic_ran=False,
            critic_skip_reason="deep_passes_disabled",
        )

    if trace is not None and trace.draft_repair_succeeded:
        logger.info("deep draft repair succeeded; continuing to critic")

    critic_started = time.perf_counter()
    if trace is not None:
        verdict = critique_draft_with_trace(
            critic,
            trace=trace,
            request=request,
            draft=draft,
            draft_raw=effective_raw,
        )
        trace.passes.append("critic")
        record_pass_latency(trace, "critic", critic_started)
    else:
        verdict = critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=effective_raw,
        )

    if verdict_passes(verdict):
        if trace is not None:
            trace.revision_applied = False
        return DeepRunResult(raw=effective_raw, revised=False, critic_ran=True)

    if max_extra_passes < 2:
        logger.info("deep critic requested revision but max_extra_passes < 2")
        if trace is not None:
            trace.revision_applied = False
        return DeepRunResult(raw=effective_raw, revised=False, critic_ran=True)

    revision_started = time.perf_counter()
    final_prompt = build_deep_final_prompt(prompt, effective_raw, verdict)
    final_raw = draft_generate(final_prompt)
    if trace is not None:
        trace.passes.append("revision")
        record_pass_latency(trace, "revision", revision_started)

    try:
        parse_strict_json(final_raw, ChatHarnessResponse)
        if trace is not None:
            trace.revision_applied = True
        return DeepRunResult(raw=final_raw, revised=True, critic_ran=True)
    except ProviderParseError:
        logger.warning("deep final parse failed; returning draft")
        if trace is not None:
            trace.parse_failures.append("final")
            trace.revision_applied = False
            trace.fail_soft_reason = trace.fail_soft_reason or "final_parse_failed"
            trace.fallback_used = True
        return DeepRunResult(raw=effective_raw, revised=False, critic_ran=True)
