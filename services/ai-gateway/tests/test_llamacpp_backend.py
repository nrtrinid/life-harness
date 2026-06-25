import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest

from app.backends.llamacpp_backend import (
    LlamaCppBackend,
    LlamaCppConnectionError,
    LlamaCppEmptyContentError,
    LlamaCppHttpError,
    LlamaCppMalformedResponseError,
    build_llamacpp_backend_for_critic,
    build_llamacpp_backend_for_slot,
    resolve_llamacpp_base_url,
)
from app.config import Settings
from app.slots.types import SlotConfig


def _settings(**overrides) -> Settings:
    base = Settings.from_env()
    return Settings(
        provider=base.provider,
        host=base.host,
        port=base.port,
        model_path=base.model_path,
        model_id=base.model_id,
        device=base.device,
        max_new_tokens=base.max_new_tokens,
        timeout_seconds=base.timeout_seconds,
        max_input_chars=base.max_input_chars,
        raw_lab_max_input_chars=base.raw_lab_max_input_chars,
        temperature=base.temperature,
        raw_lab_max_new_tokens=base.raw_lab_max_new_tokens,
        raw_lab_temperature=base.raw_lab_temperature,
        raw_lab_repetition_penalty=base.raw_lab_repetition_penalty,
        dev_cors=base.dev_cors,
        deep_enabled=base.deep_enabled,
        chat_harness_native_chat=base.chat_harness_native_chat,
        deep_max_extra_passes=base.deep_max_extra_passes,
        models_config_path=base.models_config_path,
        warm_slots=base.warm_slots,
        critic_slot=base.critic_slot,
        critic_model_path=base.critic_model_path,
        llama_base_url=overrides.pop("llama_base_url", base.llama_base_url),
        llama_timeout_seconds=overrides.pop("llama_timeout_seconds", base.llama_timeout_seconds),
        llama_api_key=overrides.pop("llama_api_key", base.llama_api_key),
        llama_base_url_explicit=overrides.pop(
            "llama_base_url_explicit", base.llama_base_url_explicit
        ),
        critic_runtime=overrides.pop("critic_runtime", base.critic_runtime),
        critic_base_url=overrides.pop("critic_base_url", base.critic_base_url),
        critic_model=overrides.pop("critic_model", base.critic_model),
        critic_timeout_seconds=overrides.pop(
            "critic_timeout_seconds", base.critic_timeout_seconds
        ),
        critic_heavy=overrides.pop("critic_heavy", base.critic_heavy),
        debug_thinking_trace=overrides.pop(
            "debug_thinking_trace", base.debug_thinking_trace
        ),
        real_model_bench_enabled=overrides.pop(
            "real_model_bench_enabled", base.real_model_bench_enabled
        ),
        critic_context_max_chars=overrides.pop(
            "critic_context_max_chars", base.critic_context_max_chars
        ),
        memory_rag_enabled=overrides.pop(
            "memory_rag_enabled", base.memory_rag_enabled
        ),
        **overrides,
    )


def _critic_slot(**overrides) -> SlotConfig:
    return SlotConfig(
        slot_id="critic_small",
        enabled=True,
        backend="llamacpp",
        model_path="models/phi-4-mini-instruct-q4_k_m.gguf",
        max_new_tokens=512,
        temperature=0.1,
        llamacpp={"host": "127.0.0.1", "port": 8121},
        **overrides,
    )


def _openai_response(content: str) -> bytes:
    return json.dumps(
        {"choices": [{"message": {"role": "assistant", "content": content}}]}
    ).encode("utf-8")


def test_generate_posts_openai_compatible_request():
    backend = LlamaCppBackend(
        base_url="http://127.0.0.1:8121",
        timeout_seconds=30,
        max_tokens=512,
        temperature=0.1,
    )
    captured: dict = {}

    def fake_urlopen(request, timeout=0):
        captured["url"] = request.full_url
        captured["headers"] = dict(request.header_items())
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return io.BytesIO(_openai_response('{"needs_revision": false}'))

    with patch("app.backends.llamacpp_backend.urllib.request.urlopen", side_effect=fake_urlopen):
        result = backend.generate("critic prompt text")

    assert result == '{"needs_revision": false}'
    assert captured["url"] == "http://127.0.0.1:8121/v1/chat/completions"
    assert captured["body"]["messages"][0]["content"] == "critic prompt text"
    assert captured["body"]["max_tokens"] == 512
    assert "Authorization" not in captured["headers"]


