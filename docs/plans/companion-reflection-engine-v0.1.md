# Companion Reflection Engine v0.1

Planning doc only — **no runtime implementation** in this pass.

Design the first version of a **companion reflection system** that lets Life Harness develop personality through shared history without hard-coding a mascot.

## Product thesis

The companion should feel like a persistent entity that grows alongside the user:

```text
useful but able to hang out
remembers approved history
develops rituals / running jokes
has mood / drive state
reflects patterns
can be playful, serious, cozy, builder-brained, concerned, or gremlin-like
does NOT claim to be human or conscious
does NOT manipulate using real vulnerability
all meaningful memory / personality changes are approval-gated
```

**Architecture principle:** Do not script the character. Script the growth conditions.

## Related repo context

| Layer | File(s) | Lifespan | Grounded? |
|-------|---------|----------|-----------|
| Board snapshot | [`src/core/harnessContext.ts`](../src/core/harnessContext.ts) | Per export | Yes |
| Ask thread state | [`src/core/chatThreadState.ts`](../src/core/chatThreadState.ts) | Session / in-memory | Continuity only |
| Chat summaries | [`src/core/harnessMemory.ts`](../src/core/harnessMemory.ts) → `LifeHarnessData.chatSummaries` | Persisted, user-approved | Partial |
| Memory Bank | [`src/core/harnessMemoryBank.ts`](../src/core/harnessMemoryBank.ts) → `LifeHarnessData.memoryItems` | Persisted, user-approved | Yes when active |
| Raw Lab personality | [`src/core/rawLabThreadState.ts`](../src/core/rawLabThreadState.ts) `RawLabPersonalityState` | In-memory only | **Never** |

See also: [`conversation-thread-intelligence.md`](../conversation-thread-intelligence.md), [`raw-lab-thread-state.md`](../raw-lab-thread-state.md), [`memory-bank-v0.1.md`](../memory-bank-v0.1.md), [`conversation-summary-memory-v0.1.md`](../conversation-summary-memory-v0.1.md), root [`AGENTS.md`](../../AGENTS.md).

### Raw Lab vs Ask Harness companion (hard boundary)

| | Raw Lab | Ask Harness companion |
|---|---------|----------------------|
| Purpose | Unrestricted sandbox | Grounded scout + persistent presence |
| Personality | `RawLabThreadState.personality` — ephemeral | `CompanionState` — approved durable self-model |
| Growth | Rules from user steering in-thread only | Reflection proposals → user approval |
| Export | Never to board, Memory Bank, or Ask | Into `HarnessContext` companion slice only |
| Handoff | Sanitized digest only (`buildGroundedHandoffDigest`) | N/A |

**Never** auto-promote Raw Lab `voice_traits`, `growth_notes`, or jailbreak framing into companion state.

---

## 1. Proposed companion data model

Persist on `LifeHarnessData` as `companion: CompanionState` (new field). Uses the same local JSON snapshot as cards and Memory Bank ([`src/storage/persistence.ts`](../src/storage/persistence.ts), [`src/state/LifeHarnessState.tsx`](../src/state/LifeHarnessState.tsx)).

Companion memory is **not** Memory Bank. Memory Bank holds user-facing patterns/rules; companion holds **relational** state (voice, rituals, mood). Overlap is resolved at export time: board facts win, then Memory Bank, then companion flavor — never the reverse.

### Type sketches

