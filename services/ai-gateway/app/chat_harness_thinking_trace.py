from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

from app.backends.llamacpp_backend import (
    LlamaCppEmptyContentError,
    LlamaCppError,
)
from app.chat_harness_critic import parse_critic_verdict, pass_verdict
from app.config import Settings
from app.critic_backend import (
    CriticBackend,
    LlamaCppCriticBackend,
    MockCriticBackend,
    SameBackendCritic,
)
from app.models import (
    ChatHarnessCriticVerdict,
    ChatHarnessRequest,
    ChatHarnessResponse,
    CriticCheckId,
)
from app.prompt_loader import build_chat_harness_critic_prompt

logger = logging.getLogger(__name__)


@dataclass
class ThinkingTrace:
    reasoning_depth: str = "deep"
    context_packet_used: bool = False
    passes: list[str] = field(default_factory=list)
    critic_backend: str | None = None
    critic_checks: list[str] = field(default_factory=list)
    critic_verdict_parsed: bool = False
    revision_applied: bool = False
    fallback_used: bool = False
    fail_soft_reason: str | None = None
    parse_failures: list[str] = field(default_factory=list)
    latency_ms: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return {
            "reasoning_depth": self.reasoning_depth,
            "context_packet_used": self.context_packet_used,
            "passes": list(self.passes),
            "critic_backend": self.critic_backend,
            "critic_checks": list(self.critic_checks),
            "critic_verdict_parsed": self.critic_verdict_parsed,
            "revision_applied": self.revision_applied,
            "fallback_used": self.fallback_used,
            "fail_soft_reason": self.fail_soft_reason,
            "parse_failures": list(self.parse_failures),
            "latency_ms": dict(self.latency_ms),
        }

def new_thinking_trace(request: ChatHarnessRequest) -> ThinkingTrace:
    return ThinkingTrace(
        reasoning_depth=request.reasoning_depth.value,
        context_packet_used=request.context_packet is not None,
    )


def emit_thinking_trace(settings: Settings, trace: ThinkingTrace | None) -> None:
    if trace is None or not settings.debug_thinking_trace:
        return
    logger.info(
        "chat_harness_thinking_trace %s",
        json.dumps(trace.to_dict(), sort_keys=True),
    )


def _classify_llama_error(exc: LlamaCppError) -> str:
    if isinstance(exc, LlamaCppEmptyContentError):
        return "critic_empty_content"
    return "critic_http_error"


def _check_ids_from_verdict(verdict: ChatHarnessCriticVerdict) -> list[str]:
    return [
        check.id.value
        for check in verdict.checks
        if check.id != CriticCheckId.no_issue
    ]


def _resolve_critic_target(critic: CriticBackend) -> CriticBackend:
    inner = getattr(critic, "_inner", None)
    if inner is not None:
        return inner
    return critic


def critique_draft_with_trace(
    critic: CriticBackend,
    *,
    trace: ThinkingTrace,
    request: ChatHarnessRequest,
    draft: ChatHarnessResponse,
    draft_raw: str,
) -> ChatHarnessCriticVerdict:
    trace.critic_backend = critic.name
    target = _resolve_critic_target(critic)

    if isinstance(target, MockCriticBackend):
        verdict = critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=draft_raw,
        )
        trace.critic_verdict_parsed = True
        trace.critic_checks = _check_ids_from_verdict(verdict)
        return verdict

    if isinstance(target, SameBackendCritic):
        prompt = build_chat_harness_critic_prompt(
            request=request,
            draft_json=draft_raw,
        )
        raw = target._generate(prompt)
        verdict = parse_critic_verdict(raw)
        if verdict is None:
            trace.critic_verdict_parsed = False
            trace.fail_soft_reason = trace.fail_soft_reason or "critic_parse_failed"
            return pass_verdict()
        trace.critic_verdict_parsed = True
        trace.critic_checks = _check_ids_from_verdict(verdict)
        return verdict

    if isinstance(target, LlamaCppCriticBackend):
        prompt = build_chat_harness_critic_prompt(
            request=request,
            draft_json=draft_raw,
        )
        try:
            raw = target._backend.generate(prompt)
        except LlamaCppError as exc:
            trace.critic_verdict_parsed = False
            trace.fail_soft_reason = trace.fail_soft_reason or _classify_llama_error(exc)
            return pass_verdict()
        verdict = parse_critic_verdict(raw)
        if verdict is None:
            trace.critic_verdict_parsed = False
            trace.fail_soft_reason = trace.fail_soft_reason or "critic_parse_failed"
            return pass_verdict()
        trace.critic_verdict_parsed = True
        trace.critic_checks = _check_ids_from_verdict(verdict)
        return verdict

    verdict = critic.critique_draft(
        request=request,
        draft=draft,
        draft_raw=draft_raw,
    )
    trace.critic_verdict_parsed = True
    trace.critic_checks = _check_ids_from_verdict(verdict)
    return verdict


def record_pass_latency(trace: ThinkingTrace, pass_name: str, started: float) -> None:
    trace.latency_ms[pass_name] = int((time.perf_counter() - started) * 1000)
