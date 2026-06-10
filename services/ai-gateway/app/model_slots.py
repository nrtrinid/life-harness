from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Literal

from app.config import Settings
from app.slots.types import ModelSlotId

logger = logging.getLogger(__name__)

ModelRuntime = Literal["mock", "openvino", "llamacpp"]


class ModelSlotRole(str, Enum):
    companion_fast = "companion_fast"
    critic = "critic"
    reflection_stretch = "reflection_stretch"
    coding_daily = "coding_daily"
    coding_stretch = "coding_stretch"
    experimental = "experimental"


ROLE_TO_SLOT_ID: dict[ModelSlotRole, ModelSlotId] = {
    ModelSlotRole.companion_fast: "companion_fast",
    ModelSlotRole.critic: "critic_small",
    ModelSlotRole.reflection_stretch: "stretch_batch",
    ModelSlotRole.coding_daily: "coder_daily",
    ModelSlotRole.coding_stretch: "stretch_batch",
    ModelSlotRole.experimental: "stretch_experimental",
}


@dataclass(frozen=True)
class ModelSlotConfig:
    role: ModelSlotRole
    slot_id: ModelSlotId
    runtime: ModelRuntime
    base_url: str | None
    model_name: str | None
    timeout_seconds: float


@dataclass(frozen=True)
class ModelSlotPolicy(ModelSlotConfig):
    is_heavy: bool
    keep_loaded: bool
    idle_unload_seconds: float | None = None


def _base_heavy_keep_loaded(role: ModelSlotRole, settings: Settings) -> tuple[bool, bool]:
    if role == ModelSlotRole.companion_fast:
        return False, True
    if role == ModelSlotRole.critic:
        return settings.critic_heavy, False
    if role in (
        ModelSlotRole.reflection_stretch,
        ModelSlotRole.coding_daily,
        ModelSlotRole.coding_stretch,
        ModelSlotRole.experimental,
    ):
        return True, False
    return False, False


def _effective_is_heavy(role: ModelSlotRole, runtime: ModelRuntime, settings: Settings) -> bool:
    is_heavy, _ = _base_heavy_keep_loaded(role, settings)
    if role == ModelSlotRole.companion_fast:
        return False
    if not is_heavy:
        return False
    # Synthesis critic via external llamacpp HTTP — mutex only, no local VRAM load.
    if role == ModelSlotRole.critic and runtime == "llamacpp":
        return settings.critic_heavy
    if runtime == "mock":
        return False
    if settings.provider == "mock":
        return False
    return True


def get_critic_slot_config(settings: Settings) -> ModelSlotConfig:
    runtime: ModelRuntime = settings.critic_runtime
    base_url = settings.critic_base_url if runtime == "llamacpp" else None
    model_name = settings.critic_model if runtime == "llamacpp" else None
    return ModelSlotConfig(
        role=ModelSlotRole.critic,
        slot_id=ROLE_TO_SLOT_ID[ModelSlotRole.critic],
        runtime=runtime,
        base_url=base_url,
        model_name=model_name,
        timeout_seconds=settings.critic_timeout_seconds,
    )


def get_slot_config_for_role(role: ModelSlotRole, settings: Settings) -> ModelSlotConfig:
    if role == ModelSlotRole.critic:
        return get_critic_slot_config(settings)

    slot_id = ROLE_TO_SLOT_ID[role]
    if role == ModelSlotRole.companion_fast:
        runtime: ModelRuntime = "openvino" if settings.provider == "openvino" else "mock"
    else:
        runtime = "mock"

    return ModelSlotConfig(
        role=role,
        slot_id=slot_id,
        runtime=runtime,
        base_url=None,
        model_name=None,
        timeout_seconds=settings.timeout_seconds,
    )


def get_slot_policy_for_role(role: ModelSlotRole, settings: Settings) -> ModelSlotPolicy:
    config = get_slot_config_for_role(role, settings)
    _, keep_loaded = _base_heavy_keep_loaded(role, settings)
    is_heavy = _effective_is_heavy(role, config.runtime, settings)
    return ModelSlotPolicy(
        role=config.role,
        slot_id=config.slot_id,
        runtime=config.runtime,
        base_url=config.base_url,
        model_name=config.model_name,
        timeout_seconds=config.timeout_seconds,
        is_heavy=is_heavy,
        keep_loaded=keep_loaded,
        idle_unload_seconds=None,
    )