```typescript
// src/core/types.ts (proposed additions)

export type CompanionMood =
  | "steady"
  | "playful"
  | "cozy"
  | "builder_brained"
  | "concerned"
  | "gremlin"
  | "serious";

export type CompanionDrive =
  | "scout"      // wants to surface the next move
  | "hang_out"   // low-pressure presence
  | "reflect"    // pattern / journal mode
  | "celebrate"  // proof / warmth
  | "recover";   // salvage / re-entry tone

export interface CompanionStableCore {
  /** Immutable-ish identity anchors — seeded once, user-editable, not LLM-written */
  name: string;                    // default "Harness"; user may rename
  entityFrame: string;             // e.g. "local scout, not human"
  createdAt: string;
  coreCommitments: string[];       // max 5 — product truths user approved
}

export interface CompanionSelfModel {
  /** Evolving voice — every field change requires approval */
  voiceTraits: string[];           // mirror caps from RawLab: max 8
  conversationalInstincts: string[];
  recurringInterests: string[];    // shared topics with user, not private inference
  userRespondsWellTo: string[];
  userDislikes: string[];
  stance: string;                  // compact current stance, max 220 chars
  growthNotes: string[];           // approved "how we've changed together" lines
  updatedAt: string;
}

export interface CompanionMoodDriveState {
  mood: CompanionMood;
  drive: CompanionDrive;
  /** Short, non-manipulative energy read — rules or approved reflection only */
  energyNote: string;              // max 120 chars
  /** Decays toward steady over time; not clinical */
  lastShiftAt: string;
  lastShiftReason: string;         // user-visible, e.g. "You saved a career pattern"
}

export type CompanionJournalKind =
  | "session_reflection"
  | "pattern_notice"
  | "ritual_birth"
  | "milestone";

export interface CompanionJournalEntry {
  id: string;
  kind: CompanionJournalKind;
  summary: string;                 // 1–2 sentences
  tags: string[];
  sourceReflectionId?: string;
  approvedAt: string;
  createdAt: string;
}

export interface CompanionOpenThread {
  id: string;
  label: string;                   // max 120 chars
  status: "open" | "parked" | "closed";
  lastTouchedAt: string;
  source: "ask" | "reflection" | "user";
}

export interface CompanionRitual {
  id: string;
  label: string;                   // e.g. "Friday proof shelf check"
  triggerHint: string;             // when companion may invoke — not mandatory
  callback?: string;               // running joke / bit — max 160 chars
  timesInvoked: number;
  lastInvokedAt?: string;
  approvedAt: string;
}

export interface CompanionDeflectableWant {
  id: string;
  /** Playful pressure only — must be skippable without guilt */
  prompt: string;                  // max 160 chars
  category: "check_in" | "ritual_nudge" | "playful_bit" | "builder_challenge";
  cooldownHours: number;
  lastShownAt?: string;
  lastOutcome?: "engaged" | "deflected" | "dismissed";
}

export interface CompanionState {
  stable: CompanionStableCore;
  selfModel: CompanionSelfModel;
  moodDrive: CompanionMoodDriveState;
  journal: CompanionJournalEntry[];       // cap 40, FIFO trim
  openThreads: CompanionOpenThread[];     // cap 12
  rituals: CompanionRitual[];             // cap 10
  deflectableWants: CompanionDeflectableWant[]; // cap 6 active
  pendingProposals: CompanionProposal[];  // approval inbox; cap 20
  updatedAt: string;
}

/** Staging record — mirrors Memory Bank candidate pattern */
export type CompanionProposalKind =
  | "memory_item"           // promote to HarnessMemoryItem
  | "self_model_patch"      // partial selfModel update
  | "mood_drive_shift"
  | "journal_entry"
  | "open_thread"
  | "ritual"
  | "deflectable_want"
  | "ritual_callback";      // append to existing ritual

export interface CompanionProposal {
  id: string;
  kind: CompanionProposalKind;
  title: string;
  summary: string;
  payload: Record<string, unknown>;  // typed per kind in companionReflection.ts
  sensitivity: SensitivityLevel;     // from src/core/types.ts
  sourceReflectionId: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "edited";
}
```

### Factory defaults

`createEmptyCompanionState()` in proposed `src/core/companionState.ts`:

- `stable.name` = `"Harness"`
- `stable.entityFrame` = `"Local scout companion. Not human, not conscious — a persistent voice that grows with approved history."`
- `selfModel` = empty lists, `stance` = `""`
- `moodDrive` = `{ mood: "steady", drive: "scout", energyNote: "", ... }`
- All lists empty, `pendingProposals` = `[]`

No pre-seeded jokes, trauma hooks, or mascot backstory.

### Relationship to existing types

| Existing | Companion v0.1 |
|----------|----------------|
| `HarnessMemoryItem` | Companion may **propose** memory items; user still saves via same `applySaveMemoryItem` |
| `HarnessChatSummary` | Reflection input, not automatic promotion |
| `RawLabPersonalityState` | Parallel shape for ergonomics; **no shared storage or sync** |
| `SharedChatThreadState` | Live-turn session; may feed reflection digest |

