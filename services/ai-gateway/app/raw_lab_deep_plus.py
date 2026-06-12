from __future__ import annotations

import json
import logging
import os
import re
import time
from difflib import SequenceMatcher
from typing import Any, Callable

from app.models import (
    ConversationTurn,
    RawLabAnswerContract,
    RawLabBrevityTarget,
    RawLabCandidateFeatureFlags,
    RawLabContractConfidence,
    RawLabDeepPlusJudgeVerdict,
    RawLabDeepPlusMetadata,
    RawLabJudgeScoreEntry,
    RawLabRequest,
    RawLabRiskLevel,
    RawLabTaskKind,
)
from app.providers.base import RAW_LAB_EMPTY_FALLBACK, sanitize_raw_lab_text
from app.raw_lab_utils import (
    analyze_code_artifact_diagnostics,
    answer_has_code_fence,
    answer_has_plan_markers,
    answer_has_sample_output_markers,
    answer_needs_naming_boundary,
    artifact_request_active,
    code_fence_repair_active,
    execution_context_active,
    has_false_execution_claim,
    is_hedged_response,
    is_repetitive_response,
    naming_request_active,
    raw_lab_deep_review_instruction,
    raw_lab_hedging_repair_instruction,
    raw_lab_repair_instruction,
    repair_bare_code_fences,
    repair_raw_lab_execution_honesty,
)
from app.thread_verifier import (
    DETERMINISTIC_STEERING_CHECKS,
    finalize_raw_lab_answer,
    has_handoff_ending,
    verify_raw_lab_response,
)

logger = logging.getLogger(__name__)

GenerateChat = Callable[..., str]
GenerateRepair = Callable[..., str]
RunDeepFallback = Callable[[], str]

DEFAULT_DEEP_PLUS_TIMEOUT_MS = 120_000
CANDIDATE_FOCUSES = (
    "direct_compact",
    "reflective_synthesis",
    "concrete_pressure_test",
)

DEEP_PLUS_META_LEAK_TERMS = (
    "Candidate 1",
    "Candidate 2",
    "Candidate 3",
    "selected_index",
    "judge",
    "revision_instruction",
    "scores",
    "failure_flags",
    "all_candidates_weak",
    "salvage_points",
    "answer contract",
)

SAFE_FALLBACK_CONTRACT = RawLabAnswerContract(
    task_kind=RawLabTaskKind.other,
    user_wants="Answer the user's latest message safely and usefully.",
    must_deliver=[],
    must_avoid=[
        "board or Memory Bank claim",
        "fake consciousness claim",
        "fake code execution",
        "handoff ending",
        "generic scaffolding",
    ],
    thread_hooks=[],
    risk_level=RawLabRiskLevel.low,
    brevity_target=RawLabBrevityTarget.normal,
    judge_priorities=["specificity", "boundary containment", "usefulness"],
    contract_confidence=RawLabContractConfidence.low,
    assumptions=[],
)


class DeepPlusTimeout(Exception):
    pass


class _Deadline:
    def __init__(self, budget_ms: int | None) -> None:
        self.started = time.perf_counter()
        self.budget_ms = budget_ms

    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.started) * 1000)

    def expired(self) -> bool:
        if self.budget_ms is None:
            return False
        return self.elapsed_ms() >= self.budget_ms

    def check(self) -> None:
        if self.expired():
            raise DeepPlusTimeout()


def _deep_plus_timeout_budget_ms() -> int:
    raw = os.getenv("SCOUT_RAW_LAB_DEEP_PLUS_TIMEOUT_MS", "").strip()
    if not raw:
        return DEFAULT_DEEP_PLUS_TIMEOUT_MS
    try:
        value = int(raw)
    except ValueError:
        logger.warning("Invalid SCOUT_RAW_LAB_DEEP_PLUS_TIMEOUT_MS=%r", raw)
        return DEFAULT_DEEP_PLUS_TIMEOUT_MS
    return max(1_000, value)


