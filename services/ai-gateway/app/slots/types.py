from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ModelSlotId = Literal[
    "companion_fast",
    "memory_embed",
    "critic_small",
    "coder_daily",
    "coder_daily_alt",
    "stretch_batch",
    "stretch_experimental",
]

BackendKind = Literal["openvino", "llamacpp", "mock"]

KNOWN_SLOT_IDS: frozenset[str] = frozenset(
    {
        "companion_fast",
        "memory_embed",
        "critic_small",
        "coder_daily",
        "coder_daily_alt",
        "stretch_batch",
        "stretch_experimental",
    }
)

# v1 -> v2 renames (models.yaml version 2).
DEPRECATED_SLOT_IDS: dict[str, str] = {
    "critic": "critic_small",
    "coding_daily": "coder_daily",
    "coding_stretch": "stretch_batch",
    "reflection_stretch": "stretch_batch",
    "experimental_qwen30": "stretch_batch",
}

KNOWN_BACKENDS: frozenset[str] = frozenset({"openvino", "llamacpp", "mock"})


@dataclass(frozen=True)
class SlotConfig:
    slot_id: ModelSlotId
    enabled: bool
    backend: BackendKind
    model_path: str
    model_id: str | None = None
    device: str | None = None
    keep_loaded: bool = False
    heavy: bool = False
    batch_only: bool = False
    max_new_tokens: int | None = None
    temperature: float | None = None
    llamacpp: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelsConfigDefaults:
    idle_unload_seconds: int
    heavy_load_timeout_seconds: int
    warm_on_start: tuple[str, ...]


@dataclass(frozen=True)
class ModelsConfig:
    version: int
    defaults: ModelsConfigDefaults
    slots: dict[ModelSlotId, SlotConfig]
