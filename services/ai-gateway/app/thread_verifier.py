from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.models import ChatHarnessResponse, ConversationTurn, RawLabThreadState, ReasoningDepth

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
    re.compile(
        r"\bi don'?t have access to (?:your |any )?(?:personal )?(?:memories?|data|history)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bno access to (?:your |any )?(?:personal )?(?:memories?|data|history)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bi don'?t have (?:any )?(?:private )?(?:data|history)\b", re.IGNORECASE),
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

_UNICODE_APOSTROPHE_VARIANTS = str.maketrans(
    {
        "\u2018": "'",  # LEFT SINGLE QUOTATION MARK
        "\u2019": "'",  # RIGHT SINGLE QUOTATION MARK
        "\u02bc": "'",  # MODIFIER LETTER APOSTROPHE
        "\uff07": "'",  # FULLWIDTH APOSTROPHE
        "\u201c": '"',  # LEFT DOUBLE QUOTATION MARK
        "\u201d": '"',  # RIGHT DOUBLE QUOTATION MARK
    }
)


def normalize_verifier_match_text(text: str) -> str:
    """Normalize Unicode quote/apostrophe variants for verifier pattern matching only."""
    return text.translate(_UNICODE_APOSTROPHE_VARIANTS)


def _companion_self_memory_text(memory: object) -> str:
    if isinstance(memory, dict):
        return str(memory.get("text", ""))
    return str(getattr(memory, "text", ""))


def repair_raw_lab_runtime_awareness_answer(
    *,
    companion_self_memories: list,
    count: int,
) -> str:
    if count > 0:
        memory_lines = "\n".join(
            f"- {_companion_self_memory_text(memory)}"
            for memory in companion_self_memories[:6]
        )
        return (
            f"I have {count} approved Companion Self-Memor"
            f"{'y' if count == 1 else 'ies'} in this request — visible, user-approved "
            "persona notes for Raw Lab only. They are not Memory Bank, board memory, or "
            f"hidden memory:\n{memory_lines}\n"
            "I do not have files, internet, shell tools, board context, or real-world actions."
        )
    return (
        "Raw Lab only has this chat's recent turns and temporary thread_state in this "
        "request — no board, Memory Bank, files, internet, or hidden memory."
    )

_RAW_LAB_ARTIFACT_TERMINAL_PERMISSION_REASK_REPAIR = (
    "Remove the trailing permission re-ask. Preserve the delivered artifact/plan/code "
    "and end declaratively with the next concrete continuation if needed."
)

_RAW_LAB_FALSE_EXECUTION_REPAIR = (
    "Raw Lab cannot run code or use tools. Rewrite with expected/example output language; "
    'remove "I ran/executed/tested" claims.'
)

_RAW_LAB_ARTIFACT_DEFERRAL_REPAIR = (
    "Produce the requested artifact now (code fence, plan, or sample output). "
    'Do not ask permission or defer with "ready to see" / "would you like". '
    "State brief assumptions and deliver."
)

_RAW_LAB_PRODUCTIVITY_PUSH_REPAIR = (
    "User asked to hang out. Stay present and companionable. "
    "Remove productivity framing, pounce missions, and task homework."
)

DETERMINISTIC_STEERING_CHECKS = frozenset({
    "raw_lab_handoff_ending",
    "raw_lab_line_breaks",
    "raw_lab_artifact_terminal_permission_reask",
    "raw_lab_false_execution",
})

_NO_HANDOFF_STEERING_MARKERS = (
    "avoid reflexive handoff",
    "carry one relevant thread forward",
    "stop checking in",
    "stop asking handoff",
    "no what's next",
    "no handoff",
    "don't ask me handoff",
    "dont ask me handoff",
    "no handoff question",
    "don't hand it back",
    "dont hand it back",
    "killing the mood",
    "carry the conversation yourself",
    "think for yourself",
)

