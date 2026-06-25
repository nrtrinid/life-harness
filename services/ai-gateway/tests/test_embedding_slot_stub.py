from pathlib import Path

from app.config import Settings
from app.retrieval.embedding_slot import EmbeddingSlotStatus, resolve_memory_embed_slot
from app.slots.registry import load_slot_registry
from app.slots.manager import ModelSlotManager


def test_memory_embed_disabled_by_default():
    status = resolve_memory_embed_slot()
    assert status.status == EmbeddingSlotStatus.disabled


def test_enabled_memory_embed_reports_unavailable_in_gateway(tmp_path: Path, monkeypatch):
    yaml_path = tmp_path / "memory-embed-enabled.yaml"
    yaml_path.write_text(
        """
version: 2
defaults:
  warm_on_start: []
slots:
  companion_fast:
    enabled: true
    backend: openvino
    model_path: models/qwen3-8b-int4-ov
  memory_embed:
    enabled: true
    backend: openvino
    model_id: OpenVINO/Qwen3-Embedding-0.6B
    model_path: models/qwen3-embedding-0.6b-ov
""",
        encoding="utf-8",
    )
    registry = load_slot_registry(yaml_path)
    settings = Settings.from_env()
    manager = ModelSlotManager(settings, registry)

    monkeypatch.setattr(
        "app.retrieval.embedding_slot.get_slot_registry",
        lambda: registry,
    )
    monkeypatch.setattr(
        "app.retrieval.embedding_slot.get_slot_manager",
        lambda: manager,
    )

    status = resolve_memory_embed_slot()
    assert status.status == EmbeddingSlotStatus.unavailable_in_gateway

