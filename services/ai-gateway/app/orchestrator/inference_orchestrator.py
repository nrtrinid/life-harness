from __future__ import annotations

import json
import logging
from functools import lru_cache

from app.config import get_settings
from app.models import ChatHarnessRequest, ChatHarnessResponse, ReasoningDepth
from app.orchestrator.depth_routing import GatewayRouteEndpoint, resolve_depth_route
from app.orchestrator.slot_plan import resolve_slots_for_chat_harness
from app.slots.manager import ModelSlotManager, get_slot_manager

logger = logging.getLogger(__name__)


class InferenceOrchestrator:
    def __init__(self, slot_manager: ModelSlotManager) -> None:
        self._slot_manager = slot_manager

    def run_chat_harness(self, request: ChatHarnessRequest) -> ChatHarnessResponse:
        settings = get_settings()
        route = resolve_depth_route(
            endpoint=GatewayRouteEndpoint.chat_harness,
            settings=settings,
            reasoning_depth=request.reasoning_depth,
        )
        if settings.debug_thinking_trace:
            logger.info(
                "chat_harness_depth_route %s",
                json.dumps(route.to_dict(), sort_keys=True),
            )

        plan = resolve_slots_for_chat_harness(request.reasoning_depth)
        for slot_id in plan.slot_ids:
            self._slot_manager.acquire(slot_id)

        from app.main import get_provider

        provider = get_provider()
        if (
            settings.deep_enabled
            and request.reasoning_depth == ReasoningDepth.deep
        ):
            return provider._run_chat_harness_deep(request)
        return provider._run_chat_harness_impl(request)


@lru_cache
def get_inference_orchestrator() -> InferenceOrchestrator:
    return InferenceOrchestrator(get_slot_manager())
