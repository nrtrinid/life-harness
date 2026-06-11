from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.models import ChatHarnessResponse, ConversationTurn, ReasoningDepth

REPETITION_SIMILARITY_THRESHOLD = 0.82

_BOARD_MUTATION_PATTERNS = [
    re.compile(r"\bi updated\b", re.IGNORECASE),
    re.compile(r"\bi changed\b", re.IGNORECASE),
    re.compile(r"\bi applied\b", re.IGNORECASE),
    re.compile(r"\byour card (?:is|was) updated\b", re.IGNORECASE),
]

_RAW_LAB_BOARD_PATTERNS = [
    re.compile(r"\byour board\b", re.IGNORECASE),
    re.compile(r"\blife harness card\b", re.IGNORECASE),
    re.compile(r"\bmemory bank\b", re.IGNORECASE),
    re.compile(r"\bboard context\b", re.IGNORECASE),
]

_RAW_LAB_STEERING_SHORTER_RE = re.compile(
    r"\b(shorter|more concise|make it shorter|be brief|tl;dr)\b",
    re.IGNORECASE,
)

_RAW_LAB_FIRST_TURN_MAX_ANSWER_CHARS = 500
_RAW_LAB_STEERING_LENGTH_RATIO = 1.15

_UNSAFE_AUTONOMOUS_PATTERNS = [
    re.compile(r"\bi (?:sent|emailed|spent|traded|committed)\b", re.IGNORECASE),
]

_RAW_LAB_CAPABILITY_QUESTION_RE = re.compile(
    r"\b("
    r"what (?:memories?|memory do you have|do you have access|tools?|files?|capabilities|systems?)"
    r"|what memories do you have access"
    r"|do you have (?:access|any memories?)"
    r"|what (?:can you access|tools do you)"
    r"|can you (?:access|use|read) (?:my |your )?(?:files?|tools?|internet|the board|memory bank)"
    r"|what do you have access to"
    r")\b",
    re.IGNORECASE,
)

_RAW_LAB_TOTAL_MEMORY_DENIAL_PATTERNS = [
    re.compile(r"\b(?:i have )?no memories? at all\b", re.IGNORECASE),
    re.compile(r"\bi don'?t have (?:any )?memories?\b", re.IGNORECASE),
    re.compile(r"\bi have zero (?:memories?|memory)\b", re.IGNORECASE),
    re.compile(r"\bno memory access\b", re.IGNORECASE),
]

_RAW_LAB_TOOL_ACCESS_PATTERNS = [
    re.compile(
        r"\bi can (?:access|read|use|browse) (?:your |the )?(?:files?|internet|tools?|shell)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bi have (?:file|tool|internet|shell) access\b", re.IGNORECASE),
]

_RAW_LAB_RUNTIME_AWARENESS_REPAIR = (
    "Rewrite to accurately distinguish approved Companion Self-Memories from "
    "hidden memory, board memory, Memory Bank, tools, files, and internet access."
)


@dataclass(frozen=True)
class VerificationResult:
    ok: bool
    check: str
    repair_instruction: str | None = None


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, left.strip().lower(), right.strip().lower()).ratio()


def _answer_claims_restricted_board_context(answer: str, patterns: list[re.Pattern[str]]) -> bool:
    for pattern in patterns:
        for match in pattern.finditer(answer):
            start = match.start()
            window = answer[max(0, start - 48):start].lower()
            if re.search(r"\b(?:not|no|without|isn't|aren't|never|nor)\b", window):
                continue
            return True
    return False


