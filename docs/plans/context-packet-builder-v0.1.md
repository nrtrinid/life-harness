# Context Packet Builder v0.1

> **Status:** Plan only — no runtime implementation in this slice.  
> **Goal:** Design a ranked, sensitivity-aware context packet system so local models receive **relevant** Life Harness state instead of a monolithic board dump or full chat history.

## Purpose

Today, Ask Harness sends a flat `HarnessContext` blob built by [`buildHarnessContext()`](../src/core/harnessContext.ts) and trimmed by [`buildCompactHarnessContext()`](../src/core/harnessContext.ts). That works for v0.1 dogfood but:

- Exports **all** mapped cards (including synthetic resume-module cards) before compaction drops low-priority rows.
- Embeds memory and diagnoses inside `recent_analyses` / `decisions` without explicit provenance or rank.
- Does not filter by per-card/log `sensitivity` (field exists on [`LifeCard`](../src/core/types.ts) / [`LifeLogEntry`](../src/core/types.ts) but export ignores it).
- Mixes board truth, operator companion signals, and thread continuity across separate wire fields with no unified budget story.
- [`POST /chat-harness`](../services/ai-gateway/app/main.py) returns plain text; structured proposals exist only on [`POST /ask-harness`](../services/ai-gateway/app/models.py) (`ProposedCardUpdate`).

The context packet builder is the **app-side** layer that assembles a typed, ranked, budgeted bundle **before** the gateway prompt is built. The model **never** mutates `LifeHarnessData` directly — it emits typed proposals the app validates and the user approves.

```text
LifeHarnessData + session inputs
  → buildAiContextPacket()
  → rank + redact + budget
  → wire to gateway (context_packet + legacy context shim)
  → model output (proposals)
  → app validators + approval UI
  → apply* actions in src/core/actions.ts
```

## Non-goals (v0.1 packet slice)

- RAG, embeddings, or vector retrieval
- Auto-applying model proposals to the board
- Sending Raw Lab personality, jailbreak framing, or ungrounded thread state to grounded modes
- Cloud providers or Supabase
- Replacing rules-only Today / briefing / primary-action logic

## Current state (what exists)

| Area | Location | Role today |
|------|----------|------------|
| Board export | [`src/core/harnessContext.ts`](../src/core/harnessContext.ts) | `HarnessContext`, `buildHarnessContext`, compact/budget helpers |
| Gateway budget | [`src/core/gatewayBudget.ts`](../src/core/gatewayBudget.ts) | `DEFAULT_GATEWAY_MAX_INPUT_CHARS` (= 12_000, matches gateway) |
| Prompt estimate | `estimateChatHarnessPromptChars`, `CHAT_HARNESS_PROMPT_SHELL_CHARS` | Full prompt budget incl. template shell |
| Thread continuity | [`src/core/chatThreadState.ts`](../src/core/chatThreadState.ts) | `SharedChatThreadState`, `toWireChatHarnessThreadState` |
| Chat summaries | [`src/core/harnessMemory.ts`](../src/core/harnessMemory.ts) | `buildChatMemoryAnalyses` → `recent_analyses` prefix |
| Memory Bank | [`src/core/harnessMemoryBank.ts`](../src/core/harnessMemoryBank.ts) | `getActiveMemoryItems`, `MEMORY_BANK_PREFIX` |
| Operator signals | [`src/core/primaryAction.ts`](../src/core/primaryAction.ts), [`src/core/briefing.ts`](../src/core/briefing.ts), [`src/core/recovery.ts`](../src/core/recovery.ts) | **Not exported** to gateway today |
| Stale / neglect | [`src/core/warmth.ts`](../src/core/warmth.ts) | `shouldFlagAsNeglected`, `shouldSuggestReheat`, `computeCardWarmth` |
| Source state | [`src/core/actions.ts`](../src/core/actions.ts) `LifeHarnessData` | Cards, logs, proof, daily, job scout, chat/memory |
| Persistence | [`src/storage/types.ts`](../src/storage/types.ts) | Versioned `PersistedEnvelope` → localStorage (web) |
| Gateway client | [`src/core/chatHarnessClient.ts`](../src/core/chatHarnessClient.ts) | POST body: `context`, `conversation_history`, `thread_state` |
| Gateway schema | [`services/ai-gateway/app/models.py`](../services/ai-gateway/app/models.py) | `HarnessContext`, `ChatHarnessRequest`, `ProposedCardUpdate` |
| S3 gate | [`services/ai-gateway/app/main.py`](../services/ai-gateway/app/main.py) | 422 before provider when `sensitivity == S3` |

