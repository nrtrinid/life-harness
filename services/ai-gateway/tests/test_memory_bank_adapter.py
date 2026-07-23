from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest

from app.config import Settings
from app.retrieval.chunking import index_chunks
from app.retrieval.evidence_packet import build_retrieval_evidence_packet
from app.retrieval.memory_bank_adapter import (
    MemoryBankDiagnosticCode,
    MemoryBankEligibilityReason,
    adapt_memory_bank_records,
    evaluate_memory_bank_retrieval_eligibility,
)
from app.retrieval.memory_types import RetrievalQuery
from app.retrieval.mock_provider import MockRetrievalProvider
from app.retrieval.provider import retrieve_memory_evidence

FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "synthetic_memory_bank_records.json"
)


def _record(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "id": "memory-test",
        "kind": "rule",
        "title": "Synthetic rule",
        "summary": "Synthetic retrieval text.",
        "tags": ["synthetic"],
        "sensitivity": "S0",
        "isActive": True,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-02T00:00:00.000Z",
    }
    record.update(overrides)
    return record


def _fixture_records() -> list[object]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _settings(*, enabled: bool) -> Settings:
    return replace(Settings.from_env(), memory_rag_enabled=enabled)


@pytest.mark.parametrize("sensitivity", ["S0", "S1", "S2"])
def test_active_s0_through_s2_are_eligible(sensitivity: str):
    result = evaluate_memory_bank_retrieval_eligibility(
        _record(sensitivity=sensitivity)
    )
    assert result.eligible is True
    assert result.reason == MemoryBankEligibilityReason.eligible
    assert result.sensitivity == sensitivity


@pytest.mark.parametrize(
    ("record", "reason"),
    [
        (_record(sensitivity="S3"), MemoryBankEligibilityReason.sensitivity_s3),
        (
            _record(sensitivity="unclassified"),
            MemoryBankEligibilityReason.sensitivity_unclassified,
        ),
        (
            _record(sensitivity="S1", isActive=False),
            MemoryBankEligibilityReason.inactive,
        ),
        (
            {key: value for key, value in _record().items() if key != "sensitivity"},
            MemoryBankEligibilityReason.sensitivity_unclassified,
        ),
        (
            _record(sensitivity=None),
            MemoryBankEligibilityReason.sensitivity_invalid,
        ),
        (
            _record(sensitivity="s1"),
            MemoryBankEligibilityReason.sensitivity_invalid,
        ),
        (
            _record(sensitivity="private"),
            MemoryBankEligibilityReason.sensitivity_invalid,
        ),
        (
            _record(sensitivity=["S0"]),
            MemoryBankEligibilityReason.sensitivity_invalid,
        ),
        (
            _record(kind="not-a-kind"),
            MemoryBankEligibilityReason.malformed,
        ),
        (
            _record(evidence=None),
            MemoryBankEligibilityReason.malformed,
        ),
        (
            _record(sourceChatSummaryId=None),
            MemoryBankEligibilityReason.malformed,
        ),
    ],
)
def test_ineligible_records_fail_closed(
    record: dict[str, object],
    reason: MemoryBankEligibilityReason,
):
    result = evaluate_memory_bank_retrieval_eligibility(record)
    assert result.eligible is False
    assert result.reason == reason


def test_fixture_adapts_only_active_classified_nonempty_unique_records():
    result = adapt_memory_bank_records(_fixture_records())
    assert [document.doc_id for document in result.documents] == [
        "memory_bank:memory-s0",
        "memory_bank:memory-s1",
        "memory_bank:memory-s2",
    ]
    assert result.input_count == 17
    assert result.document_count == 3
    assert result.excluded_count == 14

    shipping = next(
        document
        for document in result.documents
        if document.source_record_id == "memory-s1"
    )
    assert shipping.body == (
        "Ship the smallest useful slice before polishing tooling."
    )
    assert "evidence" not in shipping.body.lower()
    assert shipping.source.value == "memory_bank"
    assert shipping.source_kind == "rule"
    assert shipping.sensitivity == "S1"
    assert shipping.tags == ["synthetic", "shipping"]
    assert shipping.created_at == "2026-01-03T00:00:00.000Z"
    assert shipping.updated_at == "2026-01-04T00:00:00.000Z"

    s0 = result.documents[0]
    assert s0.source_chat_summary_id == "chat-summary-synthetic-1"


