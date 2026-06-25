from __future__ import annotations

from app.retrieval.memory_types import RetrievalEvidencePacket, RetrievalResult

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
        )

    lines = [_HEADER]
    source_chunk_ids: list[str] = []
    for item in result.evidence:
        source_chunk_ids.append(item.chunk_id)
        lines.append(f"- [{item.doc_id}/{item.chunk_id}] {item.text}")

    rendered = _clip_bundle("\n".join(lines), max_chars)
    return RetrievalEvidencePacket(
        rendered_bundle=rendered,
        char_count=len(rendered),
        max_chars=max_chars,
        source_chunk_ids=source_chunk_ids,
    )
