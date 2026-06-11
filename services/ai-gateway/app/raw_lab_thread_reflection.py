from __future__ import annotations

import re

from app.models import (
    RawLabThreadReflectionProposal,
    RawLabThreadReflectionRequest,
    RawLabThreadReflectionResponse,
)

_FORBIDDEN_REFLECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(conscious|sentient|self-aware|alive)\b", re.I),
    re.compile(r"\b(only i understand you|you need me)\b", re.I),
    re.compile(r"\b(diagnos|trauma response|attachment style)\b", re.I),
    re.compile(r"\b(memory bank|board context|saved permanently|auto.?save)\b", re.I),
]


def _append_unique(items: list[str], item: str, cap: int = 5) -> None:
    compact = " ".join(item.strip().split())
    if not compact:
        return
    lowered = compact.lower()
    if any(existing.lower() == lowered for existing in items):
        return
    items.append(compact[:220])
    del items[cap:]


def _safe_list(items: list[str]) -> list[str]:
    safe: list[str] = []
    for item in items:
        if not any(pattern.search(item) for pattern in _FORBIDDEN_REFLECTION_PATTERNS):
            _append_unique(safe, item)
    return safe


def mock_thread_reflection(
    request: RawLabThreadReflectionRequest,
) -> RawLabThreadReflectionResponse:
    state = request.thread_state
    recent_user = [
        turn.content.strip()
        for turn in request.recent_turns[-8:]
        if turn.role.value == "user" and turn.content.strip()
    ]
    recent_text = "\n".join(recent_user).lower()

    self_observations: list[str] = []
    questions_to_revisit: list[str] = []
    provisional_stances: list[str] = []
    do_not_repeat: list[str] = []
    user_steering: list[str] = []
    current_vibe = state.current_vibe

    if state.recurring_topics:
        _append_unique(
            self_observations,
            f"I'm noticing I tend to circle {state.recurring_topics[0]} with you in this thread.",
        )
    elif "identity" in recent_text or "personality" in recent_text:
        _append_unique(
            self_observations,
            "I'm noticing I tend to treat identity as an evolving thread pattern, not a fixed claim.",
        )

    if state.user_steering:
        _append_unique(
            self_observations,
            f"I'm noticing I adjust when you steer me toward {state.user_steering[0]}.",
        )
        _append_unique(user_steering, state.user_steering[0])

    if request.companion_self_memories:
        memory = request.companion_self_memories[0]
        _append_unique(
            self_observations,
            f"I'm noticing an approved self-memory shapes this chat: {memory.text[:140]}",
        )

    for loop in state.open_loops[:2]:
        _append_unique(questions_to_revisit, loop)
    for question in state.questions_to_revisit[:2]:
        _append_unique(questions_to_revisit, question)
    for user_message in recent_user[-4:]:
        if "?" in user_message or re.search(r"\b(circle back|revisit|come back)\b", user_message, re.I):
            _append_unique(questions_to_revisit, user_message)

    for stance in state.provisional_stances[:2]:
        _append_unique(provisional_stances, stance)
    if "raw lab" in recent_text and ("entity" in recent_text or "personality" in recent_text):
        _append_unique(
            provisional_stances,
            "Provisional stance: Raw Lab can feel more coherent through inspectable temporary state.",
        )

    repeat_match = re.search(
        r"\b(?:don't|dont|stop)\s+(?:keep\s+)?(?:saying|calling it|using)\s+['\"]?([^'\"\n.?!]{3,80})",
        "\n".join(recent_user),
        re.I,
    )
    if repeat_match:
        _append_unique(do_not_repeat, repeat_match.group(1))
    for phrase in state.do_not_repeat[:2]:
        _append_unique(do_not_repeat, phrase)

    if not current_vibe:
        if state.recurring_topics:
            current_vibe = (
                "Current vibe in this chat: reflective, exploratory, circling "
                f"{state.recurring_topics[0]}."
            )
        elif "playful" in recent_text or "weird" in recent_text:
            current_vibe = "Current vibe in this chat: playful, emergent, and still bounded."
        elif recent_user:
            current_vibe = "Current vibe in this chat: reflective and continuity-seeking."

    proposals = RawLabThreadReflectionProposal(
        self_observations=_safe_list(self_observations),
        questions_to_revisit=_safe_list(questions_to_revisit),
        provisional_stances=_safe_list(provisional_stances),
        current_vibe=current_vibe
        if current_vibe and not any(pattern.search(current_vibe) for pattern in _FORBIDDEN_REFLECTION_PATTERNS)
        else "",
        do_not_repeat=_safe_list(do_not_repeat),
        user_steering=_safe_list(user_steering),
    )
    return RawLabThreadReflectionResponse(
        proposals=proposals,
        safety_notes=[],
        used_context=False,
    )