def test_fixture_emits_content_free_deterministic_diagnostics():
    records = _fixture_records()
    first = adapt_memory_bank_records(records)
    second = adapt_memory_bank_records(list(reversed(records)))
    assert first.diagnostics == second.diagnostics

    codes = [diagnostic.code for diagnostic in first.diagnostics]
    assert codes.count(MemoryBankDiagnosticCode.duplicate_id) == 2
    assert MemoryBankDiagnosticCode.empty_summary in codes
    assert MemoryBankDiagnosticCode.inactive in codes
    assert MemoryBankDiagnosticCode.sensitivity_s3 in codes
    assert MemoryBankDiagnosticCode.sensitivity_unclassified in codes
    assert MemoryBankDiagnosticCode.sensitivity_invalid in codes
    assert MemoryBankDiagnosticCode.missing_id in codes
    assert MemoryBankDiagnosticCode.missing_title in codes
    assert MemoryBankDiagnosticCode.invalid_title in codes
    assert MemoryBankDiagnosticCode.invalid_tags in codes
    assert MemoryBankDiagnosticCode.malformed_record in codes

    serialized = json.dumps(
        [diagnostic.model_dump(mode="json") for diagnostic in first.diagnostics]
    )
    for forbidden in (
        "S3_PRIVATE_NEVER_INDEX_7F31",
        "UNCLASSIFIED_NEVER_INDEX_1A92",
        "INACTIVE_NEVER_INDEX_93D4",
        "Synthetic excluded S3",
        "Synthetic evidence must not become retrieval body text.",
    ):
        assert forbidden not in serialized


def test_duplicate_ids_are_all_excluded_and_cannot_alias_provenance():
    result = adapt_memory_bank_records(
        [
            _record(id="same-id", summary="First synthetic body."),
            _record(id="same-id", summary="Second synthetic body."),
        ]
    )
    assert result.documents == []
    assert [diagnostic.code for diagnostic in result.diagnostics] == [
        MemoryBankDiagnosticCode.duplicate_id,
        MemoryBankDiagnosticCode.duplicate_id,
    ]


def test_doc_and_chunk_identity_are_stable_across_reordering_and_unrelated_insert():
    records = _fixture_records()
    baseline_docs = adapt_memory_bank_records(records).documents
    changed_records = list(reversed(records)) + [
        _record(
            id="memory-unrelated",
            summary="Completely unrelated synthetic insert.",
        )
    ]
    changed_docs = adapt_memory_bank_records(changed_records).documents

    baseline_doc_ids = [document.doc_id for document in baseline_docs]
    assert [
        document.doc_id
        for document in changed_docs
        if document.source_record_id != "memory-unrelated"
    ] == baseline_doc_ids

    baseline_chunks = index_chunks(baseline_docs)
    changed_chunks = index_chunks(
        [
            document
            for document in changed_docs
            if document.source_record_id != "memory-unrelated"
        ]
    )
    assert [chunk.chunk_id for chunk in changed_chunks] == [
        chunk.chunk_id for chunk in baseline_chunks
    ]

    retained_after_delete = adapt_memory_bank_records(
        [
            record
            for record in records
            if not (
                isinstance(record, dict)
                and record.get("id") == "memory-s2"
            )
        ]
    ).documents
    retained_ids = {
        document.source_record_id: document.doc_id
        for document in retained_after_delete
    }
    assert retained_ids["memory-s0"] == "memory_bank:memory-s0"
    assert retained_ids["memory-s1"] == "memory_bank:memory-s1"


def test_metadata_changes_do_not_change_document_identity():
    original = adapt_memory_bank_records([_record(id="stable-id")]).documents[0]
    changed = adapt_memory_bank_records(
        [
            _record(
                id="stable-id",
                title="Changed synthetic title",
                tags=["changed"],
                updatedAt="2026-05-01T00:00:00.000Z",
            )
        ]
    ).documents[0]
    assert changed.source_record_id == original.source_record_id
    assert changed.doc_id == original.doc_id