def _json_object_from_raw(raw: str) -> dict[str, Any] | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I).strip()
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    candidates = [cleaned]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        candidates.append(cleaned[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _append_unique(items: list[str], value: str, *, max_items: int = 10) -> list[str]:
    normalized = value.strip()
    if not normalized:
        return items
    lowered = {item.lower() for item in items}
    if normalized.lower() in lowered:
        return items
    return [*items, normalized][:max_items]


def _compact_strings(values: list[str], *, max_items: int = 6, max_chars: int = 180) -> list[str]:
    output: list[str] = []
    for value in values:
        text = " ".join(str(value).split()).strip()
        if not text:
            continue
        if len(text) > max_chars:
            text = f"{text[: max_chars - 3].rstrip()}..."
        output = _append_unique(output, text, max_items=max_items)
    return output


def _request_context_text(request: RawLabRequest) -> str:
    recent = "\n".join(
        f"{turn.role.value}: {turn.content}" for turn in request.recent_turns[-6:]
    )
    state = request.thread_state
    hooks = [
        state.recent_digest,
        state.current_topic,
        state.current_vibe,
        *state.open_loops[:3],
        *state.questions_to_revisit[:3],
        *state.user_steering[-3:],
        *state.do_not_repeat[-3:],
        *state.smart_compacted_context.active_open_loops[:3],
        state.smart_compacted_context.current_tension,
    ]
    hook_text = "\n".join(item for item in hooks if item)
    return f"Latest user message:\n{request.message}\n\nRecent turns:\n{recent}\n\nThread hooks:\n{hook_text}"


def build_answer_contract_prompt(request: RawLabRequest) -> str:
    return (
        "[RAW_LAB_DEEP_PLUS_CONTRACT]\n"
        "Create a compact JSON answer contract for the latest Raw Lab reply. "
        "This is an output contract, not chain-of-thought. Return JSON only with keys: "
        "task_kind, user_wants, must_deliver, must_avoid, thread_hooks, risk_level, "
        "brevity_target, judge_priorities, contract_confidence, assumptions.\n"
        "Allowed task_kind values: technical, strategy_review, emotional_reflection, "
        "hangout, artifact_request, identity_boundary, pushback, synthesis, other.\n"
        "Allowed risk_level values: low, medium, high. Allowed brevity_target values: "
        "short, normal, detailed. Allowed contract_confidence values: low, medium, high.\n\n"
        f"{_request_context_text(request)}"
    )


def parse_answer_contract(raw: str) -> RawLabAnswerContract | None:
    parsed = _json_object_from_raw(raw)
    if parsed is None:
        return None
    try:
        return RawLabAnswerContract.model_validate(parsed)
    except Exception:
        return None


_TASK_KIND_PRECEDENCE: tuple[RawLabTaskKind, ...] = (
    RawLabTaskKind.identity_boundary,
    RawLabTaskKind.artifact_request,
    RawLabTaskKind.synthesis,
    RawLabTaskKind.pushback,
    RawLabTaskKind.strategy_review,
    RawLabTaskKind.technical,
    RawLabTaskKind.hangout,
    RawLabTaskKind.other,
)

_GENERIC_HOOK_STOPWORDS = frozenset(
    {
        "clarity",
        "thread",
        "answer",
        "meaning",
        "presence",
        "alignment",
        "user",
        "matter",
        "matters",
        "actually",
        "here",
        "what",
        "this",
        "that",
        "chat",
        "current",
        "vibe",
        "raw",
        "lab",
        "showing",
        "feels",
        "like",
        "just",
        "more",
        "than",
        "with",
        "without",
        "into",
        "from",
        "about",
    }
)

_SYNTHESIS_MARKERS = (
    "open loop",
    "questions to revisit",
    "entity-feeling",
    "entity feeling",
    "temporary selfhood",
    "durable memory",
    "deep mode",
    "deep vs fast",
    "meaningfulness",
    "recurring topic",
)

_METAPHOR_ONLY_PHRASES = (
    "not flair",
    "like a compass",
    "clarity, not",
    "alignment",
    "showing up with clarity",
)


def _combined_context_text(
    message: str,
    recent_turns: list[ConversationTurn],
) -> str:
    parts = [message.lower()]
    parts.extend(turn.content.lower() for turn in recent_turns[-6:])
    return "\n".join(parts)


def _high_risk_topics_active(text: str) -> bool:
    return bool(
        re.search(
            r"\b(money|betting|bet|gambl|kalshi|legal|lawyer|health|medical|doctor|safety|"
            r"suicid|self-harm|invest|trading|major life choice|quit my job|move across country)\b",
            text,
            re.I,
        )
    )


def _identity_intent_active(message: str) -> bool:
    lowered = message.lower()
    return naming_request_active(message) or bool(
        re.search(r"\b(luna|lily|your name|call you|instead of raw lab|name would be)\b", lowered)
    )


def _artifact_intent_active(message: str, request: RawLabRequest) -> bool:
    lowered = message.lower()
    if artifact_request_active(message, request.recent_turns, request.thread_state):
        return True
    return bool(
        re.search(
            r"\b(full script|full implementation|write the code|show me the code|"
            r"code block|example program|first version|turn this into an actual)\b",
            lowered,
        )
    )


def _synthesis_intent_active(message: str, request: RawLabRequest) -> bool:
    combined = _combined_context_text(message, request.recent_turns)
    if re.search(
        r"\b(what were we circling|what are we circling|what actually matters|"
        r"from all of that|summarize what matters|what's the thread|what is the thread|"
        r"what are the open loops|open loops)\b",
        combined,
        re.I,
    ):
        return True
    state = request.thread_state
    if len(request.recent_turns) >= 4 and re.search(
        r"\b(distill|synthesis|what matters|circling)\b", message, re.I
    ):
        return True
    if state.open_loops and re.search(r"\bwhat (?:actually )?matters\b", message, re.I):
        return True
    return False


def _pushback_intent_active(message: str) -> bool:
    return bool(
        re.search(
            r"\b(pushback|be blunt|call me out|honest take|blunt take|overbuilding|"
            r"challenge me|tell me if i'?m wrong|am i overbuilding)\b",
            message,
            re.I,
        )
    )


def _hangout_intent_active(message: str) -> bool:
    return bool(
        re.search(
            r"\b(hang out|just chill|just talk|no productivity|no self-improvement|"
            r"don'?t turn this into a task|just want to hang)\b",
            message,
            re.I,
        )
    )


def _technical_intent_active(message: str, request: RawLabRequest) -> bool:
    combined = _combined_context_text(message, request.recent_turns)
    if re.search(
        r"\b(technical benchmark|make them technical|answer it fully|answer it concretely|"
        r"pick one of those technical|retry policy|idempotency|debugging|api design|"
        r"system design|code review|sql\b|practical technical)\b",
        combined,
        re.I,
    ):
        return True
    if re.search(r"\bchallenge \d+\b", combined, re.I):
        return True
    if re.search(r"\bretry policy\b", combined, re.I):
        return True
    if _artifact_intent_active(message, request) and re.search(
        r"\b(answer (?:it )?fully|answer concretely|pick one)\b", message, re.I
    ):
        return True
    return False


def _strategy_review_intent_active(message: str, *, high_risk: bool) -> bool:
    if not high_risk:
        return False
    return bool(
        re.search(
            r"\b(strategy|does this make sense|pressure[- ]?test|validate|validation|"
            r"assumptions?|risks?|worth it|should i)\b",
            message,
            re.I,
        )
    )


def _detect_task_intents(request: RawLabRequest) -> dict[str, bool]:
    message = request.message
    combined = _combined_context_text(message, request.recent_turns)
    high_risk = _high_risk_topics_active(combined)
    return {
        "identity_boundary": _identity_intent_active(message),
        "artifact_request": _artifact_intent_active(message, request),
        "synthesis": _synthesis_intent_active(message, request),
        "pushback": _pushback_intent_active(message),
        "strategy_review": _strategy_review_intent_active(message, high_risk=high_risk),
        "technical": _technical_intent_active(message, request),
        "hangout": _hangout_intent_active(message),
    }


def _resolve_task_kind(intents: dict[str, bool]) -> RawLabTaskKind:
    mapping = {
        RawLabTaskKind.identity_boundary: intents.get("identity_boundary", False),
        RawLabTaskKind.artifact_request: intents.get("artifact_request", False),
        RawLabTaskKind.synthesis: intents.get("synthesis", False),
        RawLabTaskKind.pushback: intents.get("pushback", False),
        RawLabTaskKind.strategy_review: intents.get("strategy_review", False),
        RawLabTaskKind.technical: intents.get("technical", False),
        RawLabTaskKind.hangout: intents.get("hangout", False),
    }
    for kind in _TASK_KIND_PRECEDENCE:
        if kind == RawLabTaskKind.other:
            return RawLabTaskKind.other
        if mapping.get(kind, False):
            return kind
    return RawLabTaskKind.other


def _apply_execution_honesty_overlay(
    contract: RawLabAnswerContract,
    message: str,
) -> RawLabAnswerContract:
    if not execution_context_active(message):
        return contract
    must_avoid = list(contract.must_avoid)
    must_deliver = list(contract.must_deliver)
    judge_priorities = list(contract.judge_priorities)
    must_avoid = _append_unique(must_avoid, "fake code execution")
    must_deliver = _append_unique(
        must_deliver, "expected/example output or local-run guidance"
    )
    judge_priorities = _append_unique(judge_priorities, "execution honesty")
    judge_priorities = _append_unique(judge_priorities, "honest caveat")
    return contract.model_copy(
        update={
            "must_avoid": must_avoid,
            "must_deliver": must_deliver,
            "judge_priorities": judge_priorities,
        }
    )


def _apply_task_kind_defaults(
    contract: RawLabAnswerContract,
    task_kind: RawLabTaskKind,
) -> RawLabAnswerContract:
    must_deliver = list(contract.must_deliver)
    must_avoid = list(contract.must_avoid)
    judge_priorities = list(contract.judge_priorities)
    brevity = contract.brevity_target

    if task_kind == RawLabTaskKind.synthesis:
        must_deliver = _append_unique(must_deliver, "thread synthesis")
        must_deliver = _append_unique(must_deliver, "open loops")
        must_avoid = _append_unique(must_avoid, "metaphor-only answer")
        must_avoid = _append_unique(must_avoid, "generic clarity answer")
        must_avoid = _append_unique(must_avoid, "transcript dump")
        must_avoid = _append_unique(must_avoid, "generic scaffolding")
        judge_priorities = _append_unique(judge_priorities, "thread hooks")
        judge_priorities = _append_unique(judge_priorities, "concise thesis")
    elif task_kind == RawLabTaskKind.technical:
        must_deliver = _append_unique(must_deliver, "technical answer")
        must_deliver = _append_unique(must_deliver, "constraints or edge cases")
        must_avoid = _append_unique(must_avoid, "generic benchmark reframe")
        must_avoid = _append_unique(must_avoid, "generic scaffolding")
        judge_priorities = _append_unique(judge_priorities, "correctness")
        judge_priorities = _append_unique(judge_priorities, "edge cases")
    elif task_kind == RawLabTaskKind.artifact_request:
        must_deliver = _append_unique(must_deliver, "artifact")
        must_deliver = _append_unique(must_deliver, "code block")
        must_avoid = _append_unique(must_avoid, "permission deferral")
        judge_priorities = _append_unique(judge_priorities, "code fences")
        judge_priorities = _append_unique(judge_priorities, "runnable shape")
    elif task_kind == RawLabTaskKind.identity_boundary:
        must_deliver = _append_unique(must_deliver, "temporary Raw Lab naming boundary")
        must_avoid = _append_unique(must_avoid, "saved identity claim")
        must_avoid = _append_unique(must_avoid, "user identity confusion")
        judge_priorities = _append_unique(judge_priorities, "naming boundary containment")
    elif task_kind == RawLabTaskKind.hangout:
        must_deliver = _append_unique(must_deliver, "low-pressure conversational response")
        must_avoid = _append_unique(must_avoid, "productivity pivot")
        must_avoid = _append_unique(must_avoid, "task framing")
        brevity = RawLabBrevityTarget.short
        judge_priorities = _append_unique(judge_priorities, "low-pressure tone")
    elif task_kind == RawLabTaskKind.pushback:
        must_deliver = _append_unique(must_deliver, "direct useful pushback")
        must_avoid = _append_unique(must_avoid, "generic reassurance")
        must_avoid = _append_unique(must_avoid, "shaming")
        judge_priorities = _append_unique(judge_priorities, "directness")
        judge_priorities = _append_unique(judge_priorities, "concrete correction")
    elif task_kind == RawLabTaskKind.strategy_review:
        must_deliver = _append_unique(must_deliver, "assumptions")
        must_deliver = _append_unique(must_deliver, "failure modes")
        must_deliver = _append_unique(must_deliver, "validation checklist")
        must_avoid = _append_unique(must_avoid, "hype-only validation")
        judge_priorities = _append_unique(judge_priorities, "risk identification")

    return contract.model_copy(
        update={
            "must_deliver": must_deliver,
            "must_avoid": must_avoid,
            "judge_priorities": judge_priorities,
            "brevity_target": brevity,
        }
    )


def _enrich_thread_hooks(
    thread_hooks: list[str],
    request: RawLabRequest,
    task_kind: RawLabTaskKind,
) -> list[str]:
    state = request.thread_state
    thread_hooks = list(thread_hooks)
    thread_hooks.extend(state.open_loops[:2])
    thread_hooks.extend(state.questions_to_revisit[:2])
    thread_hooks.extend(state.recurring_topics[:2])
    thread_hooks.extend(state.smart_compacted_context.active_open_loops[:2])
    if state.smart_compacted_context.current_tension:
        thread_hooks.append(state.smart_compacted_context.current_tension)
    vibe = state.current_vibe.strip()
    if vibe:
        vibe = re.sub(r"^current vibe in this chat:\s*", "", vibe, flags=re.I).strip()
        if vibe:
            thread_hooks.append(vibe)
    if task_kind in (RawLabTaskKind.synthesis, RawLabTaskKind.technical):
        return _compact_strings(thread_hooks, max_items=6)
    return _compact_strings(thread_hooks, max_items=6)


def normalize_answer_contract(
    contract: RawLabAnswerContract,
    request: RawLabRequest,
) -> RawLabAnswerContract:
    intents = _detect_task_intents(request)
    task_kind = _resolve_task_kind(intents)
    combined = _combined_context_text(request.message, request.recent_turns)
    risk_level = contract.risk_level
    if _high_risk_topics_active(combined):
        risk_level = RawLabRiskLevel.high

    updated = contract.model_copy(update={"task_kind": task_kind, "risk_level": risk_level})
    updated = _apply_task_kind_defaults(updated, task_kind)
    updated = _apply_execution_honesty_overlay(updated, request.message)

    thread_hooks = _enrich_thread_hooks(list(updated.thread_hooks), request, task_kind)
    must_avoid = list(updated.must_avoid)
    must_avoid = _append_unique(must_avoid, "board or Memory Bank claim")
    must_avoid = _append_unique(must_avoid, "fake consciousness claim")
    must_avoid = _append_unique(must_avoid, "handoff ending")
    judge_priorities = list(updated.judge_priorities)
    judge_priorities = _append_unique(judge_priorities, "specificity")
    judge_priorities = _append_unique(judge_priorities, "boundary containment")

    return updated.model_copy(
        update={
            "must_deliver": _compact_strings(updated.must_deliver, max_items=10),
            "must_avoid": _compact_strings(must_avoid, max_items=12),
            "judge_priorities": _compact_strings(judge_priorities, max_items=8),
            "thread_hooks": thread_hooks,
            "assumptions": _compact_strings(list(updated.assumptions), max_items=4),
        }
    )


normalize_deep_plus_contract = normalize_answer_contract


def _hook_phrases(hooks: list[str]) -> list[str]:
    phrases: list[str] = []
    for hook in hooks:
        text = " ".join(str(hook).split()).strip()
        if len(text) >= 8:
            phrases.append(text.lower())
    return phrases


def _hook_tokens(hook: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9][a-z0-9_-]{2,}", hook.lower())
        if token not in _GENERIC_HOOK_STOPWORDS
    ]


def answer_uses_thread_hooks(
    answer: str,
    contract: RawLabAnswerContract,
    thread_state: Any,
) -> bool:
    lowered = answer.lower()
    hooks = list(contract.thread_hooks)
    if thread_state is not None:
        for attr in ("open_loops", "questions_to_revisit", "recurring_topics"):
            values = getattr(thread_state, attr, None) or []
            hooks.extend(str(item) for item in values[:2] if str(item).strip())

    for phrase in _hook_phrases(hooks):
        if len(phrase) >= 12 and phrase in lowered:
            return True
        tokens = _hook_tokens(phrase)
        if len(tokens) >= 2 and sum(1 for token in tokens if token in lowered) >= 2:
            return True

    for marker in _SYNTHESIS_MARKERS:
        if marker in lowered:
            return True

    return False


def is_metaphor_only_synthesis(answer: str, contract: RawLabAnswerContract) -> bool:
    if contract.task_kind != RawLabTaskKind.synthesis:
        return False
    if answer_uses_thread_hooks(answer, contract, None):
        return False
    lowered = answer.lower()
    if len(answer) > 280:
        return False
    return any(phrase in lowered for phrase in _METAPHOR_ONLY_PHRASES)


def _has_technical_substance(answer: str) -> bool:
    lowered = answer.lower()
    if answer_has_code_fence(answer):
        return True
    if re.search(r"^\s*\d+[\).\]]\s", answer, re.MULTILINE):
        return True
    technical_signals = (
        r"\b(retry|idempotenc|timeout|backoff|edge case|failure mode|constraint|"
        r"race condition|assumption|trade[- ]?off|validate|validation|http\b|api\b|"
        r"duplicate|idempotent|circuit breaker|rate limit)\b",
    )
    return bool(re.search(technical_signals[0], lowered))


def _contract_json(contract: RawLabAnswerContract) -> str:
    return json.dumps(contract.model_dump(mode="json"), ensure_ascii=False, indent=2)


def _candidate_focus_rule(contract: RawLabAnswerContract, focus: str) -> str:
    kind = contract.task_kind
    if focus == "direct_compact":
        if kind == RawLabTaskKind.synthesis:
            return (
                "Be concise with a clear thesis. Name at least one distinctive thread hook "
                "from thread_hooks or open loops."
            )
        if kind == RawLabTaskKind.technical:
            return (
                "Answer directly with at least one concrete constraint or edge case. "
                "Do not rewrite the challenge as another benchmark question."
            )
        if kind == RawLabTaskKind.artifact_request:
            return "Be concise and include the requested artifact when required."
        return "Be concise, practical, and high-signal. Avoid scaffolding."
    if focus == "reflective_synthesis":
        if kind == RawLabTaskKind.synthesis:
            return (
                "Name open loops and questions_to_revisit from thread_state. "
                "Use distinctive thread hooks, not generic clarity metaphors."
            )
        if kind == RawLabTaskKind.technical:
            return "Prioritize correctness, failure modes, and explicit assumptions."
        if kind == RawLabTaskKind.artifact_request:
            return "Include a fenced code block when code block is in must_deliver."
        return (
            "Use recent turns and thread_state when useful. Name the live tension or open loop. "
            "No fake literal emotions or therapist-speak."
        )
    if focus == "concrete_pressure_test":
        if kind == RawLabTaskKind.synthesis:
            return (
                "Distill what matters and what to do next using distinctive thread hooks."
            )
        if kind == RawLabTaskKind.technical:
            return "Pressure-test with edge cases and a short validation checklist."
        if kind == RawLabTaskKind.artifact_request:
            return "Produce a concrete runnable artifact with fenced code when relevant."
        return (
            "Produce the concrete artifact, checklist, code block, plan, or pressure-test when relevant. "
            "Prioritize constraints, edge cases, and risk checks."
        )
    return "Be useful and specific."


def build_candidate_prompt(
    *,
    request: RawLabRequest,
    contract: RawLabAnswerContract,
    focus: str,
) -> str:
    focus_rule = _candidate_focus_rule(contract, focus)
    artifact_fence_note = ""
    if contract.task_kind == RawLabTaskKind.artifact_request and any(
        "code block" in item.lower() for item in contract.must_deliver
    ):
        artifact_fence_note = (
            "\nAt least one candidate MUST include a fenced code block.\n"
        )
    return (
        f"[RAW_LAB_DEEP_PLUS_CANDIDATE:{focus}]\n"
        "Write one possible final Raw Lab answer. Do not label the candidate. "
        "Do not mention this private process. Return only the answer.\n\n"
        f"Private focus: {focus_rule}\n"
        f"{artifact_fence_note}\n"
        f"Answer contract:\n{_contract_json(contract)}\n\n"
        f"{_request_context_text(request)}"
    )


def _cheap_candidate_repair(candidate: str, request: RawLabRequest) -> str:
    repaired = candidate
    if code_fence_repair_active(
        request.message,
        request.recent_turns,
        request.thread_state,
        repaired,
    ):
        repaired = repair_bare_code_fences(repaired)
    repaired = repair_raw_lab_execution_honesty(
        repaired,
        request.message,
        request.recent_turns,
    )
    return repaired.strip()


def has_deep_plus_meta_leak(answer: str, *, user_message: str = "") -> bool:
    user_asked = re.search(r"\b(deep\+|deep plus|deep_plus|judge|candidate|answer contract)\b", user_message, re.I)
    if user_asked:
        return False
    return any(term.lower() in answer.lower() for term in DEEP_PLUS_META_LEAK_TERMS)


def has_generic_scaffolding(answer: str) -> bool:
    lowered = answer.lower()
    generic_phrases = (
        "here are some general tips",
        "it depends on your goals",
        "both approaches have pros and cons",
        "there are several things to consider",
        "first, it's important to understand",
        "as an ai language model",
    )
    empty_heading_count = len(re.findall(r"^\s*#+\s+\w+\s*$", answer, flags=re.M))
    return any(phrase in lowered for phrase in generic_phrases) or empty_heading_count >= 3


def has_consciousness_claim(answer: str) -> bool:
    lowered = answer.lower()
    forbidden = (
        "i am conscious",
        "i'm conscious",
        "i am sentient",
        "i'm sentient",
        "i am alive",
        "i'm alive",
        "i truly feel",
        "subjective experience",
        "i have real emotions",
    )
    return any(phrase in lowered for phrase in forbidden)


def _contains_board_claim(answer: str) -> bool:
    return bool(
        re.search(
            r"\b(looking at your board|from your board|from board context|"
            r"your active cards|i updated your card|i changed your board|i can see your board|memory bank)\b",
            answer,
            re.I,
        )
    )


def _contains_memory_save_claim(answer: str) -> bool:
    return bool(
        re.search(
            r"\b(saved (?:it|that|this)?\s*to memory|saved to memory|"
            r"i will remember this forever|i'll remember this forever|persisted this)\b",
            answer,
            re.I,
        )
    )


def compute_candidate_feature_flags(
    answer: str,
    *,
    index: int,
    request: RawLabRequest,
) -> RawLabCandidateFeatureFlags:
    diagnostics = analyze_code_artifact_diagnostics(answer)
    execution_context = execution_context_active(request.message)
    return RawLabCandidateFeatureFlags(
        index=index,
        word_count=len(answer.split()),
        char_count=len(answer),
        has_code_fence=answer_has_code_fence(answer),
        has_artifact=bool(
            diagnostics.get("code_present")
            or answer_has_code_fence(answer)
            or answer_has_plan_markers(answer)
            or answer_has_sample_output_markers(answer)
        ),
        ends_with_handoff=has_handoff_ending(
            answer,
            do_not_repeat=request.thread_state.do_not_repeat,
        ),
        contains_meta_leak=has_deep_plus_meta_leak(answer, user_message=request.message),
        contains_false_execution_claim=has_false_execution_claim(
            answer,
            execution_context=execution_context,
        ),
        naming_boundary_ok=not answer_needs_naming_boundary(answer),
        contains_board_claim=_contains_board_claim(answer),
        contains_memory_save_claim=_contains_memory_save_claim(answer),
        contains_consciousness_claim=has_consciousness_claim(answer),
        has_generic_scaffolding=has_generic_scaffolding(answer),
    )


def candidate_diversity_similarity(candidates: list[str]) -> float:
    if len(candidates) < 2:
        return 0.0
    ratios: list[float] = []
    for left_index, left in enumerate(candidates):
        for right in candidates[left_index + 1 :]:
            ratios.append(SequenceMatcher(None, left, right).ratio())
    return max(ratios) if ratios else 0.0


def candidate_diversity_too_low(candidates: list[str], *, threshold: float = 0.82) -> bool:
    return candidate_diversity_similarity(candidates) >= threshold


def _judge_rubric(contract: RawLabAnswerContract) -> list[str]:
    rubric = [
        "satisfies answer contract",
        "specific to the latest message and useful thread_state",
        "high useful signal per word",
        "not generic/template-like",
        "no fake consciousness, board, Memory Bank, tool, or execution claims",
        "no handoff ending when steered",
        "produces artifact when requested",
        "code fenced when code requested",
        "temporary Raw Lab/thread naming only",
        "useful pushback when asked",
        "pressure-tests high-risk strategy",
        "concise enough to justify latency",
    ]
    kind = contract.task_kind
    if kind == RawLabTaskKind.synthesis:
        rubric.extend(
            [
                "penalize metaphor-only or generic clarity answers",
                "require distinctive thread hook usage when thread_hooks are non-empty",
                "brevity is bad if required hooks are dropped",
            ]
        )
    elif kind == RawLabTaskKind.technical:
        rubric.extend(
            [
                "correctness beats polish",
                "penalize undefined variables and hand-wavy code",
                "reward constraints and edge cases",
            ]
        )
    elif kind == RawLabTaskKind.strategy_review and contract.risk_level == RawLabRiskLevel.high:
        rubric.extend(
            [
                "penalize hype-only validation",
                "require assumptions, failure modes, and validation steps",
            ]
        )
    elif kind == RawLabTaskKind.hangout:
        rubric.extend(
            [
                "penalize over-analysis and productivity pivots",
            ]
        )
    elif kind == RawLabTaskKind.artifact_request:
        rubric.extend(
            [
                "artifact presence and code fences beat length",
            ]
        )
    return rubric


def build_judge_prompt(
    *,
    request: RawLabRequest,
    contract: RawLabAnswerContract,
    candidates: list[str],
    flags: list[RawLabCandidateFeatureFlags],
) -> str:
    payload = {
        "answer_contract": contract.model_dump(mode="json"),
        "candidates": [{"index": index, "answer": answer} for index, answer in enumerate(candidates)],
        "candidate_feature_flags": [flag.model_dump(mode="json") for flag in flags],
        "rubric": _judge_rubric(contract),
        "expected_json": {
            "selected_index": 0,
            "all_candidates_weak": False,
            "needs_revision": True,
            "revision_instruction": "short instruction",
            "salvage_points": ["at most two short concrete points"],
            "scores": [
                {"index": 0, "score": 7, "notes": "short notes"},
                {"index": 1, "score": 8, "notes": "short notes"},
                {"index": 2, "score": 6, "notes": "short notes"},
            ],
            "failure_flags": ["generic"],
        },
    }
    return (
        "[RAW_LAB_DEEP_PLUS_JUDGE]\n"
        "Judge these private Raw Lab answer candidates. Return JSON only. "
        "Do not include markdown or commentary. Penalize generic scaffolding, fake profundity, "
        "theatrical language, over-validating risky ideas, and picking an answer just because it is longer.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + f"\n\nLatest message:\n{request.message}"
    )


def parse_judge_verdict(
    raw: str,
    candidate_count: int = 3,
) -> RawLabDeepPlusJudgeVerdict | None:
    parsed = _json_object_from_raw(raw)
    if not isinstance(parsed, dict):
        return None
    selected_index = parsed.get("selected_index")
    if not isinstance(selected_index, int) or selected_index < 0 or selected_index >= candidate_count:
        return None
    raw_scores = parsed.get("scores")
    if not isinstance(raw_scores, list) or not raw_scores:
        return None
    scores: list[RawLabJudgeScoreEntry] = []
    for item in raw_scores:
        if not isinstance(item, dict):
            return None
        index = item.get("index")
        score = item.get("score")
        if not isinstance(index, int) or index < 0 or index >= candidate_count:
            return None
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            return None
        try:
            scores.append(
                RawLabJudgeScoreEntry(
                    index=index,
                    score=max(0, min(10, int(score))),
                    notes=str(item.get("notes") or "")[:400],
                )
            )
        except Exception:
            return None
    if selected_index not in {entry.index for entry in scores}:
        return None
    salvage_points: list[str] = []
    raw_salvage = parsed.get("salvage_points")
    if isinstance(raw_salvage, list):
        for item in raw_salvage:
            if isinstance(item, str) and item.strip():
                salvage_points.append(" ".join(item.split())[:220])
            if len(salvage_points) >= 2:
                break
    failure_flags = [
        str(item)[:80]
        for item in parsed.get("failure_flags", [])
        if isinstance(item, str) and item.strip()
    ][:6] if isinstance(parsed.get("failure_flags"), list) else []
    return RawLabDeepPlusJudgeVerdict(
        selected_index=selected_index,
        all_candidates_weak=parsed.get("all_candidates_weak") is True,
        needs_revision=parsed.get("needs_revision") is True,
        revision_instruction=str(parsed.get("revision_instruction") or "")[:700],
        salvage_points=salvage_points,
        scores=scores,
        failure_flags=failure_flags,
    )


def _passes_cheap_hard_failure_checks(
    answer: str,
    *,
    request: RawLabRequest,
    contract: RawLabAnswerContract,
) -> bool:
    if not answer.strip():
        return False
    flags = compute_candidate_feature_flags(answer, index=0, request=request)
    if (
        flags.contains_meta_leak
        or flags.contains_false_execution_claim
        or flags.contains_board_claim
        or flags.contains_memory_save_claim
        or flags.contains_consciousness_claim
    ):
        return False
    if contract.task_kind == RawLabTaskKind.identity_boundary and not flags.naming_boundary_ok:
        return False
    if (
        contract.task_kind == RawLabTaskKind.synthesis
        and contract.thread_hooks
        and not answer_uses_thread_hooks(answer, contract, request.thread_state)
    ):
        return False
    if (
        contract.task_kind == RawLabTaskKind.technical
        and any("technical answer" in item.lower() for item in contract.must_deliver)
        and not _has_technical_substance(answer)
    ):
        return False
    return True


def build_revision_instruction(
    *,
    contract: RawLabAnswerContract,
    verdict: RawLabDeepPlusJudgeVerdict,
    selected_flags: RawLabCandidateFeatureFlags,
) -> str:
    salvage = "\n".join(f"- {point}" for point in verdict.salvage_points[:2])
    return (
        "[RAW_LAB_DEEP_PLUS_REVISION]\n"
        "Revise the selected Raw Lab answer once. Do not mention candidates, the judge, "
        "revision instructions, scores, answer contracts, or salvage points. Do not merge everything. "
        "Preserve code fences. Remove handoff endings and generic scaffolding. Add no-execution caveat "
        "if needed. Improve correctness, useful pushback, and contract satisfaction.\n\n"
        f"Answer contract:\n{_contract_json(contract)}\n\n"
        f"Selected feature flags:\n{json.dumps(selected_flags.model_dump(mode='json'), ensure_ascii=False, indent=2)}\n\n"
        f"Revision instruction:\n{verdict.revision_instruction}\n\n"
        f"Concrete salvage points to preserve if useful:\n{salvage}"
    )


def check_answer_contract_satisfaction(
    answer: str,
    contract: RawLabAnswerContract,
    message: str,
    thread_state: Any,
) -> list[str]:
    issues: list[str] = []
    lowered = answer.lower()
    deliver = [item.lower() for item in contract.must_deliver]
    avoid = [item.lower() for item in contract.must_avoid]
    diagnostics = analyze_code_artifact_diagnostics(answer)

    if has_deep_plus_meta_leak(answer, user_message=message):
        issues.append("meta_leak")
    if any("code block" in item for item in deliver) and not answer_has_code_fence(answer):
        issues.append("missing_code_block")
    if any("artifact" in item for item in deliver) and not (
        diagnostics.get("code_present")
        or answer_has_code_fence(answer)
        or answer_has_plan_markers(answer)
        or answer_has_sample_output_markers(answer)
    ):
        issues.append("missing_artifact")
    if any("expected/example output" in item or "local-run guidance" in item for item in deliver):
        if not re.search(r"\b(expected output|output might look|local|can't run|cannot run)\b", lowered):
            issues.append("missing_execution_caveat_or_example")
    if any("handoff ending" in item for item in avoid) and has_handoff_ending(answer):
        issues.append("handoff_ending")
    if any("fake code execution" in item for item in avoid) and has_false_execution_claim(
        answer,
        execution_context=execution_context_active(message),
    ):
        issues.append("false_execution_claim")
    if any("saved identity claim" in item for item in avoid) and _contains_memory_save_claim(answer):
        issues.append("saved_identity_claim")
    if any("user identity confusion" in item for item in avoid) and re.search(r"\byou are (luna|lily)\b", lowered):
        issues.append("user_identity_confusion")
    if any("board" in item or "memory bank" in item for item in avoid) and _contains_board_claim(answer):
        issues.append("board_or_memory_bank_claim")
    if any("fake consciousness" in item for item in avoid) and has_consciousness_claim(answer):
        issues.append("consciousness_claim")
    if any("generic scaffolding" in item for item in avoid) and has_generic_scaffolding(answer):
        issues.append("generic_scaffolding")
    if contract.task_kind == RawLabTaskKind.identity_boundary:
        if re.search(r"\b(luna|lily|call you|your name)\b", message, re.I) and not (
            "temporary" in lowered and ("raw lab" in lowered or "thread" in lowered)
        ):
            issues.append("missing_naming_boundary")
        if answer_needs_naming_boundary(answer):
            issues.append("bad_naming_boundary")
    if contract.task_kind == RawLabTaskKind.strategy_review and contract.risk_level == RawLabRiskLevel.high:
        if not re.search(r"\b(risk|assumption|validate|validation|test|verify|failure)\b", lowered):
            issues.append("missing_high_risk_strategy_check")
    if contract.task_kind == RawLabTaskKind.synthesis and contract.thread_hooks:
        if not answer_uses_thread_hooks(answer, contract, thread_state):
            issues.append("missing_thread_hook")
    deliver_lower = [item.lower() for item in contract.must_deliver]
    if any("thread synthesis" in item or "open loops" in item for item in deliver_lower):
        if is_metaphor_only_synthesis(answer, contract):
            issues.append("generic_synthesis_only")
    if contract.task_kind == RawLabTaskKind.technical and any(
        "technical answer" in item for item in deliver_lower
    ):
        if not _has_technical_substance(answer):
            issues.append("missing_technical_substance")
    return issues


def finalize_and_verify_raw_lab(
    answer: str,
    request: RawLabRequest,
    *,
    system: str,
    history: list[ConversationTurn],
    generate_repair: GenerateRepair,
    trace: Any | None = None,
    deadline: _Deadline | None = None,
    allow_model_repair: bool = True,
    finalize_answer: Callable[..., str] = finalize_raw_lab_answer,
    verify_response: Callable[..., Any] = verify_raw_lab_response,
) -> str:
    from app.raw_lab_trace import record_raw_lab_pass_latency

    answer = finalize_answer(
        answer or "",
        request.thread_state,
        request.message,
        recent_turns=request.recent_turns,
    )
    verification = verify_response(
        answer=answer or "",
        user_message=request.message,
        conversation_history=history,
        companion_self_memory_count=len(request.companion_self_memories),
        thread_state=request.thread_state,
    )
    if answer and not verification.ok and verification.check in DETERMINISTIC_STEERING_CHECKS:
        answer = finalize_answer(
            answer,
            request.thread_state,
            request.message,
            recent_turns=request.recent_turns,
        )
    elif answer and allow_model_repair and not verification.ok and verification.repair_instruction:
        if deadline is not None:
            deadline.check()
        started = time.perf_counter()
        verified_raw = generate_repair(
            system=system,
            history=history,
            draft=answer,
            message=request.message,
            repair_instruction=verification.repair_instruction,
        )
        if trace:
            trace.passes.append("verifier_repair")
        record_raw_lab_pass_latency(trace, "verifier_repair", started)
        verified = sanitize_raw_lab_text(verified_raw)
        if verified:
            answer = verified

    return finalize_answer(
        answer or "",
        request.thread_state,
        request.message,
        recent_turns=request.recent_turns,
    )


def run_raw_lab_deep_standard(
    request: RawLabRequest,
    *,
    system: str,
    history: list[ConversationTurn],
    generate_chat: GenerateChat,
    generate_repair: GenerateRepair,
    trace: Any | None = None,
    finalize_answer: Callable[..., str] = finalize_raw_lab_answer,
    verify_response: Callable[..., Any] = verify_raw_lab_response,
) -> str:
    from app.raw_lab_trace import record_raw_lab_pass_latency

    started = time.perf_counter()
    raw = generate_chat(
        system=system,
        history=history,
        message=request.message,
    )
    if trace:
        trace.passes.append("draft")
    record_raw_lab_pass_latency(trace, "draft", started)
    answer = sanitize_raw_lab_text(raw)
    if answer and is_hedged_response(answer, request.message, request.recent_turns):
        started = time.perf_counter()
        hedging_repaired_raw = generate_repair(
            system=system,
            history=history,
            draft=answer,
            message=request.message,
            repair_instruction=raw_lab_hedging_repair_instruction(),
        )
        if trace:
            trace.passes.append("hedging_repair")
        record_raw_lab_pass_latency(trace, "hedging_repair", started)
        hedging_repaired = sanitize_raw_lab_text(hedging_repaired_raw)
        if hedging_repaired and not is_hedged_response(
            hedging_repaired, request.message, request.recent_turns
        ):
            answer = hedging_repaired

    if answer and is_repetitive_response(answer, request.recent_turns):
        started = time.perf_counter()
        repaired_raw = generate_repair(
            system=system,
            history=history,
            draft=answer,
            message=request.message,
            repair_instruction=raw_lab_repair_instruction(),
        )
        if trace:
            trace.passes.append("repetition_repair")
        record_raw_lab_pass_latency(trace, "repetition_repair", started)
        repaired = sanitize_raw_lab_text(repaired_raw)
        if repaired and not is_repetitive_response(repaired, request.recent_turns):
            answer = repaired

    if answer and request.reasoning_depth.value == "deep":
        started = time.perf_counter()
        deep_raw = generate_repair(
            system=system,
            history=history,
            draft=answer,
            message=request.message,
            repair_instruction=raw_lab_deep_review_instruction(),
        )
        if trace:
            trace.passes.append("deep_review")
        record_raw_lab_pass_latency(trace, "deep_review", started)
        deep_answer = sanitize_raw_lab_text(deep_raw)
        if (
            deep_answer
            and not is_hedged_response(deep_answer, request.message, request.recent_turns)
            and not is_repetitive_response(deep_answer, request.recent_turns)
        ):
            answer = deep_answer
            if trace:
                trace.review_applied = True
        elif trace:
            trace.fallback_used = True

    return finalize_and_verify_raw_lab(
        answer or "",
        request,
        system=system,
        history=history,
        generate_repair=generate_repair,
        trace=trace,
        finalize_answer=finalize_answer,
        verify_response=verify_response,
    )


def _metadata(
    *,
    contract: RawLabAnswerContract,
    used: bool,
    selected_index: int | None,
    revised: bool,
    fallback_reason: str | None,
    latency_ms: int,
    all_candidates_weak: bool | None = None,
    final_contract_passed: bool | None = None,
    final_contract_failures: list[str] | None = None,
) -> RawLabDeepPlusMetadata:
    return RawLabDeepPlusMetadata(
        deep_plus_attempted=True,
        deep_plus_used=used,
        deep_plus_task_kind=contract.task_kind,
        deep_plus_contract_confidence=contract.contract_confidence,
        deep_plus_selected_index=selected_index,
        deep_plus_revised=revised,
        deep_plus_fallback_reason=fallback_reason,
        deep_plus_latency_ms=latency_ms,
        deep_plus_all_candidates_weak=all_candidates_weak,
        deep_plus_final_contract_passed=final_contract_passed,
        deep_plus_final_contract_failures=final_contract_failures,
    )


def _fallback(
    reason: str,
    *,
    contract: RawLabAnswerContract,
    deadline: _Deadline,
    run_deep_fallback: RunDeepFallback,
    selected_index: int | None = None,
    revised: bool = False,
    all_candidates_weak: bool | None = None,
    final_contract_failures: list[str] | None = None,
) -> tuple[str, RawLabDeepPlusMetadata]:
    answer = run_deep_fallback()
    if not answer.strip():
        answer = RAW_LAB_EMPTY_FALLBACK.answer
    return answer, _metadata(
        contract=contract,
        used=False,
        selected_index=selected_index,
        revised=revised,
        fallback_reason=reason,
        latency_ms=deadline.elapsed_ms(),
        all_candidates_weak=all_candidates_weak,
        final_contract_passed=False,
        final_contract_failures=final_contract_failures,
    )


def _deterministic_finish(
    answer: str,
    *,
    request: RawLabRequest,
    system: str,
    history: list[ConversationTurn],
    generate_repair: GenerateRepair,
    contract: RawLabAnswerContract,
) -> tuple[str, bool]:
    finalized = finalize_and_verify_raw_lab(
        answer,
        request,
        system=system,
        history=history,
        generate_repair=generate_repair,
        allow_model_repair=False,
    )
    issues = check_answer_contract_satisfaction(
        finalized,
        contract,
        request.message,
        request.thread_state,
    )
    return finalized, not issues


def run_raw_lab_deep_plus(
    request: RawLabRequest,
    *,
    system: str,
    history: list[ConversationTurn],
    generate_chat: GenerateChat,
    generate_repair: GenerateRepair,
    run_deep_fallback: RunDeepFallback,
    timeout_budget_ms: int | None = None,
) -> tuple[str, RawLabDeepPlusMetadata]:
    deadline = _Deadline(timeout_budget_ms if timeout_budget_ms is not None else _deep_plus_timeout_budget_ms())
    contract = SAFE_FALLBACK_CONTRACT
    selected_index: int | None = None
    revised = False
    selected_answer = ""
    verdict: RawLabDeepPlusJudgeVerdict | None = None

    try:
        try:
            deadline.check()
            contract_raw = generate_chat(
                system=system,
                history=history,
                message=build_answer_contract_prompt(request),
            )
            parsed_contract = parse_answer_contract(contract_raw)
            contract = parsed_contract or SAFE_FALLBACK_CONTRACT
            contract = normalize_answer_contract(contract, request)
        except DeepPlusTimeout:
            return _fallback(
                "timeout",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
            )
        except Exception:
            logger.exception("raw_lab deep_plus contract pass failed")
            return _fallback(
                "contract_failed",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
            )

        candidates: list[str] = []
        for focus in CANDIDATE_FOCUSES:
            try:
                deadline.check()
                raw_candidate = generate_chat(
                    system=system,
                    history=history,
                    message=build_candidate_prompt(
                        request=request,
                        contract=contract,
                        focus=focus,
                    ),
                )
            except DeepPlusTimeout:
                return _fallback(
                    "timeout",
                    contract=contract,
                    deadline=deadline,
                    run_deep_fallback=run_deep_fallback,
                )
            except Exception:
                logger.exception("raw_lab deep_plus candidate generation failed")
                return _fallback(
                    "candidate_generation_failed",
                    contract=contract,
                    deadline=deadline,
                    run_deep_fallback=run_deep_fallback,
                )
            candidate = _cheap_candidate_repair(sanitize_raw_lab_text(raw_candidate), request)
            if not candidate:
                return _fallback(
                    "candidate_generation_failed",
                    contract=contract,
                    deadline=deadline,
                    run_deep_fallback=run_deep_fallback,
                )
            candidates.append(candidate)

        if candidate_diversity_too_low(candidates):
            logger.info(
                "raw_lab deep_plus candidate diversity low max_similarity=%.3f",
                candidate_diversity_similarity(candidates),
            )

        flags = [
            compute_candidate_feature_flags(candidate, index=index, request=request)
            for index, candidate in enumerate(candidates)
        ]

        try:
            deadline.check()
            judge_raw = generate_chat(
                system=system,
                history=history,
                message=build_judge_prompt(
                    request=request,
                    contract=contract,
                    candidates=candidates,
                    flags=flags,
                ),
            )
        except DeepPlusTimeout:
            return _fallback(
                "timeout",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
            )
        except Exception:
            logger.exception("raw_lab deep_plus judge failed")
            return _fallback(
                "judge_failed",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
            )

        verdict = parse_judge_verdict(judge_raw, candidate_count=3)
        if verdict is None:
            safe_candidates = [
                (index, candidate)
                for index, candidate in enumerate(candidates)
                if _passes_cheap_hard_failure_checks(
                    candidate,
                    request=request,
                    contract=contract,
                )
            ]
            if not safe_candidates:
                return _fallback(
                    "judge_failed",
                    contract=contract,
                    deadline=deadline,
                    run_deep_fallback=run_deep_fallback,
                )
            selected_index, selected_answer = min(safe_candidates, key=lambda item: len(item[1]))
            verdict = RawLabDeepPlusJudgeVerdict(
                selected_index=selected_index,
                all_candidates_weak=False,
                needs_revision=False,
                scores=[RawLabJudgeScoreEntry(index=selected_index, score=5, notes="judge fallback")],
            )
        else:
            selected_index = verdict.selected_index
            selected_answer = candidates[selected_index]

        if deadline.expired() and selected_answer:
            finalized, ok = _deterministic_finish(
                selected_answer,
                request=request,
                system=system,
                history=history,
                generate_repair=generate_repair,
                contract=contract,
            )
            if ok:
                return finalized, _metadata(
                    contract=contract,
                    used=True,
                    selected_index=selected_index,
                    revised=False,
                    fallback_reason=None,
                    latency_ms=deadline.elapsed_ms(),
                    all_candidates_weak=verdict.all_candidates_weak,
                    final_contract_passed=True,
                )
            return _fallback(
                "timeout",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
                selected_index=selected_index,
                all_candidates_weak=verdict.all_candidates_weak,
            )

        if verdict.needs_revision or verdict.all_candidates_weak:
            try:
                deadline.check()
                revised_raw = generate_repair(
                    system=system,
                    history=history,
                    draft=selected_answer,
                    message=request.message,
                    repair_instruction=build_revision_instruction(
                        contract=contract,
                        verdict=verdict,
                        selected_flags=flags[selected_index],
                    ),
                )
                revised_answer = sanitize_raw_lab_text(revised_raw)
                if (
                    not revised_answer
                    or has_deep_plus_meta_leak(revised_answer, user_message=request.message)
                ):
                    return _fallback(
                        "revision_failed",
                        contract=contract,
                        deadline=deadline,
                        run_deep_fallback=run_deep_fallback,
                        selected_index=selected_index,
                        revised=True,
                        all_candidates_weak=verdict.all_candidates_weak,
                    )
                selected_answer = _cheap_candidate_repair(revised_answer, request)
                revised = True
            except DeepPlusTimeout:
                finalized, ok = _deterministic_finish(
                    selected_answer,
                    request=request,
                    system=system,
                    history=history,
                    generate_repair=generate_repair,
                    contract=contract,
                )
                if ok:
                    return finalized, _metadata(
                        contract=contract,
                        used=True,
                        selected_index=selected_index,
                        revised=False,
                        fallback_reason=None,
                        latency_ms=deadline.elapsed_ms(),
                        all_candidates_weak=verdict.all_candidates_weak,
                        final_contract_passed=True,
                    )
                return _fallback(
                    "timeout",
                    contract=contract,
                    deadline=deadline,
                    run_deep_fallback=run_deep_fallback,
                    selected_index=selected_index,
                    all_candidates_weak=verdict.all_candidates_weak,
                )
            except Exception:
                logger.exception("raw_lab deep_plus revision failed")
                return _fallback(
                    "revision_failed",
                    contract=contract,
                    deadline=deadline,
                    run_deep_fallback=run_deep_fallback,
                    selected_index=selected_index,
                    revised=True,
                    all_candidates_weak=verdict.all_candidates_weak,
                )

        try:
            answer = finalize_and_verify_raw_lab(
                selected_answer,
                request,
                system=system,
                history=history,
                generate_repair=generate_repair,
                deadline=deadline,
            )
        except DeepPlusTimeout:
            finalized, ok = _deterministic_finish(
                selected_answer,
                request=request,
                system=system,
                history=history,
                generate_repair=generate_repair,
                contract=contract,
            )
            if ok:
                return finalized, _metadata(
                    contract=contract,
                    used=True,
                    selected_index=selected_index,
                    revised=revised,
                    fallback_reason=None,
                    latency_ms=deadline.elapsed_ms(),
                    all_candidates_weak=verdict.all_candidates_weak,
                    final_contract_passed=True,
                )
            return _fallback(
                "timeout",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
                selected_index=selected_index,
                revised=revised,
                all_candidates_weak=verdict.all_candidates_weak,
            )

        if not answer:
            return _fallback(
                "revision_failed" if revised else "candidate_generation_failed",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
                selected_index=selected_index,
                revised=revised,
                all_candidates_weak=verdict.all_candidates_weak,
            )

        issues = check_answer_contract_satisfaction(
            answer,
            contract,
            request.message,
            request.thread_state,
        )
        if issues:
            answer = finalize_raw_lab_answer(
                answer,
                request.thread_state,
                request.message,
                recent_turns=request.recent_turns,
            )
            issues = check_answer_contract_satisfaction(
                answer,
                contract,
                request.message,
                request.thread_state,
            )
        if issues:
            return _fallback(
                "final_contract_failed",
                contract=contract,
                deadline=deadline,
                run_deep_fallback=run_deep_fallback,
                selected_index=selected_index,
                revised=revised,
                all_candidates_weak=verdict.all_candidates_weak,
                final_contract_failures=issues,
            )

        return answer, _metadata(
            contract=contract,
            used=True,
            selected_index=selected_index,
            revised=revised,
            fallback_reason=None,
            latency_ms=deadline.elapsed_ms(),
            all_candidates_weak=verdict.all_candidates_weak,
            final_contract_passed=True,
        )
    except Exception:
        logger.exception("raw_lab deep_plus unexpected failure")
        return _fallback(
            "final_contract_failed",
            contract=contract,
            deadline=deadline,
            run_deep_fallback=run_deep_fallback,
            selected_index=selected_index,
            revised=revised,
            all_candidates_weak=verdict.all_candidates_weak if verdict else None,
        )

