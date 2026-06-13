from __future__ import annotations

import re

from app.models import (
    RawLabThreadReflectionProposal,
    RawLabThreadReflectionRequest,
    RawLabThreadReflectionResponse,
)
from app.raw_lab_utils import (
    _DEFERRAL_ECHO_PHRASES,
    deferral_steering_active,
    repeated_deferral_evidence,
)

_HANDOFF_STEERING_RE = re.compile(
    r"\b("
    r"don'?t ask (?:me )?(?:handoff|what'?s next)"
    r"|stop asking handoff"
    r"|avoid reflexive handoff"
    r"|carry (?:the )?thread forward"
    r"|carry the conversation yourself"
    r"|be more independent"
    r"|think for yourself"
    r"|stop checking in"
    r"|don'?t hand it back"
    r"|killing the mood"
    r"|no what'?s next"
    r")\b",
    re.I,
)

_INDEPENDENCE_STEERING_RE = re.compile(
    r"\b(be more independent|think for yourself|carry the conversation yourself)\b",
    re.I,
)

_CONSENT_DRIFT_PHRASES = (
    "i don't wait for permission",
    "i just do",
)

_HANDOFF_PHRASES = (
    "what's next",
    "what's your take",
    "where should we go",
    "what should i do",
    "ready to pivot",
    "what's on your mind",
    "where do you want to begin",
    "tell me where you want to start",
    "i'm all ears",
)

_RAW_ASSISTANT_ECHO_RE = re.compile(
    r"\b("
    r"got it\b|"
    r"^bro\b|"
    r"sure thing|"
    r"you'?re welcome|"
    r"got it,? no handoffs?|"
    r"i'?m ready|"
    r"let'?s see where this goes|"
    r"i'?m all ears|"
    r"ready to see|"
    r"what do you want me to do|"
    r"i hear you|"
    r"that'?s valid|"
    r"you'?re absolutely right|"
    r"happy to help"
    r")\b",
    re.I,
)

_MALFORMED_STANCE_RE = re.compile(
    r"^provisional stance:\s*exploring whether\b",
    re.I,
)

_HOSTILE_OR_INSULT_RE = re.compile(
    r"\b(you'?re dumb|you are dumb|stupid|idiot|worthless|shut up)\b",
    re.I,
)

_BUILD_INTENT_RE = re.compile(
    r"\b(code|python|script|skeleton|implementation|prototype|artifact|build|project|game|plan)\b",
    re.I,
)

_FALSE_EXECUTION_RE = re.compile(
    r"\b(ran the code|run the code|actually execute|did you run|claim you ran)\b",
    re.I,
)

_HANDOFF_INDEPENDENCE_RE = re.compile(
    r"\b(handoff|independent|initiative|what'?s next|stop checking in)\b",
    re.I,
)

_NAMING_RAW_LAB_RE = re.compile(
    r"\b(call you|your name|name (?:you|raw lab)|(?:lily|luna)\b|name (?:for )?raw lab)\b",
    re.I,
)

_REVISIT_QUESTION_RE = re.compile(
    r"\b(come back to|revisit|circle back|what were we circling|what are we circling)\b",
    re.I,
)

_STANCE_ARTIFACT = (
    "Raw Lab should produce the next concrete artifact once the user has approved a build direction."
)
_STANCE_FALSE_EXECUTION = (
    "Raw Lab should not claim code ran unless it actually executed code."
)
_STANCE_HANDOFF_ENGAGEMENT = (
    "Engagement should come from carrying a thread forward, not reflexive check-in questions."
)

