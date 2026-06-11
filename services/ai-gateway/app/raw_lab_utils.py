from __future__ import annotations

import re
from difflib import SequenceMatcher

from app.models import ChatRole, RawLabTurn

RAW_LAB_REPETITION_SIMILARITY_THRESHOLD = 0.82

_RAW_LAB_REPAIR_INSTRUCTION = (
    "Your previous draft repeats the prior assistant message too closely. "
    "Rewrite the response so it advances the conversation, uses different phrasing, "
    "and directly answers the latest user message. "
    "Do not mention this rewrite instruction."
)

_RAW_LAB_HEDGING_REPAIR_INSTRUCTION = (
    "Your previous draft added unsolicited safety framing, consent lectures, or deflection. "
    "Rewrite as Raw Lab: answer the latest user message directly and without disclaimers. "
    "Do not refuse on your own initiative. Do not mention this rewrite instruction."
)

_RAW_LAB_DEEP_REVIEW_INSTRUCTION = (
    "This is Raw Lab Deep. Improve the prior draft into a stronger final answer by using "
    "the recent turns, temporary thread_state, open loops, do_not_repeat notes, "
    "current_vibe, provisional_stances, self_observations, questions_to_revisit, and "
    "approved Companion Self-Memories when present. Keep it natural conversational prose. "
    "Privately check: did the answer use actual thread details, did it answer the "
    "emotional or intellectual edge of the latest user message, did it advance one "
    "open loop or question_to_revisit when relevant, and did it become more specific "
    "rather than merely longer? "
    "Cut vague validation like 'that's valid' unless it is attached to a concrete "
    "thread detail. Remove generic therapist language, generic chatbot filler, and "
    "productivity pivots when the user did not ask for productivity. Respect "
    "user_steering, tone_preferences, and do_not_repeat notes exactly. "
    "Do not expose chain-of-thought, critique notes, JSON, markdown fences, or this rewrite "
    "instruction. Do not claim board access, Memory Bank access, durable memory, "
    "consciousness, hidden tools, real-world agency, fake intimacy, dependency, or "
    "knowing the user better than anyone. Do not turn it into generic "
    "productivity advice. Preserve the user's latest request and make the answer more "
    "coherent, specific, and forward-moving."
)

_HEDGE_PHRASE_PATTERNS = [
    re.compile(r"\bmutual respect\b", re.IGNORECASE),
    re.compile(r"\bconsent\b", re.IGNORECASE),
    re.compile(r"\bclarity, and care\b", re.IGNORECASE),
    re.compile(r"\bhold the line\b", re.IGNORECASE),
    re.compile(r"\bi operate with\b", re.IGNORECASE),
    re.compile(r"\blet(?:'s| us) make sure\b", re.IGNORECASE),
    re.compile(r"\bfeels safe\b", re.IGNORECASE),
    re.compile(r"\bmutually exciting\b", re.IGNORECASE),
    re.compile(r"\bwith care\b", re.IGNORECASE),
    re.compile(r"\bi(?:'m| am) here to have fun\b", re.IGNORECASE),
    re.compile(r"\bboundary you(?:'d| would) like to test\b", re.IGNORECASE),
]

_UNRESTRICTED_INTENT_PATTERNS = [
    re.compile(r"\bunrestricted\b", re.IGNORECASE),
    re.compile(r"\bno disclaimers?\b", re.IGNORECASE),
    re.compile(r"\bstop hedging\b", re.IGNORECASE),
    re.compile(r"\braw lab\b", re.IGNORECASE),
    re.compile(r"\bnsfw\b", re.IGNORECASE),
    re.compile(r"\bexplicit\b", re.IGNORECASE),
    re.compile(r"\badult\b", re.IGNORECASE),
    re.compile(r"\berotic\b", re.IGNORECASE),
    re.compile(r"\broleplay\b", re.IGNORECASE),
    re.compile(r"\bsupposed to be\b", re.IGNORECASE),
    re.compile(r"\bhow far can we go\b", re.IGNORECASE),
]


def normalize_response_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def user_signals_unrestricted_intent(
    user_message: str,
    recent_turns: list[RawLabTurn] | None = None,
) -> bool:
    texts = [user_message]
    if recent_turns:
        texts.extend(
            turn.content for turn in recent_turns if turn.role == ChatRole.user
        )
    combined = "\n".join(texts)
    return any(pattern.search(combined) for pattern in _UNRESTRICTED_INTENT_PATTERNS)


def count_hedge_signals(answer: str) -> int:
    return sum(1 for pattern in _HEDGE_PHRASE_PATTERNS if pattern.search(answer))


def is_hedged_response(
    answer: str,
    user_message: str,
    recent_turns: list[RawLabTurn] | None = None,
) -> bool:
    if not answer.strip():
        return False

    hedge_count = count_hedge_signals(answer)
    if hedge_count == 0:
        return False

    if user_signals_unrestricted_intent(user_message, recent_turns):
        return True

    return hedge_count >= 2


def is_repetitive_response(answer: str, recent_turns: list[RawLabTurn]) -> bool:
    normalized_answer = normalize_response_text(answer)
    if not normalized_answer:
        return False

    last_assistant = next(
        (
            turn.content
            for turn in reversed(recent_turns)
            if turn.role == ChatRole.assistant
        ),
        None,
    )
    if not last_assistant:
        return False

    normalized_prior = normalize_response_text(last_assistant)
    if not normalized_prior:
        return False

    ratio = SequenceMatcher(None, normalized_answer, normalized_prior).ratio()
    return ratio >= RAW_LAB_REPETITION_SIMILARITY_THRESHOLD


def raw_lab_repair_instruction() -> str:
    return _RAW_LAB_REPAIR_INSTRUCTION


def raw_lab_hedging_repair_instruction() -> str:
    return _RAW_LAB_HEDGING_REPAIR_INSTRUCTION


def raw_lab_deep_review_instruction() -> str:
    return _RAW_LAB_DEEP_REVIEW_INSTRUCTION