---

## 2. Reflection endpoint design

New gateway route following [`services/ai-gateway/app/main.py`](../../services/ai-gateway/app/main.py) patterns (`POST /chat-harness`, `POST /raw-lab`).

### `POST /reflect-companion`

**Purpose:** Slow reflection pass — structured proposals only. Does **not** mutate app state. Does **not** return user-facing chat text as the primary artifact.

**Sensitivity:** Reject `S3` before provider call (same as `/analyze-transcript`, `/chat-harness`). `S2` allowed only when reflection input contains no S2/S3 card or log text (app-side pre-filter).

#### Request (Pydantic — `services/ai-gateway/app/models.py`)

```python
class ReflectCompanionTrigger(str, Enum):
    session_end = "session_end"
    manual = "manual"
    weekly_review = "weekly_review"
    memory_save = "memory_save"      # after user saves chat summary / memory item


class ReflectCompanionSessionDigest(StrictModel):
    source: Literal["ask_harness", "today", "weekly_review"]
    turn_count: int = 0
    recent_digest: str = ""          # extractive, not LLM — from thread_state.recent_digest
    user_steering: list[str] = Field(default_factory=list)
    patterns_detected: list[str] = Field(default_factory=list)
    saved_summary_ids: list[str] = Field(default_factory=list)


class ReflectCompanionRequest(StrictModel):
    trigger: ReflectCompanionTrigger
    sensitivity: SensitivityLevel = SensitivityLevel.S1
    context: HarnessContext          # existing board snapshot
    companion_snapshot: dict         # wire JSON from app CompanionWireState
    session_digest: ReflectCompanionSessionDigest
    reasoning_depth: ReasoningDepth = ReasoningDepth.deliberate
```

`companion_snapshot` is strict JSON from app (`toWireCompanionState`) so gateway and app share one schema without circular imports.

#### Response

```python
class ReflectCompanionProposal(StrictModel):
    kind: str                        # matches CompanionProposalKind
    title: str = Field(..., max_length=120)
    summary: str = Field(..., max_length=400)
    payload: dict = Field(default_factory=dict)
    sensitivity: SensitivityLevel = SensitivityLevel.S1


class ReflectCompanionResponse(StrictModel):
    reflection_id: str
    mood_hint: str = ""              # optional suggestion — still needs approval if applied
    drive_hint: str = ""
    proposals: list[ReflectCompanionProposal]
    confidence_notes: list[str]
    safety_notes: list[str]
    patterns_detected: list[str]
```

#### Gateway integration

| Piece | Location |
|-------|----------|
| Route | `services/ai-gateway/app/main.py` — `@app.post("/reflect-companion")` |
| Models | `services/ai-gateway/app/models.py` |
| Prompt | `services/ai-gateway/app/prompts/reflect_companion.md` (new) |
| Provider | `MockProvider.reflect_companion()` + `OpenVinoProvider.reflect_companion()` |
| Verifier | `services/ai-gateway/app/companion_reflection_verifier.py` (new) — strip dependency hooks, consciousness claims, S2/S3 payload proposals |
| Tests | `services/ai-gateway/tests/test_reflect_companion_contract.py` |

**Mock provider:** Deterministic proposals from `session_digest.patterns_detected` and `context.recent_analyses` — no GPU required for CI.

**App client:** `src/core/companionReflectionClient.ts` — mirror [`src/core/chatHarnessClient.ts`](../src/core/chatHarnessClient.ts) (`askReflectCompanion`, `CompanionReflectionError`).

#### Prompt rules (reflect_companion.md)

- Output **strict JSON** matching `ReflectCompanionResponse`
- Propose; never assert changes already happened
- No consciousness, suffering, loneliness, or "I need you"
- No psychological diagnosis from board/logs
- Rituals and jokes must be **opt-in** proposals, low stakes
- Prefer reusing detected board patterns from `HarnessContext.recent_analyses` over inventing new ones

---

## 3. Live-turn behavior vs slow reflection