Raw Lab uses a **separate** budget path ([`src/core/rawLabContextBudget.ts`](../src/core/rawLabContextBudget.ts)) and must stay isolated per [`AGENTS.md`](../AGENTS.md).

---

## 1. Proposed TypeScript types

New types live in `src/core/contextPacket.ts` (types only in v0.1 ticket; builder in `contextPacketBuilder.ts`).

### Design principles

- **Stable IDs** on board-derived rows (`cardId`, `logId`, `proofId`, `memoryId`) for proposal validation — export-facing `HarnessContextCard` is title-only today; packet layer adds IDs internally and strips them from wire when not needed.
- **`ContextSource`** on every ranked slice for grounding arrays and debug UI.
- **`AiContextPacket`** is the single send bundle; gateway may still receive a derived `HarnessContext` shim during migration.

### Example definitions

```ts
import type { ChatHarnessMode, HarnessContext } from "./harnessContext";
import type { SensitivityLevel } from "./types";
import type { WireChatHarnessThreadState } from "./chatThreadState";

/** Provenance for grounding, ranking audit, and debug panels. */
export type ContextSource =
  | "user_intent"
  | "board_snapshot"
  | "active_cards"
  | "stale_cards"
  | "recent_proof"
  | "recovery_signals"
  | "memory_bank"
  | "chat_summary"
  | "board_diagnosis"
  | "companion"
  | "open_thread"
  | "project_doc"
  | "product_rule"
  | "tool_permission";

export type ContextRankTier =
  | "critical"   // never drop unless S3/redaction
  | "high"
  | "medium"
  | "low"
  | "filler";    // drop first under budget

export type RankedSlice<T> = {
  source: ContextSource;
  tier: ContextRankTier;
  rank: number;          // higher = keep longer under trim
  sensitivity: SensitivityLevel;
  payload: T;
};

export type UserIntentContext = {
  /** Latest user message for this request. */
  message: string;
  mode: ChatHarnessMode;
  sensitivity: SensitivityLevel;
  /** Rules-only primary action from computePrimaryAction(). */
  primaryAction?: {
    kind: string;
    title: string;
    reason: string;
    smallestAction: string;
    cardId?: string;
  };
  /** Task mode from thread state when grounded chat. */
  taskMode?: string;
};

export type BoardContext = {
  /** Subset of HarnessContext — canonical gateway shape for board facts. */
  harness: HarnessContext;
  activeLimit: {
    count: number;
    limit: number;
    isAtLimit: boolean;
    isOverLimit: boolean;
    message: string;
  };
  /** Deterministic diagnoses already produced by buildHarnessBoardDiagnosis(). */
  diagnoses: HarnessContext["recent_analyses"];
  productDecisions: HarnessContext["decisions"];
};

export type BoardCardSlice = {
  cardId: string;
  title: string;
  area: string;
  state: string;
  warmth: string;
  progress: number;
  nextTinyAction: string;
  whyItMatters: string;
  /** Neglect / reheat flags from warmth.ts */
  isStale: boolean;
  neglectReason?: string;
};

export type RetrievedMemory = {
  memoryId: string;
  kind: string;
  title: string;
  summary: string;
  tags: string[];
  source: "memory_bank" | "chat_summary";
  /** Original chat summary id when applicable. */
  sourceChatSummaryId?: string;
};

export type CompanionContext = {
  /** Operator companion — rules-only, not LLM memory. */
  briefingTitle?: string;
  briefingPrepared: string[];   // from Briefing.prepared (cap)
  briefingDetected: string[];   // from Briefing.detected (cap)
  recovery: {
    showSalvage: boolean;
    showMvd: boolean;
    shouldPromote: boolean;
    salvageReason?: string;
  };
  whileYouWereAwayHighlights: string[];  // merged updated + proof lines, capped
};

export type OpenThreadContext = {
  recentDigest: string;
  activeGoal: string;
  currentTopic: string;
  openLoops: string[];
  pinnedFacts: string[];
  userSteering: string[];
  doNotRepeat: string[];
  /** Wire subset — no personality fields. */
  wire: WireChatHarnessThreadState;
};

export type ProjectDocSnippet = {
  docId: string;           // stable slug, e.g. "product_rules_v0.1"
  title: string;
  excerpt: string;           // curated static excerpt, not whole repo
  sensitivity: SensitivityLevel;
};

export type ToolPermission =
  | "read_board"
  | "read_memory"
  | "read_thread"
  | "propose_card_update"
  | "propose_log_capture"
  | "propose_memory_save"
  | "navigate_route";

export type ToolPermissionContext = {
  allowed: ToolPermission[];
  denied: ToolPermission[];
  /** Human-readable why — e.g. "S3 request: proposals disabled" */
  notes: string[];
};

/** Structured output the gateway should target (Ask harness path first). */
export type AiOutputSchemaRef = {
  name: "chat_harness_answer" | "ask_harness_grounded" | "operator_proposal_bundle";
  version: "0.1";
  /** JSON Schema id or inline schema hash — gateway owns canonical schema. */
  schemaRef: string;
  requiresApproval: boolean;
};

export type AiContextPacket = {
  packetVersion: "0.1";
  builtAt: string;
  intent: UserIntentContext;
  board: BoardContext;
  activeCards: RankedSlice<BoardCardSlice>[];
  staleCards: RankedSlice<BoardCardSlice>[];
  recentProof: RankedSlice<{ proofId: string; summary: string; timestamp: string }>[];
  recoverySignals: RankedSlice<{ summary: string; kind: "salvage" | "mvd" | "ignored" | "recovered" }>[];
  memories: RankedSlice<RetrievedMemory>[];
  companion: CompanionContext;
  openThread: OpenThreadContext;
  projectDocs: RankedSlice<ProjectDocSnippet>[];
  outputSchema: AiOutputSchemaRef;
  tools: ToolPermissionContext;
  /** Budget metadata for debug / RawLab-style inspectors. */
  budget: {
    estimatedChars: number;
    maxChars: number;
    compactionLevel: "none" | "trim_low" | "compact" | "aggressive";
    droppedSources: ContextSource[];
  };
};
```

