from __future__ import annotations

from app.config import Settings
from app.retrieval.chunking import index_chunks
from app.retrieval.memory_types import MemoryDocument, MemoryDocumentSource, RetrievalQuery
from app.retrieval.mock_provider import MockRetrievalProvider
from app.retrieval.provider import retrieve_memory_evidence


def _settings(*, enabled: bool) -> Settings:
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
        llama_base_url=base.llama_base_url,
        llama_timeout_seconds=base.llama_timeout_seconds,
        llama_api_key=base.llama_api_key,
        llama_base_url_explicit=base.llama_base_url_explicit,
        critic_runtime=base.critic_runtime,
        critic_base_url=base.critic_base_url,
        critic_model=base.critic_model,
        critic_timeout_seconds=base.critic_timeout_seconds,
        critic_heavy=base.critic_heavy,
        debug_thinking_trace=base.debug_thinking_trace,
        critic_context_max_chars=base.critic_context_max_chars,
        real_model_bench_enabled=base.real_model_bench_enabled,
        memory_rag_enabled=enabled,
    )


def _docs() -> list[MemoryDocument]:
    return [
        MemoryDocument(
            doc_id="mem-1",
            source=MemoryDocumentSource.memory_bank,
            title="Career focus",
            body="Career-first direction is the current practical priority.",
        ),
        MemoryDocument(
            doc_id="mem-2",
            source=MemoryDocumentSource.chat_summary,
            title="Build trap",
            body="Avoid endless tooling polish before shipping.",
        ),
    ]


def test_mock_retrieval_ranking_is_deterministic():
    query = RetrievalQuery(query_text="career practical priority", top_k=2)
    chunks = index_chunks(_docs())
    provider = MockRetrievalProvider()
    first = provider.retrieve(query, chunks)
    second = provider.retrieve(query, chunks)
    assert first.evidence == second.evidence
    assert first.evidence[0].doc_id == "mem-1"
    assert first.evidence[0].rank == 1


def test_mock_retrieval_respects_top_k():
    query = RetrievalQuery(query_text="career build tooling", top_k=1)
    result = MockRetrievalProvider().retrieve(query, index_chunks(_docs()))
    assert len(result.evidence) == 1


def test_retrieve_memory_evidence_disabled_by_default():
    query = RetrievalQuery(query_text="career")
    result = retrieve_memory_evidence(query, _docs(), settings=_settings(enabled=False))
    assert result.evidence == []
    assert result.trace.enabled is False
    assert result.trace.provider == "disabled"
    assert "not real RAG" in result.trace.notes[0]


def test_runtime_chat_paths_do_not_import_retrieval():
    import importlib

    modules = (
        "app.main",
        "app.providers.mock",
        "app.providers.openvino_provider",
        "app.critic_backend",
        "app.context_packet_render",
        "app.chat_harness_draft_generate",
    )
    for name in modules:
        mod = importlib.import_module(name)
        assert mod.__file__ is not None
        text = open(mod.__file__, encoding="utf-8").read()
        assert "app.retrieval" not in text, f"{name} must not import retrieval spine"


def test_retrieve_memory_evidence_enabled_uses_mock_provider():
    query = RetrievalQuery(query_text="tooling polish", top_k=2)
    result = retrieve_memory_evidence(query, _docs(), settings=_settings(enabled=True))
    assert result.trace.enabled is True
    assert result.trace.provider == "mock"
    assert any(item.doc_id == "mem-2" for item in result.evidence)
