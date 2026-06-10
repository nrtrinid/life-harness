from __future__ import annotations

from dataclasses import dataclass

from app.models import ReasoningDepth
from app.slots.types import ModelSlotId


@dataclass(frozen=True)
class SlotPlan:
    slot_ids: tuple[ModelSlotId, ...]


def resolve_slots_for_chat_harness(reasoning_depth: ReasoningDepth) -> SlotPlan:
    del reasoning_depth
    return SlotPlan(slot_ids=("companion_fast",))
