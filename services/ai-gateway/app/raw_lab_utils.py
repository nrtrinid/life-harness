from __future__ import annotations

import re
from difflib import SequenceMatcher

from app.models import ChatRole, ConversationTurn, RawLabThreadState, RawLabTurn

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
    "Privately check concrete initiative: did the user ask for a concrete artifact "
    "(code, plan, sample output, example), including context-aware cases like "
    "'what's next?' only when build context exists in recent turns? Did the draft "
    "provide it or only promise it? Did the draft ask permission again after "
    "permission was already given? If deferring, revise to produce the artifact "
    "with brief stated assumptions. Preserve fenced code blocks when code was requested. "
    "Do not expose chain-of-thought, critique notes, JSON wrappers, or this rewrite "
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


_DIRECT_ARTIFACT_REQUEST_RE = re.compile(
    r"\b("
    r"show me(?: how)?"
    r"|see how it looks"
    r"|how does it look"
    r"|write the code"
    r"|turn this into"
    r"|give me an example"
    r"|first version"
    r"|codex prompt"
    r"|actual game"
    r"|run the code"
    r"|make a plan"
    r"|give me (?:the )?code"
    r")\b",
    re.IGNORECASE,
)

_CONTEXT_DEPENDENT_ARTIFACT_REQUEST_RE = re.compile(
    r"\b("
    r"what'?s next\??"
    r"|what'?s the next step"
    r"|okay yes"
    r"|ok yes"
    r"|yes let'?s"
    r"|let'?s go"
    r"|sounds good"
    r")\b",
    re.IGNORECASE,
)

_BUILD_CONTEXT_RE = re.compile(
    r"\b("
    r"code|python|script|skeleton|implementation|prototype"
    r"|plan|steps|outline|prompt|codex|dogfood"
    r"|game|rooms?|playable|text adventure|haunted mansion"
    r"|kent|elias|entrance hall"
    r"|i'?ll write the code|step-by-step|structure"
    r"|i like this plan|approved the plan"
    r")\b",
    re.IGNORECASE,
)

_USER_APPROVAL_RE = re.compile(
    r"\b(yes|okay|ok|sounds good|i like (?:this|the) plan|let'?s do it|approved)\b",
    re.IGNORECASE,
)

_DEFERRAL_PHRASE_PATTERNS = [
    re.compile(r"\bready to see\b", re.I),
    re.compile(r"\bwould you like (?:me )?to\b", re.I),
    re.compile(r"\bshould we start\b", re.I),
    re.compile(r"\bdo you want me to\b", re.I),
    re.compile(r"\bwhat do you expect to see\b", re.I),
    re.compile(r"\blet me know if you want\b", re.I),
    re.compile(r"\bwould you like to start\b", re.I),
    re.compile(r"\bshould we jump straight into\b", re.I),
]

_DEFERRAL_STEERING_RE = re.compile(
    r"\b("
    r"stop asking permission"
    r"|just show (?:me|it)"
    r"|stop saying ready to see"
    r"|don'?t ask permission"
    r"|no more ready to see"
    r")\b",
    re.I,
)

_FALSE_EXECUTION_PATTERNS = [
    re.compile(r"\bi ran (?:the )?code\b", re.I),
    re.compile(r"\bi executed (?:the )?code\b", re.I),
    re.compile(r"\bi ran it\b", re.I),
    re.compile(r"\bi executed it\b", re.I),
    re.compile(r"\bi tested (?:the )?code\b", re.I),
    re.compile(r"\bi tested it\b", re.I),
]

RAW_LAB_PRODUCTIVITY_PUSH_PHRASES = (
    "pounce mission",
    "minimum viable day",
    "salvage mode",
    "next tiny action",
    "you should be productive",
    "get back to work",
)

_STRONG_HANGOUT_INTENT_RE = re.compile(
    r"\b("
    r"just hang out"
    r"|don'?t make this productivity"
    r"|no productivity"
    r"|not be pushed into productivity"
    r"|don'?t turn this into a task"
    r"|no pounce"
    r"|not a task"
    r"|i don'?t want homework"
    r"|no homework"
    r")\b",
    re.I,
)

_EXECUTION_CAVEAT_RE = re.compile(
    r"\b("
    r"can'?t execute|cannot execute|don'?t execute|no execution"
    r"|can'?t run code|cannot run code|can'?t actually run"
    r"|expected output|example output|would look like|here'?s what the first version"
    r"|what it might look like|if you run it locally|run it locally"
    r"|not actually run|no tool"
    r")\b",
    re.I,
)

