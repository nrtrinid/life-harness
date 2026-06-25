"""Retrieval provider resolution — mock spine only, not wired into Chat Harness.

`SCOUT_MEMORY_RAG_ENABLED=true` enables the mock test provider only. It does not
run embeddings, change HTTP routes, or inject evidence into chat prompts.
"""
from __future__ import annotations

from app.config import Settings
from app.retrieval.chunking import index_chunks
from app.retrieval.memory_types import (
    MemoryDocument,
    RetrievalQuery,
    RetrievalResult,
    RetrievalTrace,
)
from app.retrieval.mock_provider import MockRetrievalProvider


def resolve_retrieval_provider(settings: Settings) -> MockRetrievalProvider | None:
    if not settings.memory_rag_enabled:
        return None
    return MockRetrievalProvider()


def _disabled_result(query: RetrievalQuery) -> RetrievalResult:
    return RetrievalResult(
        query=query,
        evidence=[],
        trace=RetrievalTrace(
            provider="disabled",
            enabled=False,
            query_tokens=[],
            candidates_considered=0,
            notes=["SCOUT_MEMORY_RAG_ENABLED=false; mock retrieval spine disabled (not real RAG)"],
        ),
        degraded_notes=["memory RAG spine disabled by default; mock-only when enabled — not real retrieval"],
    )


def retrieve_memory_evidence(
    query: RetrievalQuery,
    documents: list[MemoryDocument],
    *,
    settings: Settings,
) -> RetrievalResult:
    provider = resolve_retrieval_provider(settings)
    if provider is None:
        return _disabled_result(query)

    chunks = index_chunks(documents)
    return provider.retrieve(query, chunks)