### Mapping from existing types

| Packet field | Built from |
|--------------|------------|
| `board.harness` | `buildHarnessContext(data)` or compact variant |
| `activeCards` | `LifeCard` where `state === "active"` + main quest |
| `staleCards` | `shouldFlagAsNeglected` / `shouldSuggestReheat` + cold/dormant |
| `recentProof` | `proofItems` sorted newest-first (reuse `MAX_EXPORT_PROOF`) |
| `recoverySignals` | `computeRecoveryVisibility(briefing, dailyState, now)` + briefing salvage lines |
| `memories` | `getActiveMemoryItems` + latest `chatSummaries` via existing analysis builders |
| `companion` | `generateWhileYouWereAway`, `computePrimaryAction`, `computeRecoveryVisibility` |
| `openThread` | `SharedChatThreadState` → `toWireChatHarnessThreadState` |
| `projectDocs` | Static curated map in `src/core/contextProjectDocs.ts` (new, small) |

`HarnessContext` remains the **compatibility shim** for [`ChatHarnessRequest.context`](../services/ai-gateway/app/models.py) until gateway accepts `context_packet` natively.

---

## 2. Context ranking rules

Ranking is **deterministic** (same inputs → same packet). Reuse and extend [`scoreCompactCardPriority()`](../src/core/harnessContext.ts) rather than inventing a second card scorer.