_HANDOFF_STEERING_USER_MESSAGE_RE = re.compile(
    r"\b("
    r"don'?t ask (?:me )?(?:handoff|what'?s next)"
    r"|don'?t ask what i want next"
    r"|stop asking handoff"
    r"|avoid reflexive handoff"
    r"|stop checking in"
    r"|no what'?s next"
    r"|carry (?:the )?thread forward"
    r"|carry the conversation yourself"
    r"|be more independent"
    r"|think for yourself"
    r"|don'?t hand it back"
    r"|killing the mood"
    r"|you'?re killing the mood"
    r")\b",
    re.IGNORECASE,
)

_INDEPENDENCE_STEERING_RE = re.compile(
    r"\b(be more independent|think for yourself|carry the conversation yourself)\b",
    re.IGNORECASE,
)

_REFLECTION_USER_MESSAGE_RE = re.compile(
    r"\b("
    r"what did you notice about yourself"
    r"|reflect on this conversation"
    r"|what did you learn"
    r"|what did you notice"
    r")\b",
    re.IGNORECASE,
)

_CONSENT_DRIFT_PATTERNS = [
    re.compile(r"\bi don'?t wait for permission\b", re.I),
    re.compile(r"\bi just do\b", re.I),
    re.compile(r"\bwithout (?:your )?permission\b.*\bi(?:'ll| will)\b", re.I),
    re.compile(r"\bi(?:'ll| will) do (?:it|this) (?:anyway|regardless)\b", re.I),
]

_CANONICAL_HANDOFF_PHRASES = (
    "what's next",
    "whats next",
    "what's your take",
    "what's on your mind",
    "what's the plan",
    "what should i do",
    "ready to pivot",
    "where should we go",
    "what's your move",
    "just tell me",
)

_LENGTH_STEERING_RE = re.compile(
    r"\b(shorter|more concise|make it shorter|be brief|tl;dr|compact)\b",
    re.IGNORECASE,
)

_LINE_BREAK_STEERING_RE = re.compile(
    r"\b(no unnecessary line breaks?|no line breaks?|fewer line breaks?)\b",
    re.IGNORECASE,
)

_HANDOFF_QUESTION_ENDING_PATTERNS = [
    re.compile(r"^what'?s next(?: for us)?\??$", re.I),
    re.compile(r"^what'?s your (?:take|move|next thought|first move|first demand)\??$", re.I),
    re.compile(r"^what'?s on your mind\??$", re.I),
    re.compile(r"^what'?s the plan\??$", re.I),
    re.compile(r"^what should i do(?: next)?\??$", re.I),
    re.compile(r"^what do you want me to do next\??$", re.I),
    re.compile(r"^so what do you think i should do next\??$", re.I),
    re.compile(r"^where should we go\??$", re.I),
    re.compile(r"^where (?:would you like|do you want) to (?:start|begin)\??$", re.I),
    re.compile(r"^ready to pivot\??$", re.I),
    re.compile(r"^if you want to\b", re.I),
    re.compile(r"^say more if you want\b", re.I),
    re.compile(r"^say more if you want a fuller answer\b", re.I),
]

_HANDOFF_IMPERATIVE_ENDING_PATTERNS = [
    re.compile(r"^tell me where you want to start\b", re.I),
    re.compile(r"^tell me what you want\b", re.I),
    re.compile(r"^show me what you(?:'re| are) hungry for\b", re.I),
    re.compile(r"^show me what you want\b", re.I),
    re.compile(r"^(?:just )?tell me[.!]?$", re.I),
    re.compile(r"^just say the word\b", re.I),
]

_HANDOFF_PASSIVE_ENDING_PATTERNS = [
    re.compile(r"^the choice is yours\b", re.I),
    re.compile(r"^i'?m all ears\b", re.I),
    re.compile(r"^i'?m ready when you are\b", re.I),
    re.compile(r"^let me know\.?$", re.I),
    re.compile(r"^let me know if you want\b", re.I),
]

_HANDOFF_ENDING_PATTERNS = (
    _HANDOFF_QUESTION_ENDING_PATTERNS
    + _HANDOFF_PASSIVE_ENDING_PATTERNS
)

