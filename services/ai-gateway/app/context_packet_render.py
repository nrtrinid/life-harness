import json
import logging

from app.config import DEFAULT_CRITIC_CONTEXT_MAX_CHARS
from app.context_packet import AiContextPacketWire, CompanionContextWire, OpenThreadContextWire, RankedBoardCardSlice
from app.models import CardState, ChatHarnessRequest, ChatHarnessThreadState, HarnessContext, SensitivityLevel

logger = logging.getLogger(__name__)

CRITIC_CONTEXT_MAX_CHARS = DEFAULT_CRITIC_CONTEXT_MAX_CHARS


def _format_card_slice(slice_item: RankedBoardCardSlice) -> str:
    payload = slice_item.payload
    stale = " (stale)" if payload.is_stale else ""
    neglect = f" — {payload.neglect_reason}" if payload.neglect_reason else ""
    why = f"\n  Why: {payload.why_it_matters}" if payload.why_it_matters else ""
    return (
        f"- [{slice_item.rank}] {payload.title} ({payload.state}, {payload.warmth}){stale}\n"
        f"  Next: {payload.next_tiny_action}{why}{neglect}"
    )


def render_context_packet_sections(packet: AiContextPacketWire) -> str:
    lines: list[str] = []

    if packet.untrusted_blocks:
        lines.extend(["### Untrusted context", ""])
        for block in packet.untrusted_blocks:
            lines.append(block.markdown)
            lines.append("")

    lines.extend(
        [
            "### User intent",
            f"- Message context: {packet.user_intent.message}",
            f"- Mode: {packet.user_intent.mode.value}",
            f"- Sensitivity: {packet.user_intent.sensitivity.value}",
        ]
    )

    if packet.user_intent.primary_action:
        action = packet.user_intent.primary_action
        lines.append(f"- Primary action: {action.title} ({action.kind}) — {action.smallest_action}")

    if packet.user_intent.task_mode:
        lines.append(f"- Task mode: {packet.user_intent.task_mode}")

    lines.extend(
        [
            "",
            "### Active limit",
            f"- {packet.board.active_limit.message}",
            "",
            "### Active cards (ranked)",
        ]
    )
    if packet.active_cards:
        for slice_item in sorted(packet.active_cards, key=lambda item: item.rank, reverse=True):
            lines.append(_format_card_slice(slice_item))
    else:
        lines.append("- (none)")

    lines.extend(["", "### Stale / reheat cards (ranked)"])
    if packet.stale_cards:
        for slice_item in sorted(packet.stale_cards, key=lambda item: item.rank, reverse=True):
            lines.append(_format_card_slice(slice_item))
    else:
        lines.append("- (none)")

    if packet.recovery_signals:
        lines.extend(["", "### Recovery signals"])
        for slice_item in packet.recovery_signals:
            lines.append(f"- [{slice_item.rank}] {slice_item.payload.summary}")

    if packet.recent_proof:
        lines.extend(["", "### Recent proof"])
        for slice_item in packet.recent_proof:
            lines.append(f"- {slice_item.payload.summary} ({slice_item.payload.timestamp})")

    if packet.memories:
        lines.extend(["", "### Memories"])
        for slice_item in packet.memories:
            lines.append(f"- {slice_item.payload.title}: {slice_item.payload.summary}")

    companion = packet.companion
    if companion.briefing_title or companion.briefing_prepared or companion.briefing_detected:
        lines.extend(["", "### Companion briefing"])
        if companion.briefing_title:
            lines.append(f"- Title: {companion.briefing_title}")
        for line in companion.briefing_prepared:
            lines.append(f"- Prepared: {line}")
        for line in companion.briefing_detected:
            lines.append(f"- Detected: {line}")

    if packet.board.diagnoses:
        lines.extend(["", "### Board diagnoses"])
        for item in packet.board.diagnoses:
            lines.append(f"- {item.summary}")

    if packet.board.product_decisions:
        lines.extend(["", "### Product decisions"])
        for item in packet.board.product_decisions:
            lines.append(f"- {item.summary}: {item.reason}")

    if packet.tools.notes:
        lines.extend(["", "### Proposable actions"])
        for note in packet.tools.notes:
            lines.append(f"- {note}")

    headroom = max(0, packet.budget.max_chars - packet.budget.estimated_chars)
    lines.extend(
        [
            "",
            "### Packet budget",
            (
                f"- Compaction: {packet.budget.compaction_level.value}; "
                f"estimated ~{packet.budget.estimated_chars} / {packet.budget.max_chars} "
                f"(~{headroom} headroom)"
            ),
        ]
    )

    if packet.redaction.notes:
        lines.extend(["", "### Redaction notes"])
        for note in packet.redaction.notes:
            lines.append(f"- {note}")

    return "\n".join(lines)