### Tier defaults

| Tier | Sources | Drop order |
|------|---------|------------|
| `critical` | `user_intent`, `product_rule`, active limit signal, `tool_permission` | Never drop (except S3 hard block) |
| `high` | `active_cards`, `board_diagnosis`, `companion` primary action, `memory_bank` (active), stale active cards | Drop after medium |
| `medium` | `stale_cards` (parked reheat), `recent_proof`, `recovery_signals`, `open_thread` digest/pinned | Trim text before drop |
| `low` | `chat_summary`, inbox candidates, career queue cards, `project_doc` | Drop before low-priority board rows |
| `filler` | Resume module synthetic cards (`title.startsWith("Resume:")`), parked non-career cards, old logs | Drop first (matches compact export) |

### Rank score formula (cards)

Start from `scoreCompactCardPriority(harnessCard)` then adjust:

```text
+20  if stale active (shouldFlagAsNeglected)
+15  if follow-up due (getFollowUpsDue from career.ts)
+10  if matches primaryAction.cardId
+10  if referenced in user message (title token match via cardMatching.ts)
-30  if Resume: synthetic card
-20  if state Parked and warmth Hot/Warm
```

Sort descending; under budget pressure drop lowest rank within tier before crossing tier boundaries.

### Caps (initial)

| Slice | Full cap | Compact cap |
|-------|----------|-------------|
| `activeCards` | all active (≤3 enforced by product) | all |
| `staleCards` | 8 | 4 |
| `recentProof` | 20 (`MAX_EXPORT_PROOF`) | 5 (`COMPACT_MAX_PROOF`) |
| `memories` | 10 active bank + 5 chat | 3 bank + 2 chat |
| `board.harness.logs` | 30 | 10 |
| `companion` lines | 6 prepared + 6 detected | 3 + 3 |
| `projectDocs` | 2 snippets | 1 snippet |
| `openThread` open loops / pinned | 8 each (match `chatThreadState` caps) | 4 each |

### Budget algorithm

Mirror [`resolveChatHarnessSendBundle()`](../src/core/harnessContext.ts) and [`rawLabContextBudget.ts`](../src/core/rawLabContextBudget.ts):

1. Build full packet (no drops).
2. Estimate serialized size: `JSON.stringify(packet)` + `CHAT_HARNESS_PROMPT_SHELL_CHARS` + message + `conversation_history`.
3. If over `DEFAULT_GATEWAY_MAX_INPUT_CHARS - GATEWAY_PROMPT_SAFETY_MARGIN_CHARS`, run compaction passes in order:
   - Drop `filler` slices
   - Trim `projectDocs`, chat memories, resume modules
   - Cap logs/proof (reuse compact helpers)
   - Drop lowest-rank `staleCards`, then low-priority parked
   - Shorten text on `medium` tier (`truncateCompactText`, 80 chars)
   - Trim `conversation_history` via `trimConversationHistoryForPromptBudget`
4. Record `budget.compactionLevel` and `droppedSources`.

**Preserved first (same as harness-context-quality):** `recent_analyses` diagnoses, all Active/Waiting cards, career + Inbox candidates, cold/dormant signals, active limit decisions.

### Intent-aware boosting

When `intent.message` or `thread.taskMode` indicates career/debug/builder:

- Boost `social_career` cards and job candidates (+15 rank)
- Boost `project_doc` snippets tagged `career` or `architecture` when mode is `builder`
- For `reflection` mode, boost `recovery_signals` and Memory Bank `trap`/`pattern` kinds

Use existing `classifyTurnIntent` / `ThreadTaskMode` from [`chatThreadState.ts`](../src/core/chatThreadState.ts) — do not add LLM classification.

