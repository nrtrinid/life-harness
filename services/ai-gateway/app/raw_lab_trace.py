from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

from app.config import Settings
from app.models import RawLabRequest

logger = logging.getLogger(__name__)


@dataclass
class RawLabDeepTrace:
    reasoning_depth: str = "deep"
    passes: list[str] = field(default_factory=list)
    used_thread_mind: bool = False
    used_companion_self_memories: bool = False
    review_applied: bool = False
    fallback_used: bool = False
    depth_route: dict[str, object] | None = None
    latency_ms: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "reasoning_depth": self.reasoning_depth,
            "passes": list(self.passes),
            "used_thread_mind": self.used_thread_mind,
            "used_companion_self_memories": self.used_companion_self_memories,
            "review_applied": self.review_applied,
            "fallback_used": self.fallback_used,
            "latency_ms": dict(self.latency_ms),
        }
        if self.depth_route is not None:
            payload["depth_route"] = self.depth_route
        return payload


def _has_thread_mind(request: RawLabRequest) -> bool:
    state = request.thread_state
    return any(
        [
            bool(state.recent_digest.strip()),
            bool(state.pinned_facts),
            bool(state.open_loops),
            bool(state.user_steering),
            bool(state.do_not_repeat),
            bool(state.recurring_topics),
            bool(state.current_vibe.strip()),
            bool(state.provisional_stances),
            bool(state.self_observations),
            bool(state.questions_to_revisit),
        ]
    )


def new_raw_lab_deep_trace(request: RawLabRequest) -> RawLabDeepTrace:
    return RawLabDeepTrace(
        reasoning_depth=request.reasoning_depth.value,
        used_thread_mind=_has_thread_mind(request),
        used_companion_self_memories=bool(request.companion_self_memories),
    )


def attach_raw_lab_depth_route(
    settings: Settings,
    request: RawLabRequest,
    trace: RawLabDeepTrace | None = None,
) -> None:
    from app.orchestrator.depth_routing import GatewayRouteEndpoint, resolve_depth_route

    route = resolve_depth_route(
        endpoint=GatewayRouteEndpoint.raw_lab,
        settings=settings,
        reasoning_depth=request.reasoning_depth,
    )
    route_dict = route.to_dict()
    emit_raw_lab_route_trace(settings, depth_route=route_dict)
    if trace is not None:
        trace.depth_route = route_dict


def emit_raw_lab_deep_trace(
    settings: Settings, trace: RawLabDeepTrace | None
) -> None:
    if trace is None or not settings.debug_thinking_trace:
        return
    logger.info(
        "raw_lab_deep_trace %s",
        json.dumps(trace.to_dict(), sort_keys=True),
    )


def emit_raw_lab_route_trace(
    settings: Settings,
    *,
    depth_route: dict[str, object],
) -> None:
    if not settings.debug_thinking_trace:
        return
    logger.info(
        "raw_lab_depth_route %s",
        json.dumps(depth_route, sort_keys=True),
    )


def record_raw_lab_pass_latency(
    trace: RawLabDeepTrace | None, pass_name: str, started: float
) -> None:
    if trace is None:
        return
    trace.latency_ms[pass_name] = int((time.perf_counter() - started) * 1000)
