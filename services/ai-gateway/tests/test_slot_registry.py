from pathlib import Path

import pytest

from app.config import SERVICE_ROOT, Settings, resolve_models_config_path
from app.slots.registry import SlotRegistryError, load_slot_registry as load_registry

DEFAULT_MODELS_YAML = SERVICE_ROOT / "models.yaml"


def test_load_default_models_yaml():
    registry = load_registry(DEFAULT_MODELS_YAML)
    companion = registry.companion_fast()
    assert companion.enabled is True
    assert companion.backend == "openvino"
    assert registry.config.version == 2


def test_heavy_and_embed_slots_disabled_by_default():
    registry = load_registry(DEFAULT_MODELS_YAML)
    for slot_id in (
        "memory_embed",
        "critic_small",
        "coder_daily",
        "coder_daily_alt",
        "stretch_batch",
        "stretch_experimental",
    ):
        assert registry.get(slot_id).enabled is False


def test_companion_fast_defaults():
    registry = load_registry(DEFAULT_MODELS_YAML)
    companion = registry.companion_fast()
    assert companion.keep_loaded is True
    assert companion.model_path == "models/qwen3-8b-int4-ov"
    assert companion.device == "GPU"
    assert companion.heavy is False


def test_enabled_slots_only_companion_fast():
    registry = load_registry(DEFAULT_MODELS_YAML)
    enabled_ids = {slot.slot_id for slot in registry.enabled_slots()}
    assert enabled_ids == {"companion_fast"}


def test_missing_config_file_raises(tmp_path: Path):
    missing = tmp_path / "missing.yaml"
    with pytest.raises(SlotRegistryError, match="not found"):
        load_registry(missing)


def test_invalid_yaml_raises(tmp_path: Path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("slots:\n  - not a mapping\n", encoding="utf-8")
    with pytest.raises(SlotRegistryError, match="Invalid YAML|must be"):
        load_registry(bad)


def test_deprecated_v1_slot_key_rejected(tmp_path: Path):
    bad = tmp_path / "deprecated-slot.yaml"
    bad.write_text(
        """
version: 2
defaults:
  warm_on_start: []
slots:
  companion_fast:
    enabled: true
    backend: openvino
    model_path: models/qwen3-8b-int4-ov
  critic:
    enabled: false
    backend: llamacpp
    model_path: models/phi-4-mini-instruct-q4_k_m.gguf
""",
        encoding="utf-8",
    )
    with pytest.raises(SlotRegistryError, match="renamed to 'critic_small'"):
        load_registry(bad)


def test_unknown_slot_key_rejected(tmp_path: Path):
    bad = tmp_path / "unknown-slot.yaml"
    bad.write_text(
        """
version: 1
defaults:
  warm_on_start: []
slots:
  companion_fast:
    enabled: true
    backend: openvino
    model_path: models/qwen3-8b-int4-ov
  mystery_slot:
    enabled: false
    backend: llamacpp
    model_path: models/mystery.gguf
""",
        encoding="utf-8",
    )
    with pytest.raises(SlotRegistryError, match="Unknown slot id"):
        load_registry(bad)


def test_env_model_path_override(monkeypatch):
    monkeypatch.setenv("SCOUT_MODEL_PATH", "/custom/model/path")
    monkeypatch.setenv("SCOUT_DEVICE", "CPU")
    settings = Settings.from_env()
    registry = load_registry(DEFAULT_MODELS_YAML, settings=settings)
    companion = registry.companion_fast()
    assert companion.model_path == "/custom/model/path"
    assert companion.device == "CPU"


def test_get_slot_registry_from_config():
    from app.config import get_slot_registry

    get_slot_registry.cache_clear()
    registry = get_slot_registry()
    assert registry.companion_fast().enabled is True
    get_slot_registry.cache_clear()


def test_resolve_models_config_path_relative():
    settings = Settings.from_env()
    resolved = resolve_models_config_path(settings)
    assert resolved == SERVICE_ROOT / "models.yaml"
