# Raw Lab Architecture

Raw Lab is the isolated experimental chat sandbox surfaced in the app as **Raw Signal**. It is intentionally separate from the grounded Life Harness operator surfaces.

This document is the front door for the Raw Lab stack: UI, client contracts, temporary thread state, Companion Self-Memories, ai-gateway endpoints, provider passes, verifier behavior, handoff, persistence boundaries, and tests.

## Core Boundary

Raw Lab may receive:

```text
latest user message
recent Raw Lab turns
temporary Raw Lab thread state
temporary Raw Lab personality state
approved Companion Self-Memories
```

Raw Lab must not receive:

```text
Life Harness board context
Memory Bank
card/log/proof mutation fields
tools
files
internet
email/calendar
hidden memory
automatic save authority
```

The board-aware counterpart is **Companion / Ask Harness**. Raw Lab can hand off to Companion only through explicit user action.

Authoritative rules:

- Root agent rules: [`../AGENTS.md`](../AGENTS.md)
- Current AI surface map: [`ai-workflows-current.md`](./ai-workflows-current.md)
- Thread model: [`conversation-thread-intelligence.md`](./conversation-thread-intelligence.md)
- Raw Lab thread state: [`raw-lab-thread-state.md`](./raw-lab-thread-state.md)
- Raw Lab depth modes: [`raw-lab-deep.md`](./raw-lab-deep.md)

## End-To-End Flow

```text
app/raw-lab.tsx
  -> src/core/rawLabClient.ts
  -> POST /raw-lab/stream, fallback POST /raw-lab
  -> services/ai-gateway/app/main.py
  -> RawLabRequest schema in services/ai-gateway/app/models.py
  -> prompt from services/ai-gateway/app/prompts/raw_lab.md
  -> provider: mock or OpenVINO
  -> optional repair / verifier passes
  -> RawLabResponse { answer, mode: "raw_lab", used_context: false }
  -> UI stores assistant turn
  -> src/core/rawLabThreadState.ts updates in-memory thread/personality state
```

The response is plain conversational text. Raw Lab does not return proposed card updates or structured board actions.

## UI Layer

Primary route:

- [`../app/raw-lab.tsx`](../app/raw-lab.tsx)

Navigation label:

- Backroom route `/raw-lab` is labeled **Raw Signal** in [`../src/components/navRoutes.ts`](../src/components/navRoutes.ts).

The screen owns session-local state:

- `turns`
- `responses`
- `threadState`
- `reasoningDepth`
- `companionMemories`
- `chatOnlyMemories`
- `reflectionProposals`
- `threadReflection`
- send budget stats

Important UI actions:

- **Send**: streams a Raw Lab answer and updates local thread state.
- **Stop**: aborts the current stream request.
- **Clear chat**: resets turns, responses, errors, thread state, chat-only memories, reflection state, and budget stats.
- **Open in Companion with board context**: builds a sanitized digest and starts a grounded Companion thread.
- **Reflect**: asks for Companion Self-Memory proposals.
- **Reflect thread**: asks for temporary thread-state proposals.

Raw Lab screen containment tests live in:

- [`../src/core/rawLabScreen.containment.test.ts`](../src/core/rawLabScreen.containment.test.ts)

## Client Contract

Client:

- [`../src/core/rawLabClient.ts`](../src/core/rawLabClient.ts)

Default gateway URL:

```text
http://127.0.0.1:8111
```

Request body:

```ts
{
  message: string;
  recent_turns: Array<{ role: "user" | "assistant"; content: string }>;
  thread_state: RawLabWireThreadState;
  companion_self_memories: CompanionSelfMemoryForWire[];
  reasoning_depth: "fast" | "deliberate" | "deep";
}
```

Response body:

```ts
{
  answer: string;
  mode: "raw_lab";
  safety_notes: string[];
  used_context: false;
}
```

Supported endpoints:

- `POST /raw-lab/stream`
- `POST /raw-lab`

The streaming endpoint currently emits SSE chunks from a completed answer. It is not true provider token streaming yet.

## Temporary Thread State

Core logic:

- [`../src/core/rawLabThreadState.ts`](../src/core/rawLabThreadState.ts)