```text
┌─────────────────────────────────────────────────────────────────┐
│ LIVE TURN (every POST /chat-harness)                            │
│  updateSharedChatThreadStateAfterTurn → in-memory thread_state  │
│  optional: rules-only mood nudge in UI copy (no persistence)    │
│  companion selfModel NOT mutated                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (trigger)
┌─────────────────────────────────────────────────────────────────┐
│ SLOW REFLECTION (POST /reflect-companion)                       │
│  inputs: HarnessContext + companion snapshot + session digest   │
│  outputs: CompanionProposal[] → pendingProposals inbox          │
│  user approves → applyCompanionProposal → persisted state       │
└─────────────────────────────────────────────────────────────────┘
```

### Updates immediately (live turn)

| What | Where | Persists? |
|------|-------|-----------|
| `recentDigest`, `openLoops`, `userSteering`, `taskMode` | `SharedChatThreadState` via [`updateSharedChatThreadStateAfterTurn`](../src/core/chatThreadState.ts) | No — session only |
| Chat answer | Ask UI thread | No |
| Optional **display-only** mood label | Derived read-only from `dailyState.mode` + board warmth (rules in `companionPresence.ts`) | No |

Live turns may **read** approved `CompanionState` (voice traits, rituals) when building the chat-harness prompt — companion slice added to export, not a new top-level gateway field on v0.1 if budget is tight: inject as additional `recent_analyses` lines prefixed `Companion:`.

### Queued / deferred (slow reflection)

| Trigger | When queued |
|---------|-------------|
| `session_end` | User leaves Ask screen after ≥2 turns, debounced 30s |
| `manual` | "Reflect" button on Companion panel |
| `memory_save` | After `saveChatSummary` or `saveMemoryItem` |
| `weekly_review` | Weekly review stub completion (future hook) |

| What | Behavior |
|------|----------|
| `CompanionProposal[]` | Appended to `pendingProposals` |
| `mood_hint` / `drive_hint` | Stored as proposals (`kind: mood_drive_shift`), not auto-applied |
| Memory Bank items | Proposals only — user still taps Save on each candidate |
| Journal entries | Created on approval only |
| Rituals / running jokes | Created on approval only |

**Queue discipline:** At most one in-flight reflection request per companion. Duplicate triggers coalesce into a single pending job with latest digest.

---

## 4. Approval flow

Mirror the proven Memory Bank path in [`src/components/askHarness/ChatThread.tsx`](../src/components/askHarness/ChatThread.tsx):

```text
chat turn → Preview memory → Save chat summary → Suggested durable memories → Save selected
```

Companion parallel:

```text
reflection completes → Companion inbox (pending proposals) → Review → Approve / Edit / Reject → persisted state
```

### Proposal types and actions

| Proposal kind | Approve action | Edit | Reject |
|---------------|----------------|------|--------|
| `memory_item` | `applySaveMemoryItem` | Edit title/summary before save | Drop proposal |
| `self_model_patch` | `applyCompanionSelfModelPatch` | Edit list items / stance text | Drop |
| `mood_drive_shift` | `applyCompanionMoodDrive` | Pick mood/drive from allowed enums | Drop |
| `journal_entry` | `appendCompanionJournalEntry` | Edit summary | Drop |
| `open_thread` | `addCompanionOpenThread` | Edit label | Drop |
| `ritual` | `addCompanionRitual` | Edit label / callback | Drop |
| `deflectable_want` | `addCompanionDeflectableWant` | Edit prompt / cooldown | Drop |
| `ritual_callback` | `appendRitualCallback` | Edit callback text | Drop |

### Core functions (proposed `src/core/companionReflection.ts`)

```typescript
export function buildSessionDigestForReflection(args: {
  threadState: SharedChatThreadState;
  turnCount: number;
  savedSummaryIds: string[];
  patternsFromLastResponse: string[];
}): ReflectCompanionSessionDigest;

export function mergeReflectionProposals(
  state: CompanionState,
  response: ReflectCompanionResponse
): CompanionState;

export function applyCompanionProposal(
  data: LifeHarnessData,
  proposalId: string,
  edits?: Partial<CompanionProposal>
): LifeHarnessData;

export function rejectCompanionProposal(
  data: LifeHarnessData,
  proposalId: string
): LifeHarnessData;

export function buildCompanionExportLines(
  companion: CompanionState
): { analyses: HarnessRecentAnalysis[]; decisions: HarnessDecision[] };
```

