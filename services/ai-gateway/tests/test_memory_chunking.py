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
