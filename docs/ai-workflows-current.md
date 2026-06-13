# AI Workflows Current State

This map records the implemented AI-adjacent surfaces as of the dogfood-blocked readiness pass. The v0.1 board remains rules-only and usable without ai-gateway.

**Machine-readable inventory:** [`agent-spine-inventory-v0.1.md`](agent-spine-inventory-v0.1.md) and [`src/core/agentWorkflowRegistry.ts`](../src/core/agentWorkflowRegistry.ts) — typed workflow registry with tests. That registry is documentation-only in v0.1; it does not change runtime behavior.

## Boundaries

- **Core app loop:** Today, Board, Career, Playback, Log, Review, Quick Capture, Pounce, MVD, Salvage, Proof Shelf, and persistence are local app behavior.
- **No autonomous mutation:** AI surfaces may suggest, summarize, or draft. They must not apply board changes, save memory, send messages, submit applications, spend money, trade, or change files without explicit user approval.
- **Sensitivity:** S3 content is rules-only. Ask / Chat Harness and Deep Synthesis reject S3 before provider calls. Raw Signal has no v0.1 sensitivity field, so do not paste secrets or S3-style private data there.
- **Provider neutrality:** The Expo app calls task-level gateway clients. It does not bind directly to OpenVINO, llama.cpp, or any cloud provider.

## Companion / Ask

- **Route:** `/ask-harness`, labeled **Companion** in primary nav (see [`nav-backroom-cleanup-v0.1.md`](nav-backroom-cleanup-v0.1.md)).
- **Gateway endpoint:** `POST /chat-harness`.
- **Purpose:** Grounded, read-only chat over board context.
- **Context sent:** board snapshot, context packet when available, conversation history, and temporary thread state.
- **Memory:** Thread state is in-memory unless the user explicitly saves a chat summary to Memory Bank.
- **Safety shape:** Board context is source of truth. Responses can suggest next moves, but proposed changes require user action.
- **Capability routing v0.1:** [`../src/core/capabilityRouter.ts`](../src/core/capabilityRouter.ts) classifies each Companion/Deep Synthesis request into always-on reads/actions plus routed groups (career, feature sprint, job source debug). The Backroom inspector shows intent, allowed/denied counts, and untrusted pasted-content hints. Assistant action proposals are rejected when routing disallows them (for example `create_agent_session` on a generic next-move question). See [`plans/odysseus-patterns-repo-map-v0.1.md`](plans/odysseus-patterns-repo-map-v0.1.md) and [`feature-sprint-untrusted-context-v0.1.md`](feature-sprint-untrusted-context-v0.1.md).
- **Untrusted context v0.1:** Long pasted external text (≥240 chars when router flags it) is wrapped in `untrustedBlocks` on the context packet; the gateway receives a trusted stub or short first-line question instead of the raw paste. See [`untrusted-context-companion-career-v0.1.md`](untrusted-context-companion-career-v0.1.md).

## Deep Synthesis

- **Entry:** Companion thread action / synthesis panel.
- **Gateway endpoints:** `POST /ai/deep-synthesis`, `POST /ai/deep-synthesis-jobs`, `GET /ai/jobs/{id}`.
- **Purpose:** Manual structured report for an Ask thread: what we are circling, strongest idea, hidden risk, connections, and one next pounce.
- **Runtime shape:** Fast path may complete inline. Critic or stretch profiles can queue a job and poll.
- **Current implementation:** App client, job polling, report card, gateway route, verifier, mock/rules fallback, OpenVINO fast path, and optional llama.cpp critic path exist.
- **Non-goal:** It is not an automatic weekly brain, scheduler, or board mutation engine.

## Career / card packets

- **Card context + agent task packets:** Career application `jobDescription` (and differing scout candidate descriptions) export inside untrusted `job_post` blocks, not as trusted bullets. Same module as Companion paste wrapping. See [`untrusted-context-companion-career-v0.1.md`](untrusted-context-companion-career-v0.1.md).

## Raw Signal / Raw Lab

- **Route:** `/raw-lab`, labeled **Raw Signal** in Backroom.
- **Gateway endpoints:** `POST /raw-lab`, `POST /raw-lab/stream`, `POST /raw-lab/self-reflection`.
- **Purpose:** Isolated experimental chat sandbox.
- **Context sent:** recent turns, temporary Raw Lab thread state, temporary personality state, and approved Companion Self-Memories.
- **Never sent:** board context, Memory Bank, action tools, mutation fields, Ask Harness personality export, or hidden memory.
- **Persistence:** Thread/personality state is in-memory only. Approved Companion Self-Memories are visible, editable, and deletable.

## Feature Sprint (Backroom builder loop)

- **Routes:** Card Detail → Backroom → Feature Sprint; Backroom dashboard at `/feature-sprints`.
- **Authority:** [`feature-sprint-architecture-v0.1.md`](feature-sprint-architecture-v0.1.md).
- **Purpose:** Card-anchored developer-agent control plane — scope, implement, review, and complete feature slices with manual gates.
- **Role split:** architect scopes (ChatGPT / Codex xhigh), worker implements (Cursor / Codex in worktree), evaluator reviews (Codex xhigh), Life Harness stores plan/state/proof, user approves at trust boundaries.
- **Runner:** Optional localhost bridge for scoping, implementation, and review packets — see `feature-sprint-local-runner-v0.1.md`. Runner fills textareas; **Import plan**, **Save agent output**, **Import review verdict**, **Advance**, and **Mark complete** remain manual.
- **Not sent to board AI surfaces:** Feature Sprint packets and runner output do not flow into Ask Harness or Raw Lab automatically.
- **Sensitivity:** S3/redacted cards block the builder loop in core logic.

## Memory Surfaces

- **Memory Bank:** Durable, user-approved memories from Companion chat summaries. These can feed grounded Companion context.
- **Companion Self-Memories:** Approved Raw Signal persona notes. They are separate from Memory Bank and do not represent board memory.
- **No auto-save:** Chat summaries, memory proposals, and self-memory proposals require explicit user approval.

## ai-gateway Providers

- **Default:** `SCOUT_PROVIDER=mock`, deterministic and CI-safe.
- **Optional local model:** `SCOUT_PROVIDER=openvino` with local model files, typically `companion_fast`.
- **Manual critic path:** llama.cpp critic can be configured for selected synthesis or deep critic flows. It is optional and has mock/rules fallback.
- **Model slots:** `services/ai-gateway/models.yaml` is gateway-internal. Expo UI must not expose model slot names as product concepts.

## Verify Without Dogfooding

```powershell
npm run typecheck
npm test
cd services/ai-gateway
$env:SCOUT_PROVIDER="mock"
pytest -q
```

No browser dogfood loop, OpenVINO smoke, or llama.cpp server is required for the readiness pass.
