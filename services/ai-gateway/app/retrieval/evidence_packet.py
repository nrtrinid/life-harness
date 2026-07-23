from __future__ import annotations

from app.retrieval.memory_types import (
    RetrievalEvidencePacket,
    RetrievalEvidencePacketItem,
    RetrievalResult,
)

DEFAULT_RETRIEVAL_EVIDENCE_MAX_CHARS = 1200
_HEADER = "### Retrieved memory evidence"


def _clip_bundle(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    suffix = "…"
    keep = max(0, max_chars - len(suffix))
    return text[:keep].rstrip() + suffix


def build_retrieval_evidence_packet(
    result: RetrievalResult,
    *,
    max_chars: int = DEFAULT_RETRIEVAL_EVIDENCE_MAX_CHARS,
) -> RetrievalEvidencePacket:
    if not result.evidence:
        return RetrievalEvidencePacket(
            rendered_bundle="",
            char_count=0,
            max_chars=max_chars,
            source_chunk_ids=[],
            items=[],
        )

    lines = [_HEADER]
    source_chunk_ids: list[str] = []
    packet_items: list[RetrievalEvidencePacketItem] = []
    for item in result.evidence:
        prefix = f"- [{item.doc_id}/{item.chunk_id}] "
        used_chars = len("\n".join(lines))
        remaining = max_chars - used_chars - 1
        if remaining <= len(prefix):
            break
        excerpt = item.text
        if len(prefix) + len(excerpt) > remaining:
            excerpt = _clip_bundle(excerpt, remaining - len(prefix))
        if not excerpt:
            break

        source_chunk_ids.append(item.chunk_id)
        lines.append(f"{prefix}{excerpt}")
        packet_items.append(
            RetrievalEvidencePacketItem(
                chunk_id=item.chunk_id,
                doc_id=item.doc_id,
                source_record_id=item.source_record_id,
                source=item.source,
                source_kind=item.source_kind,
                sensitivity=item.sensitivity,
                source_chat_summary_id=item.source_chat_summary_id,
                created_at=item.created_at,
                updated_at=item.updated_at,
                chunk_index=item.chunk_index,
                excerpt=excerpt,
            )
        )

    rendered = _clip_bundle("\n".join(lines), max_chars)
    return RetrievalEvidencePacket(
        rendered_bundle=rendered,
        char_count=len(rendered),
        max_chars=max_chars,
        source_chunk_ids=source_chunk_ids,
        items=packet_items,
    )