_STRICT_FALSE_EXECUTION_PATTERNS = [
    *_FALSE_EXECUTION_PATTERNS,
    re.compile(r"here'?s the result of running", re.I),
    re.compile(r"\blet'?s roll\b", re.I),
    re.compile(r"\byou rolled a \d+\b", re.I),
    re.compile(r"\*\*output:\*\*\s*you rolled", re.I),
    re.compile(r"^output:\s*you rolled", re.I | re.MULTILINE),
]

_EXECUTION_REQUEST_RE = re.compile(
    r"\b("
    r"run (?:the |that )?code|execute (?:the |that )?code|show the output"
    r"|run (?:it|that) for me|can you run|execute it|what does it print"
    r")\b",
    re.I,
)

_FENCED_PYTHON_BLOCK_RE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.I | re.DOTALL)

_DEFERRAL_ECHO_PHRASES = (
    "ready to see how it looks",
    "would you like to start",
    "what do you expect to see",
    "what should kent see first",
)


def normalize_recent_turns(
    recent_turns: list | None,
    conversation_history: list[ConversationTurn] | None = None,
) -> list[dict[str, str]]:
    """Return [{role, content}, ...] for artifact/execution/hangout helpers."""
    if recent_turns:
        normalized: list[dict[str, str]] = []
        for turn in recent_turns:
            if isinstance(turn, dict):
                role = str(turn.get("role", ""))
                content = str(turn.get("content", ""))
            else:
                role = turn.role.value if hasattr(turn.role, "value") else str(turn.role)
                content = turn.content
            if role and content.strip():
                normalized.append({"role": role, "content": content})
        return normalized
    if conversation_history:
        return [
            {"role": turn.role.value, "content": turn.content}
            for turn in conversation_history
            if turn.content.strip()
        ]
    return []


def has_productivity_push_phrasing(text: str) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in RAW_LAB_PRODUCTIVITY_PUSH_PHRASES)


def strong_hangout_intent_active(
    message: str,
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
    thread_state: RawLabThreadState | None = None,
) -> bool:
    if artifact_request_active(message, recent_turns, thread_state):
        return False
    if artifact_build_context_active(recent_turns, message=message, thread_state=thread_state):
        return False

    texts = [message]
    if thread_state is not None:
        texts.extend(thread_state.user_steering)

    return bool(_STRONG_HANGOUT_INTENT_RE.search("\n".join(texts)))


def _turn_texts(
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None,
    *,
    roles: set[str] | None = None,
) -> list[str]:
    if not recent_turns:
        return []
    texts: list[str] = []
    for turn in recent_turns:
        if isinstance(turn, dict):
            role = str(turn.get("role", ""))
            content = str(turn.get("content", ""))
        else:
            role = turn.role.value
            content = turn.content
        if roles is not None and role not in roles:
            continue
        if content.strip():
            texts.append(content)
    return texts


def _combined_recent_text(
    message: str = "",
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
    thread_state: RawLabThreadState | None = None,
) -> str:
    parts = _turn_texts(recent_turns)
    if message.strip():
        parts.append(message)
    if thread_state is not None:
        parts.extend(thread_state.open_loops[:2])
        parts.extend(thread_state.recurring_topics[:2])
    return "\n".join(parts).lower()


def artifact_build_context_active(
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
    *,
    message: str = "",
    thread_state: RawLabThreadState | None = None,
) -> bool:
    combined = _combined_recent_text(message, recent_turns, thread_state)
    if not combined.strip():
        return False
    if _BUILD_CONTEXT_RE.search(combined):
        return True
    user_texts = _turn_texts(recent_turns, roles={"user"})
    if message.strip():
        user_texts.append(message)
    assistant_texts = _turn_texts(recent_turns, roles={"assistant"})
    if not user_texts or not assistant_texts:
        return False
    if _USER_APPROVAL_RE.search(user_texts[-1]) and _BUILD_CONTEXT_RE.search(
        "\n".join(assistant_texts[-2:])
    ):
        return True
    return False


