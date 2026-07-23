from __future__ import annotations

from enum import Enum
from typing import Literal

from app.models import SensitivityLevel, StrictModel


class MemoryDocumentSource(str, Enum):
    memory_bank = "memory_bank"
    chat_summary = "chat_summary"
    thread_state = "thread_state"
    proof_shelf = "proof_shelf"
    manual_fixture = "manual_fixture"


class MemoryDocument(StrictModel):
    doc_id: str
    source: MemoryDocumentSource
    source_record_id: str | None = None
    source_kind: str | None = None
    title: str
    body: str
    created_at: str | None = None
    updated_at: str | None = None
    source_chat_summary_id: str | None = None
    sensitivity: SensitivityLevel | None = None
    tags: list[str] = []


class MemoryChunk(StrictModel):
    chunk_id: str
    doc_id: str
    source: MemoryDocumentSource
    source_record_id: str | None = None
    source_kind: str | None = None
    sensitivity: SensitivityLevel | None = None
    source_chat_summary_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    text: str
    char_start: int
    char_end: int
    chunk_index: int


class RetrievalQuery(StrictModel):
    query_text: str
    top_k: int = 5
    max_evidence_chars: int = 1200
    source_filter: list[MemoryDocumentSource] | None = None


class RetrievedEvidence(StrictModel):
    chunk_id: str
    doc_id: str
    source: MemoryDocumentSource
    source_record_id: str | None = None
    source_kind: str | None = None
    sensitivity: SensitivityLevel | None = None
    source_chat_summary_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    chunk_index: int
    text: str
    score: float
    rank: int


class RetrievalTrace(StrictModel):
    provider: Literal["mock", "disabled"] = "mock"
    enabled: bool = True
    query_tokens: list[str] = []
    candidates_considered: int = 0
    notes: list[str] = []


class RetrievalResult(StrictModel):
    query: RetrievalQuery
    evidence: list[RetrievedEvidence] = []
    trace: RetrievalTrace
    degraded_notes: list[str] = []


class RetrievalEvidencePacketItem(StrictModel):
    chunk_id: str
    doc_id: str
    source_record_id: str | None = None
    source: MemoryDocumentSource
    source_kind: str | None = None
    sensitivity: SensitivityLevel | None = None
    source_chat_summary_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    chunk_index: int
    excerpt: str


class RetrievalEvidencePacket(StrictModel):
    rendered_bundle: str
    char_count: int
    max_chars: int
    source_chunk_ids: list[str] = []
    items: list[RetrievalEvidencePacketItem] = []
