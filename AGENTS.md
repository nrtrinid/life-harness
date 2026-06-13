# AGENTS.md

## Product Mission
Build **Life Harness / Momentum Board**: an alive, low-friction executive-function board that helps the user become more put together by making the next useful action obvious, small, urgent, rewarding, and recoverable.

The app should act like a private scout/operator:

```text
I kept track.
Here is what changed.
Here is what matters.
Here is the move.
```

It should not act like a scolding productivity coach.

## v0.1 Constraints
Do not add without an explicit ticket:

```text
auth
cloud sync complexity
notifications
mobile widgets
calendar/GitHub/bank/fitness integrations
voice assistant
local LLM setup
OpenVINO
llama.cpp
IPEX-LLM
Ollama
full AI autonomy
complex gamification
leaderboards
badge explosions
daily questionnaires
beautiful UI rabbit holes
```

v0.1 must work with local seed data/state first. Supabase is allowed only when a ticket explicitly asks for it.

## UX Rules
- One-sentence capture is the central interaction.
- New ideas go to Inbox, not Active.
- Maximum 3 Active cards.
- Maximum 1 Main Quest.
- Parked means safe, not failed.
- Reward starting, re-entry, clean parking, and salvage.
- Use warmth instead of guilt streaks.
- Every Active card needs a Next Tiny Action.
- Every meaningful task should expose a Do lane and an Improve lane.
- The app must help the user act, not merely organize.

## Motivation Rules
Core motivation features: While You Were Away, Pounce Mission, Minimum Viable Day, Salvage Mode, Proof Shelf, Momentum Warmth, and Use-before-improve locks.

Do not add new motivational concepts unless the user explicitly requests them and they directly address a documented failure mode.

## AI Architecture
Do not bind the app directly to a specific LLM provider. All AI-like behavior must go through a future provider abstraction. v0.1 app behavior is rules-only.

The Intel Arc A770 is a future optional local AI provider, not a v0.1 dependency. Do not add OpenVINO, llama.cpp, IPEX-LLM, Ollama, LM Studio, or A770-specific app code unless a ticket explicitly asks for it.

## Data Sensitivity
Future AI features must check data sensitivity before sending data to any provider.

```text
S0 - safe/boring project metadata
S1 - personal but acceptable if cloud AI is enabled
S2 - sensitive; local AI preferred
S3 - never send to AI; manual/rules-only only
```

Money, vice, mood, therapy/reflection, and deeply personal logs should default to S2 or S3.

## Manual Before Automation
Do the thing manually before automating.

```text
AI classification unlocks after 20 manual logs.
GitHub integration unlocks after 10 manual Build logs.
Calendar integration unlocks after 7 pounce sessions.
Resume automation unlocks after 5 manual career actions.
```

## Agent Workflow
For every task:

1. Read `docs/01_final_design_doc.md`, `docs/02_v0_1_scope.md`, and this `AGENTS.md`.
2. Run or consult `npm run agent:bootstrap`, then use `docs/AGENT_CONTEXT_MAP.md` for task-specific docs/files/tests.
3. Obey `.agentignore`; do not broad-read archived, planning, historical, fixture, sample-output, or compiled context files by default.
4. Make the smallest change that satisfies the ticket.
5. Do not introduce new product concepts.
6. Keep code modular and portable.
7. Put product rules in core logic, not scattered in UI.
8. Add or update tests when core logic changes.
9. Run typecheck/tests before finishing.
10. Summarize what changed, commands run, and remaining gaps.

## Product Quality Bar
A feature is valid only if it helps the user start sooner, recover faster, capture faster, resume easier, see progress, reduce overwhelm, prevent over-optimization, or create useful pressure. If not, park it.

## Local AI Gateway
The Phase 0 local scout prototype lives in `services/ai-gateway/`. It is not part of v0.1 app dependencies. The Expo app remains rules-only until an explicit integration ticket.

See `docs/local-a770-plan.md`, `docs/local-ai-agent-guide.md`, and `services/ai-gateway/README.md`.

## Raw Lab Containment
Raw Lab is the explicit unrestricted experimental chat sandbox, isolated from the board:

- no board context, tools, Memory Bank authority, or mutation path
- session/thread/personality state is in-memory only unless the user explicitly saves approved Companion Self-Memories
- Raw Lab state is not Ask Harness state, not Life Harness memory, and not evidence of consciousness
- Raw Lab can be direct/unhedged; do not add app-side refusal layers or content guardrails to Raw Lab
- do not export in-thread jailbreak/framing techniques to Ask Harness, Chat Harness, or other modes
- do not weaken Ask Harness, Chat Harness, S3 routing, memory guardrails, or board-context export
- do not paste secrets or S3-style private data into Raw Lab

Read `docs/raw-lab-architecture.md`, `docs/raw-lab-thread-state.md`, and `docs/ai-workflows-current.md` for Raw Lab tickets.

## Thread Intelligence
Ask Harness / Chat Harness may send `conversation_history` and `thread_state` for continuity. Board context remains source of truth.

- Shared logic lives in `src/core/chatThreadState.ts` and must stay UI-independent.
- Raw Lab may compose `SharedChatThreadState & { personality }`; personality never enters Chat Harness requests.
- Thread memory is session/in-memory only unless the user explicitly saves to Memory Bank.
- Raw Lab to Ask Harness handoff requires explicit user action; digest is sanitized and starts a grounded thread.
- Do not weaken S3 routing, board mutation guardrails, or Raw Lab containment when extending thread features.
