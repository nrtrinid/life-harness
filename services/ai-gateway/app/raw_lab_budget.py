from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import Settings, raw_lab_input_char_limit
from app.models import (
    RawLabCompanionSelfMemory,
    RawLabPersonalityState,
    RawLabRequest,
    RawLabSmartCompactedContext,
    RawLabThreadState,
    RawLabTurn,
    ReasoningDepth,
)
from app.prompt_loader import build_raw_lab_system_prompt, estimate_raw_lab_input_chars

logger = logging.getLogger(__name__)

RAW_LAB_MIN_RECENT_TURNS = 4
RAW_LAB_NORMAL_RECENT_TURNS = 20
RAW_LAB_COMPACT_RECENT_TURNS = 10
RAW_LAB_AGGRESSIVE_RECENT_TURNS = 6
RAW_LAB_SELF_MEMORY_CAP_NORMAL = 12
RAW_LAB_SELF_MEMORY_CAP_COMPACT = 6
RAW_LAB_SELF_MEMORY_CAP_AGGRESSIVE = 3


@dataclass(frozen=True)
class RawLabBudgetResult:
    request: RawLabRequest
    system_prompt: str
    level: str
    before_chars: int
    after_chars: int
    turns_before: int
    turns_after: int


def _compact_text(text: str, max_chars: int) -> str:
    normalized = " ".join(text.split()).strip()
    if len(normalized) <= max_chars:
        return normalized
    if max_chars <= 3:
        return normalized[:max_chars]
    return f"{normalized[: max_chars - 3].rstrip()}..."


def _slice_list(items: list[str], max_items: int) -> list[str]:
    return items[:max_items]


def _slice_latest_list(items: list[str], max_items: int) -> list[str]:
    if max_items <= 0:
        return []
    return items[-max_items:]


def _has_smart_compacted_context(context: RawLabSmartCompactedContext) -> bool:
    return bool(
        context.active_open_loops
        or context.questions_to_revisit
        or context.user_steering
        or context.do_not_repeat
        or context.recurring_topics
        or context.provisional_stances
        or context.self_observations
        or context.important_recent_moments
        or context.current_tension
        or context.discarded_noise_summary
    )


def _detect_current_tension(
    turns: list[RawLabTurn], state: RawLabThreadState
) -> str:
    recent_user_text = " ".join(
        turn.content for turn in turns[-8:] if turn.role == "user"
    ).lower()
    if any(
        token in recent_user_text
        for token in ["avoid", "avoiding", "stuck", "pushback", "call me out"]
    ):
        return (
            "The live tension is whether the user is building directly or "
            "circling avoidance."
        )
    if any(
        token in recent_user_text
        for token in ["hang out", "chill", "just talk", "no productivity"]
    ):
        return (
            "The live tension is staying present without turning the chat into "
            "productivity advice."
        )
    if any(
        token in recent_user_text
        for token in ["entity", "personality", "conscious", "alive", "selfhood"]
    ):
        return (
            "The live tension is making Raw Lab feel coherent without implying "
            "consciousness or durable selfhood."
        )
    if state.open_loops or state.questions_to_revisit:
        return "The live tension is carrying forward the unresolved thread instead of resetting."
    return ""


def _important_recent_moments(
    turns: list[RawLabTurn], max_items: int
) -> list[str]:
    markers = [
        "don't",
        "dont",
        "stop",
        "actually",
        "trying to build",
        "avoid",
        "pushback",
        "hang out",
        "what were we circling",
        "remember",
        "?",
    ]
    moments: list[str] = []
    for turn in turns:
        if turn.role != "user":
            continue
        lowered = turn.content.lower()
        if any(marker in lowered for marker in markers):
            moments.append(_compact_text(f"user: {turn.content}", 160))
    return moments[-max_items:]


