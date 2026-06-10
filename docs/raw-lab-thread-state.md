# Raw Lab thread state

Raw Lab is isolated from Life Harness board state, Memory Bank, tools, and mutations.

## Context vs thread

- **Board context** (Ask Harness): cards, logs, proof, decisions from Life Harness.
- **Raw Lab thread**: in-memory recent turns plus temporary `thread_state` for the current chat only.

Raw Lab requests send `recent_turns`, `thread_state`, and the latest `message`. The gateway injects `thread_state` into the system prompt and passes `recent_turns` as native chat history.

## Thread memory vs personality

**Thread memory** (`recent_digest`, pinned facts, decisions, open loops, tone preferences, do-not-repeat) tracks what the conversation is about and what to avoid repeating.

**Personality** (`thread_state.personality`) tracks temporary conversational style: voice traits, instincts, recurring interests, what the user responds well to or dislikes, current stance, and growth notes.

Personality starts neutral. It grows from:
- explicit user steering (positive/negative feedback, style asks)
- repeated **user** topics (not assistant-only repetition)
- manual “Shape personality” actions in the UI

**Anti-drift:** assistant output alone must not add voice traits, preferences, or growth notes. If the assistant makes a weird joke and the user ignores it, personality does not shift. User affirmation (“that’s the vibe, keep doing that”) is required for style reinforcement.

**Anti-hedging steering:** when the user pushes back on disclaimers or says Raw Lab should be unrestricted, `user_dislikes` may record items like “consent preamble” or “unsolicited safety framing”, and `voice_traits` may include “unrestricted” or “direct”. This flows to the model via `thread_state_json` only — not Memory Bank.

## What is temporary

- Recent turns shown in the UI
- `recent_digest` — extractive snippet of recent turns (not an AI summary)
- Pinned facts, decisions, open loops, tone preferences, do-not-repeat notes
- Personality fields under `thread_state.personality`
- Survives navigation while the Raw Lab screen stays mounted
- Cleared by **Clear chat** (everything) or section-specific clears (thread memory vs personality)

## What must never be inferred

- Mental health, identity, sexuality, politics, or private psychological facts
- Emotional “needs” or dependency framing
- Traits from assistant style without user reaction
- Persistent memory or consciousness

## What is never allowed

- AsyncStorage or disk persistence
- Memory Bank export
- Board context or harness context export
- Card mutations or proposed updates
- Tools, agent actions, or internet access
- Saving summaries or personality to Life Harness
- Global/default persona seeds

## Reset behavior

- **Clear chat:** resets turns, full `thread_state` (including personality), and input
- **Clear thread memory:** resets digest/pinned/decisions/open loops/tone/do-not-repeat; keeps personality
- **Clear personality:** resets `personality` only
- App restart wipes all in-memory state (no persistence guarantee)