def _card_slice_renderable(
    slice_item: RankedBoardCardSlice,
    *,
    excluded_card_ids: set[str],
) -> bool:
    if slice_item.sensitivity == SensitivityLevel.S3:
        return False
    if slice_item.payload.card_id in excluded_card_ids:
        return False
    return True


def _truncate_critic_bundle(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    suffix = "\n(truncated for critic budget)"
    keep = max(0, max_chars - len(suffix))
    return text[:keep].rstrip() + suffix


def _clip_critic_evidence_text(text: str, max_len: int = 200) -> str:
    stripped = text.strip()
    if len(stripped) <= max_len:
        return stripped
    return stripped[: max_len - 1].rstrip() + "…"


def _companion_briefing_snippet(companion: CompanionContextWire) -> str | None:
    if companion.briefing_prepared:
        return _clip_critic_evidence_text(companion.briefing_prepared[0])
    if companion.briefing_detected:
        return _clip_critic_evidence_text(companion.briefing_detected[0])
    if companion.briefing_title:
        return _clip_critic_evidence_text(companion.briefing_title)
    return None


def _build_critic_evidence_lines(
    *,
    recent_digest: str = "",
    active_goal: str = "",
    open_loops: list[str] | None = None,
    pinned_facts: list[str] | None = None,
    user_steering: list[str] | None = None,
    do_not_repeat: list[str] | None = None,
    companion_briefing_snippet: str | None = None,
) -> list[str]:
    loops = [item.strip() for item in (open_loops or []) if item.strip()]
    facts = [
        _clip_critic_evidence_text(item, max_len=120)
        for item in (pinned_facts or [])
        if item.strip()
    ][:3]
    steering = [
        _clip_critic_evidence_text(item)
        for item in (user_steering or [])
        if item.strip()
    ][:2]
    banned = [
        _clip_critic_evidence_text(item)
        for item in (do_not_repeat or [])
        if item.strip()
    ][:2]
    digest = recent_digest.strip()
    goal = active_goal.strip()
    briefing = (companion_briefing_snippet or "").strip()

    if not any([digest, goal, loops, facts, steering, banned, briefing]):
        return []

    lines = ["", "### Critic evidence"]
    if digest:
        lines.append(f"- Recent digest: {_clip_critic_evidence_text(digest, max_len=300)}")
    if goal:
        lines.append(f"- Thread goal: {_clip_critic_evidence_text(goal)}")
    if loops:
        joined = ", ".join(_clip_critic_evidence_text(item, max_len=80) for item in loops[:3])
        lines.append(f"- Open loops: {joined}")
    if facts:
        lines.append("- Pinned facts:")
        lines.extend(f"  - {fact}" for fact in facts)
    if steering:
        lines.append("- User steering:")
        lines.extend(f"  - {item}" for item in steering)
    if banned:
        lines.append("- Do not repeat:")
        lines.extend(f"  - {item}" for item in banned)
    if briefing:
        lines.append(f"- Companion briefing: {briefing}")
    return lines


def _critic_evidence_from_open_thread(
    thread: OpenThreadContextWire,
    *,
    companion_briefing_snippet: str | None = None,
) -> list[str]:
    wire = thread.wire
    return _build_critic_evidence_lines(
        recent_digest=thread.recent_digest or wire.recent_digest,
        active_goal=thread.active_goal or wire.active_goal,
        open_loops=thread.open_loops or wire.open_loops,
        pinned_facts=thread.pinned_facts or wire.pinned_facts,
        user_steering=thread.user_steering or wire.user_steering,
        do_not_repeat=thread.do_not_repeat or wire.do_not_repeat,
        companion_briefing_snippet=companion_briefing_snippet,
    )


def _critic_evidence_from_thread_state(
    thread_state: ChatHarnessThreadState,
    *,
    companion_briefing_snippet: str | None = None,
) -> list[str]:
    return _build_critic_evidence_lines(
        recent_digest=thread_state.recent_digest,
        active_goal=thread_state.active_goal,
        open_loops=thread_state.open_loops,
        pinned_facts=thread_state.pinned_facts,
        user_steering=thread_state.user_steering,
        do_not_repeat=thread_state.do_not_repeat,
        companion_briefing_snippet=companion_briefing_snippet,
    )


def resolve_critic_context_max_chars(max_chars: int | None = None) -> int:
    if max_chars is not None:
        return max_chars
    from app.config import get_settings

    return get_settings().critic_context_max_chars


def render_context_packet_sections_for_critic(
    packet: AiContextPacketWire,
    *,
    max_chars: int | None = None,
) -> str:
    budget = resolve_critic_context_max_chars(max_chars)
    excluded_card_ids = set(packet.redaction.excluded_card_ids)
    thread = packet.open_thread
    lines: list[str] = [
        "### User intent",
        f"- Message context: {packet.user_intent.message}",
        f"- Mode: {packet.user_intent.mode.value}",
    ]

    if packet.user_intent.primary_action:
        action = packet.user_intent.primary_action
        lines.append(f"- Primary action: {action.title} ({action.kind}) — {action.smallest_action}")

    lines.extend(
        _critic_evidence_from_open_thread(
            thread,
            companion_briefing_snippet=_companion_briefing_snippet(packet.companion),
        )
    )

    lines.extend(
        [
            "",
            "### Active limit",
            f"- {packet.board.active_limit.message}",
            "",
            "### Active cards (ranked)",
        ]
    )

    active_cards = [
        slice_item
        for slice_item in sorted(packet.active_cards, key=lambda item: item.rank, reverse=True)
        if _card_slice_renderable(slice_item, excluded_card_ids=excluded_card_ids)
    ][:3]
    if active_cards:
        lines.extend(_format_card_slice(slice_item) for slice_item in active_cards)
    else:
        lines.append("- (none)")

    lines.extend(["", "### Stale / reheat cards (ranked)"])
    stale_cards = [
        slice_item
        for slice_item in sorted(packet.stale_cards, key=lambda item: item.rank, reverse=True)
        if _card_slice_renderable(slice_item, excluded_card_ids=excluded_card_ids)
    ][:2]
    if stale_cards:
        lines.extend(_format_card_slice(slice_item) for slice_item in stale_cards)
    else:
        lines.append("- (none)")

    recovery = [
        slice_item
        for slice_item in sorted(packet.recovery_signals, key=lambda item: item.rank, reverse=True)
        if slice_item.sensitivity != SensitivityLevel.S3
    ][:2]
    if recovery:
        lines.extend(["", "### Recovery signals"])
        for slice_item in recovery:
            lines.append(f"- [{slice_item.rank}] {slice_item.payload.summary}")

    if packet.board.diagnoses:
        lines.extend(["", "### Board diagnoses"])
        for item in packet.board.diagnoses[:2]:
            lines.append(f"- {item.summary}")

    proof = [
        slice_item
        for slice_item in packet.recent_proof
        if slice_item.sensitivity != SensitivityLevel.S3
    ][:2]
    if proof:
        lines.extend(["", "### Recent proof"])
        for slice_item in proof:
            lines.append(f"- {slice_item.payload.summary} ({slice_item.payload.timestamp})")

    return _truncate_critic_bundle("\n".join(lines), budget)


def _render_legacy_critic_context(
    request: ChatHarnessRequest,
    *,
    max_chars: int | None = None,
) -> str:
    budget = resolve_critic_context_max_chars(max_chars)
    active = [card for card in request.context.cards if card.state == CardState.active]
    active_titles = ", ".join(card.title for card in active[:3]) or "(none)"
    lines = [
        f"Active cards ({len(active)}): {active_titles}",
    ]
    lines.extend(_critic_evidence_from_thread_state(request.thread_state))
    if request.context.recent_analyses:
        lines.append("Board diagnoses:")
        for item in request.context.recent_analyses[:2]:
            lines.append(f"- {item.summary}")
    return _truncate_critic_bundle("\n".join(lines), budget)


def resolve_critic_context_bundle_for_prompt(
    request: ChatHarnessRequest,
    *,
    max_chars: int | None = None,
) -> str:
    if request.context_packet is not None:
        try:
            return render_context_packet_sections_for_critic(
                request.context_packet,
                max_chars=max_chars,
            )
        except Exception:
            logger.warning(
                "context_packet critic render failed; falling back to legacy context",
                exc_info=True,
            )

    return _render_legacy_critic_context(request, max_chars=max_chars)


def resolve_context_bundle_for_prompt(request: ChatHarnessRequest) -> str:
    if request.context_packet is not None:
        return render_context_packet_sections(request.context_packet)

    context: HarnessContext = request.context
    return json.dumps(context.model_dump(mode="json"), indent=2, ensure_ascii=False)
