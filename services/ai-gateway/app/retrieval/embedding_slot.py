from __future__ import annotations

from enum import Enum
from typing import Literal

from app.config import get_slot_registry
from app.models import StrictModel
from app.slots.manager import (
    SlotDisabledError,
    SlotNotAvailableError,
    get_slot_manager,
)


class EmbeddingSlotStatus(str, Enum):
    not_configured = "not_configured"
    disabled = "disabled"
    ready = "ready"
    unavailable_in_gateway = "unavailable_in_gateway"


class MemoryEmbedSlotStatus(StrictModel):
    slot_id: Literal["memory_embed"] = "memory_embed"
    status: EmbeddingSlotStatus
    backend: Literal["openvino", "llamacpp"] | None = None
    note: str | None = None


def resolve_memory_embed_slot() -> MemoryEmbedSlotStatus:
    """Resolve memory_embed slot availability without running embeddings."""
    try:
        registry = get_slot_registry()
    except Exception as exc:
        return MemoryEmbedSlotStatus(
            status=EmbeddingSlotStatus.not_configured,
            backend=None,
            note=f"slot registry unavailable: {exc}",
        )

    try:
        slot = registry.get("memory_embed")
    except Exception as exc:
        return MemoryEmbedSlotStatus(
            status=EmbeddingSlotStatus.not_configured,
            backend=None,
            note=f"memory_embed slot missing: {exc}",
        )

    backend = slot.backend if slot.backend in ("openvino", "llamacpp") else None

    if not slot.enabled:
        return MemoryEmbedSlotStatus(
            status=EmbeddingSlotStatus.disabled,
            backend=backend,
            note="memory_embed slot is disabled in models config",
        )

    try:
        get_slot_manager().acquire("memory_embed")
        return MemoryEmbedSlotStatus(
            status=EmbeddingSlotStatus.ready,
            backend=backend,
            note="memory_embed slot enabled and acquirable",
        )
    except SlotDisabledError:
        return MemoryEmbedSlotStatus(
            status=EmbeddingSlotStatus.disabled,
            backend=backend,
            note="memory_embed slot disabled at runtime",
        )
    except SlotNotAvailableError:
        return MemoryEmbedSlotStatus(
            status=EmbeddingSlotStatus.unavailable_in_gateway,
            backend=backend,
            note="memory_embed slot enabled but not implemented in this gateway build",
        )

