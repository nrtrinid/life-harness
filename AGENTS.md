# AGENTS.md

## Product mission

Build **Life Harness / Momentum Board**: an alive, low-friction executive-function board that helps the user become more put together by making the next useful action obvious, small, urgent, rewarding, and recoverable.

The app should act like a private scout/operator:

```text
I kept track.
Here is what changed.
Here is what matters.
Here is the move.
```

It should not act like a scolding productivity coach.

## v0.1 constraints

Do not add:

```text
auth
cloud sync complexity beyond explicit ticket
notifications
mobile widgets
calendar integration
GitHub integration
bank/spending integration
fitness integration
voice assistant
local LLM setup
OpenVINO
llama.cpp
IPEX-LLM
Ollama
full AI autonomy
complex gamification
leaderboards
badges explosion
daily questionnaires
beautiful UI rabbit holes
```

v0.1 must work with local seed data/state first. Supabase is allowed only when a ticket explicitly asks for it.

## UX rules

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

## Motivation rules

The core motivation features are:

```text
While You Were Away
Pounce Mission
Minimum Viable Day
Salvage Mode
Proof Shelf
Momentum Warmth
Use-before-improve locks
```

Do not add new motivational concepts unless the user explicitly requests them and they directly address a documented failure mode.

## AI architecture rule

Do not bind the app directly to a specific LLM provider.

All AI-like behavior must go through a future provider abstraction.

v0.1 uses rules-only behavior.

## Local model rule

The Intel Arc A770 is a future optional local AI provider, not a v0.1 dependency.

Do not add OpenVINO, llama.cpp, IPEX-LLM, Ollama, LM Studio, or A770-specific code unless a ticket explicitly asks for it.

## Data sensitivity rule

Future AI features must check data sensitivity before sending data to any provider.

Default sensitivity guidance:

```text
S0 - safe/boring project metadata
S1 - personal but acceptable if cloud AI is enabled
S2 - sensitive; local AI preferred
S3 - never send to AI; manual/rules-only only
```

Money, vice, mood, therapy/reflection, and deeply personal logs should default to S2 or S3.

## Manual before automation

Do the thing manually before automating.

Use-before-improve examples:

```text
AI classification unlocks after 20 manual logs.
GitHub integration unlocks after 10 manual Build logs.
Calendar integration unlocks after 7 pounce sessions.
Resume automation unlocks after 5 manual career actions.
```

## Agent workflow

For every task:

1. Read `docs/01_final_design_doc.md`, `docs/02_v0_1_scope.md`, and this `AGENTS.md`.
2. Make the smallest change that satisfies the ticket.
3. Do not introduce new product concepts.
4. Keep code modular and portable.
5. Put product rules in core logic, not scattered in UI.
6. Add or update tests when core logic changes.
7. Run typecheck/tests before finishing.
8. Summarize what changed, commands run, and remaining gaps.

## Product quality bar

A feature is valid only if it helps one of these:

```text
start sooner
recover faster
capture faster
resume easier
see progress
reduce overwhelm
prevent over-optimization
create useful pressure
```

If not, park it.

## Local AI gateway (separate service)

The Phase 0 local scout prototype lives in `services/ai-gateway/`. It is **not** part of v0.1 app dependencies. The Expo app remains rules-only until an explicit integration ticket.

See `docs/local-a770-plan.md` and `services/ai-gateway/README.md`.

## Raw Lab (unrestricted isolated sandbox)

Raw Lab is an **unrestricted** experimental chat sandbox — the explicit exception to app-side content policy.
It has no board context, no tools, no memory, no persistence, and no mutation path.
Raw Lab single-thread state: Raw Lab may maintain temporary thread state inside the current screen/session:
recent turns, a compact `recent_digest` (extractive snippet, not semantic summary), pinned facts, open loops, tone preferences,
and do-not-repeat notes. This state is in-memory only — not AsyncStorage, not disk, not Memory Bank, not board state.
It may survive navigation while the screen stays mounted; Clear chat resets it. It is not exported to Ask Harness and not used for board decisions.

Raw Lab emergent personality: Raw Lab may maintain temporary in-session personality state, including voice traits,
conversational instincts, recurring interests, current stance, and user steering preferences. This is not Life Harness memory, not persisted, not exported to Ask
Harness, and not evidence of consciousness. It exists only to make the current Raw Lab thread more coherent and expressive.
Automatic personality growth comes from user steering and repeated user topics only — not from assistant output alone.
It must not be treated as Ask Harness or as a Life Harness authority.
The Raw Lab prompt instructs direct, unhedged replies; do not add app-side refusal layers, toggles, or content guardrails to Raw Lab.
Do **not** weaken Ask Harness, Chat Harness, S3 routing, memory guardrails, or board-context export.
Do **not** add jailbreak systems to Ask Harness or other Harness modes — the unrestricted policy applies **only** to Raw Lab.
The underlying model/provider may still limit some outputs; that is a provider constraint, not a Harness authority feature.
Do not paste secrets or S3-style private data into Raw Lab.
If a sensitivity field is added later, S3 requests must be rejected at the gateway before provider calls.
