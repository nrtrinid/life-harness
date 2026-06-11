# Agent Workbench v0.1

## What this adds

Agent Workbench is a Backroom dashboard for the manual agent-delegation loop Life Harness already supports on Card Detail. It answers:

**What agent-delegated work is currently in motion, and what needs my attention?**

The screen classifies existing `HarnessAgentSession` rows and project-backed cards into four sections:

- **Needs review** — sessions awaiting your review (including `sent` sessions that already have result/verification/commit/files)
- **In motion** — `planned` or `sent` sessions without a result yet
- **Recently completed** — newest `done` sessions (cap 8)
- **Ready to delegate** — project-backed build/career-relevant cards with no in-flight session (cap 8)

`LifeCard` remains the anchor. Project Registry and Agent Session Log remain the sources of truth.

## Manual workflow

1. Open **Workbench** from Backroom.
2. Pick a **Ready to delegate** card (project metadata required on the card).
3. **Copy task packet** or **Copy + log sent** (explicit only — normal copy does not create a session).
4. Paste into Codex/Cursor and do the work.
5. Return to Workbench to see the session move through **In motion** → **Needs review**.
6. **Open card** to edit the session or **Mark done** on Card Detail (proof/log evidence unchanged).

## Boundaries

- **Copy agent task packet** from Workbench is side-effect-free (clipboard only).
- Only **Copy + log sent** creates a new `sent` session.
- Workbench does **not** expose **Mark done** — completion has form fields and idempotent proof/log side effects; use Card Detail.
- S3 cards and their sessions are excluded from Workbench rows.
- Cards with in-flight sessions (`planned`, `sent`, `reviewing`) do not appear in **Ready to delegate**.

## Deferred

- Recent proof section (agent-session proof timeline polish)

## Intentionally not added

- chat panel inside Workbench
- Assistant Action Registry
- Codex/Cursor execution bridge
- PC or browser automation
- background agent runs
- sprint tracker / burndown
- GitHub integration
- ai-gateway, Raw Lab, auth, or cloud sync changes
- autonomous AI actions

## Future path

- scoped Companion/chat panel on Workbench
- Assistant Action Registry
- Codex/Cursor execution bridge (still manual-first)
- recent proof timeline
- PC automation only much later, if ever