def test_generate_adds_api_key_header_when_configured():
    backend = LlamaCppBackend(
        base_url="http://127.0.0.1:8121",
        timeout_seconds=30,
        api_key="secret-token",
    )
    captured: dict = {}

    def fake_urlopen(request, timeout=0):
        captured["headers"] = dict(request.header_items())
        return io.BytesIO(_openai_response("ok"))

    with patch("app.backends.llamacpp_backend.urllib.request.urlopen", side_effect=fake_urlopen):
        backend.generate("hello")

    assert captured["headers"]["Authorization"] == "Bearer secret-token"


def test_generate_raises_on_http_error():
    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=30)

    def fake_urlopen(request, timeout=0):
        raise urllib.error.HTTPError(
            request.full_url, 503, "Service Unavailable", hdrs=None, fp=io.BytesIO(b"down")
        )

    with patch("app.backends.llamacpp_backend.urllib.request.urlopen", side_effect=fake_urlopen):
        with pytest.raises(LlamaCppHttpError) as exc:
            backend.generate("hello")
    assert exc.value.status == 503


def test_generate_raises_on_connection_error():
    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=30)

    with patch(
        "app.backends.llamacpp_backend.urllib.request.urlopen",
        side_effect=urllib.error.URLError("connection refused"),
    ):
        with pytest.raises(LlamaCppConnectionError):
            backend.generate("hello")


def test_generate_raises_on_malformed_response():
    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=30)

    with patch(
        "app.backends.llamacpp_backend.urllib.request.urlopen",
        return_value=io.BytesIO(b"not-json"),
    ):
        with pytest.raises(LlamaCppMalformedResponseError):
            backend.generate("hello")


def test_generate_raises_on_empty_content():
    backend = LlamaCppBackend(base_url="http://127.0.0.1:8121", timeout_seconds=30)

    with patch(
        "app.backends.llamacpp_backend.urllib.request.urlopen",
        return_value=io.BytesIO(_openai_response("   ")),
    ):
        with pytest.raises(LlamaCppEmptyContentError):
            backend.generate("hello")


def test_resolve_base_url_from_slot_when_env_unset():
    settings = _settings(llama_base_url="http://127.0.0.1:8120", llama_base_url_explicit=False)
    slot = _critic_slot()
    assert resolve_llamacpp_base_url(slot, settings) == "http://127.0.0.1:8121"


def test_resolve_base_url_from_env_when_explicit():
    settings = _settings(
        llama_base_url="http://10.0.0.5:9000",
        llama_base_url_explicit=True,
    )
    slot = _critic_slot()
    assert resolve_llamacpp_base_url(slot, settings) == "http://10.0.0.5:9000"


def test_build_llamacpp_backend_for_slot_uses_settings():
    settings = _settings(llama_timeout_seconds=45, llama_api_key="k")
    backend = build_llamacpp_backend_for_slot(_critic_slot(), settings)
    assert backend.timeout_seconds == 45
    assert backend.api_key == "k"
    assert backend.base_url == "http://127.0.0.1:8121"


def test_generate_sends_configured_model_in_request_body():
    backend = LlamaCppBackend(
        base_url="http://127.0.0.1:8121",
        timeout_seconds=30,
        model="phi-4-reasoning-plus",
    )
    captured: dict = {}

    def fake_urlopen(request, timeout=0):
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return io.BytesIO(_openai_response("ok"))

    with patch("app.backends.llamacpp_backend.urllib.request.urlopen", side_effect=fake_urlopen):
        backend.generate("hello")

    assert captured["body"]["model"] == "phi-4-reasoning-plus"


def test_build_llamacpp_backend_for_critic_uses_settings():
    settings = _settings(
        critic_runtime="llamacpp",
        critic_base_url="http://127.0.0.1:8120/v1",
        critic_model="phi-4-reasoning-plus",
        critic_timeout_seconds=30,
    )
    backend = build_llamacpp_backend_for_critic(settings)
    assert backend.base_url == "http://127.0.0.1:8120"
    assert backend.model == "phi-4-reasoning-plus"
    assert backend.timeout_seconds == 30
    assert backend.max_tokens == 512
    assert backend.temperature == 0.1