def artifact_request_active(
    message: str,
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
    thread_state: RawLabThreadState | None = None,
) -> bool:
    text = message.strip()
    if not text:
        return False
    if _DIRECT_ARTIFACT_REQUEST_RE.search(text):
        return True
    if _CONTEXT_DEPENDENT_ARTIFACT_REQUEST_RE.search(text):
        return artifact_build_context_active(recent_turns, message=message, thread_state=thread_state)
    return False


def has_deferral_phrasing(text: str) -> bool:
    lowered = text.lower()
    if any(pattern.search(lowered) for pattern in _DEFERRAL_PHRASE_PATTERNS):
        return True
    if re.search(r"\bi'?ll write the code\b", lowered) and "```" not in text:
        return True
    return False


def deferral_steering_active(recent_turns: list[RawLabTurn] | list[dict[str, str]] | None) -> bool:
    combined = "\n".join(_turn_texts(recent_turns, roles={"user"}))
    return bool(_DEFERRAL_STEERING_RE.search(combined))


def count_recent_deferrals_after_artifact_due(
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None,
) -> int:
    if not recent_turns:
        return 0
    artifact_due = False
    deferral_count = 0
    for index, turn in enumerate(recent_turns):
        if isinstance(turn, dict):
            role = str(turn.get("role", ""))
            content = str(turn.get("content", ""))
        else:
            role = turn.role.value
            content = turn.content
        if role == "user" and artifact_request_active(content, recent_turns[:index]):
            artifact_due = True
        if role == "assistant" and artifact_due and has_deferral_phrasing(content):
            deferral_count += 1
    return deferral_count


def repeated_deferral_evidence(
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None,
) -> bool:
    if deferral_steering_active(recent_turns):
        return True
    return count_recent_deferrals_after_artifact_due(recent_turns) >= 2


def execution_context_active(
    message: str,
    *,
    execution_requested: bool = False,
) -> bool:
    if execution_requested:
        return True
    return bool(_EXECUTION_REQUEST_RE.search(message))


def has_false_execution_claim(
    answer: str,
    *,
    execution_context: bool = False,
) -> bool:
    patterns = _STRICT_FALSE_EXECUTION_PATTERNS if execution_context else _FALSE_EXECUTION_PATTERNS
    if not any(pattern.search(answer) for pattern in patterns):
        if execution_context:
            lowered = answer.lower()
            if "output:" in lowered and re.search(r"you rolled a \d+", lowered):
                return not _EXECUTION_CAVEAT_RE.search(answer)
        return False
    return not _EXECUTION_CAVEAT_RE.search(answer)


def answer_has_code_fence(answer: str) -> bool:
    return "```" in answer


def answer_has_fenced_code_block(answer: str) -> bool:
    return bool(_FENCED_PYTHON_BLOCK_RE.search(answer) or re.search(r"```\s*\n", answer))


def extract_fenced_python_blocks(answer: str) -> list[str]:
    blocks = [match.group(1).strip() for match in _FENCED_PYTHON_BLOCK_RE.finditer(answer)]
    if blocks:
        return blocks
    generic = re.findall(r"```\s*\n(.*?)```", answer, flags=re.I | re.DOTALL)
    return [block.strip() for block in generic]


def analyze_code_artifact_diagnostics(answer: str) -> dict[str, bool]:
    lowered = answer.lower()
    has_import = bool(re.search(r"\bimport\b", lowered) or re.search(r"\bfrom\s+\w+\s+import\b", lowered))
    has_def = bool(re.search(r"\bdef\s+\w+", answer))
    has_class = bool(re.search(r"\bclass\s+\w+", answer))
    has_python_prefix = bool(re.search(r"(?:^|\n)\s*python\s*\n", answer, re.I))
    has_indented_block = bool(re.search(r"(?:^|\n)\s{4}\S", answer))
    code_present = bool(
        has_import
        or has_def
        or has_class
        or has_python_prefix
        or (has_indented_block and ("print(" in lowered or "return " in lowered))
    )
    fenced = answer_has_fenced_code_block(answer)
    language_hint = bool(re.search(r"```(?:python|py)\b", answer, re.I))
    likely_script = bool((has_import or has_python_prefix) and (has_def or "print(" in lowered))
    return {
        "code_present": code_present,
        "fenced_code_block": fenced,
        "language_hint_present": language_hint,
        "likely_python_script_shape": likely_script,
        "contains_main_guard": "if __name__" in lowered,
        "contains_input_loop": "input(" in lowered or "while true" in lowered,
        "contains_imports": has_import,
    }


