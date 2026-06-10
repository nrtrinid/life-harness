# Contributing to Life Harness

Life Harness is a **personal** executive-function board project. Contributions are primarily from the owner and coding agents (Codex, Cursor, etc.). This doc sets expectations so changes stay small, testable, and aligned with product rules.

## Before you change anything

1. Read [`AGENTS.md`](AGENTS.md) — non-negotiable v0.1 constraints and Raw Lab containment rules.
2. Read [`docs/README.md`](docs/README.md) — find the right slice doc for your task.
3. For product behavior: [`docs/01_final_design_doc.md`](docs/01_final_design_doc.md), [`docs/02_v0_1_scope.md`](docs/02_v0_1_scope.md), [`docs/05_product_rules.md`](docs/05_product_rules.md).
4. For local AI / gateway work: [`docs/local-ai-agent-guide.md`](docs/local-ai-agent-guide.md) and [`services/ai-gateway/AGENTS.md`](services/ai-gateway/AGENTS.md).

## What belongs in v0.1

Valid changes help the user:

```text
start sooner · recover faster · capture faster · resume easier
see progress · reduce overwhelm · prevent over-optimization · create useful pressure
```

Do **not** add without an explicit ticket:

```text
auth · cloud sync · notifications · calendar/GitHub/bank integrations
full AI autonomy · complex gamification · beautiful UI rabbit holes
```

Optional **Ask / Raw Lab** via `services/ai-gateway` is allowed as an opt-in dev bridge — not a core-loop dependency.

## Workflow

### 1. Scope the task

- One narrow ticket or slice doc section.
- Smallest diff that satisfies acceptance criteria.
- No new product concepts unless the user explicitly requests them.

### 2. Implement

- Put product rules in `src/core/`, not scattered in UI.
- Match existing naming, types, and test style.
- Gateway changes stay in `services/ai-gateway/` — app calls clients in `src/core/`.

### 3. Verify

From repo root:

```bash
npm run typecheck
npm run test
npm run scout:runner:test
```

For gateway changes:

```bash
cd services/ai-gateway
SCOUT_PROVIDER=mock pytest
```

For web export smoke:

```bash
npx expo export --platform web
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for full setup.

### 4. Document

- Update the relevant slice doc if behavior changed.
- Add a bullet under **`[Unreleased]`** in [`CHANGELOG.md`](CHANGELOG.md).
- Update [`docs/README.md`](docs/README.md) only when adding a new doc file.

### 5. Summarize

End with: what changed, commands run, and remaining gaps.

## Pull requests and commits

- Prefer small, reviewable PRs tied to a slice or ticket.
- Commit messages: focus on **why**, not just what.
- Do not commit secrets, `.env`, model weights (`services/ai-gateway/models/`), or real transcripts.

## Agent-specific guardrails

Paste when an agent drifts:

```text
Do not add new product concepts.
Do not add AI to the core loop unless the ticket explicitly asks.
Do not add Supabase unless the ticket explicitly asks.
Implement only the requested ticket.
Read AGENTS.md and the slice doc first.
```

See [`docs/09_agent_development_guide.md`](docs/09_agent_development_guide.md) for ticket shape and completed ticket list.

## Security

See [`SECURITY.md`](SECURITY.md) for the local-first threat model. Do not expose gateway or runner services beyond `127.0.0.1` without reviewing logging and data flow.

## License

This repository is marked `"private": true` in `package.json`. No public license is declared unless one is added explicitly later.
