# Local Memory / RAG Spine v0.1

Structural foundation for retrieval-augmented generation in Life Harness. **This is a spine only** — not real embeddings, vector search, or production chat injection.

## Purpose

Prepare a deterministic, testable pipeline for local memory retrieval before `memory_embed` or any vector index exists:

```text
MemoryDocument corpus
  → deterministic chunking
  → RetrievalQuery
  → mock ranker (token overlap)
  → RetrievalResult + RetrievalTrace
  → bounded RetrievalEvidencePacket
```

Default runtime: **disabled** (`SCOUT_MEMORY_RAG_ENABLED=false`). Even when set to `true`, only the **mock token-overlap test provider** runs — **not real retrieval**, not embeddings, not chat injection. Library code lives in `services/ai-gateway/app/retrieval/` and is exercised in tests only until a future ticket wires real retrieval.

## What this is not

- Not real RAG or answer-quality improvement
- Not OpenVINO / embedding execution
- Not a vector database
- Not an HTTP endpoint
- Not wired into Chat Harness, context packets, or Memory Bank UI

See also: [memory-bank-v0.1.md](./memory-bank-v0.1.md) (user-approved durable memory, export-only today), [conversation-summary-memory-v0.1.md](./conversation-summary-memory-v0.1.md) (chat summaries, not retrieval).

## Data model (gateway)

| Type | Role |
|------|------|
| `MemoryDocument` | Ingest unit (`doc_id`, `source`, `title`, `body`) |
| `MemoryChunk` | Deterministic slice with stable `chunk_id` |
| `RetrievalQuery` | `query_text`, `top_k`, `max_evidence_chars`, optional `source_filter` |
| `RetrievedEvidence` | Ranked chunk hit with score |
| `RetrievalTrace` | Provider, enabled flag, token/candidate metadata |
| `RetrievalResult` | Query + evidence + trace + `degraded_notes` |
| `RetrievalEvidencePacket` | Bounded markdown bundle for prompt injection (future) |

`MemoryDocumentSource` values: `memory_bank`, `chat_summary`, `thread_state`, `proof_shelf`, `manual_fixture`.

## Chunking (deterministic)

- `chunk_document()` — paragraph/newline boundaries, max ~400 chars per chunk, stable IDs `{doc_id}#chunk-{index}`
- `chunk_thread_like_items()` — one chunk per non-empty thread line (open loops, pinned facts)
- No randomness, no timestamps in IDs

## Mock retrieval

`MockRetrievalProvider` scores chunks with normalized token overlap plus exact substring boost. **Test/development only** — this ranking must not ship as the production retrieval strategy. Tie-break: `chunk_id` lexicographic order.

`retrieve_memory_evidence()` gates on `SCOUT_MEMORY_RAG_ENABLED`. When false (default), returns empty evidence and `trace.enabled=false`. When true, runs the mock provider only — still **not real RAG** and **not wired into Chat Harness**.

## Evidence packet

`build_retrieval_evidence_packet()` renders:

```text
### Retrieved memory evidence
- [doc_id/chunk_id] clipped text…
```

Budget: `DEFAULT_RETRIEVAL_EVIDENCE_MAX_CHARS` (1200) — separate from critic context budget.

## Future mapping: Memory Bank → MemoryDocument

| `HarnessMemoryItem` | `MemoryDocument` |
|---------------------|------------------|
| `id` | `doc_id` |
| `kind` + `title` + `summary` | `title` + `body` |
| — | `source=memory_bank` |

No TypeScript adapter in v0.1; mapping is documented for a later ticket.

## Future phases (out of scope)

1. Enable `memory_embed` slot + real embeddings
2. Local vector index / persistence
3. Opt-in Chat Harness evidence injection behind explicit flag + sensitivity checks
4. Eval fixtures for retrieval quality (not mock overlap)

## Verify

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest tests/test_memory_chunking.py tests/test_mock_retrieval.py tests/test_retrieval_evidence_packet.py tests/test_embedding_slot_stub.py -q
```

## Related seams

- `app/retrieval/embedding_slot.py` — slot probe only (PR-6)
- `app/critic_contract.py` — critic evidence packets (orthogonal budget)
