import json
import logging
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.backends.llamacpp_backend import LlamaCppConnectionError, LlamaCppEmptyContentError
from app.context_packet import AiContextPacketWire
from app.critic_backend import (
    LlamaCppCriticBackend,
    MockCriticBackend,
    SameBackendCritic,
    get_critic_backend,
)
from app.main import app, get_provider
from app.models import (
    ChatHarnessRequest,
    ChatHarnessResponse,
    CriticCheckId,
    HarnessContext,
)
from app.prompt_loader import build_chat_harness_critic_prompt
from app.slots.manager import get_slot_manager
from app.slots.registry import load_slot_registry

os.environ.setdefault("SCOUT_PROVIDER", "mock")

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "synthetic_harness_context.json"
PACKET_FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "synthetic_context_packet.json"
)

ENABLED_CRITIC_YAML = """
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
    max_new_tokens: 512
    temperature: 0.1
    llamacpp:
      host: 127.0.0.1
      port: 8121
"""


@pytest.fixture(autouse=True)
def _reset_env():
    prior_slot = os.environ.get("SCOUT_CRITIC_SLOT")
    prior_models = os.environ.get("SCOUT_MODELS_CONFIG")
    prior_provider = os.environ.get("SCOUT_PROVIDER")
    os.environ["SCOUT_PROVIDER"] = "mock"
    os.environ.pop("SCOUT_CRITIC_SLOT", None)
    get_provider.cache_clear()
    get_slot_manager.cache_clear()
    from app.config import get_slot_registry

    get_slot_registry.cache_clear()
    yield
    if prior_slot is None:
        os.environ.pop("SCOUT_CRITIC_SLOT", None)
    else:
        os.environ["SCOUT_CRITIC_SLOT"] = prior_slot
    if prior_models is None:
        os.environ.pop("SCOUT_MODELS_CONFIG", None)
    else:
        os.environ["SCOUT_MODELS_CONFIG"] = prior_models
    if prior_provider is None:
        os.environ.pop("SCOUT_PROVIDER", None)
    else:
        os.environ["SCOUT_PROVIDER"] = prior_provider
    get_provider.cache_clear()
    get_slot_manager.cache_clear()
    get_slot_registry.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def harness_context() -> HarnessContext:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return HarnessContext.model_validate(data)


def _write_models_yaml(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "models.yaml"
    path.write_text(content, encoding="utf-8")
    return path


def test_default_critic_slot_uses_mock_rules():
    from app.config import get_settings

    critic = get_critic_backend(get_settings(), lambda _p: "{}")
    assert isinstance(critic, MockCriticBackend)


def test_secondary_with_enabled_slot_returns_llamacpp_critic(tmp_path: Path):
    yaml_path = _write_models_yaml(tmp_path, ENABLED_CRITIC_YAML)
    os.environ["SCOUT_CRITIC_SLOT"] = "secondary"
    os.environ["SCOUT_MODELS_CONFIG"] = str(yaml_path)
    get_slot_manager.cache_clear()
    from app.config import get_slot_registry

    get_slot_registry.cache_clear()
    from app.config import get_settings

    critic = get_critic_backend(get_settings(), lambda _p: "{}")
    assert isinstance(critic, LlamaCppCriticBackend)
    assert critic.name == "llamacpp_secondary"


def test_secondary_with_disabled_slot_falls_back_to_mock(tmp_path: Path):
    content = ENABLED_CRITIC_YAML.replace(
        "  critic_small:\n    enabled: true",
        "  critic_small:\n    enabled: false",
    )
    yaml_path = _write_models_yaml(tmp_path, content)
    os.environ["SCOUT_CRITIC_SLOT"] = "secondary"
    os.environ["SCOUT_MODELS_CONFIG"] = str(yaml_path)
    get_slot_manager.cache_clear()
    from app.config import get_slot_registry

    get_slot_registry.cache_clear()
    from app.config import get_settings

    critic = get_critic_backend(get_settings(), lambda _p: "{}")
    assert isinstance(critic, MockCriticBackend)


def test_secondary_critic_prompt_is_packet_aware(harness_context):
    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    request = ChatHarnessRequest(
        message="What am I avoiding right now?",
        mode="operator",
        sensitivity="S1",
        context=harness_context,
        context_packet=packet,
        reasoning_depth="deep",
    )
    prompt = build_chat_harness_critic_prompt(request=request, draft_json="{}")
    assert "### Active cards (ranked)" in prompt
    assert "Career / Networking" in prompt


def test_llamacpp_critic_malformed_json_fails_soft(harness_context):
    from app.backends.llamacpp_backend import LlamaCppBackend

    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=1)
    critic = LlamaCppCriticBackend(backend=backend)
    request = ChatHarnessRequest(
        message="hello",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    draft = ChatHarnessResponse(
        answer="draft",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    )

    with patch.object(backend, "generate", return_value="not json {{{"):
        verdict = critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=draft.model_dump_json(),
        )

    assert verdict.needs_revision is False
    assert verdict.checks[0].id == CriticCheckId.no_issue