def _build_smart_compacted_context(
    *,
    state: RawLabThreadState,
    turns: list[RawLabTurn],
    aggressive: bool,
    turns_before: int,
) -> RawLabSmartCompactedContext:
    active_open_loops = _slice_list(state.open_loops, 2 if aggressive else 4)
    questions_to_revisit = _slice_list(
        state.questions_to_revisit, 2 if aggressive else 3
    )
    user_steering = _slice_latest_list(state.user_steering, 2 if aggressive else 4)
    do_not_repeat = _slice_latest_list(state.do_not_repeat, 2 if aggressive else 3)
    moments = _important_recent_moments(turns, 2 if aggressive else 3)
    source_turn_ids = [
        f"recent_turn_{index}"
        for index, turn in enumerate(turns)
        if turn.role == "user"
        and any(turn.content.strip()[:24] in moment for moment in moments)
    ][-len(moments) :]
    context = RawLabSmartCompactedContext(
        active_open_loops=active_open_loops,
        questions_to_revisit=questions_to_revisit,
        user_steering=user_steering,
        do_not_repeat=do_not_repeat,
        recurring_topics=_slice_list(state.recurring_topics, 2 if aggressive else 3),
        provisional_stances=_slice_list(
            state.provisional_stances, 1 if aggressive else 2
        ),
        self_observations=_slice_list(
            state.self_observations, 1 if aggressive else 2
        ),
        important_recent_moments=moments,
        current_tension=_compact_text(_detect_current_tension(turns, state), 180),
        discarded_noise_summary=(
            _compact_text(
                f"{turns_before - len(turns)} older Raw Lab turns were dropped; "
                "lower-priority style flavor and repeated summaries should not "
                "dominate this reply.",
                220,
            )
            if turns_before > len(turns)
            else ""
        ),
        source_turn_ids=source_turn_ids,
        confidence=(
            0.8
            if active_open_loops
            or questions_to_revisit
            or user_steering
            or do_not_repeat
            else 0.65
            if moments
            else 0.35
        ),
    )
    return context if _has_smart_compacted_context(context) else RawLabSmartCompactedContext()


def _compact_thread_state(
    state: RawLabThreadState,
    *,
    aggressive: bool,
    turns: list[RawLabTurn] | None = None,
    turns_before: int | None = None,
) -> RawLabThreadState:
    digest_max = 240 if aggressive else 400
    goal_topic_max = 120 if aggressive else 220
    stance_max = 120 if aggressive else 180
    vibe_max = 90 if aggressive else 140

    references = state.references.model_copy(deep=True)
    references.last_options = _slice_list(
        references.last_options, 2 if aggressive else 4
    )
    if references.last_plan:
        references.last_plan = _compact_text(
            references.last_plan, 200 if aggressive else 400
        )
    if references.last_named_thing:
        references.last_named_thing = _compact_text(
            references.last_named_thing, 80 if aggressive else 160
        )
    if references.likely_reference:
        references.likely_reference = _compact_text(
            references.likely_reference, 80 if aggressive else 160
        )
    if references.last_code_block and len(references.last_code_block.code) > (
        600 if aggressive else 1200
    ):
        code = references.last_code_block
        references.last_code_block = code.model_copy(
            update={
                "code": _compact_text(code.code, 600 if aggressive else 1200)
            }
        )

    personality = RawLabPersonalityState(
        voice_traits=_slice_list(
            state.personality.voice_traits, 2 if aggressive else 4
        ),
        conversational_instincts=_slice_list(
            state.personality.conversational_instincts, 2 if aggressive else 4
        ),
        recurring_interests=_slice_list(
            state.personality.recurring_interests, 2 if aggressive else 4
        ),
        user_responds_well_to=_slice_list(
            state.personality.user_responds_well_to, 1 if aggressive else 3
        ),
        user_dislikes=_slice_list(
            state.personality.user_dislikes, 1 if aggressive else 3
        ),
        current_stance=_compact_text(state.personality.current_stance, stance_max),
        growth_notes=_slice_list(
            state.personality.growth_notes, 1 if aggressive else 2
        ),
        updated_at=state.personality.updated_at,
    )

    return state.model_copy(
        update={
            "recent_digest": _compact_text(state.recent_digest, digest_max),
            "active_goal": _compact_text(state.active_goal, goal_topic_max),
            "current_topic": _compact_text(state.current_topic, goal_topic_max),
            "open_loops": _slice_list(state.open_loops, 2 if aggressive else 4),
            "decisions": _slice_list(state.decisions, 2 if aggressive else 4),
            "pinned_facts": _slice_list(state.pinned_facts, 2 if aggressive else 4),
            "user_steering": _slice_latest_list(state.user_steering, 2 if aggressive else 4),
            "tone_preferences": _slice_list(state.tone_preferences, 2 if aggressive else 4),
            "do_not_repeat": _slice_latest_list(state.do_not_repeat, 2 if aggressive else 3),
            "recurring_topics": _slice_list(state.recurring_topics, 2 if aggressive else 4),
            "current_vibe": _compact_text(state.current_vibe, vibe_max),
            "provisional_stances": _slice_list(
                state.provisional_stances, 1 if aggressive else 3
            ),
            "self_observations": _slice_list(
                state.self_observations, 1 if aggressive else 3
            ),
            "questions_to_revisit": _slice_list(
                state.questions_to_revisit, 2 if aggressive else 3
            ),
            "smart_compacted_context": _build_smart_compacted_context(
                state=state,
                turns=turns or [],
                aggressive=aggressive,
                turns_before=turns_before if turns_before is not None else len(turns or []),
            ),
            "references": references,
            "personality": personality,
        }
    )


