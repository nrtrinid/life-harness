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


def normalize_response_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


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