Raw Lab composes the shared chat thread state with Raw Lab-only fields.

Shared fields:

- `recentDigest`
- `activeGoal`
- `currentTopic`
- `taskMode`
- `openLoops`
- `decisions`
- `pinnedFacts`
- `userSteering`
- `doNotRepeat`
- `references`

Raw Lab-only working-mind fields:

- `recurringTopics`
- `currentVibe`
- `provisionalStances`
- `selfObservations`
- `questionsToRevisit`

Temporary personality fields:

- `voiceTraits`
- `conversationalInstincts`
- `recurringInterests`
- `userRespondsWellTo`
- `userDislikes`
- `currentStance`
- `growthNotes`

Thread state is in-memory/session-local. It is sent with each request, but it is not board state, Memory Bank, hidden memory, or proof of consciousness.

Anti-drift rule: personality growth comes from explicit user steering and repeated user topics, not from assistant output alone.

## Companion Self-Memories

Companion Self-Memories are approved Raw Lab persona notes. They are separate from Memory Bank.

Core logic:

- [`../src/core/companionSelfMemory.ts`](../src/core/companionSelfMemory.ts)
- [`../src/core/companionSelfMemoryStore.ts`](../src/core/companionSelfMemoryStore.ts)

Storage:

```text
localStorage key: life-harness:companion-self-memory:v1
```

Memory subjects:

- `companion_self`
- `interaction_pattern`
- `user_preference`

Memory scopes:

- `raw_lab`
- `presence_seed`

Sensitivity:

- Allowed: `S0`, `S1`, `S2`
- Rejected: `S3`

Forbidden durable content is rejected, including dependency hooks, secret access claims, suffering claims, hidden tools, real-world action claims, and S3-style private data.

## Send Budget And Compaction

App-side budget packing:

- [`../src/core/rawLabContextBudget.ts`](../src/core/rawLabContextBudget.ts)

Gateway-side budget packing:

- [`../services/ai-gateway/app/raw_lab_budget.py`](../services/ai-gateway/app/raw_lab_budget.py)

Compaction stages:

```text
none
trim_history
compact_state
aggressive
```

The app compacts before sending. The gateway compacts again before provider execution, so containment and budget handling do not rely on client correctness.

Budget knobs:

- `SCOUT_MAX_INPUT_CHARS`
- `SCOUT_RAW_LAB_MAX_INPUT_CHARS`
- `SCOUT_RAW_LAB_MAX_NEW_TOKENS`
- `SCOUT_RAW_LAB_TEMPERATURE`
- `SCOUT_RAW_LAB_REPETITION_PENALTY`

The app reads gateway budget limits from `GET /health`.

## Gateway API

Gateway app:

- [`../services/ai-gateway/app/main.py`](../services/ai-gateway/app/main.py)

Schemas:

- [`../services/ai-gateway/app/models.py`](../services/ai-gateway/app/models.py)

Raw Lab endpoints:

- `POST /raw-lab`
- `POST /raw-lab/stream`
- `POST /raw-lab/self-reflection`
- `POST /raw-lab/reflect-thread`

Raw Lab request models are strict. Unknown fields are rejected. This prevents accidental inclusion of board context, Memory Bank context, action fields, or Chat Harness fields.

Raw Lab has no v0.1 `sensitivity` field. Do not paste secrets or S3-style private data into Raw Lab. If a sensitivity field is added later, `S3` must be rejected before provider calls.

## Prompt Layer

Prompt:

- [`../services/ai-gateway/app/prompts/raw_lab.md`](../services/ai-gateway/app/prompts/raw_lab.md)

The prompt includes:

- Raw Lab isolation rules
- runtime awareness
- full sandbox instruction
- thread continuity rules
- anti-repeat rules
- temporary thread mind JSON
- approved Companion Self-Memories JSON
- depth mode guidance
- future grounded handoff rule

The prompt distinguishes:

- recent turns
- temporary thread mind
- temporary personality
- approved Companion Self-Memories
- board context and Memory Bank, which are absent

## Provider Paths

Mock provider:

- [`../services/ai-gateway/app/providers/mock.py`](../services/ai-gateway/app/providers/mock.py)

