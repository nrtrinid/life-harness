from __future__ import annotations

import re

from app.retrieval.memory_types import MemoryChunk, MemoryDocument, MemoryDocumentSource

DEFAULT_MAX_CHUNK_CHARS = 400
DEFAULT_MAX_THREAD_ITEM_CHARS = 200


def _clip_text(text: str, max_len: int) -> str:
    stripped = text.strip()
    if len(stripped) <= max_len:
        return stripped
    return stripped[: max_len - 1].rstrip() + "…"


def _paragraph_segments(body: str) -> list[str]:
    parts = re.split(r"\n\s*\n+", body.strip())
    segments: list[str] = []
    for part in parts:
        for line in part.splitlines():
            line = line.strip()
            if line:
                segments.append(line)
    return segments


def _pack_segments(segments: list[str], *, max_chunk_chars: int) -> list[str]:
    if not segments:
        return []

    chunks: list[str] = []
    current = ""
    for segment in segments:
        candidate = f"{current}\n{segment}".strip() if current else segment
        if len(candidate) <= max_chunk_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(segment) <= max_chunk_chars:
            current = segment
            continue
        words = segment.split()
        word_buf: list[str] = []
        for word in words:
            trial = " ".join(word_buf + [word])
            if len(trial) <= max_chunk_chars:
                word_buf.append(word)
            else:
                if word_buf:
                    chunks.append(" ".join(word_buf))
                word_buf = [word]
        if word_buf:
            current = " ".join(word_buf)
        else:
            current = ""
    if current:
        chunks.append(current)
    return chunks


def chunk_document(
    doc: MemoryDocument,
    *,
    max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
    overlap_chars: int = 0,
) -> list[MemoryChunk]:
    if overlap_chars != 0:
        raise ValueError("overlap_chars is not supported in v0.1 chunking")

    body = doc.body.strip()
    if not body:
        return []

    segments = _paragraph_segments(body)
    packed = _pack_segments(segments, max_chunk_chars=max_chunk_chars)
    if not packed:
        return []

    chunks: list[MemoryChunk] = []
    cursor = 0
    for index, text in enumerate(packed):
        start = body.find(text, cursor)
        if start < 0:
            start = cursor
        end = start + len(text)
        cursor = end
        chunks.append(
            MemoryChunk(
                chunk_id=f"{doc.doc_id}#chunk-{index}",
                doc_id=doc.doc_id,
                source=doc.source,
                source_record_id=doc.source_record_id,
                source_kind=doc.source_kind,
                sensitivity=doc.sensitivity,
                source_chat_summary_id=doc.source_chat_summary_id,
                created_at=doc.created_at,
                updated_at=doc.updated_at,
                text=text,
                char_start=start,
                char_end=end,
                chunk_index=index,
            )
        )
    return chunks


def chunk_thread_like_items(
    doc_id: str,
    source: MemoryDocumentSource,
    items: list[str],
    *,
    max_item_chars: int = DEFAULT_MAX_THREAD_ITEM_CHARS,
) -> list[MemoryChunk]:
    chunks: list[MemoryChunk] = []
    index = 0
    for item in items:
        text = _clip_text(item, max_item_chars)
        if not text:
            continue
        chunks.append(
            MemoryChunk(
                chunk_id=f"{doc_id}#chunk-{index}",
                doc_id=doc_id,
                source=source,
                text=text,
                char_start=0,
                char_end=len(text),
                chunk_index=index,
            )
        )
        index += 1
    return chunks


def index_chunks(docs: list[MemoryDocument]) -> list[MemoryChunk]:
    indexed: list[MemoryChunk] = []
    for doc in docs:
        indexed.extend(chunk_document(doc))
    return indexed
