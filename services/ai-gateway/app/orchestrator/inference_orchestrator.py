from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.models import ChatHarnessRequest, ChatHarnessResponse, ReasoningDepth
from app.orchestrator.slot_plan import resolve_slots_for_chat_harness
from app.slots.manager import ModelSlotManager, get_slot_manager


class InferenceOrchestrator:
    def __init__(self, slot_manager: ModelSlotManager) -> None:
        self._slot_manager = slot_manager

    def run_chat_harness(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        plan = resolve_slots_for_chat_harness(request.reasoning_depth)
        for slot_id in plan.slot_ids:
            self._slot_manager.acquire(slot_id)

        from app.main import get_provider

        provider = get_provider()
        settings = get_settings()
        if (
            settings.deep_enabled
            and request.reasoning_depth == ReasoningDepth.deep
        ):
            return provider._run_chat_harness_deep(request)
        return provider._run_chat_harness_impl(request)


@lru_cache
def get_inference_orchestrator() -> InferenceOrchestrator:
    return InferenceOrchestrator(get_slot_manager())