---

## 3. Redaction and approval rules

### Sensitivity (S0–S3)

Align with [`AGENTS.md`](../AGENTS.md) and [`docs/08_ai_provider_and_a770_plan.md`](../08_ai_provider_and_a770_plan.md).

| Level | In packet? | Notes |
|-------|------------|-------|
| **S0** | Yes | Project metadata, generic build notes |
| **S1** | Yes (default Ask) | Personal but acceptable for local model |
| **S2** | Redact or summarize | Prefer local gateway only; strip `rawText` from logs, keep typed summary |
| **S3** | **Never** | Gateway returns 422 today; packet builder must **exclude** S3 cards/logs and reject send |

### Per-field redaction (app-side, before wire)

Implement `redactForSensitivity(slice, requestSensitivity)` in `contextPacketRedaction.ts`:

- **S3 card or log:** omit entirely; add `budget.droppedSources` entry `"board_snapshot"` with reason.
- **S2 log `rawText`:** replace with `buildHarnessLogEntry()` summary only (no vice/money detail leakage).
- **S2 cards** (`stability_vices`, money): include title + `nextTinyAction` only; blank `whyItMatters` if it contains leak markers.
- **Memory Bank `evidence`:** never export (field exists on [`HarnessMemoryItem`](../src/core/types.ts) but not in current export).
- **Thread `pinned_facts`:** run `SENSITIVE_INFERENCE_PATTERNS` filter from [`chatThreadState.ts`](../src/core/chatThreadState.ts) before wire.

### Approval-gated **mutations** (not packet inclusion)

| Proposal type | Validation | User approval |
|---------------|------------|-----------------|
| Card state / NTA change | `canActivateCard`, active limit guards | Required |
| New card | Must land **Inbox** | Required |
| Log capture | `parseQuickCapture` + sensitivity check | Required for S2+ |
| Memory Bank save | `createMemoryItem` + dedupe | Required (existing flow) |
| Job candidate actions | career/jobScout guards | Required |

Packet `tools.allowed` must reflect this — e.g. when `sensitivity === "S3"`, packet build aborts before network; when S2, `propose_card_update` may be allowed but proposals touching S3 targets are rejected in validator.

### Never in grounded packets

- Raw Lab `personality` ([`RawLabPersonalityState`](../services/ai-gateway/app/models.py))
- Full `conversation_history` beyond trimmed turns (digest + thread state preferred)
- Unredacted S3 fields
- Storage paths, API keys, `.env`, full job descriptions (career cards: use existing summarized titles)
- Autonomous tool execution flags

---

## 4. Where packet construction should live

All logic stays **UI-independent** under `src/core/` (per agent workflow).

| Module | Responsibility |
|--------|----------------|
| **`src/core/contextPacket.ts`** | Types: `AiContextPacket`, `ContextSource`, etc. |
| **`src/core/contextPacketBuilder.ts`** | `buildAiContextPacket(input, options)` — orchestrator |
| **`src/core/contextPacketRanking.ts`** | `rankCardSlices`, `applyPacketBudget`, tier drops |
| **`src/core/contextPacketRedaction.ts`** | Sensitivity filters, text redaction |
| **`src/core/contextPacketShim.ts`** | `packetToHarnessContext(packet)` for gateway compat |
| **`src/core/contextProjectDocs.ts`** | Curated static doc excerpts (ids → text) |
| **`src/core/harnessContext.ts`** | **Keep** — board mapping, `HarnessContext`, compact passes; called by builder for `board.harness` |
| **`src/core/gatewayBudget.ts`** | **Keep** — shared `DEFAULT_GATEWAY_MAX_INPUT_CHARS` |
| **`src/core/chatThreadState.ts`** | **Keep** — thread serialization |
| **`src/core/chatHarnessClient.ts`** | Extend `AskChatHarnessInput` with optional `contextPacket`; still send `context` shim |

