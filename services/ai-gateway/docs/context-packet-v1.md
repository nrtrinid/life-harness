# Context packet wire schema v0.1

Product context packet for `POST /chat-harness`. Mirrors app [`AiContextPacket`](../../../src/core/contextPacket.ts).

## Version

- `packet_version`: `"0.1"` (required)

All JSON keys are **snake_case** on the wire.

## Root shape

| Field | Description |
|-------|-------------|
| `user_intent` | Message, mode, sensitivity, optional primary action, task mode |
| `board` | `harness` (legacy `HarnessContext`), `active_limit`, `diagnoses`, `product_decisions` |
| `active_cards` | Ranked active card slices |
| `stale_cards` | Ranked stale / reheat slices |
| `recent_proof` | Ranked proof items |
| `recovery_signals` | Salvage / MVD / recovery lines |
| `memories` | Memory bank + chat summary slices |
| `companion` | Briefing + recovery companion context |
| `open_thread` | In-session thread digest (no personality) |
| `project_docs` | Curated doc snippets (often empty in v0.1) |
| `tools` | Read-only permission placeholders |
| `budget` | Compaction metadata |
| `redaction` | Excluded S3 ids and notes |

## Ranked slice

```json
{
  "source": "active_cards",
  "tier": "high",
  "rank": 95,
  "sensitivity": "S1",
  "payload": { }
}
```

## Compatibility (v0.1)

- `ChatHarnessRequest.context` remains **required**.
- When `context_packet` is present, the gateway prompt prefers **ranked section rendering** from the packet.
- `context` stays on the wire as a shim for critic paths, mock heuristics, and older clients.
- Request-level `sensitivity: S3` is rejected before any provider call (unchanged).

## Sensitivity

- App builder excludes S3 cards/logs before send.
- Gateway does not re-expand `redaction.excluded_*` into prompt sections.