def _slice_self_memories(
    memories: list[RawLabCompanionSelfMemory],
    *,
    level: str,
) -> list[RawLabCompanionSelfMemory]:
    if not memories:
        return []
    cap = RAW_LAB_SELF_MEMORY_CAP_NORMAL
    if level in {"compact_state", "trim_history"}:
        cap = RAW_LAB_SELF_MEMORY_CAP_COMPACT
    if level == "aggressive":
        cap = RAW_LAB_SELF_MEMORY_CAP_AGGRESSIVE
    ranked = sorted(
        memories,
        key=lambda memory: (memory.confidence, len(memory.text)),
        reverse=True,
    )
    return ranked[:cap]


def _trim_turns(
    turns: list[RawLabTurn],
    *,
    max_turns: int,
    message: str,
    thread_state: RawLabThreadState,
    companion_self_memories: list[RawLabCompanionSelfMemory],
    reasoning_depth: ReasoningDepth,
    system_prompt: str,
    max_chars: int,
) -> list[RawLabTurn]:
    trimmed = turns[-max_turns:]
    while trimmed:
        candidate = RawLabRequest(
            message=message,
            recent_turns=trimmed,
            thread_state=thread_state,
            companion_self_memories=companion_self_memories,
            reasoning_depth=reasoning_depth,
        )
        if (
            estimate_raw_lab_input_chars(system=system_prompt, request=candidate)
            <= max_chars
        ):
            return trimmed
        trimmed = trimmed[1:]
    return []


def _build_candidate(
    *,
    request: RawLabRequest,
    max_turns: int,
    aggressive: bool,
    compact_state: bool,
    max_chars: int,
    level: str,
) -> tuple[RawLabRequest, str]:
    thread_state = request.thread_state
    if compact_state:
        thread_state = _compact_thread_state(
            thread_state,
            aggressive=aggressive,
            turns=list(request.recent_turns),
            turns_before=len(request.recent_turns),
        )

    memory_level = "aggressive" if aggressive else ("compact_state" if compact_state else level)
    sliced_memories = _slice_self_memories(
        list(request.companion_self_memories),
        level=memory_level,
    )
    system_prompt = build_raw_lab_system_prompt(
        thread_state=thread_state,
        companion_self_memories=sliced_memories,
        reasoning_depth=request.reasoning_depth.value,
    )
    trimmed_turns = _trim_turns(
        list(request.recent_turns),
        max_turns=max_turns,
        message=request.message,
        thread_state=thread_state,
        companion_self_memories=sliced_memories,
        reasoning_depth=request.reasoning_depth,
        system_prompt=system_prompt,
        max_chars=max_chars,
    )

    if compact_state:
        thread_state = thread_state.model_copy(
            update={
                "smart_compacted_context": _build_smart_compacted_context(
                    state=thread_state,
                    turns=trimmed_turns,
                    aggressive=aggressive,
                    turns_before=len(request.recent_turns),
                )
            }
        )

    compacted = request.model_copy(
        update={
            "recent_turns": trimmed_turns,
            "thread_state": thread_state,
            "companion_self_memories": sliced_memories,
        }
    )
    system_prompt = build_raw_lab_system_prompt(
        thread_state=compacted.thread_state,
        companion_self_memories=compacted.companion_self_memories,
        reasoning_depth=compacted.reasoning_depth.value,
    )
    return compacted, system_prompt