def test_llamacpp_critic_connection_error_fails_soft(harness_context):
    from app.backends.llamacpp_backend import LlamaCppBackend

    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=1)
    critic = LlamaCppCriticBackend(backend=backend)
    request = ChatHarnessRequest(
        message="hello",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    draft = ChatHarnessResponse(
        answer="draft",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    )

    with patch.object(backend, "generate", side_effect=LlamaCppConnectionError("refused")):
        verdict = critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=draft.model_dump_json(),
        )

    assert verdict.needs_revision is False


def test_deep_chat_harness_200_when_secondary_llama_unavailable(tmp_path: Path, harness_context):
    yaml_path = _write_models_yaml(tmp_path, ENABLED_CRITIC_YAML)
    os.environ["SCOUT_CRITIC_SLOT"] = "secondary"
    os.environ["SCOUT_MODELS_CONFIG"] = str(yaml_path)
    get_slot_manager.cache_clear()
    get_provider.cache_clear()
    from app.config import get_slot_registry

    get_slot_registry.cache_clear()

    client = TestClient(app)
    with patch(
        "app.backends.llamacpp_backend.LlamaCppBackend.generate",
        side_effect=LlamaCppConnectionError("refused"),
    ):
        response = client.post(
            "/chat-harness",
            json={
                "message": "What should I do next?",
                "mode": "general",
                "sensitivity": "S1",
                "context": harness_context.model_dump(mode="json"),
                "conversation_history": [],
                "reasoning_depth": "deep",
            },
        )

    assert response.status_code == 200
    body = response.json()
    ChatHarnessResponse.model_validate(body)
    assert any("structured critic" in note.lower() for note in body["confidence_notes"])


def test_llamacpp_critic_empty_content_fails_soft(harness_context):
    from app.backends.llamacpp_backend import LlamaCppBackend

    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=1)
    critic = LlamaCppCriticBackend(backend=backend)
    request = ChatHarnessRequest(
        message="hello",
        mode="general",
        sensitivity="S1",
        context=harness_context,
        reasoning_depth="deep",
    )
    draft = ChatHarnessResponse(
        answer="draft",
        used_context=True,
        confidence_notes=[],
        safety_notes=[],
    )

    with patch.object(
        backend,
        "generate",
        side_effect=LlamaCppEmptyContentError("empty"),
    ):
        verdict = critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=draft.model_dump_json(),
        )

    assert verdict.needs_revision is False


def test_deep_http_when_secondary_disabled_falls_back(client, harness_context, caplog):
    payload = {
        "message": "What should I do next?",
        "mode": "general",
        "sensitivity": "S1",
        "context": harness_context.model_dump(mode="json"),
        "conversation_history": [],
        "reasoning_depth": "deep",
    }
    os.environ["SCOUT_CRITIC_SLOT"] = "secondary"
    get_provider.cache_clear()
    with caplog.at_level(logging.WARNING):
        response = client.post("/chat-harness", json=payload)
    assert response.status_code == 200
    ChatHarnessResponse.model_validate(response.json())
    assert any(
        "critic_small is disabled" in record.message for record in caplog.records
    )


def test_secondary_packet_sections_in_llama_generate_prompt(
    tmp_path: Path, harness_context
):
    yaml_path = _write_models_yaml(tmp_path, ENABLED_CRITIC_YAML)
    os.environ["SCOUT_CRITIC_SLOT"] = "secondary"
    os.environ["SCOUT_MODELS_CONFIG"] = str(yaml_path)
    get_slot_manager.cache_clear()
    from app.config import get_slot_registry

    get_slot_registry.cache_clear()

    packet = AiContextPacketWire.model_validate(
        json.loads(PACKET_FIXTURE_PATH.read_text(encoding="utf-8"))
    )
    captured_prompts: list[str] = []

    def _capture_generate(_self, prompt: str) -> str:
        captured_prompts.append(prompt)
        return json.dumps(
            {
                "needs_revision": False,
                "checks": [{"id": "no_issue", "severity": "info", "message": "ok"}],
                "revision_instruction": "",
            }
        )

    with patch(
        "app.backends.llamacpp_backend.LlamaCppBackend.generate",
        _capture_generate,
    ):
        from app.config import get_settings

        backend_critic = get_critic_backend(get_settings(), lambda _p: "{}")
        request = ChatHarnessRequest(
            message="What am I avoiding?",
            mode="operator",
            sensitivity="S1",
            context=harness_context,
            context_packet=packet,
            reasoning_depth="deep",
        )
        draft = ChatHarnessResponse(
            answer="draft",
            used_context=True,
            confidence_notes=[],
            safety_notes=[],
        )
        backend_critic.critique_draft(
            request=request,
            draft=draft,
            draft_raw=draft.model_dump_json(),
        )

    assert len(captured_prompts) == 1
    assert "### Active cards (ranked)" in captured_prompts[0]
    assert "Career / Networking" in captured_prompts[0]


def test_openvino_same_slot_still_uses_same_backend():
    prior = os.environ.get("SCOUT_PROVIDER")
    os.environ["SCOUT_PROVIDER"] = "openvino"
    os.environ.pop("SCOUT_CRITIC_SLOT", None)
    from app.config import get_settings

    try:
        critic = get_critic_backend(get_settings(), lambda _p: "{}")
        assert isinstance(critic, SameBackendCritic)
    finally:
        if prior is None:
            os.environ.pop("SCOUT_PROVIDER", None)
        else:
            os.environ["SCOUT_PROVIDER"] = prior