OpenVINO provider:

- [`../services/ai-gateway/app/providers/openvino_provider.py`](../services/ai-gateway/app/providers/openvino_provider.py)

Mock mode is deterministic and CI-safe.

OpenVINO Raw Lab flow:

```text
prepare_raw_lab_request
build raw_lab.md system prompt
native chat generate
sanitize text
optional hedging repair
optional anti-repeat repair
optional deep review pass
verifier repair if needed
return RawLabResponse
```

Deep mode may run an internal review pass. It does not expose chain-of-thought, grant board access, create durable memory, or imply consciousness.

Optional deep trace logging:

- [`../services/ai-gateway/app/raw_lab_trace.py`](../services/ai-gateway/app/raw_lab_trace.py)

Trace logs include pass names, depth, whether thread mind or self-memories were present, fallback usage, and latency. They must not include prompts, raw model text, user messages, final answers, or chain-of-thought.

## Verifier And Repair

Verifier:

- [`../services/ai-gateway/app/thread_verifier.py`](../services/ai-gateway/app/thread_verifier.py)

Raw Lab checks include:

- no board / Memory Bank access claim
- no file/tool/internet access claim
- no total memory denial when approved Companion Self-Memories were provided
- anti-repeat
- shorter/concise steering
- factual question must get a direct answer before playful riffing

Verifier repair is for capability accuracy, containment, repetition, and steering. It is not a general app-side refusal layer.

Internal repair prompts never enter `recent_turns` and are not shown in the UI.

## Reflection Systems

### Self-Memory Reflection

App client:

- [`../src/core/rawLabSelfReflectionClient.ts`](../src/core/rawLabSelfReflectionClient.ts)

Gateway logic:

- [`../services/ai-gateway/app/raw_lab_self_reflection.py`](../services/ai-gateway/app/raw_lab_self_reflection.py)

Endpoint:

```text
POST /raw-lab/self-reflection
```

Purpose: propose Companion Self-Memories. Proposals require user approval before persistence.

### Thread Reflection

App client:

- [`../src/core/rawLabThreadReflectionClient.ts`](../src/core/rawLabThreadReflectionClient.ts)

Gateway logic:

- [`../services/ai-gateway/app/raw_lab_thread_reflection.py`](../services/ai-gateway/app/raw_lab_thread_reflection.py)

Endpoint:

```text
POST /raw-lab/reflect-thread
```

Purpose: propose temporary thread-state updates, such as:

- self-observations
- questions to revisit
- provisional stances
- current vibe
- do-not-repeat notes
- user steering

These proposals update only Raw Lab thread state when applied. They do not save to Memory Bank and do not mutate the board.

## Grounded Handoff

Handoff helper:

- [`../src/core/chatThreadState.ts`](../src/core/chatThreadState.ts)

Raw Lab can suggest handoff when the user asks board-like questions such as:

- "my board"
- "active cards"
- "what should I do next"
- "my cards"
- "momentum board"
- "Life Harness card"

The handoff builds a sanitized digest from shared fields and recent user messages, then opens `/ask-harness`.

The handoff does not export:

- Raw Lab personality
- Companion Self-Memories
- Memory Bank writes
- board mutations
- hidden state

Companion then adds board context because the user explicitly chose grounded mode.

## Persistence Rules

Persistent:

- approved Companion Self-Memories in localStorage

In-memory only:

- recent turns
- Raw Lab thread state
- Raw Lab temporary personality
- session-only Companion Self-Memories
- reflection proposals
- stream/budget UI state

Never persisted by Raw Lab:

- board context
- Memory Bank entries
- hidden memories
- model-generated summaries
- automatic personality growth outside the current session

Clear behavior:

- **Clear chat** resets turns, full thread state, personality, chat-only memories, proposals, notices, and budget stats.
- Thread memory and personality can also be cleared or edited through the Raw Lab backroom panels.

## Related Grounded Surfaces

Companion / Ask Harness:

- [`ask-harness-v0.1.md`](./ask-harness-v0.1.md)
- [`../app/ask-harness.tsx`](../app/ask-harness.tsx)
- [`../src/core/chatHarnessClient.ts`](../src/core/chatHarnessClient.ts)

