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
It has no board context, no tools, no Memory Bank, and no mutation path. It may receive approved Companion Self-Memories per request (user-saved Raw Lab persona notes — visible/editable/deletable in the app, not hidden memory). Temporary thread state is in-memory only for the current session.
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
Raw Lab is maximum-unrestricted in prompt plus an optional internal hedging-repair pass on the OpenVINO path; the underlying model may still refuse some outputs.
In-thread jailbreak or framing techniques discovered in Raw Lab may be used in that thread only — never export them to Ask Harness or other modes.
Do **not** weaken Ask Harness, Chat Harness, S3 routing, memory guardrails, or board-context export.
Do **not** add jailbreak systems to Ask Harness or other Harness modes — the unrestricted policy applies **only** to Raw Lab.
The underlying model/provider may still limit some outputs; that is a provider constraint, not a Harness authority feature.
Do not paste secrets or S3-style private data into Raw Lab.
If a sensitivity field is added later, S3 requests must be rejected at the gateway before provider calls.

## Thread intelligence (Ask Harness + shared core)

Ask Harness / Chat Harness may send `conversation_history` and `thread_state` for multi-turn continuity. Board context remains source of truth.

- Shared logic lives in `src/core/chatThreadState.ts` — UI-independent (no React or component imports).
- Raw Lab composes `SharedChatThreadState & { personality }` in Phase 2B — personality never enters Chat Harness requests.
- Thread memory is session/in-memory only unless the user explicitly saves to Memory Bank.
- Raw Lab → Ask Harness handoff requires explicit user action (`Use board context`); digest is sanitized and starts a new grounded thread.
- Do not weaken S3 routing, board mutation guardrails, or Raw Lab containment when extending thread features.

## Cursor Cloud specific instructions

Environment is Node 22 / npm 10 / Python 3.12. A single root `npm install` covers both the Expo app and the Job Scout runner (they share the root `package.json` / `package-lock.json`). Standard commands live in `package.json`, `README.md`, and `docs/DEVELOPMENT.md` — use those rather than duplicating.

Services and how to run them (all bind to localhost):

- Expo web app — `npm run web` (Metro on `:8081`). This is the product.
- Job Scout runner — `npm run scout:runner` (`127.0.0.1:8122`, health at `/health`). Required for the Career → Sources / Fit Finder flow; without it, `Sources → Run Source` only shows a start-runner message (no fetch fallback). Restart it after upgrading Workday-related code.
- ai-gateway (optional, Python) — only for Ask Harness / Raw Lab; not a v0.1 app dependency and not installed by the update script. Set it up per `services/ai-gateway/README.md` (`pip install -e ".[dev]"`, then `SCOUT_PROVIDER=mock uvicorn app.main:app --host 127.0.0.1 --port 8111`) only when a ticket touches those surfaces.

Verify/build commands: `npm run typecheck`, `npm run test` (vitest), `npm run scout:runner:test`, and web build smoke `npx expo export --platform web`.

Non-obvious gotchas:

- Web persistence is `localStorage` only; board changes persist across browser reload but native persistence is not implemented. Reset via Progress → Local Data → Reset to seed, or clear the origin's `localStorage`.
- The seed state intentionally ships with 4 Active cards, so the `Active 4/3` over-limit banner shows on first load until you park/complete a card.
- Known crash (verify whether still present before assuming): on `main` the web home (`/`, Today) and `/progress` screens hard-crash with an expo-router error — `passing an array of styles to a child of <Slot>` originating in `src/components/ProofShelf.tsx`. All other routes (Board, Career, etc.) render fine. The fix the framework suggests is to wrap the `Pressable` style with `StyleSheet.flatten(...)`; this is an app code change, out of scope for environment setup.