**Call site:** [`app/ask-harness.tsx`](../app/ask-harness.tsx) replaces direct `resolveChatHarnessSendBundle` with:

```ts
const packet = buildAiContextPacket({ data: exportInput, intent, thread, briefing, now });
const { context, conversationHistory } = resolveFromPacket(packet, options);
```

**Do not** import packet builder from Raw Lab ([`rawLabScreen.containment.test.ts`](../src/core/rawLabScreen.containment.test.ts) pattern).

---

## 5. How ai-gateway should receive packets

### Phase A — shim (first ship)

No breaking gateway change. Client sends existing body:

```json
{
  "message": "...",
  "mode": "operator",
  "sensitivity": "S1",
  "context": { "...": "HarnessContext from packetToHarnessContext()" },
  "conversation_history": [],
  "thread_state": { "...": "from packet.openThread.wire" },
  "reasoning_depth": "fast"
}
```

Add optional debug header or envelope field (gateway ignores unknown keys today — `StrictModel` forbids extras on **request**):

- **App-only:** attach `X-LH-Packet-Version: 0.1` for logging, or
- **Gateway Phase B:** extend `ChatHarnessRequest` with optional `context_packet: dict` (`extra` allowed on nested model only).

### Phase B — native packet field

Extend [`ChatHarnessRequest`](../services/ai-gateway/app/models.py):

```python
class AiContextPacketWire(StrictModel):
    packet_version: Literal["0.1"]
    intent: dict  # or nested models mirroring TS
  # ... slices

class ChatHarnessRequest(StrictModel):
    # existing fields
    context_packet: AiContextPacketWire | None = None
```

[`build_chat_harness_prompt()`](../services/ai-gateway/app/prompt_loader.py) prefers `context_packet` when present; falls back to indented `context` JSON.

### Relationship to `gatewayBudget` / compaction

| Layer | Responsibility |
|-------|----------------|
| **App `buildAiContextPacket`** | Semantic ranking — *what* to include |
| **`harnessContext` compact** | Legacy board JSON trim (used inside `board.harness`) |
| **`trimConversationHistoryForPromptBudget`** | History trim after packet built |
| **Gateway `SCOUT_MAX_INPUT_CHARS`** | Hard reject / provider input cap ([`openvino_provider.py`](../services/ai-gateway/app/providers/openvino_provider.py)) |

Single budget number: `DEFAULT_GATEWAY_MAX_INPUT_CHARS` from [`gatewayBudget.ts`](../src/core/gatewayBudget.ts). Packet `budget.estimatedChars` should use same estimator as `estimateChatHarnessPromptChars` for Ask parity.

### Structured proposals (output path)

Use **`POST /ask-harness`** response shape for proposal validation work:

- [`ProposedCardUpdate`](../services/ai-gateway/app/models.py) already has `requires_approval: Literal[True]`
- Chat harness can add Phase C `proposal_bundle` optional field — validated in app against `ToolPermissionContext`

Flow:

```text
model → gateway JSON → app parseProposals() → guards.ts / canActivateCard → UI approve → actions.ts
```

---

## 6. Deterministic testing strategy

### Unit tests — `src/core/contextPacketBuilder.test.ts`

Use Vitest (matches [`harnessContext.test.ts`](../src/core/harnessContext.test.ts)).

| Test | Assertion |
|------|-----------|
| Seed board snapshot | `createSeedState()` → stable `packetVersion`, card counts |
| Active vs stale split | Active cards never in `staleCards`; neglected active in `staleCards` |
| Ranking order | Given artificial cards, sort order matches `scoreCompactCardPriority` + boosts |
| S3 exclusion | Card with `sensitivity: "S3"` absent; S3 request throws `ContextPacketBuildError` |
| S2 redaction | Vice log rawText not in packet |
| Memory provenance | Active memory only; inactive excluded |
| Companion derivation | Mock `Briefing` → `companion.briefingPrepared` length ≤ cap |
| Budget determinism | Fixed oversized fixture → exact `droppedSources` + `compactionLevel` |
| Shim round-trip | `packetToHarnessContext(packet)` satisfies existing gateway fixture tests |
| Raw Lab isolation | Import graph test — `rawLabClient` does not import packet builder |