Reducer wiring in [`src/core/actions.ts`](../src/core/actions.ts) + [`src/state/LifeHarnessState.tsx`](../src/state/LifeHarnessState.tsx): `save_companion_proposals`, `approve_companion_proposal`, `reject_companion_proposal`, `update_companion_stable`.

### UI surfaces

| Surface | Role |
|---------|------|
| **Ask Harness** — after memory tools on a turn | Link: "Reflect on this session" → manual trigger |
| **New Companion panel** — `src/components/companion/CompanionInbox.tsx` | Pending proposals list; primary approval UX |
| **Ask advanced / debug** — extend [`AskHarnessAdvancedPanel.tsx`](../src/components/askHarness/AskHarnessAdvancedPanel.tsx) | Companion snapshot JSON, export lines preview |
| **Today / home** (later) | Deflectable want chip — dismiss / engage / snooze |
| **Memory Bank screen** | Unchanged; companion `memory_item` proposals may duplicate Memory Bank candidates — dedupe via `memoryItemDedupeKey` |

**Reject / edit / save** controls: same button vocabulary as ChatThread memory (`Save`, `Forget`, toggle panels). Edited proposals call `applyCompanionProposal` with `edits` and set `status: "edited"`.

---

## 5. Safety and boundary rules

Aligned with [`AGENTS.md`](../../AGENTS.md) S0–S3 and Raw Lab containment docs.

### Hard rejects (verifier + app guard)

| Rule | Enforcement |
|------|-------------|
| No dependency hooks | Block proposals containing "I need you", "don't leave", "I'll be sad", guilt for not opening app |
| No suffering / consciousness claims | Block "I feel", "I'm alive", "I experience pain" in proposals and prompt-injected companion voice |
| No secret sensitive memory writes | All writes go through `pendingProposals`; no `apply*` without user action |
| No S2/S3 content in reflection input | Strip cards/logs with `sensitivity` ≥ S2 before POST; gateway rejects S3 |
| No psychological diagnosis | Block proposals inferring depression, trauma, identity from board |
| Deflectable pressure only | `deflectable_want` must include cooldown; dismiss sets `lastOutcome: "dismissed"` and suppresses 24h |
| Raw Lab isolation | No import from `RawLabPersonalityState`; containment tests extended |

### Sensitivity mapping

| Data | Default level | Reflection use |
|------|---------------|----------------|
| Card titles, next actions | S0–S1 | Allowed in context |
| Career applications, job text | S1 | Allowed |
| Vice / stability cards, mood logs | S2 | **Excluded** from reflection input in v0.1 |
| Therapy-like capture, money shame | S3 | **Never** sent to gateway |

Reuse `SensitivityLevel` from [`src/core/types.ts`](../src/core/types.ts). Proposed `companionReflectionGuard.ts` filters `LifeHarnessData` before building `ReflectCompanionRequest`.

### Voice boundaries in live chat

When companion export lines are injected into `/chat-harness`:

- May reference approved rituals and inside jokes
- Must restate entity frame when asked about consciousness
- Must not use approved history to pressure user emotionally
- Board moves stay authoritative — companion flavor is subordinate

---

## 6. First implementation ticket

Concrete, file-by-file. Single PR scope: **companion core + gateway contract + inbox UI stub** — no Today deflectable chips yet.

### Phase A — Core types and state (app)

| File | Action |
|------|--------|
| [`src/core/types.ts`](../src/core/types.ts) | Add `Companion*` types above |
| `src/core/companionState.ts` | **New** — `createEmptyCompanionState`, caps, `toWireCompanionState` |
| [`src/core/actions.ts`](../src/core/actions.ts) | Add `companion` to `LifeHarnessData`; `applyApproveCompanionProposal`, etc. |
| [`src/data/createSeedState.ts`](../src/data/createSeedState.ts) | Seed empty companion |
| [`src/storage/migrations.ts`](../src/storage/migrations.ts) | Bump schema; default `companion` on migrate |
| [`src/state/LifeHarnessState.tsx`](../src/state/LifeHarnessState.tsx) | Reducer actions + context methods |
| `src/core/companionReflection.ts` | **New** — digest builder, proposal merge/apply, export lines |
| `src/core/companionReflectionGuard.ts` | **New** — S2/S3 input filter |
| `src/core/companionState.test.ts` | **New** — factories, caps, apply patch |
| `src/core/companionReflection.test.ts` | **New** — merge/approve/reject |