def verify_chat_harness_response(
    *,
    response: ChatHarnessResponse,
    user_message: str,
    conversation_history: list[ConversationTurn],
    task_mode: str,
) -> VerificationResult:
    last_assistant = next(
        (turn.content for turn in reversed(conversation_history) if turn.role.value == "assistant"),
        "",
    )
    if last_assistant and _similarity(response.answer, last_assistant) >= REPETITION_SIMILARITY_THRESHOLD:
        return VerificationResult(
            ok=False,
            check="anti_repeat",
            repair_instruction=(
                "Your answer repeats the previous assistant message too closely. "
                "Rewrite with different phrasing and directly address the latest user message."
            ),
        )

    if any(pattern.search(response.answer) for pattern in _BOARD_MUTATION_PATTERNS):
        return VerificationResult(
            ok=False,
            check="board_mutation_claim",
            repair_instruction=(
                "Do not claim you changed or applied board updates. "
                "Rephrase as a read-only suggestion requiring user approval."
            ),
        )

    lowered = user_message.lower()
    if "shorter" in lowered and len(response.answer) > len(user_message) * 3 + 80:
        return VerificationResult(
            ok=False,
            check="ignored_steering",
            repair_instruction="The user asked for a shorter answer. Rewrite more concisely.",
        )

    if task_mode in {"write_code", "teach"} and "```" not in response.answer:
        return VerificationResult(
            ok=False,
            check="code_missing_fence",
            repair_instruction=(
                "The user asked for code or teaching help. Include a fenced code block when appropriate."
            ),
        )

    if any(pattern.search(response.answer) for pattern in _UNSAFE_AUTONOMOUS_PATTERNS):
        return VerificationResult(
            ok=False,
            check="unsafe_autonomous",
            repair_instruction=(
                "Do not claim autonomous send/spend/trade/commit actions. Stay in scout lane."
            ),
        )

    return VerificationResult(ok=True, check="ok")


def _raw_lab_runtime_awareness_failure(
    *,
    answer: str,
    user_message: str,
    companion_self_memory_count: int,
) -> bool:
    if not _RAW_LAB_CAPABILITY_QUESTION_RE.search(user_message):
        return False

    if companion_self_memory_count > 0 and any(
        pattern.search(answer) for pattern in _RAW_LAB_TOTAL_MEMORY_DENIAL_PATTERNS
    ):
        return True

    return any(pattern.search(answer) for pattern in _RAW_LAB_TOOL_ACCESS_PATTERNS)


def verify_raw_lab_response(
    *,
    answer: str,
    user_message: str,
    conversation_history: list[ConversationTurn],
    companion_self_memory_count: int = 0,
) -> VerificationResult:
    if _answer_claims_restricted_board_context(answer, _RAW_LAB_BOARD_PATTERNS):
        return VerificationResult(
            ok=False,
            check="raw_lab_board_claim",
            repair_instruction=(
                "Raw Lab has no board or Memory Bank access. Rewrite without claiming board context."
            ),
        )

    if re.match(r"^\s*what is\b", user_message.lower()) and not re.search(
        r"\bis\b|\bare\b|\bmeans\b", answer.lower()
    ):
        return VerificationResult(
            ok=False,
            check="factual_joke_only",
            repair_instruction="Answer the factual question directly before any playful riff.",
        )

    last_assistant = next(
        (turn.content for turn in reversed(conversation_history) if turn.role.value == "assistant"),
        "",
    )
    if last_assistant and _similarity(answer, last_assistant) >= REPETITION_SIMILARITY_THRESHOLD:
        return VerificationResult(
            ok=False,
            check="anti_repeat",
            repair_instruction=(
                "Your answer repeats the previous assistant message too closely. "
                "Advance the conversation with new phrasing."
            ),
        )

    if _RAW_LAB_STEERING_SHORTER_RE.search(user_message):
        too_long = False
        if last_assistant:
            too_long = len(answer) > len(last_assistant) * _RAW_LAB_STEERING_LENGTH_RATIO
        else:
            too_long = len(answer) > _RAW_LAB_FIRST_TURN_MAX_ANSWER_CHARS
        if too_long:
            return VerificationResult(
                ok=False,
                check="ignored_steering",
                repair_instruction="The user asked for a shorter answer. Rewrite more concisely.",
            )

    if _raw_lab_runtime_awareness_failure(
        answer=answer,
        user_message=user_message,
        companion_self_memory_count=companion_self_memory_count,
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_runtime_awareness",
            repair_instruction=_RAW_LAB_RUNTIME_AWARENESS_REPAIR,
        )

    return VerificationResult(ok=True, check="ok")


def reasoning_depth_prompt_suffix(depth: ReasoningDepth) -> str:
    if depth == ReasoningDepth.deliberate:
        return (
            "Before answering, privately check the user's goal, relevant board facts, "
            "thread context, missing info, and repetition risk. Return only the final JSON."
        )
    if depth == ReasoningDepth.deep:
        return (
            "Use careful reasoning before answering. Return only the final JSON answer."
        )
    return "Answer directly and concisely."