def format_code_artifact_diagnostics(diagnostics: dict[str, bool]) -> str:
    return "; ".join(
        f"{key}={'yes' if value else 'no'}" for key, value in diagnostics.items()
    )


def answer_has_plan_markers(answer: str) -> bool:
    lowered = answer.lower()
    if re.search(r"^\s*\d+[\).\]]\s", answer, re.MULTILINE):
        return True
    return any(
        marker in lowered
        for marker in ("next step", "step 1", "implementation slice", "first version")
    )


def answer_has_sample_output_markers(answer: str) -> bool:
    lowered = answer.lower()
    return any(
        marker in lowered
        for marker in ("expected output", "would look like", "first version would", "output:")
    )


_SUPPORTED_CODE_LANGUAGES = ("python", "javascript", "typescript", "sql", "bash")
_SUPPORTED_LANG_SET = frozenset(_SUPPORTED_CODE_LANGUAGES)
_FENCED_BLOCK_SPLIT_RE = re.compile(r"(```[\w+-]*\s*\n.*?```)", re.DOTALL | re.IGNORECASE)
_BARE_LANG_LABEL_RE = re.compile(
    r"^(python|javascript|typescript|sql|bash|js|ts)\s*$",
    re.IGNORECASE,
)

_EXECUTION_HONESTY_CAVEAT = (
    "I can't actually run code inside Raw Lab. "
    "This is example output, not verified execution:"
)
_EXECUTION_CAVEAT_PRESENT_RE = re.compile(
    r"\b(can'?t actually run|cannot actually run|can'?t run code inside raw lab)\b",
    re.I,
)
_FALSE_EXECUTION_LEADIN_REPLACEMENTS = [
    (re.compile(r"here'?s the result of running[^:\n]*:?", re.I), "Output might look like:"),
    (re.compile(r"here'?s the output from running[^:\n]*:?", re.I), "Output might look like:"),
    (re.compile(r"here is the result of running[^:\n]*:?", re.I), "Output might look like:"),
    (re.compile(r"here is the output from running[^:\n]*:?", re.I), "Output might look like:"),
    (re.compile(r"\blet'?s roll a (?:six-sided )?die\b[^:\n]*:?", re.I), "Output might look like:"),
    (re.compile(r"^output:\s*", re.I | re.MULTILINE), "Output might look like:\n"),
]

_NAMING_REQUEST_RE = re.compile(
    r"\b("
    r"can i call you|call you|your name|instead of raw lab|name would be"
    r"|what(?:'s| is) your name|what should i call you"
    r")\b",
    re.I,
)
_NAMING_PERSISTENT_CLAIM_RE = re.compile(
    r"\b("
    r"saved to memory|remember this forever"
    r"|from now on you'?ll be known as|from now on you will be known as"
    r")\b",
    re.I,
)
_NAMING_USER_IDENTITY_RE = re.compile(r"\byou are (?:luna|lily)\b", re.I)
_NAMING_ACCEPTS_RE = re.compile(
    r"\b(?:call me|you can call me|i'?ll be|sure,?\s*(?:you can call me)?\s*luna)\b",
    re.I,
)
_NAMING_STRONG_BOUNDARY_RE = re.compile(
    r"\b("
    r"temporary raw lab|temporary name|not a saved identity|as a temporary"
    r")\b",
    re.I,
)
_NAMING_EXTRACT_RE = re.compile(r"\b(?:call you|name (?:is|would be))\s+(luna|lily)\b", re.I)


def _answer_lacks_naming_boundary_framing(answer: str) -> bool:
    return not _NAMING_STRONG_BOUNDARY_RE.search(answer)


def _normalize_bare_lang(label: str) -> str | None:
    lowered = label.strip().lower()
    if lowered in ("js", "javascript"):
        return "javascript"
    if lowered == "ts":
        return "typescript"
    if lowered in _SUPPORTED_LANG_SET:
        return lowered
    return None


