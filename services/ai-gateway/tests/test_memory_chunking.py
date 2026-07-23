from __future__ import annotations

from app.retrieval.chunking import (
    chunk_document,
    chunk_thread_like_items,
    index_chunks,
)
from app.retrieval.memory_types import MemoryDocument, MemoryDocumentSource


def _doc(doc_id: str, body: str) -> MemoryDocument:
    return MemoryDocument(
        doc_id=doc_id,
        source=MemoryDocumentSource.manual_fixture,
        title="Fixture",
        body=body,
    )


def test_chunk_document_splits_paragraphs_deterministically():
    para_one = "First paragraph line one. " * 20
    para_two = "Second paragraph is here. " * 20
    doc = _doc("doc-a", f"{para_one}\n\n{para_two}")
    first = chunk_document(doc)
    second = chunk_document(doc)
    assert first == second
    assert len(first) >= 2
    assert first[0].chunk_id == "doc-a#chunk-0"
    assert first[1].chunk_id == "doc-a#chunk-1"


def test_chunk_document_empty_body_returns_no_chunks():
    assert chunk_document(_doc("empty", "")) == []
    assert chunk_document(_doc("spaces", "   \n\n  ")) == []


def test_chunk_thread_like_items_one_chunk_per_item():
    chunks = chunk_thread_like_items(
        "thread-doc",
        MemoryDocumentSource.thread_state,
        ["  open loop one  ", "", "pinned fact"],
    )
    assert len(chunks) == 2
    assert chunks[0].chunk_id == "thread-doc#chunk-0"
    assert chunks[0].text == "open loop one"
    assert chunks[1].text == "pinned fact"


def test_index_chunks_flattens_documents():
    docs = [
        _doc("one", "Alpha paragraph."),
        _doc("two", "Beta paragraph."),
    ]
    indexed = index_chunks(docs)
    assert [chunk.doc_id for chunk in indexed] == ["one", "two"]


def test_chunk_document_preserves_memory_bank_provenance():
    document = MemoryDocument(
        doc_id="memory_bank:memory-s2",
        source=MemoryDocumentSource.memory_bank,
        source_record_id="memory-s2",
        source_kind="preference",
        title="Synthetic preference",
        body="First paragraph.\n\nSecond paragraph.",
        created_at="2026-01-01T00:00:00.000Z",
        updated_at="2026-01-02T00:00:00.000Z",
        source_chat_summary_id="chat-summary-synthetic",
        sensitivity="S2",
        tags=["synthetic"],
    )
    chunks = chunk_document(document, max_chunk_chars=20)
    assert len(chunks) == 2
    for index, chunk in enumerate(chunks):
        assert chunk.chunk_id == f"memory_bank:memory-s2#chunk-{index}"
        assert chunk.doc_id == document.doc_id
        assert chunk.source_record_id == "memory-s2"
        assert chunk.source_kind == "preference"
        assert chunk.sensitivity == "S2"
        assert chunk.source_chat_summary_id == "chat-summary-synthetic"
        assert chunk.created_at == "2026-01-01T00:00:00.000Z"
        assert chunk.updated_at == "2026-01-02T00:00:00.000Z"