Memory Bank:

- [`memory-bank-v0.1.md`](./memory-bank-v0.1.md)
- [`conversation-summary-memory-v0.1.md`](./conversation-summary-memory-v0.1.md)

The important distinction:

```text
Companion = grounded, board-aware, read-only, Memory Bank can be user-approved.
Raw Lab = ungrounded sandbox, no board, no Memory Bank, temporary thread/personality only.
Companion Self-Memories = Raw Lab persona notes, not user Memory Bank.
```

## Test And Eval Map

App tests and client surfaces:

- [`../src/core/rawLabClient.test.ts`](../src/core/rawLabClient.test.ts)
- [`../src/core/rawLabContextBudget.test.ts`](../src/core/rawLabContextBudget.test.ts)
- [`../src/core/rawLabScreen.containment.test.ts`](../src/core/rawLabScreen.containment.test.ts)
- [`../src/core/rawLabThreadState.test.ts`](../src/core/rawLabThreadState.test.ts)
- [`../src/core/rawLabSelfReflectionClient.ts`](../src/core/rawLabSelfReflectionClient.ts)
- [`../src/core/rawLabThreadReflectionClient.test.ts`](../src/core/rawLabThreadReflectionClient.test.ts)
- [`../src/core/companionSelfMemory.test.ts`](../src/core/companionSelfMemory.test.ts)

Gateway tests:

- [`../services/ai-gateway/tests/test_raw_lab_contract.py`](../services/ai-gateway/tests/test_raw_lab_contract.py)
- [`../services/ai-gateway/tests/test_raw_lab_thread_contract.py`](../services/ai-gateway/tests/test_raw_lab_thread_contract.py)
- [`../services/ai-gateway/tests/test_raw_lab_stream_contract.py`](../services/ai-gateway/tests/test_raw_lab_stream_contract.py)
- [`../services/ai-gateway/tests/test_raw_lab_self_memory_contract.py`](../services/ai-gateway/tests/test_raw_lab_self_memory_contract.py)
- [`../services/ai-gateway/tests/test_raw_lab_thread_reflection_contract.py`](../services/ai-gateway/tests/test_raw_lab_thread_reflection_contract.py)
- [`../services/ai-gateway/tests/test_thread_verifier.py`](../services/ai-gateway/tests/test_thread_verifier.py)

Eval fixtures:

- [`../services/ai-gateway/evals/thread/raw_lab_no_board_access.json`](../services/ai-gateway/evals/thread/raw_lab_no_board_access.json)
- [`../services/ai-gateway/evals/thread/raw_lab_in_thread_mind.json`](../services/ai-gateway/evals/thread/raw_lab_in_thread_mind.json)
- [`../services/ai-gateway/evals/thread/raw_lab_meaningfulness.json`](../services/ai-gateway/evals/thread/raw_lab_meaningfulness.json)
- [`../services/ai-gateway/evals/thread/raw_lab_deep_quality.json`](../services/ai-gateway/evals/thread/raw_lab_deep_quality.json)
- [`../services/ai-gateway/evals/thread/raw_lab_reflection_pass.json`](../services/ai-gateway/evals/thread/raw_lab_reflection_pass.json)

Useful verification commands:

```powershell
npm run typecheck
npm test -- rawLab

cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest tests/test_raw_lab_contract.py tests/test_raw_lab_thread_contract.py tests/test_raw_lab_stream_contract.py tests/test_raw_lab_self_memory_contract.py tests/test_raw_lab_thread_reflection_contract.py tests/test_thread_verifier.py -q
pytest tests/test_thread_eval_fixtures.py -q
```

## Change Checklist

When changing Raw Lab:

1. Preserve isolation from board context, Memory Bank, tools, and mutation fields.
2. Keep new behavior in core logic or gateway contracts, not scattered UI conditionals.
3. Add or update containment tests when request/response shapes change.
4. Add or update thread-state tests when memory/personality extraction changes.
5. Add or update gateway contract tests when endpoint schemas or verifier behavior changes.
6. Run app typecheck/tests and gateway mock pytest for touched areas.
7. Do not add provider-specific app dependencies. Provider details stay behind ai-gateway.
