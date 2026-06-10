import os
from unittest.mock import patch

from app.config import Settings
from app.model_slots import (
    ROLE_TO_SLOT_ID,
    ModelSlotRole,
    get_critic_slot_config,
    get_slot_config_for_role,
    get_slot_policy_for_role,
)

_DEFAULT_CRITIC_FIELDS = dict(
    critic_runtime="mock",
    critic_base_url="http://127.0.0.1:8120/v1",
    critic_model="phi-4-reasoning-plus",
    critic_timeout_seconds=30.0,
    critic_heavy=False,
)


def _base_settings(**overrides) -> Settings:
    base = Settings.from_env()
    critic_fields = {**_DEFAULT_CRITIC_FIELDS, **overrides}
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
        llama_base_url=base.llama_base_url,
        llama_timeout_seconds=base.llama_timeout_seconds,
        llama_api_key=base.llama_api_key,
        llama_base_url_explicit=base.llama_base_url_explicit,
        critic_runtime=critic_fields["critic_runtime"],
        critic_base_url=critic_fields["critic_base_url"],
        critic_model=critic_fields["critic_model"],
        critic_timeout_seconds=critic_fields["critic_timeout_seconds"],
        critic_heavy=critic_fields["critic_heavy"],
        debug_thinking_trace=base.debug_thinking_trace,
        real_model_bench_enabled=base.real_model_bench_enabled,
    )


def test_default_critic_slot_config_is_mock():
    config = get_critic_slot_config(_base_settings())
    assert config.role == ModelSlotRole.critic
    assert config.slot_id == "critic_small"
    assert config.runtime == "mock"
    assert config.base_url is None
    assert config.model_name is None


def test_critic_slot_config_llamacpp_from_settings():
    config = get_critic_slot_config(
        _base_settings(
            critic_runtime="llamacpp",
            critic_base_url="http://127.0.0.1:8120/v1",
            critic_model="phi-4-reasoning-plus",
            critic_timeout_seconds=45.0,
        )
    )
    assert config.runtime == "llamacpp"
    assert config.base_url == "http://127.0.0.1:8120/v1"
    assert config.model_name == "phi-4-reasoning-plus"
    assert config.timeout_seconds == 45.0


def test_critic_runtime_from_env_llamacpp():
    with patch.dict(os.environ, {"SCOUT_CRITIC_RUNTIME": "llamacpp"}, clear=False):
        settings = Settings.from_env()
    assert settings.critic_runtime == "llamacpp"


def test_invalid_critic_runtime_falls_back_to_mock():
    with patch.dict(os.environ, {"SCOUT_CRITIC_RUNTIME": "openvino"}, clear=False):
        settings = Settings.from_env()
    assert settings.critic_runtime == "mock"


def test_role_to_slot_id_mapping():
    assert ROLE_TO_SLOT_ID[ModelSlotRole.companion_fast] == "companion_fast"
    assert ROLE_TO_SLOT_ID[ModelSlotRole.critic] == "critic_small"
    assert ROLE_TO_SLOT_ID[ModelSlotRole.reflection_stretch] == "stretch_batch"
    assert ROLE_TO_SLOT_ID[ModelSlotRole.coding_daily] == "coder_daily"
    assert ROLE_TO_SLOT_ID[ModelSlotRole.coding_stretch] == "stretch_batch"
    assert ROLE_TO_SLOT_ID[ModelSlotRole.experimental] == "stretch_experimental"


def test_get_slot_config_for_role_stubs():
    settings = _base_settings()
    for role in ModelSlotRole:
        config = get_slot_config_for_role(role, settings)
        assert config.role == role
        assert config.slot_id == ROLE_TO_SLOT_ID[role]
        if role == ModelSlotRole.critic:
            assert config.runtime == "mock"
        elif role == ModelSlotRole.companion_fast:
            assert config.runtime in ("mock", "openvino")


def test_default_slot_policies_ci_safe():
    settings = _base_settings()
    for role in ModelSlotRole:
        policy = get_slot_policy_for_role(role, settings)
        assert policy.is_heavy is False
        if role == ModelSlotRole.companion_fast:
            assert policy.keep_loaded is True
        else:
            assert policy.keep_loaded is False


def test_critic_heavy_policy_when_llamacpp_and_env():
    settings = _base_settings(critic_runtime="llamacpp", critic_heavy=True)
    policy = get_slot_policy_for_role(ModelSlotRole.critic, settings)
    assert policy.is_heavy is True
    assert policy.runtime == "llamacpp"


def test_stretch_roles_not_heavy_under_mock_runtime():
    settings = _base_settings()
    for role in (
        ModelSlotRole.reflection_stretch,
        ModelSlotRole.coding_daily,
        ModelSlotRole.coding_stretch,
        ModelSlotRole.experimental,
    ):
        policy = get_slot_policy_for_role(role, settings)
        assert policy.runtime == "mock"
        assert policy.is_heavy is False