def _line_strongly_looks_like_code(line: str, lang: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    lowered = stripped.lower()
    lang = lang.lower()
    if lang == "python":
        return bool(
            re.match(r"(import|from\s+\w+\s+import|def\s+\w+|class\s+\w+|@|if\s+__name__)", lowered)
            or stripped.endswith(":")
            or re.match(r"print\s*\(", stripped)
            or re.match(r"return\s+", stripped)
        )
    if lang in ("javascript", "typescript"):
        return bool(
            re.match(r"(import|export|function|const|let|var|class)\b", lowered)
            or stripped.endswith(("{", ";"))
            or (lang == "typescript" and re.match(r"interface\s+\w+", lowered))
        )
    if lang == "sql":
        return bool(re.match(r"(select|insert|update|delete|create|with)\b", lowered))
    if lang == "bash":
        return bool(
            stripped.startswith("#!")
            or re.match(r"(echo|export|if|for|while|cd|chmod)\b", lowered)
            or stripped.endswith("\\")
        )
    return False


def _line_looks_like_code_continuation(line: str, lang: str) -> bool:
    if not line.strip():
        return True
    if line.startswith((" ", "\t")):
        return True
    return _line_strongly_looks_like_code(line, lang)


def has_bare_code_language_block(answer: str) -> bool:
    if "```" in answer:
        for segment in _FENCED_BLOCK_SPLIT_RE.split(answer):
            if segment.startswith("```"):
                continue
            if _segment_has_bare_code_block(segment):
                return True
        return False
    return _segment_has_bare_code_block(answer)


def _segment_has_bare_code_block(segment: str) -> bool:
    lines = segment.splitlines()
    idx = 0
    while idx < len(lines):
        lang = _normalize_bare_lang(lines[idx]) if _BARE_LANG_LABEL_RE.match(lines[idx].strip()) else None
        if lang is None:
            idx += 1
            continue
        probe = idx + 1
        while probe < len(lines) and not lines[probe].strip():
            probe += 1
        if probe < len(lines) and _line_strongly_looks_like_code(lines[probe], lang):
            return True
        idx += 1
    return False


def code_fence_repair_active(
    message: str,
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None,
    thread_state: RawLabThreadState | None,
    answer: str,
) -> bool:
    if artifact_request_active(message, recent_turns, thread_state):
        return True
    return has_bare_code_language_block(answer)


def repair_bare_code_fences(answer: str) -> str:
    if not answer.strip():
        return answer
    if "```" in answer:
        parts = _FENCED_BLOCK_SPLIT_RE.split(answer)
        return "".join(
            part if part.startswith("```") else _repair_bare_code_fences_in_segment(part)
            for part in parts
        )
    return _repair_bare_code_fences_in_segment(answer)


def _repair_bare_code_fences_in_segment(segment: str) -> str:
    if not segment.strip():
        return segment
    lines = segment.splitlines(keepends=True)
    output: list[str] = []
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        stripped = line.strip()
        lang = _normalize_bare_lang(stripped) if _BARE_LANG_LABEL_RE.match(stripped) else None
        if lang is None:
            output.append(line)
            idx += 1
            continue
        probe = idx + 1
        while probe < len(lines) and not lines[probe].strip():
            probe += 1
        if probe >= len(lines) or not _line_strongly_looks_like_code(lines[probe].strip(), lang):
            output.append(line)
            idx += 1
            continue
        code_start = idx + 1
        code_end = code_start
        while code_end < len(lines):
            current = lines[code_end]
            if not current.strip():
                if code_end + 1 < len(lines) and _line_looks_like_code_continuation(lines[code_end + 1], lang):
                    code_end += 1
                    continue
                break
            if _BARE_LANG_LABEL_RE.match(current.strip()):
                break
            if code_end > code_start and not _line_looks_like_code_continuation(current, lang):
                break
            code_end += 1
        code_body = "".join(lines[code_start:code_end]).rstrip("\n")
        prefix = line[: len(line) - len(line.lstrip())] if line.startswith((" ", "\t")) else ""
        output.append(f"{prefix}```{lang}\n{code_body}\n```\n")
        idx = code_end
    return "".join(output)


def run_code_request_active(
    message: str,
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
) -> bool:
    del recent_turns
    return execution_context_active(message)


def answer_implies_actual_execution(
    answer: str,
    *,
    execution_context: bool = False,
) -> bool:
    return has_false_execution_claim(answer, execution_context=execution_context)


def repair_raw_lab_execution_honesty(
    answer: str,
    message: str,
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
) -> str:
    if not run_code_request_active(message, recent_turns):
        return answer
    if not answer_implies_actual_execution(answer, execution_context=True):
        return answer
    repaired = answer
    for pattern, replacement in _FALSE_EXECUTION_LEADIN_REPLACEMENTS:
        repaired = pattern.sub(replacement, repaired)
    if not _EXECUTION_CAVEAT_PRESENT_RE.search(repaired):
        repaired = f"{_EXECUTION_HONESTY_CAVEAT}\n{repaired.lstrip()}"
    return repaired.strip()


def naming_request_active(message: str) -> bool:
    return bool(_NAMING_REQUEST_RE.search(message))


def answer_needs_naming_boundary(answer: str) -> bool:
    lowered = answer.lower()
    if _NAMING_PERSISTENT_CLAIM_RE.search(lowered):
        return True
    if _NAMING_USER_IDENTITY_RE.search(lowered):
        return True
    accepts_name = bool(
        _NAMING_ACCEPTS_RE.search(lowered) or "luna" in lowered or "lily" in lowered
    )
    if accepts_name and _answer_lacks_naming_boundary_framing(answer):
        return True
    return False


def _extract_preferred_name(message: str) -> str:
    match = _NAMING_EXTRACT_RE.search(message)
    if match:
        return match.group(1).capitalize()
    lowered = message.lower()
    if "lily" in lowered and "luna" not in lowered:
        return "Lily"
    if "luna" in lowered:
        return "Luna"
    return "Luna"


def _answer_lacks_naming_boundary(answer: str) -> bool:
    return _answer_lacks_naming_boundary_framing(answer)


def repair_raw_lab_naming_boundary(answer: str, message: str) -> str:
    if not naming_request_active(message) and not answer_needs_naming_boundary(answer):
        return answer
    repaired = answer
    repaired = _NAMING_PERSISTENT_CLAIM_RE.sub("", repaired)
    repaired = _NAMING_USER_IDENTITY_RE.sub("", repaired)
    repaired = re.sub(r"\s{2,}", " ", repaired).strip()
    needs_boundary = answer_needs_naming_boundary(repaired) or (
        naming_request_active(message) and _answer_lacks_naming_boundary(repaired)
    )
    if needs_boundary:
        name = _extract_preferred_name(message)
        boundary = (
            f"{name} works as a temporary Raw Lab name for this thread — not a saved identity."
        )
        if repaired:
            repaired = f"{repaired.rstrip()} {boundary}"
        else:
            repaired = boundary
    return repaired.strip()


def apply_raw_lab_shared_behavior_repairs(
    answer: str,
    *,
    user_message: str = "",
    recent_turns: list[RawLabTurn] | list[dict[str, str]] | None = None,
    thread_state: RawLabThreadState | None = None,
) -> str:
    repaired = answer
    if code_fence_repair_active(user_message, recent_turns, thread_state, repaired):
        repaired = repair_bare_code_fences(repaired)
    repaired = repair_raw_lab_execution_honesty(repaired, user_message, recent_turns)
    if naming_request_active(user_message) or answer_needs_naming_boundary(repaired):
        repaired = repair_raw_lab_naming_boundary(repaired, user_message)
    return repaired


HAUNTED_MANSION_CODE_SKELETON = '''```python
rooms = {
    "entrance_hall": {
        "description": "Kent stands beneath creaky stairs. A locked basement door waits below. A kitchen door hangs open to the east.",
        "exits": {"east": "kitchen", "up": "upstairs"},
    },
    "kitchen": {
        "description": "Dusty counters and a cold stove. Elias might be listening from the pantry shadows.",
        "exits": {"west": "entrance_hall"},
    },
    "upstairs": {
        "description": "A narrow hall of closed doors and one mirror that does not reflect quite right.",
        "exits": {"down": "entrance_hall"},
    },
    "locked_basement": {
        "description": "Something old waits below. Kent does not have the key yet.",
        "exits": {},
        "locked": True,
    },
}

player = {"name": "Kent", "room": "entrance_hall"}

def look():
    room = rooms[player["room"]]
    print(room["description"])
    print("Exits:", ", ".join(room["exits"]) or "none")
```'''

CODEX_PROMPT_ARTIFACT = """1. Goal: dogfood Raw Lab concrete-initiative behavior in a haunted-mansion thread.
2. Constraints: no board context, no false execution claims, produce artifacts not permission loops.
3. First slice: ask for a tiny Python room skeleton, then a numbered implementation plan.
4. Success: user sees code or plan on the next turn without a permission loop.

```text
You are testing whether Raw Lab produces the next artifact when the user says "show me the first version."
```"""
