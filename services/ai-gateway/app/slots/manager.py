from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from threading import Lock
from typing import TYPE_CHECKING

from app.backends.base import InferenceBackend
from app.backends.llamacpp_backend import LlamaCppBackend, build_llamacpp_backend_for_slot
from app.config import Settings, get_settings, get_slot_registry
from app.models import SlotHealthEntry, SlotHealthStatus
from app.slots.registry import ModelSlotRegistry
from app.slots.types import ModelSlotId

if TYPE_CHECKING:
    from app.backends.openvino_backend import OpenVinoBackend

logger = logging.getLogger(__name__)


class SlotDisabledError(Exception):
    """Raised when acquire is called on a disabled slot."""


class SlotNotAvailableError(Exception):
    """Raised when a slot backend is not implemented in this gateway version."""


@dataclass(frozen=True)
class AcquiredSlot:
    slot_id: ModelSlotId
    backend: InferenceBackend | LlamaCppBackend | None
    enabled: bool


class ModelSlotManager:
    # Heavy-slot VRAM mutex placeholder for Ticket 4+.
    _heavy_lock = Lock()

    def __init__(self, settings: Settings, registry: ModelSlotRegistry) -> None:
        self._settings = settings
        self._registry = registry
        self._companion_backend: OpenVinoBackend | None = None

    @property
    def companion_backend(self) -> OpenVinoBackend:
        if self._companion_backend is None:
            from app.backends.openvino_backend import OpenVinoBackend

            self._companion_backend = OpenVinoBackend(self._settings)
        return self._companion_backend

    def effective_warm_slots(self) -> tuple[str, ...]:
        if self._settings.warm_slots:
            return self._settings.warm_slots
        return self._registry.config.defaults.warm_on_start

    def acquire(self, slot_id: ModelSlotId) -> AcquiredSlot:
        slot = self._registry.get(slot_id)
        if not slot.enabled:
            raise SlotDisabledError(f"Slot {slot_id} is disabled")

        if slot_id == "companion_fast":
            if self._settings.provider == "mock":
                return AcquiredSlot(slot_id=slot_id, backend=None, enabled=True)
            if slot.backend == "openvino":
                return AcquiredSlot(
                    slot_id=slot_id,
                    backend=self.companion_backend,
                    enabled=True,
                )

        if slot_id == "critic_small" and slot.backend == "llamacpp":
            return AcquiredSlot(
                slot_id=slot_id,
                backend=build_llamacpp_backend_for_slot(slot, self._settings),
                enabled=True,
            )

        if slot.backend == "llamacpp":
            raise SlotNotAvailableError(
                f"Slot {slot_id} uses llamacpp backend — not available in this gateway version"
            )

        raise SlotNotAvailableError(f"Slot {slot_id} is not available")

    def warm(self, slot_id: ModelSlotId) -> None:
        if self._settings.provider != "openvino":
            return
        if slot_id != "companion_fast":
            raise SlotNotAvailableError(f"Warm not supported for slot {slot_id}")
        slot = self._registry.get(slot_id)
        if not slot.enabled:
            raise SlotDisabledError(f"Slot {slot_id} is disabled")
        self.companion_backend.ensure_ready()

    def _companion_fast_state(self) -> SlotHealthStatus:
        slot = self._registry.companion_fast()
        if not slot.enabled:
            return SlotHealthStatus.disabled

        if self._settings.provider == "mock":
            return SlotHealthStatus.ready

        backend = self.companion_backend
        if not backend.is_importable() or not backend.is_model_path_ready():
            return SlotHealthStatus.degraded
        if backend.load_error:
            return SlotHealthStatus.degraded
        if backend.pipeline_loaded:
            return SlotHealthStatus.ready
        return SlotHealthStatus.ready

    def slot_health(self) -> dict[str, SlotHealthEntry]:
        entries: dict[str, SlotHealthEntry] = {}
        for slot_id, slot in self._registry.config.slots.items():
            if slot_id == "companion_fast":
                state = self._companion_fast_state()
            elif slot_id == "critic_small" and slot.enabled:
                state = SlotHealthStatus.degraded
            elif not slot.enabled:
                state = SlotHealthStatus.disabled
            else:
                state = SlotHealthStatus.disabled
            entries[slot_id] = SlotHealthEntry(enabled=slot.enabled, state=state)
        return entries


@lru_cache
def get_slot_manager() -> ModelSlotManager:
    return ModelSlotManager(get_settings(), get_slot_registry())