def compact_raw_lab_request_for_budget(
    *,
    request: RawLabRequest,
    max_chars: int,
) -> RawLabBudgetResult:
    turns_before = len(request.recent_turns)
    system_prompt = build_raw_lab_system_prompt(
        thread_state=request.thread_state,
        companion_self_memories=request.companion_self_memories,
        reasoning_depth=request.reasoning_depth.value,
    )
    before_chars = estimate_raw_lab_input_chars(system=system_prompt, request=request)

    stages: list[tuple[int, bool, bool, str]] = [
        (RAW_LAB_NORMAL_RECENT_TURNS, False, False, "none"),
        (RAW_LAB_COMPACT_RECENT_TURNS, False, False, "trim_history"),
        (RAW_LAB_COMPACT_RECENT_TURNS, False, True, "compact_state"),
        (RAW_LAB_AGGRESSIVE_RECENT_TURNS, True, True, "aggressive"),
        (RAW_LAB_MIN_RECENT_TURNS, True, True, "aggressive"),
    ]

    best_request = request
    best_system = system_prompt
    best_level = "none"

    for max_turns, aggressive, compact_state, level in stages:
        candidate, candidate_system = _build_candidate(
            request=request,
            max_turns=max_turns,
            aggressive=aggressive,
            compact_state=compact_state,
            max_chars=max_chars,
            level=level,
        )
        best_request = candidate
        best_system = candidate_system
        best_level = level
        if (
            estimate_raw_lab_input_chars(system=candidate_system, request=candidate)
            <= max_chars
        ):
            break

    after_chars = estimate_raw_lab_input_chars(system=best_system, request=best_request)
    return RawLabBudgetResult(
        request=best_request,
        system_prompt=best_system,
        level=best_level,
        before_chars=before_chars,
        after_chars=after_chars,
        turns_before=turns_before,
        turns_after=len(best_request.recent_turns),
    )


def prepare_raw_lab_request(
    request: RawLabRequest,
    settings: Settings,
) -> RawLabBudgetResult:
    system_prompt = build_raw_lab_system_prompt(
        thread_state=request.thread_state,
        companion_self_memories=request.companion_self_memories,
    )
    before_chars = estimate_raw_lab_input_chars(system=system_prompt, request=request)

    max_chars = raw_lab_input_char_limit(settings)
    if before_chars <= max_chars:
        return RawLabBudgetResult(
            request=request,
            system_prompt=system_prompt,
            level="none",
            before_chars=before_chars,
            after_chars=before_chars,
            turns_before=len(request.recent_turns),
            turns_after=len(request.recent_turns),
        )

    result = compact_raw_lab_request_for_budget(
        request=request,
        max_chars=max_chars,
    )

    if result.before_chars != result.after_chars or result.level != "none":
        logger.info(
            "raw_lab budget_before=%d budget_after=%d compaction_level=%s "
            "turns_before=%d turns_after=%d",
            result.before_chars,
            result.after_chars,
            result.level,
            result.turns_before,
            result.turns_after,
        )

    return result