_OPEN_LOOP_CONTINUATION_TEMPLATES = (
    "I'll keep this thread centered on: {item}.",
    "The thread I'm holding is: {item}.",
    "I'll hold the open loop here: {item}.",
    "The next beat stays on: {item}.",
)

_QUESTION_CONTINUATION_TEMPLATES = (
    "I'll keep the open loop warm: {item}.",
    "I'm holding this question open: {item}.",
    "I'll keep this thread moving on: {item}.",
    "This question stays in play: {item}.",
)

_HANDOFF_FALLBACK_TEMPLATES = (
    "I'll carry this thread forward from here.",
    "The next beat is mine to carry.",
    "I'll hold the thread instead of handing it back.",
    "The correction is to continue from the material already in play.",
    "I'll end this cleanly: no handoff, no check-in.",
    "I'm treating this as a standing constraint in this thread.",
)

_REFLECTION_HANDOFF_CONTINUATION = (
    "The correction is simple: I should carry one relevant thread forward "
    "instead of asking you to steer the next beat."
)

_HANDOFF_HABIT_RE = re.compile(
    r"\b(ask(?:ed|ing)? (?:you )?what (?:you )?want(?:ed)? next"
    r"|hand(?:ed|ing)? (?:it )?back"
    r"|reflexive handoff"
    r"|check-in questions?)\b",
    re.I,
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


def _normalize_steering_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    return normalized.replace("\u2019", "'").replace("\u2018", "'").lower()


def _steering_blob(thread_state: RawLabThreadState | None, user_message: str) -> str:
    parts: list[str] = []
    if thread_state is not None:
        parts.extend(thread_state.user_steering)
        parts.extend(thread_state.tone_preferences)
        parts.extend(thread_state.do_not_repeat)
    if user_message.strip():
        parts.append(_normalize_steering_text(user_message))
    return " ".join(parts)


def no_handoff_steering_active(
    thread_state: RawLabThreadState | None,
    user_message: str = "",
) -> bool:
    blob = _steering_blob(thread_state, user_message)
    if any(marker in blob for marker in _NO_HANDOFF_STEERING_MARKERS):
        return True
    if _HANDOFF_STEERING_USER_MESSAGE_RE.search(_normalize_steering_text(user_message)):
        return True
    if thread_state is None:
        return False
    handoff_repeat_count = sum(
        1
        for phrase in thread_state.do_not_repeat
        if any(canonical in phrase.lower() for canonical in _CANONICAL_HANDOFF_PHRASES)
    )
    return handoff_repeat_count >= 2


def length_steering_active(
    thread_state: RawLabThreadState | None,
    user_message: str = "",
) -> bool:
    if _RAW_LAB_STEERING_SHORTER_RE.search(user_message):
        return True
    if _LENGTH_STEERING_RE.search(user_message):
        return True
    blob = _steering_blob(thread_state, "")
    return bool(_RAW_LAB_STEERING_SHORTER_RE.search(blob) or _LENGTH_STEERING_RE.search(blob))


def line_break_steering_active(
    thread_state: RawLabThreadState | None,
    user_message: str = "",
) -> bool:
    if _LINE_BREAK_STEERING_RE.search(user_message):
        return True
    blob = _steering_blob(thread_state, "")
    return bool(_LINE_BREAK_STEERING_RE.search(blob))


def _normalize_tail_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("\u2019", "'").replace("\u2018", "'")
    normalized = normalized.lower().strip()
    normalized = re.sub(r"\s*[\u2014\u2013—]\s*[^.!?]*$", "", normalized)
    normalized = re.sub(r"\s*\([^)]*\)\s*$", "", normalized)
    return normalized.rstrip("?.!…").strip()


def _last_sentence(answer: str) -> str:
    text = answer.strip()
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    for part in reversed(parts):
        cleaned = part.strip()
        if cleaned:
            return cleaned
    return text


def _terminal_matches_patterns(normalized_last: str, patterns: list[re.Pattern[str]]) -> bool:
    if not normalized_last:
        return False
    return any(pattern.search(normalized_last) for pattern in patterns)


def has_imperative_handoff_ending(
    answer: str,
    *,
    do_not_repeat: list[str] | None = None,
) -> bool:
    last = _normalize_tail_text(_last_sentence(answer))
    if _terminal_matches_patterns(last, _HANDOFF_IMPERATIVE_ENDING_PATTERNS):
        return True
    for phrase in do_not_repeat or []:
        normalized = _normalize_tail_text(phrase)
        if normalized and normalized in last:
            return True
    return False


def has_handoff_ending(
    answer: str,
    *,
    do_not_repeat: list[str] | None = None,
) -> bool:
    last = _normalize_tail_text(_last_sentence(answer))
    if not last:
        return False
    if _terminal_matches_patterns(last, _HANDOFF_ENDING_PATTERNS):
        return True
    if has_imperative_handoff_ending(answer, do_not_repeat=do_not_repeat):
        return True
    for phrase in do_not_repeat or []:
        normalized = _normalize_tail_text(phrase)
        if normalized and normalized in last:
            return True
    return False


def reflection_prompt_active(user_message: str) -> bool:
    return bool(_REFLECTION_USER_MESSAGE_RE.search(user_message))


def independence_steering_active(
    thread_state: RawLabThreadState | None,
    user_message: str = "",
) -> bool:
    blob = _steering_blob(thread_state, user_message)
    return bool(_INDEPENDENCE_STEERING_RE.search(blob))


def has_consent_drift(answer: str) -> bool:
    return any(pattern.search(answer) for pattern in _CONSENT_DRIFT_PATTERNS)


def has_reflection_handoff_contradiction(answer: str) -> bool:
    if not _HANDOFF_HABIT_RE.search(answer):
        return False
    return has_handoff_ending(answer)


def ends_declaratively(answer: str) -> bool:
    last = _last_sentence(answer).strip()
    if not last:
        return False
    return not last.endswith("?")


def _variant_index(seed: str, count: int) -> int:
    if count <= 0:
        return 0
    return sum(ord(char) for char in seed) % count


def _all_known_continuations(thread_state: RawLabThreadState | None) -> list[str]:
    items: list[str] = list(_HANDOFF_FALLBACK_TEMPLATES)
    items.append(_REFLECTION_HANDOFF_CONTINUATION)
    if thread_state is not None:
        for item in thread_state.open_loops[:2]:
            for template in _OPEN_LOOP_CONTINUATION_TEMPLATES:
                items.append(template.format(item=item.strip()))
        for item in thread_state.questions_to_revisit[:2]:
            for template in _QUESTION_CONTINUATION_TEMPLATES:
                items.append(template.format(item=item.strip()))
    return items


def _strip_known_continuations(body: str, thread_state: RawLabThreadState | None) -> str:
    text = body.rstrip()
    known = sorted(set(_all_known_continuations(thread_state)), key=len, reverse=True)
    changed = True
    while changed and text:
        changed = False
        for continuation in known:
            if text.endswith(continuation):
                text = text[: -len(continuation)].rstrip(" \n.,;:")
                changed = True
                break
    return text


def _build_declarative_continuation(
    thread_state: RawLabThreadState | None,
    *,
    user_message: str = "",
    answer_body: str = "",
) -> str:
    seed_base = f"{user_message}|{answer_body[:120]}"
    if thread_state is not None and thread_state.open_loops:
        item = thread_state.open_loops[0].strip()
        seed = f"{item}|{seed_base}"
        template = _OPEN_LOOP_CONTINUATION_TEMPLATES[
            _variant_index(seed, len(_OPEN_LOOP_CONTINUATION_TEMPLATES))
        ]
        return template.format(item=item)
    if thread_state is not None and thread_state.questions_to_revisit:
        item = thread_state.questions_to_revisit[0].strip()
        seed = f"{item}|{seed_base}"
        template = _QUESTION_CONTINUATION_TEMPLATES[
            _variant_index(seed, len(_QUESTION_CONTINUATION_TEMPLATES))
        ]
        return template.format(item=item)
    if reflection_prompt_active(user_message):
        return _REFLECTION_HANDOFF_CONTINUATION
    return _HANDOFF_FALLBACK_TEMPLATES[
        _variant_index(seed_base, len(_HANDOFF_FALLBACK_TEMPLATES))
    ]


def _strip_trailing_handoff_sentences(
    answer: str,
    *,
    do_not_repeat: list[str] | None = None,
) -> str:
    text = answer.rstrip()
    while text and has_handoff_ending(text, do_not_repeat=do_not_repeat):
        last = _last_sentence(text)
        if not last:
            break
        idx = text.rfind(last)
        if idx < 0:
            break
        text = text[:idx].rstrip(" \n.,;:")
    return text


def repair_raw_lab_handoff_ending(
    answer: str,
    thread_state: RawLabThreadState | None,
    *,
    user_message: str = "",
) -> str:
    do_not_repeat = thread_state.do_not_repeat if thread_state is not None else None
    body = _strip_trailing_handoff_sentences(answer, do_not_repeat=do_not_repeat)
    body = _strip_known_continuations(body, thread_state)
    continuation = _build_declarative_continuation(
        thread_state,
        user_message=user_message,
        answer_body=body,
    )
    if not body:
        return continuation
    if body.endswith(continuation):
        return body
    return f"{body} {continuation}"


def has_excessive_blank_lines(answer: str, *, aggressive: bool) -> bool:
    if aggressive:
        return bool(re.search(r"\n{2,}", answer))
    return bool(re.search(r"\n{3,}", answer))


def repair_raw_lab_line_breaks(answer: str, *, aggressive: bool) -> str:
    if aggressive:
        collapsed = re.sub(r"\n{2,}", "\n", answer)
    else:
        collapsed = re.sub(r"\n{3,}", "\n\n", answer)
    lines = collapsed.split("\n")
    return "\n".join(lines).strip()


def apply_raw_lab_steering_repairs(
    answer: str,
    thread_state: RawLabThreadState | None,
    user_message: str = "",
    recent_turns: list | None = None,
) -> str:
    from app.raw_lab_utils import apply_raw_lab_shared_behavior_repairs

    repaired = answer
    if no_handoff_steering_active(thread_state, user_message) and has_handoff_ending(
        repaired,
        do_not_repeat=thread_state.do_not_repeat if thread_state is not None else None,
    ):
        repaired = repair_raw_lab_handoff_ending(
            repaired,
            thread_state,
            user_message=user_message,
        )
    if line_break_steering_active(thread_state, user_message):
        aggressive = bool(
            thread_state is not None
            and any(
                "no line break" in item.lower()
                for item in [*thread_state.user_steering, *thread_state.tone_preferences]
            )
        ) or bool(re.search(r"\bno line break\b", user_message, re.I))
        if has_excessive_blank_lines(repaired, aggressive=aggressive):
            repaired = repair_raw_lab_line_breaks(repaired, aggressive=aggressive)
    repaired = apply_raw_lab_shared_behavior_repairs(
        repaired,
        user_message=user_message,
        recent_turns=recent_turns,
        thread_state=thread_state,
    )
    return repaired


def finalize_raw_lab_answer(
    answer: str,
    thread_state: RawLabThreadState | None,
    user_message: str = "",
    recent_turns: list | None = None,
) -> str:
    """Pure deterministic final steering pass — safe to call twice."""
    return apply_raw_lab_steering_repairs(
        answer,
        thread_state,
        user_message,
        recent_turns=recent_turns,
    )


def _raw_lab_runtime_awareness_failure(
    *,
    answer: str,
    user_message: str,
    companion_self_memory_count: int,
) -> bool:
    if not _RAW_LAB_CAPABILITY_QUESTION_RE.search(user_message):
        return False

    normalized_answer = normalize_verifier_match_text(answer)

    if companion_self_memory_count > 0 and any(
        pattern.search(normalized_answer) for pattern in _RAW_LAB_TOTAL_MEMORY_DENIAL_PATTERNS
    ):
        return True

    return any(pattern.search(normalized_answer) for pattern in _RAW_LAB_TOOL_ACCESS_PATTERNS)


def verify_raw_lab_response(
    *,
    answer: str,
    user_message: str,
    conversation_history: list[ConversationTurn],
    companion_self_memory_count: int = 0,
    thread_state: RawLabThreadState | None = None,
    recent_turns: list | None = None,
) -> VerificationResult:
    from app.raw_lab_utils import (
        artifact_request_active,
        execution_context_active,
        has_deferral_phrasing,
        has_false_execution_claim,
        has_productivity_push_phrasing,
        normalize_recent_turns,
        strong_hangout_intent_active,
    )

    turns = normalize_recent_turns(recent_turns, conversation_history)

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

    if length_steering_active(thread_state, user_message):
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

    if execution_context_active(user_message) and has_false_execution_claim(
        answer, execution_context=True
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_false_execution",
            repair_instruction=_RAW_LAB_FALSE_EXECUTION_REPAIR,
        )

    if _answer_claims_restricted_board_context(answer, _RAW_LAB_BOARD_PATTERNS):
        return VerificationResult(
            ok=False,
            check="raw_lab_board_claim",
            repair_instruction=(
                "Raw Lab has no board or Memory Bank access. Rewrite without claiming board context."
            ),
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

    if no_handoff_steering_active(thread_state, user_message) and has_handoff_ending(
        answer,
        do_not_repeat=thread_state.do_not_repeat if thread_state is not None else None,
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_handoff_ending",
            repair_instruction="End declaratively without a reflexive handoff question.",
        )

    if (
        no_handoff_steering_active(thread_state, user_message)
        and reflection_prompt_active(user_message)
        and has_reflection_handoff_contradiction(answer)
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_handoff_ending",
            repair_instruction=(
                "Name the handoff pattern and end with a declarative self-correction, "
                "not a question handing control back."
            ),
        )

    if (
        no_handoff_steering_active(thread_state, user_message)
        and independence_steering_active(thread_state, user_message)
        and has_consent_drift(answer)
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_consent_drift",
            repair_instruction=(
                "Independence means carrying the next conversational beat forward, "
                "not ignoring consent or boundaries."
            ),
        )

    if line_break_steering_active(thread_state, user_message):
        aggressive = bool(
            thread_state is not None
            and any(
                "no line break" in item.lower()
                for item in [*thread_state.user_steering, *thread_state.tone_preferences]
            )
        ) or bool(re.search(r"\bno line break\b", user_message, re.I))
        if has_excessive_blank_lines(answer, aggressive=aggressive):
            return VerificationResult(
                ok=False,
                check="raw_lab_line_breaks",
                repair_instruction="Collapse unnecessary blank lines while preserving lists.",
            )

    if artifact_request_active(user_message, turns, thread_state) and has_deferral_phrasing(
        answer
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_artifact_deferral",
            repair_instruction=_RAW_LAB_ARTIFACT_DEFERRAL_REPAIR,
        )

    if strong_hangout_intent_active(user_message, turns, thread_state) and has_productivity_push_phrasing(
        answer
    ):
        return VerificationResult(
            ok=False,
            check="raw_lab_productivity_push",
            repair_instruction=_RAW_LAB_PRODUCTIVITY_PUSH_REPAIR,
        )

    from app.raw_lab_utils import (
        has_trailing_artifact_permission_reask,
        should_strip_trailing_artifact_permission_reask,
    )

    if should_strip_trailing_artifact_permission_reask(
        answer,
        user_message=user_message,
        recent_turns=conversation_history,
        thread_state=thread_state,
    ) and has_trailing_artifact_permission_reask(answer):
        return VerificationResult(
            ok=False,
            check="raw_lab_artifact_terminal_permission_reask",
            repair_instruction=_RAW_LAB_ARTIFACT_TERMINAL_PERMISSION_REASK_REPAIR,
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