def test_fixture_runs_adapter_chunk_retrieval_and_packet_with_provenance():
    adaptation = adapt_memory_bank_records(_fixture_records())
    chunks = index_chunks(adaptation.documents)
    result = MockRetrievalProvider().retrieve(
        RetrievalQuery(query_text="smallest useful slice", top_k=1),
        chunks,
    )
    assert result.evidence[0].doc_id == "memory_bank:memory-s1"
    evidence = result.evidence[0]
    assert evidence.source_record_id == "memory-s1"
    assert evidence.source_kind == "rule"
    assert evidence.sensitivity == "S1"
    assert evidence.chunk_index == 0
    assert evidence.created_at == "2026-01-03T00:00:00.000Z"
    assert evidence.updated_at == "2026-01-04T00:00:00.000Z"

    packet = build_retrieval_evidence_packet(result)
    assert packet.source_chunk_ids == [
        "memory_bank:memory-s1#chunk-0"
    ]
    assert packet.items[0].source_record_id == "memory-s1"
    assert packet.items[0].sensitivity == "S1"
    assert packet.items[0].chunk_index == 0


def test_mock_retrieval_ties_and_no_match_are_deterministic():
    chunks = index_chunks(adapt_memory_bank_records(_fixture_records()).documents)
    tie = MockRetrievalProvider().retrieve(
        RetrievalQuery(query_text="shared focus", top_k=2),
        list(reversed(chunks)),
    )
    assert [item.doc_id for item in tie.evidence] == [
        "memory_bank:memory-s0",
        "memory_bank:memory-s2",
    ]
    no_match = MockRetrievalProvider().retrieve(
        RetrievalQuery(query_text="zerooverlapqz", top_k=3),
        chunks,
    )
    assert no_match.evidence == []


def test_empty_candidate_corpus_returns_no_evidence():
    result = MockRetrievalProvider().retrieve(
        RetrievalQuery(query_text="anything", top_k=3),
        [],
    )
    assert result.evidence == []
    assert result.trace.candidates_considered == 0


def test_query_changes_do_not_change_source_or_document_identity():
    documents = adapt_memory_bank_records(_fixture_records()).documents
    chunks = index_chunks(documents)
    provider = MockRetrievalProvider()
    provider.retrieve(RetrievalQuery(query_text="shipping"), chunks)
    first_identity = [
        (document.source_record_id, document.doc_id) for document in documents
    ]
    provider.retrieve(RetrievalQuery(query_text="focus"), chunks)
    second_identity = [
        (document.source_record_id, document.doc_id) for document in documents
    ]
    assert second_identity == first_identity


def test_excluded_content_never_reaches_docs_chunks_evidence_or_packet():
    records = _fixture_records()
    adaptation = adapt_memory_bank_records(records)
    chunks = index_chunks(adaptation.documents)
    result = MockRetrievalProvider().retrieve(
        RetrievalQuery(query_text="shared focus", top_k=3),
        chunks,
    )
    packet = build_retrieval_evidence_packet(result)
    serialized = json.dumps(
        {
            "documents": [
                document.model_dump(mode="json")
                for document in adaptation.documents
            ],
            "chunks": [chunk.model_dump(mode="json") for chunk in chunks],
            "evidence": [
                item.model_dump(mode="json") for item in result.evidence
            ],
            "packet": packet.model_dump(mode="json"),
        }
    )
    for record in records:
        if not isinstance(record, dict):
            continue
        summary = record.get("summary")
        if isinstance(summary, str) and "NEVER_INDEX" in summary:
            assert summary not in serialized


def test_runtime_retrieval_remains_disabled_unless_flag_is_enabled():
    documents = adapt_memory_bank_records(_fixture_records()).documents
    query = RetrievalQuery(query_text="smallest useful slice", top_k=1)
    disabled = retrieve_memory_evidence(
        query,
        documents,
        settings=_settings(enabled=False),
    )
    assert disabled.evidence == []
    assert disabled.trace.enabled is False

    enabled = retrieve_memory_evidence(
        query,
        documents,
        settings=_settings(enabled=True),
    )
    assert enabled.evidence[0].doc_id == "memory_bank:memory-s1"


def test_adaptation_does_not_mutate_input_records():
    records = _fixture_records()
    original = deepcopy(records)
    adapt_memory_bank_records(records)
    assert records == original
