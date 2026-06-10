from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from app.slots.types import (
    DEPRECATED_SLOT_IDS,
    KNOWN_BACKENDS,
    KNOWN_SLOT_IDS,
    ModelSlotId,
    ModelsConfig,
    ModelsConfigDefaults,
    SlotConfig,
)

if TYPE_CHECKING:
    from app.config import Settings


class SlotRegistryError(ValueError):
    pass


@dataclass
class ModelSlotRegistry:
    config: ModelsConfig

    def get(self, slot_id: ModelSlotId) -> SlotConfig:
        if slot_id not in self.config.slots:
            raise KeyError(f"Unknown slot: {slot_id}")
        return self.config.slots[slot_id]

    def enabled_slots(self) -> list[SlotConfig]:
        return [slot for slot in self.config.slots.values() if slot.enabled]

    def companion_fast(self) -> SlotConfig:
        return self.get("companion_fast")

    def critic_small(self) -> SlotConfig:
        return self.get("critic_small")


def _require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SlotRegistryError(f"{label} must be a mapping")
    return value


def _parse_bool(value: Any, label: str) -> bool:
    if isinstance(value, bool):
        return value
    raise SlotRegistryError(f"{label} must be a boolean")


def _parse_slot(slot_id: str, raw: Any) -> SlotConfig:
    if slot_id in DEPRECATED_SLOT_IDS:
        raise SlotRegistryError(
            f"Slot id {slot_id!r} was renamed to {DEPRECATED_SLOT_IDS[slot_id]!r} in models.yaml v2"
        )
    if slot_id not in KNOWN_SLOT_IDS:
        raise SlotRegistryError(f"Unknown slot id: {slot_id}")

    data = _require_mapping(raw, f"slots.{slot_id}")
    backend = data.get("backend")
    if backend not in KNOWN_BACKENDS:
        raise SlotRegistryError(
            f"slots.{slot_id}.backend must be one of {sorted(KNOWN_BACKENDS)}"
        )

    model_path = data.get("model_path")
    if not isinstance(model_path, str) or not model_path.strip():
        raise SlotRegistryError(f"slots.{slot_id}.model_path must be a non-empty string")

    enabled = _parse_bool(data.get("enabled", False), f"slots.{slot_id}.enabled")

    llamacpp_raw = data.get("llamacpp", {})
    if llamacpp_raw is None:
        llamacpp_raw = {}
    if not isinstance(llamacpp_raw, dict):
        raise SlotRegistryError(f"slots.{slot_id}.llamacpp must be a mapping")

    model_id = data.get("model_id")
    device = data.get("device")
    max_new_tokens = data.get("max_new_tokens")
    temperature = data.get("temperature")

    return SlotConfig(
        slot_id=slot_id,  # type: ignore[arg-type]
        enabled=enabled,
        backend=backend,  # type: ignore[arg-type]
        model_path=model_path.strip(),
        model_id=model_id if isinstance(model_id, str) else None,
        device=device if isinstance(device, str) else None,
        keep_loaded=_parse_bool(data.get("keep_loaded", False), f"slots.{slot_id}.keep_loaded"),
        heavy=_parse_bool(data.get("heavy", False), f"slots.{slot_id}.heavy"),
        batch_only=_parse_bool(data.get("batch_only", False), f"slots.{slot_id}.batch_only"),
        max_new_tokens=int(max_new_tokens) if max_new_tokens is not None else None,
        temperature=float(temperature) if temperature is not None else None,
        llamacpp=dict(llamacpp_raw),
    )


def _apply_settings_overrides(
    slots: dict[ModelSlotId, SlotConfig], settings: Settings
) -> dict[ModelSlotId, SlotConfig]:
    companion = slots.get("companion_fast")
    if companion is None:
        return slots

    updated = dict(slots)
    updated["companion_fast"] = SlotConfig(
        slot_id=companion.slot_id,
        enabled=companion.enabled,
        backend=companion.backend,
        model_path=settings.model_path,
        model_id=companion.model_id,
        device=settings.device,
        keep_loaded=companion.keep_loaded,
        heavy=companion.heavy,
        batch_only=companion.batch_only,
        max_new_tokens=companion.max_new_tokens,
        temperature=companion.temperature,
        llamacpp=companion.llamacpp,
    )
    return updated


def _parse_models_config(raw: Any) -> ModelsConfig:
    root = _require_mapping(raw, "models config root")
    version = root.get("version")
    if not isinstance(version, int):
        raise SlotRegistryError("version must be an integer")

    defaults_raw = _require_mapping(root.get("defaults", {}), "defaults")
    warm_on_start_raw = defaults_raw.get("warm_on_start", [])
    if not isinstance(warm_on_start_raw, list) or not all(
        isinstance(item, str) for item in warm_on_start_raw
    ):
        raise SlotRegistryError("defaults.warm_on_start must be a list of strings")

    for slot_name in warm_on_start_raw:
        if slot_name not in KNOWN_SLOT_IDS:
            raise SlotRegistryError(f"defaults.warm_on_start references unknown slot: {slot_name}")

    defaults = ModelsConfigDefaults(
        idle_unload_seconds=int(defaults_raw.get("idle_unload_seconds", 300)),
        heavy_load_timeout_seconds=int(defaults_raw.get("heavy_load_timeout_seconds", 120)),
        warm_on_start=tuple(warm_on_start_raw),
    )

    slots_raw = _require_mapping(root.get("slots"), "slots")
    if "companion_fast" not in slots_raw:
        raise SlotRegistryError("slots.companion_fast is required")

    slots: dict[ModelSlotId, SlotConfig] = {}
    for slot_id, slot_raw in slots_raw.items():
        if not isinstance(slot_id, str):
            raise SlotRegistryError("slot ids must be strings")
        slots[slot_id] = _parse_slot(slot_id, slot_raw)  # type: ignore[assignment]

    return ModelsConfig(version=version, defaults=defaults, slots=slots)


def load_slot_registry(path: Path, *, settings: Settings | None = None) -> ModelSlotRegistry:
    if not path.is_file():
        raise SlotRegistryError(f"Model slot config not found: {path}")

    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SlotRegistryError(f"Failed to read model slot config: {path}") from exc

    try:
        raw = yaml.safe_load(raw_text)
    except yaml.YAMLError as exc:
        raise SlotRegistryError(f"Invalid YAML in model slot config: {path}") from exc

    if raw is None:
        raise SlotRegistryError(f"Model slot config is empty: {path}")

    config = _parse_models_config(raw)
    slots = config.slots
    if settings is not None:
        slots = _apply_settings_overrides(slots, settings)
        config = ModelsConfig(version=config.version, defaults=config.defaults, slots=slots)

    return ModelSlotRegistry(config=config)
