import json
import logging

from app.context_packet import AiContextPacketWire, RankedBoardCardSlice
from app.models import CardState, ChatHarnessRequest, HarnessContext, SensitivityLevel

logger = logging.getLogger(__name__)

CRITIC_CONTEXT_MAX_CHARS = 1800


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
    lines: list[str] = [
        "### User intent",
        f"- Message context: {packet.user_intent.message}",
        f"- Mode: {packet.user_intent.mode.value}",
        f"- Sensitivity: {packet.user_intent.sensitivity.value}",
    ]

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


def render_context_packet_sections_for_critic(
    packet: AiContextPacketWire,
    *,
    max_chars: int = CRITIC_CONTEXT_MAX_CHARS,
) -> str:
    excluded_card_ids = set(packet.redaction.excluded_card_ids)
    lines: list[str] = [
        "### User intent",
        f"- Message context: {packet.user_intent.message}",
        f"- Mode: {packet.user_intent.mode.value}",
    ]

    if packet.user_intent.primary_action:
        action = packet.user_intent.primary_action
        lines.append(f"- Primary action: {action.title} ({action.kind}) — {action.smallest_action}")

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

    thread = packet.open_thread
    if thread.active_goal or thread.open_loops:
        lines.extend(["", "### Thread continuity"])
        if thread.active_goal:
            lines.append(f"- Thread goal: {thread.active_goal}")
        if thread.open_loops:
            open_loops = ", ".join(thread.open_loops[:3]) or "(none)"
            lines.append(f"- Open loops: {open_loops}")

    return _truncate_critic_bundle("\n".join(lines), max_chars)


def _render_legacy_critic_context(request: ChatHarnessRequest) -> str:
    active = [card for card in request.context.cards if card.state == CardState.active]
    active_titles = ", ".join(card.title for card in active[:3]) or "(none)"
    lines = [
        f"Active cards ({len(active)}): {active_titles}",
        f"Thread goal: {request.thread_state.active_goal or '(none)'}",
        f"Open loops: {', '.join(request.thread_state.open_loops[:3]) or '(none)'}",
    ]
    if request.context.recent_analyses:
        lines.append("Board diagnoses:")
        for item in request.context.recent_analyses[:2]:
            lines.append(f"- {item.summary}")
    return "\n".join(lines)


def resolve_critic_context_bundle_for_prompt(request: ChatHarnessRequest) -> str:
    if request.context_packet is not None:
        try:
            return render_context_packet_sections_for_critic(request.context_packet)
        except Exception:
            logger.warning(
                "context_packet critic render failed; falling back to legacy context",
                exc_info=True,
            )

    return _render_legacy_critic_context(request)


def resolve_context_bundle_for_prompt(request: ChatHarnessRequest) -> str:
    if request.context_packet is not None:
        return render_context_packet_sections(request.context_packet)

    context: HarnessContext = request.context
    return json.dumps(context.model_dump(mode="json"), indent=2, ensure_ascii=False)
