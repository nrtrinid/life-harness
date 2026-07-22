"""CI-safe tests for POST /ai/coding/chat (Coding Slice A)."""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.backends.openvino_backend import OpenVinoBackend
from app.coding_chat import (
    CODING_MAX_NEW_TOKENS_CAP,
    build_coding_history,
    resolve_coding_generation,
)
from app.coding_models import CodingChatRequest, CodingMessage
from app.config import Settings, get_settings
from app.main import app
from app.prompt_loader import (
    build_coding_system_prompt,
    load_ask_harness_template,
    load_coding_template,
    load_raw_lab_template,
)
from app.providers.base import ProviderInputError


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _coding_body(**overrides: object) -> dict:
    base: dict = {
        "model_alias": "coding_fast",
        "messages": [{"role": "user", "content": "Explain list comprehensions briefly."}],
    }
    base.update(overrides)
    return base


def test_coding_route_success(client: TestClient) -> None:
    response = client.post("/ai/coding/chat", json=_coding_body())
    assert response.status_code == 200
    data = response.json()
    assert data["model_alias"] == "coding_fast"
    assert data["content"][0]["type"] == "text"
    assert "CODING_MOCK_OK" in data["content"][0]["text"]
    assert data["usage"]["input_tokens"] == 0
    assert data["stop_reason"] == "end_turn"


def test_native_system_preserved(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(system="Prefer TypeScript examples."),
    )
    assert response.status_code == 200
    assert "caller_system_len=" in response.json()["content"][0]["text"]


def test_ordered_multi_turn_history(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(
            messages=[
                {"role": "user", "content": "one"},
                {"role": "assistant", "content": "two"},
                {"role": "user", "content": "three"},
            ]
        ),
    )
    assert response.status_code == 200
    text = response.json()["content"][0]["text"]
    assert "history_turns=2" in text
    assert "last=three" in text


def test_coding_prompt_selected_and_isolated() -> None:
    coding = load_coding_template()
    raw = load_raw_lab_template()
    ask = load_ask_harness_template()
    assert "concise local coding assistant" in coding.lower()
    assert "companion_self_memories" not in coding.lower()
    assert "thread_state" not in coding.lower()
    assert coding.strip() != raw.strip()
    assert coding.strip() != ask.strip()
    system = build_coding_system_prompt()
    assert "HarnessContext" not in system


def test_build_history_preserves_system_and_order() -> None:
    req = CodingChatRequest(
        model_alias="coding_fast",
        system="Use pytest.",
        messages=[
            CodingMessage(role="user", content="a"),
            CodingMessage(role="assistant", content="b"),
            CodingMessage(role="user", content="c"),
        ],
    )
    system, history, message = build_coding_history(req)
    assert "Use pytest." in system
    assert "concise local coding assistant" in system.lower()
    assert [t.content for t in history] == ["a", "b"]
    assert message == "c"
    assert "recent_turns" not in system
    assert "companion_self_memories" not in system


def test_unknown_model_alias(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(model_alias="gpt-cloud"),
    )
    assert response.status_code == 422
    assert "Unsupported model_alias" in response.json()["detail"]


def test_valid_model_aliases(client: TestClient) -> None:
    for alias in ("coding_fast", "local-qwen-coding"):
        response = client.post("/ai/coding/chat", json=_coding_body(model_alias=alias))
        assert response.status_code == 200
        assert response.json()["model_alias"] == alias


def test_max_tokens_mapping_and_cap(client: TestClient) -> None:
    ok = client.post("/ai/coding/chat", json=_coding_body(max_tokens=128))
    assert ok.status_code == 200
    assert "max_tokens=128" in ok.json()["content"][0]["text"]

    over = client.post(
        "/ai/coding/chat",
        json=_coding_body(max_tokens=CODING_MAX_NEW_TOKENS_CAP + 1),
    )
    assert over.status_code == 422


def test_temperature_mapping(client: TestClient) -> None:
    ok = client.post("/ai/coding/chat", json=_coding_body(temperature=0.1))
    assert ok.status_code == 200
    assert "temperature=0.1" in ok.json()["content"][0]["text"]

    bad = client.post("/ai/coding/chat", json=_coding_body(temperature=9.0))
    assert bad.status_code == 422


def test_top_p_policy_without_backend_support() -> None:
    settings = get_settings()
    req = CodingChatRequest(
        model_alias="coding_fast",
        messages=[CodingMessage(role="user", content="hi")],
        top_p=0.9,
    )
    with pytest.raises(ProviderInputError, match="top_p"):
        resolve_coding_generation(req, settings=settings, config_supports_top_p=False)

    overrides = resolve_coding_generation(
        req.model_copy(update={"top_p": None}),
        settings=settings,
        config_supports_top_p=False,
    )
    assert "top_p" not in overrides


def test_stop_sequences_rejected(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(stop_sequences=["END"]),
    )
    assert response.status_code == 422


