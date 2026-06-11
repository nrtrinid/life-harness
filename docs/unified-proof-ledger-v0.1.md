# Unified Proof Ledger v0.1

## Product rationale

Life Harness already creates momentum evidence in many places — Quick Capture, Pounce, MVD/Salvage, career actions, resume export, card movement, and agent session completion. **Proof Shelf** and Playback surfaces showed slices of that history, but proof still felt fragmented.

**Unified Proof Ledger v0.1** adds a read-only view model and screen that answers:

```text
What changed?
What did I do?
What momentum did I earn?
```

This is unification only — `ProofItem` and `LifeLogEntry` remain the source of truth.

## What counts as ledger evidence

| Evidence | How it enters the ledger |
|----------|--------------------------|
| **Proof items** (primary) | All non–S3 proof items, classified by title/log context |
| **Logs without proof** | Meaningful `win`, `idea`, `pounce`, `salvage`, `mvd`, `clarity` logs not already backing a proof item |
| **Agent sessions** | Completed sessions **without** `evidenceProofItemId` get a fallback agent entry |
| **Career / resume** | Appears through existing proof/log pairs (intake, apply, follow-up, source runs, etc.) — no invented events |

### Current write paths (unchanged)

| Action | Proof | Log |
|--------|-------|-----|
| Pounce / MVD / Salvage | yes | yes (linked) |
| Quick capture idea / park / win / apply / follow-up | usually yes | yes |
| Career intake / approve candidate / job source run | yes | yes |
| Agent session mark done | yes | yes |
| Job candidate intake | no | yes (log-only in ledger) |
| Card state change (non-park) | no | no |

See `src/core/proofLedger.ts` header comment for the canonical list.

## Dedupe rules

1. **Proof items** are emitted first (primary evidence).
2. **Logs** are skipped when `proofItemId` points at an existing proof, or when any proof’s `sourceLogId` matches the log.
3. **Agent sessions** with `evidenceProofItemId` are not double-counted when that proof is already in the ledger.
4. **S3** cards/logs are excluded via `shouldIncludeCard` / `shouldIncludeLog` (same as context export).

## Surfaces

| Surface | Role |
|---------|------|
| **Today → You moved** | Proof Shelf teaser + **View ledger** link |
| **`/proof-ledger`** | Full ledger (Backroom nav) with source filters |
| **Playback** | Proof Shelf + ledger link |
| **Card Detail (Act)** | Linked proof + **View proof ledger for this card** (`?cardId=`) |
| **Proof Shelf** | Unchanged data; optional `showLedgerLink` prop |

## API

```ts
buildProofLedger(data, { now?, limit?, cardId?, source? })
```

Returns `entries` (newest first), `recent` (cap 8), `bySource` counts, and `totalProof`.

## Intentionally unchanged

- No new proof-writing behavior
- No new Quick Capture parser commands or assistant action types
- No LLM classification or ai-gateway changes
- No Playback redesign, analytics dashboard, or cloud sync

## Future path

- Stronger event taxonomy
- Universal capture commands feeding ledger rows explicitly
- Ledger search and richer filters
- Card-native ledger panel using `buildProofLedger({ cardId })` inline
- Every tool explicitly feeding card / proof / log / next move