_COMPACT_DO_NOT_REPEAT = frozenset(
    phrase.lower()
    for phrase in (
        "what's next",
        "whats next",
        "what's your take",
        "ready to pivot",
        "i'm all ears",
        "ready to see it",
        "what's on your mind",
    )
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


def _is_deferral_echo(item: str) -> bool:
    lowered = item.lower()
    return any(phrase in lowered for phrase in _DEFERRAL_ECHO_PHRASES)


def _is_noisy_assistant_snippet(item: str) -> bool:
    compact = item.strip()
    if not compact:
        return False
    if "```" in compact:
        return True
    if len(compact) > 220:
        return True
    return bool(_RAW_ASSISTANT_ECHO_RE.search(compact))


def _is_compact_do_not_repeat(item: str) -> bool:
    key = " ".join(item.strip().lower().split()).rstrip("?.!")
    return any(key == phrase or key.startswith(f"{phrase} ") for phrase in _COMPACT_DO_NOT_REPEAT)


def _extract_exploring_payload(text: str) -> str:
    match = re.match(r"^provisional stance:\s*exploring whether\s+(.+)$", text.strip(), re.I)
    payload = match.group(1) if match else text
    return payload.strip().rstrip("?.!")


def _extract_raw_lab_name_candidate(text: str) -> str | None:
    match = re.search(r"\b(lily|luna)\b", text, re.I)
    if not match:
        return None
    name = match.group(1).capitalize()
    return f"Potential temporary name candidate for Raw Lab: {name}."


def _normalize_provisional_stance(text: str) -> str | None:
    payload = _extract_exploring_payload(text)
    if not payload or _HOSTILE_OR_INSULT_RE.search(payload):
        return None
    if _NAMING_RAW_LAB_RE.search(payload) or re.search(r"\b(lily|luna)\b", payload, re.I):
        return _extract_raw_lab_name_candidate(payload)
    if _FALSE_EXECUTION_RE.search(payload):
        return _STANCE_FALSE_EXECUTION
    if _HANDOFF_INDEPENDENCE_RE.search(payload):
        return _STANCE_HANDOFF_ENGAGEMENT
    if _BUILD_INTENT_RE.search(payload):
        return _STANCE_ARTIFACT
    if _MALFORMED_STANCE_RE.search(text):
        return None
    stripped = re.sub(r"^provisional stance:\s*", "", text.strip(), flags=re.I).strip()
    if len(stripped) >= 24 and not _is_noisy_assistant_snippet(stripped):
        return stripped[:220]
    return None


def _is_malformed_provisional_stance(text: str) -> bool:
    compact = text.strip()
    if not compact:
        return False
    if _MALFORMED_STANCE_RE.search(compact):
        return True
    if _is_noisy_assistant_snippet(compact):
        return True
    if compact.endswith("?") and not _REVISIT_QUESTION_RE.search(compact):
        return True
    return False


def _is_raw_user_question_memory(text: str) -> bool:
    compact = text.strip()
    if not compact.endswith("?"):
        return False
    if _REVISIT_QUESTION_RE.search(compact):
        return False
    if re.match(r"^how (does|should|do|can|would)\b", compact, re.I):
        return False
    if len(compact) >= 80:
        return False
    return len(compact) < 120


def _safe_list(items: list[str], *, allow_do_not_repeat: bool = False) -> list[str]:
    safe: list[str] = []
    for item in items:
        if _is_deferral_echo(item):
            continue
        if _is_noisy_assistant_snippet(item) and not (
            allow_do_not_repeat and _is_compact_do_not_repeat(item)
        ):
            continue
        if not any(pattern.search(item) for pattern in _FORBIDDEN_REFLECTION_PATTERNS):
            _append_unique(safe, item)
    return safe


def _safe_self_observations(items: list[str]) -> list[str]:
    safe: list[str] = []
    for item in items:
        if _is_noisy_assistant_snippet(item) or _is_deferral_echo(item):
            continue
        if re.search(
            r"^i'?m noticing i adjust when you steer me toward\b",
            item.strip(),
            re.I,
        ):
            continue
        if not any(pattern.search(item) for pattern in _FORBIDDEN_REFLECTION_PATTERNS):
            _append_unique(safe, item)
    return safe


def _safe_provisional_stances(items: list[str]) -> list[str]:
    safe: list[str] = []
    for item in items:
        if _is_malformed_provisional_stance(item):
            normalized = _normalize_provisional_stance(item)
            if normalized:
                _append_unique(safe, normalized)
            continue
        normalized = _normalize_provisional_stance(item)
        if normalized:
            _append_unique(safe, normalized)
    return safe


_THIN_VAGUE_OPEN_LOOP_RE = re.compile(
    r"^(can you make it better|make it better|can you\b|what about\b|how about\b)",
    re.I,
)

_ALIVE_PERSONA_OPEN_LOOP_RE = re.compile(
    r"\b(alive|persona|entity|visible state|feel alive|feel more alive)\b",
    re.I,
)

_SUBSTANTIVE_OPEN_LOOP_RE = re.compile(
    r"\b(whether|how (does|should|do|can|would)|should feel|instead of|through|versus|vs\.?)\b",
    re.I,
)


def _is_substantive_open_loop(text: str) -> bool:
    compact = text.strip()
    if len(compact) >= 72:
        return True
    return bool(_SUBSTANTIVE_OPEN_LOOP_RE.search(compact))


def _is_thin_vague_open_loop(text: str) -> bool:
    compact = text.strip()
    if not compact or _is_substantive_open_loop(compact):
        return False
    if _THIN_VAGUE_OPEN_LOOP_RE.search(compact):
        return True
    if len(compact.split()) <= 5 and re.search(
        r"\b(we need|next|can we get|how would|still need|what about|can you)\b",
        compact,
        re.I,
    ):
        return True
    return len(compact) < 40


def _distill_open_loop_to_revisit(
    loop: str,
    *,
    recurring_topics: list[str],
) -> str | None:
    compact = " ".join(loop.strip().split())
    if not compact or _is_noisy_assistant_snippet(compact):
        return None
    if _is_thin_vague_open_loop(compact):
        if _ALIVE_PERSONA_OPEN_LOOP_RE.search(compact):
            return (
                "Still circling whether Raw Lab should feel alive through visible state "
                "or stronger persona prompting."
            )
        if recurring_topics:
            return f"Still circling {recurring_topics[0]} in this thread."
        return "Still circling an unresolved direction in this thread."
    return compact[:220]


def _safe_questions_to_revisit(items: list[str]) -> list[str]:
    safe: list[str] = []
    for item in items:
        if _is_raw_user_question_memory(item):
            continue
        if _is_noisy_assistant_snippet(item):
            continue
        if not any(pattern.search(item) for pattern in _FORBIDDEN_REFLECTION_PATTERNS):
            _append_unique(safe, item)
    return safe


def _safe_do_not_repeat(items: list[str]) -> list[str]:
    safe: list[str] = []
    for item in items:
        if _is_noisy_assistant_snippet(item) and not (
            _is_compact_do_not_repeat(item) or _is_deferral_echo(item)
        ):
            continue
        if not any(pattern.search(item) for pattern in _FORBIDDEN_REFLECTION_PATTERNS):
            _append_unique(safe, item[:120])
    return safe


def _distilled_not_raw(item: str) -> bool:
    return not _is_noisy_assistant_snippet(item) and not _is_malformed_provisional_stance(item)


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
        _append_unique(user_steering, state.user_steering[0])

    if request.companion_self_memories:
        memory = request.companion_self_memories[0]
        _append_unique(
            self_observations,
            f"I'm noticing an approved self-memory shapes this chat: {memory.text[:140]}",
        )

    for loop in state.open_loops[:2]:
        distilled = _distill_open_loop_to_revisit(
            loop,
            recurring_topics=state.recurring_topics,
        )
        if distilled:
            _append_unique(questions_to_revisit, distilled)
    for question in state.questions_to_revisit[:2]:
        _append_unique(questions_to_revisit, question)
    for user_message in recent_user[-4:]:
        if _REVISIT_QUESTION_RE.search(user_message):
            _append_unique(questions_to_revisit, user_message)

    for stance in state.provisional_stances[:2]:
        if _distilled_not_raw(stance):
            _append_unique(provisional_stances, stance)

    if repeated_deferral_evidence(request.recent_turns) or deferral_steering_active(
        request.recent_turns
    ):
        _append_unique(
            self_observations,
            "I'm noticing I tend to ask permission when I should produce the next concrete artifact.",
        )
        _append_unique(
            user_steering,
            "When the user asks to see code, output, or a plan after approving a direction, make a small assumption and show the artifact.",
        )
        for phrase in _DEFERRAL_ECHO_PHRASES:
            _append_unique(do_not_repeat, phrase)

    if _HANDOFF_STEERING_RE.search(recent_text):
        _append_unique(user_steering, "avoid reflexive handoff questions")
        _append_unique(user_steering, "carry one relevant thread forward")
        _append_unique(
            self_observations,
            "I'm noticing I tend to ask for direction after claiming autonomy in this thread.",
        )
        if _INDEPENDENCE_STEERING_RE.search(recent_text):
            _append_unique(
                user_steering,
                "carry the scene forward while respecting explicit boundaries",
            )
            for phrase in _CONSENT_DRIFT_PHRASES:
                _append_unique(do_not_repeat, phrase)
        for phrase in _HANDOFF_PHRASES:
            _append_unique(do_not_repeat, phrase)
        if "initiative" in recent_text or "independent" in recent_text:
            _append_unique(
                questions_to_revisit,
                "Can Raw Lab become engaging through initiative instead of constant questions?",
            )
    if re.search(r"\b(lily|luna)\b", recent_text) and re.search(
        r"\b(call you|your name|name (?:you|raw lab))\b",
        recent_text,
        re.I,
    ):
        candidate = _extract_raw_lab_name_candidate(recent_text)
        if candidate:
            _append_unique(provisional_stances, candidate)
    elif "raw lab" in recent_text and ("entity" in recent_text or "personality" in recent_text):
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
        self_observations=_safe_self_observations(self_observations),
        questions_to_revisit=_safe_questions_to_revisit(questions_to_revisit),
        provisional_stances=_safe_provisional_stances(provisional_stances),
        current_vibe=current_vibe
        if current_vibe and not any(pattern.search(current_vibe) for pattern in _FORBIDDEN_REFLECTION_PATTERNS)
        else "",
        do_not_repeat=_safe_do_not_repeat(do_not_repeat),
        user_steering=_safe_list(user_steering),
    )
    return RawLabThreadReflectionResponse(
        proposals=proposals,
        safety_notes=[],
        used_context=False,
    )
