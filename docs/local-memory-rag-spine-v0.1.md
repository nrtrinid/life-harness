# Local Memory / RAG Spine v0.1

Structural foundation for retrieval-augmented generation in Life Harness. **This is a spine only** — not real embeddings, vector search, or production chat injection.

## Purpose

Prepare a deterministic, testable pipeline for local memory retrieval before `memory_embed` or any vector index exists:

```text
Canonical Memory Bank records
  → sensitivity/shape eligibility adapter
  → MemoryDocument corpus
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
- Not a persistent or background index
- Not semantic retrieval or a retrieval-quality benchmark
- Not an HTTP endpoint
- Not wired into Chat Harness, context packets, or Memory Bank UI

See also: [memory-bank-v0.1.md](./memory-bank-v0.1.md) (user-approved durable memory, export-only today), [conversation-summary-memory-v0.1.md](./conversation-summary-memory-v0.1.md) (chat summaries, not retrieval).

## Data model (gateway)

| Type | Role |
|------|------|
| `MemoryDocument` | Ingest unit with stable identity, retrieval text, sensitivity, and compact source provenance |
| `MemoryChunk` | Deterministic slice with stable `chunk_id` and copied document provenance |
| `RetrievalQuery` | `query_text`, `top_k`, `max_evidence_chars`, optional `source_filter` |
| `RetrievedEvidence` | Ranked chunk hit with score and copied chunk provenance |
| `RetrievalTrace` | Provider, enabled flag, token/candidate metadata |
| `RetrievalResult` | Query + evidence + trace + `degraded_notes` |
| `RetrievalEvidencePacket` | Bounded markdown bundle plus structured provenance items for future prompt injection |

`MemoryDocumentSource` values: `memory_bank`, `chat_summary`, `thread_state`, `proof_shelf`, `manual_fixture`.

## Canonical Memory Bank adapter

`adapt_memory_bank_records()` consumes the persisted application-shaped Memory Bank JSON contract. The Python eligibility function narrowly mirrors canonical `getMemoryRetrievalEligibility()` behavior:

- Active S0, S1, and S2 records are eligible.
- S3, `unclassified`, inactive, missing sensitivity, invalid sensitivity, and malformed records are excluded before documents or chunks exist.
- Unknown classifications fail closed; they are never coerced to S1.
- The legacy S1 context-packet compatibility label is not used as retrieval classification.
- Duplicate, missing, or blank source IDs fail closed with content-free diagnostics.
- An eligible record with an empty summary produces no retrieval document.

Diagnostics contain only structured reason codes and source IDs when safe. They never contain titles, summaries, evidence text, or tags. The synthetic contract fixture lives at `services/ai-gateway/tests/fixtures/synthetic_memory_bank_records.json`.

### Implemented mapping

| `HarnessMemoryItem` | `MemoryDocument` |
|---------------------|------------------|
| `id` | `source_record_id`; stable `doc_id=memory_bank:{id}` |
| `kind` | `source_kind` |
| `title` | `title`, preserved |
| `summary` | `body`, preserved |
| `tags` | `tags`, preserved in input order |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` |
| `sourceChatSummaryId` | optional `source_chat_summary_id` |
| `sensitivity` | canonical `sensitivity`, propagated through the packet |
| `isActive` | eligibility input only |
| `evidence` | not copied into retrieval text in this slice |
| — | `source=memory_bank` |

Document identity depends only on the persisted Memory Bank ID. Input reordering, unrelated insertions/deletions, queries, and metadata changes therefore do not change document identity. Chunk identity remains `{doc_id}#chunk-{index}` for deterministic rechunking of the same body.

## Chunking (deterministic)

- `chunk_document()` — paragraph/newline boundaries, max ~400 chars per chunk, stable IDs `{doc_id}#chunk-{index}`
- `chunk_thread_like_items()` — one chunk per non-empty thread line (open loops, pinned facts)
- Source record ID, source type, sensitivity, optional chat-summary provenance, and timestamps propagate to every document chunk.
- No randomness and no timestamps in IDs.

## Mock retrieval

`MockRetrievalProvider` scores chunks with normalized token overlap plus exact substring boost. **Test/development only** — this ranking must not ship as the production retrieval strategy and must not be called semantic retrieval. Tie-break: `chunk_id` lexicographic order.

`retrieve_memory_evidence()` gates on `SCOUT_MEMORY_RAG_ENABLED`. When false (default), it returns empty evidence and `trace.enabled=false`. When true, it runs the mock provider only — still **not real RAG** and **not wired into Chat Harness**.

The fixture-backed tests prove deterministic eligible-record ranking and confirm excluded bodies cannot enter documents, chunks, evidence, or packets.

## Evidence packet

`build_retrieval_evidence_packet()` renders:

```text
### Retrieved memory evidence
- [doc_id/chunk_id] clipped text…
```

Budget: `DEFAULT_RETRIEVAL_EVIDENCE_MAX_CHARS` (1200) — separate from critic context budget.

Each included packet item retains `chunk_id`, `doc_id`, `source_record_id`, source type, sensitivity, chunk index, timestamps, optional `source_chat_summary_id`, and the rendered excerpt. It does not retain the full Memory Bank record.

## Future phases (out of scope)

1. Opt-in Chat Harness evidence injection behind an explicit flag and model-facing sensitivity check
2. Real `memory_embed` inference
3. Vector database or other persistent index
4. Background indexing
5. Semantic retrieval and retrieval-quality benchmarking
6. Production latency evaluation

## Verify

```powershell
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest tests/test_memory_bank_adapter.py tests/test_memory_chunking.py tests/test_mock_retrieval.py tests/test_retrieval_evidence_packet.py tests/test_embedding_slot_stub.py -q
```

## Related seams

- `app/retrieval/embedding_slot.py` — slot probe only (PR-6)
- `app/critic_contract.py` — critic evidence packets (orthogonal budget)
