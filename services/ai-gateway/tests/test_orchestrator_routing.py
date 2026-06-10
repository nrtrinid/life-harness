import os
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import SERVICE_ROOT, Settings
from app.models import ReasoningDepth
from app.orchestrator.slot_plan import resolve_slots_for_chat_harness
from app.slots.manager import (
    ModelSlotManager,
    SlotDisabledError,
    SlotNotAvailableError,
    get_slot_manager,
)
from app.slots.registry import load_slot_registry

DEFAULT_MODELS_YAML = SERVICE_ROOT / "models.yaml"


@pytest.mark.parametrize(
    "depth",
    [ReasoningDepth.fast, ReasoningDepth.deliberate, ReasoningDepth.deep],
)
def test_resolve_slots_for_chat_harness_companion_only(depth: ReasoningDepth):
    plan = resolve_slots_for_chat_harness(depth)
    assert plan.slot_ids == ("companion_fast",)


def test_mock_acquire_companion_fast_no_backend():
    os.environ["SCOUT_PROVIDER"] = "mock"
    get_slot_manager.cache_clear()
    acquired = get_slot_manager().acquire("companion_fast")
    assert acquired.slot_id == "companion_fast"
    assert acquired.backend is None
    assert acquired.enabled is True


def test_acquire_disabled_companion_raises(tmp_path: Path):
    disabled_yaml = tmp_path / "disabled-companion.yaml"
    disabled_yaml.write_text(
        """
version: 1
defaults:
  warm_on_start: []
slots:
  companion_fast:
    enabled: false
    backend: openvino
    model_path: models/qwen3-8b-int4-ov
""",
        encoding="utf-8",
    )
    registry = load_slot_registry(disabled_yaml)
    settings = Settings.from_env()
    manager = ModelSlotManager(settings, registry)
    with pytest.raises(SlotDisabledError, match="companion_fast"):
        manager.acquire("companion_fast")


def test_acquire_critic_small_llamacpp_returns_backend(tmp_path: Path):
    enabled_llama_yaml = tmp_path / "enabled-llama.yaml"
    enabled_llama_yaml.write_text(
        """
version: 2
defaults:
  warm_on_start: []
slots:
  companion_fast:
    enabled: true
    backend: openvino
    model_path: models/qwen3-8b-int4-ov
  critic_small:
    enabled: true
    backend: llamacpp
    model_path: models/phi-4-mini-instruct-q4_k_m.gguf
    llamacpp:
      host: 127.0.0.1
      port: 8121
""",
        encoding="utf-8",
    )
    registry = load_slot_registry(enabled_llama_yaml)
    settings = Settings.from_env()
    manager = ModelSlotManager(settings, registry)
    acquired = manager.acquire("critic_small")
    assert acquired.slot_id == "critic_small"
    from app.backends.llamacpp_backend import LlamaCppBackend

    assert isinstance(acquired.backend, LlamaCppBackend)
    assert acquired.backend.base_url == "http://127.0.0.1:8121"


def test_acquire_other_llamacpp_slot_raises_not_available(tmp_path: Path):
    enabled_llama_yaml = tmp_path / "enabled-coder.yaml"
    enabled_llama_yaml.write_text(
        """
version: 2
defaults:
  warm_on_start: []
slots:
  companion_fast:
    enabled: true
    backend: openvino
    model_path: models/qwen3-8b-int4-ov
  coder_daily:
    enabled: true
    backend: llamacpp
    model_path: models/deepseek-coder-v2-lite-instruct-q4_k_m.gguf
""",
        encoding="utf-8",
    )
    registry = load_slot_registry(enabled_llama_yaml)
    settings = Settings.from_env()
    manager = ModelSlotManager(settings, registry)
    with pytest.raises(SlotNotAvailableError, match="llamacpp"):
        manager.acquire("coder_daily")


def test_warm_skipped_for_mock_provider():
    os.environ["SCOUT_PROVIDER"] = "mock"
    get_slot_manager.cache_clear()
    get_slot_manager().warm("companion_fast")


def test_openvino_warm_calls_ensure_ready():
    os.environ["SCOUT_PROVIDER"] = "openvino"
    get_slot_manager.cache_clear()
    manager = get_slot_manager()
    with patch.object(manager.companion_backend, "ensure_ready") as ensure_ready:
        manager.warm("companion_fast")
        ensure_ready.assert_called_once()
