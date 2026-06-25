"""Deterministic mock retrieval for tests and spine development only.

Token-overlap ranking is NOT a production retrieval strategy. A future ticket
must replace this with embedding/vector retrieval before any real RAG path ships.
"""

from __future__ import annotations

import re

from app.retrieval.memory_types import (
    MemoryChunk,
    MemoryDocumentSource,
    RetrievalQuery,
    RetrievalResult,
    RetrievalTrace,
    RetrievedEvidence,
)

_TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)
_SUBSTRING_BOOST = 2.0


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text)]


def _score_chunk(query_text: str, query_tokens: set[str], chunk: MemoryChunk) -> float:
    if not query_tokens:
        return 0.0

    haystack = chunk.text.lower()
    chunk_tokens = set(_tokenize(chunk.text))
    overlap = len(query_tokens & chunk_tokens)
    score = float(overlap)
    if query_text.lower() in haystack:
        score += _SUBSTRING_BOOST
    return score


class MockRetrievalProvider:
    provider_name = "mock"

    def retrieve(self, query: RetrievalQuery, chunks: list[MemoryChunk]) -> RetrievalResult:
        query_text = query.query_text.strip()
        query_tokens = set(_tokenize(query_text))
        source_filter = set(query.source_filter or ())

        candidates = [
            chunk
            for chunk in chunks
            if not source_filter or chunk.source in source_filter
        ]

        ranked: list[tuple[float, MemoryChunk]] = []
        for chunk in candidates:
            score = _score_chunk(query_text, query_tokens, chunk)
            if score > 0:
                ranked.append((score, chunk))

        ranked.sort(key=lambda item: (-item[0], item[1].chunk_id))

        evidence: list[RetrievedEvidence] = []
        budget = query.max_evidence_chars
        used = 0
        for rank, (score, chunk) in enumerate(ranked[: query.top_k], start=1):
            line_budget = max(0, budget - used)
            if line_budget <= 0:
                break
            text = chunk.text
            if len(text) > line_budget:
                text = text[: max(0, line_budget - 1)].rstrip() + "…"
            evidence.append(
                RetrievedEvidence(
                    chunk_id=chunk.chunk_id,
                    doc_id=chunk.doc_id,
                    source=chunk.source,
                    text=text,
                    score=score,
                    rank=rank,
                )
            )
            used += len(text)

        trace = RetrievalTrace(
            provider="mock",
            enabled=True,
            query_tokens=sorted(query_tokens),
            candidates_considered=len(candidates),
            notes=["mock token-overlap test ranking only; not production retrieval"],
        )
        return RetrievalResult(query=query, evidence=evidence, trace=trace)