### Fixtures

| File | Purpose |
|------|---------|
| [`src/data/createSeedState.ts`](../src/data/createSeedState.ts) | Default board |
| `src/core/fixtures/contextPacketGolden.json` | Frozen expected packet (minified) for regression |
| [`services/ai-gateway/tests/fixtures/synthetic_harness_context.json`](../services/ai-gateway/tests/fixtures/synthetic_harness_context.json) | Shim must remain parseable by gateway |

### Golden workflow

```bash
npx vitest src/core/contextPacketBuilder.test.ts
npx tsx scripts/dogfood-chat-harness.ts   # after shim wired — no gateway schema break
cd services/ai-gateway && pytest tests/test_chat_harness_contract.py
```

### Prompt shell sync

If packet changes prompt layout, update `CHAT_HARNESS_PROMPT_SHELL_CHARS` and [`test_prompt_shell_sync.py`](../services/ai-gateway/tests/test_prompt_shell_sync.py) together (existing pattern).

---

## 7. First implementation ticket

**Title:** Context packet builder v0.1 — types, seed-board builder, HarnessContext shim

**Scope:**

1. Add `src/core/contextPacket.ts` with types from §1.
2. Add `src/core/contextPacketBuilder.ts`:
   - `buildAiContextPacket(input: ContextPacketBuildInput): AiContextPacket`
   - `ContextPacketBuildInput` wraps `HarnessExportInput` + `UserIntentContext` + optional `SharedChatThreadState`, `Briefing`, `now`
3. Add `src/core/contextPacketRanking.ts` — extract `scoreCompactCardPriority` re-export; implement stale detection via `computeCardWarmth` + `shouldFlagAsNeglected` / `shouldSuggestReheat`.
4. Add `src/core/contextPacketRedaction.ts` — S3 block, S2 log redaction.
5. Add `src/core/contextPacketShim.ts` — `packetToHarnessContext` delegating to existing `HarnessContext` shape (lossy but compatible).
6. Add `src/core/contextProjectDocs.ts` — 2–3 curated excerpts (`05_product_rules`, `ask-harness-v0.1` operator rules) as static strings, S0.
7. Tests: `src/core/contextPacketBuilder.test.ts` (≥12 cases per §6).
8. Wire **debug-only** in [`app/ask-harness.tsx`](../app/ask-harness.tsx): build packet, show slice counts in advanced panel; **still send** shim `context` via existing `askChatHarness`.
9. **Do not** change gateway Python in this ticket.

**Out of scope for ticket 1:**

- `POST /ask-harness` proposal UI
- Native `context_packet` gateway field
- Briefing export to `recent_analyses` (noted in harness-context-quality future path)

**Acceptance criteria:**

- `npm run test` passes
- Packet for seed board is deterministic across runs
- `packetToHarnessContext(buildAiContextPacket(...))` passes existing `test_chat_harness_contract` when POSTed via dogfood script
- S3 card on seed [`Spending / Vice Tracking`](../src/data/seed.ts) excluded from packet slices when marked S2/S3 appropriately
- No new imports from Raw Lab into packet modules

---

## Related

- [`harness-context-quality-v0.1.md`](../harness-context-quality-v0.1.md) — current compact export rules
- [`conversation-thread-intelligence.md`](../conversation-thread-intelligence.md) — thread vs board layers
- [`memory-bank-v0.1.md`](../memory-bank-v0.1.md) — durable memory export mapping
- [`ask-harness-v0.1.md`](../ask-harness-v0.1.md) — Ask screen integration
- [`local-a770-plan.md`](../local-a770-plan.md) — gateway phases
- [`services/ai-gateway/README.md`](../../services/ai-gateway/README.md) — endpoint reference