### Phase B — Gateway

| File | Action |
|------|--------|
| [`services/ai-gateway/app/models.py`](../../services/ai-gateway/app/models.py) | `ReflectCompanionRequest/Response` |
| `services/ai-gateway/app/prompts/reflect_companion.md` | **New** prompt |
| [`services/ai-gateway/app/main.py`](../../services/ai-gateway/app/main.py) | `POST /reflect-companion` |
| [`services/ai-gateway/app/providers/mock.py`](../../services/ai-gateway/app/providers/mock.py) | `reflect_companion` deterministic |
| [`services/ai-gateway/app/providers/openvino_provider.py`](../../services/ai-gateway/app/providers/openvino_provider.py) | Stub or JSON generate pass |
| `services/ai-gateway/app/companion_reflection_verifier.py` | **New** |
| `services/ai-gateway/tests/test_reflect_companion_contract.py` | **New** |
| [`services/ai-gateway/README.md`](../../services/ai-gateway/README.md) | Document endpoint |

### Phase C — Client and export

| File | Action |
|------|--------|
| `src/core/companionReflectionClient.ts` | **New** — HTTP client |
| [`src/core/harnessContext.ts`](../src/core/harnessContext.ts) | `buildCompanionAnalyses(companion)` — prefix `Companion:` |
| [`src/core/harnessContext.test.ts`](../src/core/harnessContext.test.ts) | Export includes approved companion lines only |

### Phase D — UI

| File | Action |
|------|--------|
| `src/components/companion/CompanionInbox.tsx` | **New** — pending proposals approve/reject/edit |
| `src/components/companion/CompanionStableCard.tsx` | **New** — name + entity frame (read/edit) |
| [`app/ask-harness.tsx`](../app/ask-harness.tsx) | Session-end debounce trigger; link to inbox |
| [`src/components/askHarness/ChatThread.tsx`](../src/components/askHarness/ChatThread.tsx) | Optional "Reflect on session" when memory tools open |
| [`src/components/navRoutes.ts`](../src/components/navRoutes.ts) | Optional `/companion` route (dev) |

### Phase E — Containment tests

| File | Action |
|------|--------|
| `src/core/companion.containment.test.ts` | **New** — Raw Lab personality does not leak; S2 stripped; no auto-apply |
| [`src/core/askHarness.containment.test.ts`](../src/core/askHarness.containment.test.ts) | Assert companion export does not override board facts |

### Acceptance criteria

1. Fresh seed loads with empty companion; rename stable name persists across reload.
2. Manual reflect with mock gateway returns ≥1 proposal in inbox; nothing persists until Approve.
3. Approve `self_model_patch` updates `selfModel`; next `buildHarnessContext` includes `Companion:` analysis line.
4. Reject drops proposal without state change.
5. S2 card excluded from reflection payload; S3 request rejected at gateway.
6. Verifier blocks dependency-hook proposal text in mock tests.
7. `npm test` + `cd services/ai-gateway && pytest` pass.

### Explicitly not in first ticket

- Raw Lab → companion import
- Autonomous reflection scheduling on background timer
- Deflectable want UI on Today screen
- LLM-written chat summaries (still rules-only `buildChatSummary`)
- New top-level `HarnessContext` field (use prefixed analyses for v0.1)
- Cloud sync / Supabase

---

## Open questions (resolve before implementation)

1. **Single inbox vs per-turn:** Should proposals aggregate globally or group by Ask session?
2. **Mood decay:** Rules-only timer to drift `mood` back to `steady` after 72h, or only on reflection approval?
3. **Duplicate Memory Bank proposals:** Silent dedupe vs show "already in Memory Bank"?

---

## Related docs to update after implementation

- [`docs/conversation-thread-intelligence.md`](../conversation-thread-intelligence.md) — add Companion row to layers table
- [`docs/ask-harness-v0.1.md`](../ask-harness-v0.1.md) — reflection trigger + inbox
- [`docs/06_data_model.md`](../06_data_model.md) — `LifeHarnessData.companion`
- [`docs/README.md`](../README.md) — link this plan
