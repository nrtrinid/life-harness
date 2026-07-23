from __future__ import annotations

from app.config import Settings
from app.retrieval.evidence_packet import build_retrieval_evidence_packet
from app.retrieval.memory_types import (
    MemoryDocument,
    MemoryDocumentSource,
    RetrievalQuery,
    RetrievalResult,
    RetrievalTrace,
    RetrievedEvidence,
)
from app.retrieval.provider import retrieve_memory_evidence


def _settings_enabled() -> Settings:
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
        memory_rag_enabled=True,
    )


def test_evidence_packet_includes_source_ids_and_header():
    result = RetrievalResult(
        query=RetrievalQuery(query_text="career"),
        evidence=[
            RetrievedEvidence(
                chunk_id="mem-1#chunk-0",
                doc_id="mem-1",
                source=MemoryDocumentSource.memory_bank,
                source_record_id="memory-1",
                source_kind="rule",
                sensitivity="S1",
                source_chat_summary_id="chat-summary-synthetic",
                created_at="2026-01-01T00:00:00.000Z",
                updated_at="2026-01-02T00:00:00.000Z",
                chunk_index=0,
                text="Career-first direction.",
                score=2.0,
                rank=1,
            )
        ],
        trace=RetrievalTrace(provider="mock", enabled=True),
    )
    packet = build_retrieval_evidence_packet(result)
    assert "### Retrieved memory evidence" in packet.rendered_bundle
    assert "[mem-1/mem-1#chunk-0]" in packet.rendered_bundle
    assert packet.source_chunk_ids == ["mem-1#chunk-0"]
    assert packet.items[0].source_record_id == "memory-1"
    assert packet.items[0].source_kind == "rule"
    assert packet.items[0].sensitivity == "S1"
    assert packet.items[0].source_chat_summary_id == "chat-summary-synthetic"
    assert packet.items[0].chunk_index == 0


def test_evidence_packet_respects_char_budget():
    long_text = "x" * 500
    result = RetrievalResult(
        query=RetrievalQuery(query_text="x"),
        evidence=[
            RetrievedEvidence(
                chunk_id="doc#chunk-0",
                doc_id="doc",
                source=MemoryDocumentSource.manual_fixture,
                chunk_index=0,
                text=long_text,
                score=1.0,
                rank=1,
            )
        ],
        trace=RetrievalTrace(provider="mock", enabled=True),
    )
    packet = build_retrieval_evidence_packet(result, max_chars=120)
    assert packet.char_count <= 120
    assert packet.items[0].excerpt
    assert packet.items[0].excerpt in packet.rendered_bundle


def test_evidence_packet_empty_result_is_safe():
    result = RetrievalResult(
        query=RetrievalQuery(query_text="none"),
        evidence=[],
        trace=RetrievalTrace(provider="disabled", enabled=False),
    )
    packet = build_retrieval_evidence_packet(result)
    assert packet.rendered_bundle == ""
    assert packet.source_chunk_ids == []
    assert packet.items == []


def test_end_to_end_retrieval_to_evidence_packet():
    docs = [
        MemoryDocument(
            doc_id="mem-1",
            source=MemoryDocumentSource.memory_bank,
            title="Focus",
            body="Ship the smallest useful slice before polishing tooling.",
        )
    ]
    query = RetrievalQuery(query_text="smallest useful slice", top_k=1)
    result = retrieve_memory_evidence(query, docs, settings=_settings_enabled())
    packet = build_retrieval_evidence_packet(result)
    assert packet.source_chunk_ids
    assert "mem-1" in packet.rendered_bundle
