from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.context_packet import (
    AiContextPacketWire,
    ContextRankTier,
    RankedBoardCardSlice,
)
from app.models import CardState, HarnessContext, SensitivityLevel
from app.synthesis_models import DeepSynthesisRequest

logger = logging.getLogger(__name__)

DEEP_SYNTHESIS_CONTEXT_MAX_CHARS = 7500
DEEP_SYNTHESIS_CONTEXT_ITEM_MAX_CHARS = 800
DEEP_SYNTHESIS_HISTORY_MAX_CHARS = 2000

_TIER_DROP_ORDER = (
    ContextRankTier.filler,
    ContextRankTier.low,
    ContextRankTier.medium,
    ContextRankTier.high,
    ContextRankTier.critical,
)

_SECTION_ORDER = ("Critical", "High", "Medium", "Low")
_SECTION_DROP_WEIGHT = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}


@dataclass(frozen=True)
class _ContextLine:
    section: str
    tier: ContextRankTier
    rank: int
    text: str


def _truncate_item(text: str, max_chars: int = DEEP_SYNTHESIS_CONTEXT_ITEM_MAX_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def _tier_weight(tier: ContextRankTier) -> int:
    return {tier: index for index, tier in enumerate(_TIER_DROP_ORDER)}.get(tier, 99)


def _card_renderable(
    slice_item: RankedBoardCardSlice,
    *,
    excluded_card_ids: set[str],
) -> bool:
    if slice_item.sensitivity == SensitivityLevel.S3:
        return False
    if slice_item.payload.card_id in excluded_card_ids:
        return False
    return True


def _format_active_card_line(slice_item: RankedBoardCardSlice) -> str:
    payload = slice_item.payload
    stale = " (stale)" if payload.is_stale else ""
    return (
        f"Active card: [{payload.card_id}] {payload.title}{stale} — "
        f"{payload.next_tiny_action}"
    )


def _collect_packet_lines(packet: AiContextPacketWire) -> list[_ContextLine]:
    excluded_card_ids = set(packet.redaction.excluded_card_ids)
    lines: list[_ContextLine] = []

    if packet.user_intent.primary_action:
        action = packet.user_intent.primary_action
        ref = f" [{action.card_id}]" if action.card_id else ""
        lines.append(
            _ContextLine(
                section="Critical",
                tier=ContextRankTier.critical,
                rank=1000,
                text=f"Primary action:{ref} {action.title} — {action.smallest_action}",
            )
        )

    thread = packet.open_thread
    if thread.active_goal:
        lines.append(
            _ContextLine(
                section="Critical",
                tier=ContextRankTier.critical,
                rank=950,
                text=f"Current thread goal: {thread.active_goal}",
            )
        )

    for slice_item in sorted(packet.active_cards, key=lambda item: item.rank, reverse=True):
        if not _card_renderable(slice_item, excluded_card_ids=excluded_card_ids):
            continue
        lines.append(
            _ContextLine(
                section="Critical",
                tier=slice_item.tier,
                rank=slice_item.rank,
                text=_format_active_card_line(slice_item),
            )
        )

    for slice_item in sorted(packet.stale_cards, key=lambda item: item.rank, reverse=True):
        if slice_item.tier == ContextRankTier.filler:
            continue
        if not _card_renderable(slice_item, excluded_card_ids=excluded_card_ids):
            continue
        payload = slice_item.payload
        neglect = f" — {payload.neglect_reason}" if payload.neglect_reason else ""
        lines.append(
            _ContextLine(
                section="High",
                tier=slice_item.tier,
                rank=slice_item.rank,
                text=(
                    f"Stale card: [{payload.card_id}] {payload.title}{neglect} — "
                    f"{payload.next_tiny_action}"
                ),
            )
        )

    for slice_item in sorted(packet.recent_proof, key=lambda item: item.rank, reverse=True):
        if slice_item.sensitivity == SensitivityLevel.S3:
            continue
        if slice_item.tier == ContextRankTier.filler:
            continue
        payload = slice_item.payload
        lines.append(
            _ContextLine(
                section="High",
                tier=slice_item.tier,
                rank=slice_item.rank,
                text=f"Recent proof: [{payload.proof_id}] {payload.summary} ({payload.timestamp})",
            )
        )

    for slice_item in sorted(packet.recovery_signals, key=lambda item: item.rank, reverse=True):
        if slice_item.sensitivity == SensitivityLevel.S3:
            continue
        if slice_item.tier == ContextRankTier.filler:
            continue
        lines.append(
            _ContextLine(
                section="High",
                tier=slice_item.tier,
                rank=slice_item.rank,
                text=f"Recovery signal: {slice_item.payload.summary}",
            )
        )

    for loop in thread.open_loops[:8]:
        lines.append(
            _ContextLine(
                section="High",
                tier=ContextRankTier.high,
                rank=50,
                text=f"Open loop: {loop}",
            )
        )

    for slice_item in sorted(packet.memories, key=lambda item: item.rank, reverse=True):
        if slice_item.sensitivity == SensitivityLevel.S3:
            continue
        if slice_item.tier == ContextRankTier.filler:
            continue
        payload = slice_item.payload
        lines.append(
            _ContextLine(
                section="Medium",
                tier=slice_item.tier,
                rank=slice_item.rank,
                text=f"Approved memory: [{payload.memory_id}] {payload.title}: {payload.summary}",
            )
        )

    for index, diagnosis in enumerate(packet.board.diagnoses[:2]):
        lines.append(
            _ContextLine(
                section="Medium",
                tier=ContextRankTier.medium,
                rank=80 - index,
                text=f"Board diagnosis: {diagnosis.summary}",
            )
        )

    companion = packet.companion
    for index, line in enumerate(companion.briefing_prepared[:3]):
        lines.append(
            _ContextLine(
                section="Medium",
                tier=ContextRankTier.medium,
                rank=40 - index,
                text=f"Companion prepared: {line}",
            )
        )
    for index, line in enumerate(companion.briefing_detected[:3]):
        lines.append(
            _ContextLine(
                section="Medium",
                tier=ContextRankTier.medium,
                rank=30 - index,
                text=f"Companion detected: {line}",
            )
        )

    for slice_item in sorted(packet.project_docs, key=lambda item: item.rank, reverse=True):
        if slice_item.sensitivity == SensitivityLevel.S3:
            continue
        if slice_item.tier == ContextRankTier.filler:
            continue
        payload = slice_item.payload
        lines.append(
            _ContextLine(
                section="Low",
                tier=slice_item.tier,
                rank=slice_item.rank,
                text=f"Project note: [{payload.doc_id}] {payload.title}: {payload.excerpt}",
            )
        )

    for index, decision in enumerate(packet.board.product_decisions):
        lines.append(
            _ContextLine(
                section="Low",
                tier=ContextRankTier.low,
                rank=index,
                text=f"Product rule: {decision.summary}",
            )
        )

    return lines


def _trim_context_lines(
    lines: list[_ContextLine],
    *,
    max_chars: int,
    user_intent_line: str | None = None,
) -> tuple[list[_ContextLine], list[str]]:
    excluded_notes: list[str] = []
    trimmed = [
        _ContextLine(
            section=line.section,
            tier=line.tier,
            rank=line.rank,
            text=_truncate_item(line.text),
        )
        for line in lines
    ]

    def _content_len(selected: list[_ContextLine], notes: list[str]) -> int:
        return len(
            _format_context_block(
                selected,
                user_intent_line=user_intent_line,
                excluded_notes=notes,
            )
        )

    while trimmed and _content_len(trimmed, excluded_notes) > max_chars:
        droppable = sorted(
            trimmed,
            key=lambda line: (
                _tier_weight(line.tier),
                _SECTION_DROP_WEIGHT.get(line.section, 1),
                line.rank,
            ),
        )
        dropped = droppable[0]
        trimmed.remove(dropped)
        excluded_notes.append(
            f"Trimmed for budget: {dropped.section} item (tier={dropped.tier.value})."
        )

    if trimmed and _content_len(trimmed, excluded_notes) > max_chars:
        return trimmed, excluded_notes + [f"Context block truncated to {max_chars} chars."]

    return trimmed, excluded_notes


def _format_context_block(
    lines: list[_ContextLine],
    *,
    user_intent_line: str | None = None,
    excluded_notes: list[str] | None = None,
) -> str:
    output: list[str] = ["Context packet:"]
    if user_intent_line:
        output.append(f"- User intent: {user_intent_line}")

    for section in _SECTION_ORDER:
        section_lines = [line for line in lines if line.section == section]
        if not section_lines:
            continue
        output.append(f"- {section}:")
        for line in section_lines:
            output.append(f"  - {line.text}")

    notes = excluded_notes or []
    if notes:
        output.append("- Excluded/summarized:")
        for note in notes:
            output.append(f"  - {note}")

    return "\n".join(output)


def _render_packet_context(packet: AiContextPacketWire) -> tuple[str, list[str]]:
    intent_line = (
        f"{packet.user_intent.message} (mode: {packet.user_intent.mode.value}, "
        f"sensitivity: {packet.user_intent.sensitivity.value})"
    )
    lines = _collect_packet_lines(packet)
    trimmed, trim_notes = _trim_context_lines(
        lines,
        max_chars=DEEP_SYNTHESIS_CONTEXT_MAX_CHARS,
        user_intent_line=intent_line,
    )
    block = _format_context_block(
        trimmed,
        user_intent_line=intent_line,
        excluded_notes=trim_notes,
    )
    if len(block) > DEEP_SYNTHESIS_CONTEXT_MAX_CHARS:
        block = block[: DEEP_SYNTHESIS_CONTEXT_MAX_CHARS - 1].rstrip() + "…"
    return block, []


def _render_legacy_synthesis_context(request: DeepSynthesisRequest) -> str:
    context: HarnessContext = request.context
    active = [card for card in context.cards if card.state == CardState.active]
    lines: list[str] = [
        "Context packet:",
        f"- User intent: {request.user_prompt} (legacy board summary)",
    ]

    active_count = len(active)
    if active_count > 3:
        lines.append(
            f"- Active limit: {active_count} active cards (product limit is typically 3)."
        )

    lines.append("- Critical:")
    if active:
        for card in active[:3]:
            lines.append(f"  - Active card: {card.title} — {card.next_tiny_action}")
    else:
        lines.append("  - (no active cards)")

    goal = request.thread_state.active_goal
    if goal:
        lines.append(f"  - Current thread goal: {goal}")

    loops = request.thread_state.open_loops[:3]
    if loops:
        lines.append("- High:")
        for loop in loops:
            lines.append(f"  - Open loop: {loop}")

    if context.recent_analyses:
        lines.append("- Medium:")
        for item in context.recent_analyses[:2]:
            lines.append(f"  - Board diagnosis: {item.summary}")

    return "\n".join(lines)


def build_deep_synthesis_context_block(
    request: DeepSynthesisRequest,
) -> tuple[str, list[str]]:
    """Returns (markdown_block, degraded_notes). Never raises."""
    degraded_notes: list[str] = []
    try:
        if request.context_packet is not None:
            block, notes = _render_packet_context(request.context_packet)
            return block, degraded_notes + notes
    except Exception:
        logger.warning(
            "context_packet synthesis render failed; falling back to legacy context",
            exc_info=True,
        )
        degraded_notes.append(
            "Context packet render failed; using legacy board summary."
        )

    return _render_legacy_synthesis_context(request), degraded_notes


def resolve_deep_synthesis_history_for_prompt(
    request: DeepSynthesisRequest,
) -> tuple[str, list[str]]:
    """Returns (history_section, excluded_notes)."""
    excluded_notes: list[str] = []
    digest = request.thread_state.recent_digest.strip()
    if not digest and request.context_packet is not None:
        digest = request.context_packet.open_thread.recent_digest.strip()

    if digest:
        excluded_notes.append("Full chat history trimmed; digest used instead.")
        return (
            json.dumps({"recent_digest": digest}, indent=2, ensure_ascii=False),
            excluded_notes,
        )

    if not request.conversation_history:
        return "[]", excluded_notes

    turns = list(reversed(request.conversation_history))
    selected: list[dict] = []
    total_chars = 2
    for turn in turns:
        serialized = turn.model_dump(mode="json")
        turn_chars = len(json.dumps(serialized, ensure_ascii=False))
        if total_chars + turn_chars > DEEP_SYNTHESIS_HISTORY_MAX_CHARS and selected:
            excluded_notes.append(
                f"Older conversation turns trimmed; kept {len(selected)} recent turn(s)."
            )
            break
        selected.insert(0, serialized)
        total_chars += turn_chars

    return json.dumps(selected, indent=2, ensure_ascii=False), excluded_notes


def resolve_thread_state_for_synthesis_prompt(request: DeepSynthesisRequest) -> str:
    """Slim thread state JSON — avoid duplicating packet open_thread fields."""
    if request.context_packet is not None:
        thread = request.context_packet.open_thread
        if thread.active_goal or thread.recent_digest or thread.open_loops:
            slim = {
                "note": "Thread continuity summarized in context packet.",
                "current_topic": thread.current_topic or None,
                "pinned_facts": thread.pinned_facts[:4] if thread.pinned_facts else [],
            }
            slim = {key: value for key, value in slim.items() if value}
            return json.dumps(slim, indent=2, ensure_ascii=False)

    from app.models import ChatHarnessThreadState

    state = request.thread_state or ChatHarnessThreadState()
    return json.dumps(state.model_dump(mode="json"), indent=2, ensure_ascii=False)