def test_metadata_not_model_visible() -> None:
    req = CodingChatRequest(
        model_alias="coding_fast",
        messages=[CodingMessage(role="user", content="hello")],
        metadata={"secret": "nope"},
    )
    system, history, message = build_coding_history(req)
    assert "secret" not in system
    assert "nope" not in system
    assert "secret" not in message
    assert all("secret" not in t.content for t in history)


def test_tools_and_stream_rejected(client: TestClient) -> None:
    tools = client.post(
        "/ai/coding/chat",
        json=_coding_body(tools=[{"name": "Read"}]),
    )
    assert tools.status_code == 422

    stream = client.post("/ai/coding/chat", json=_coding_body(stream=True))
    assert stream.status_code == 422

    choice = client.post(
        "/ai/coding/chat",
        json=_coding_body(tool_choice={"type": "any"}),
    )
    assert choice.status_code == 422


def test_tool_blocks_not_in_schema() -> None:
    with pytest.raises(ValidationError):
        CodingMessage.model_validate(
            {
                "role": "user",
                "content": [{"type": "tool_use", "id": "x", "name": "Read", "input": {}}],
            }
        )


def test_empty_backend_output(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(messages=[{"role": "user", "content": "__CODING_EMPTY__"}]),
    )
    assert response.status_code == 503


def test_backend_failure(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(messages=[{"role": "user", "content": "__CODING_FAIL__"}]),
    )
    assert response.status_code == 503


def test_timeout(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(messages=[{"role": "user", "content": "__CODING_TIMEOUT__"}]),
    )
    assert response.status_code == 503
    assert "timed out" in response.json()["detail"].lower()


def test_coding_fast_shares_companion_backend_instance() -> None:
    settings = Settings(
        provider="openvino",
        host="127.0.0.1",
        port=8111,
        model_path="models/qwen3-8b-int4-ov",
        model_id="OpenVINO/Qwen3-8B-int4-ov",
        device="GPU",
        max_new_tokens=64,
        timeout_seconds=5.0,
        max_input_chars=18000,
        raw_lab_max_input_chars=32000,
        temperature=0.2,
        raw_lab_max_new_tokens=128,
        raw_lab_temperature=0.7,
        raw_lab_repetition_penalty=1.12,
        dev_cors=False,
        deep_enabled=False,
        chat_harness_native_chat=False,
        deep_max_extra_passes=1,
        models_config_path="models.yaml",
        warm_slots=(),
        critic_slot="same",
        critic_model_path=None,
        llama_base_url="http://127.0.0.1:8120",
        llama_timeout_seconds=60.0,
        llama_api_key=None,
        llama_base_url_explicit=False,
        critic_runtime="mock",
        critic_base_url="http://127.0.0.1:8120/v1",
        critic_model="x",
        critic_timeout_seconds=30.0,
        critic_heavy=False,
        debug_thinking_trace=False,
        critic_context_max_chars=1800,
        real_model_bench_enabled=False,
        memory_rag_enabled=False,
    )
    from app.slots.manager import ModelSlotManager
    from app.slots.registry import load_slot_registry
    from app.config import resolve_models_config_path

    registry = load_slot_registry(resolve_models_config_path(settings), settings=settings)
    manager = ModelSlotManager(settings, registry)
    coding = manager.acquire("coding_fast")
    companion = manager.acquire("companion_fast")
    assert coding.backend is companion.backend
    assert isinstance(coding.backend, OpenVinoBackend)
    # Second acquire must not create a new backend instance.
    again = manager.acquire("coding_fast")
    assert again.backend is companion.backend


def test_shared_generation_serialization() -> None:
    """Two logical consumers sharing one backend must not overlap generation."""
    settings = get_settings()
    backend = OpenVinoBackend(settings)
    entered = 0
    max_concurrent = 0
    lock = threading.Lock()

    class _FakePipeline:
        def generate(self, *_args, **_kwargs):
            nonlocal entered, max_concurrent
            with lock:
                entered += 1
                max_concurrent = max(max_concurrent, entered)
            time.sleep(0.05)
            with lock:
                entered -= 1
            return "ok"

    backend._pipeline = _FakePipeline()  # type: ignore[assignment]

    def _call() -> str:
        return backend.generate_chat(
            system="sys",
            history=[],
            message="hi",
            generation_overrides={"max_new_tokens": 8, "temperature": 0.2},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_call), pool.submit(_call)]
        results = [f.result(timeout=5) for f in futures]

    assert results == ["ok", "ok"]
    assert max_concurrent == 1


def test_invalid_role_ordering(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(
            messages=[
                {"role": "user", "content": "a"},
                {"role": "user", "content": "b"},
            ]
        ),
    )
    assert response.status_code == 422


def test_last_message_must_be_user(client: TestClient) -> None:
    response = client.post(
        "/ai/coding/chat",
        json=_coding_body(
            messages=[
                {"role": "user", "content": "a"},
                {"role": "assistant", "content": "b"},
            ]
        ),
    )
    assert response.status_code == 422
