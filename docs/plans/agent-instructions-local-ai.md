# Agent Instructions — Local AI (Follow-ups)

**Status:** Planning / review. Safe baseline is in [`docs/local-ai-agent-guide.md`](../local-ai-agent-guide.md) and root [`AGENTS.md`](../../AGENTS.md).

This doc captures **larger or review-needed** improvements identified during the 2026-06-10 agent-instructions pass. Do not implement wholesale without an explicit ticket.

---

## 1. Recommended AGENTS.md changes (done vs deferred)

### Applied (safe patches)

- Verify commands table in root `AGENTS.md`
- Local AI agent workflow summary + do/don't under Local AI gateway
- Agent workflow step 3: read `docs/local-ai-agent-guide.md` for gateway work
- New [`docs/local-ai-agent-guide.md`](../local-ai-agent-guide.md)
- `docs/README.md` plans index (see below)

### Deferred (needs ticket)

| Item | Rationale |
|------|-----------|
| Split Raw Lab / Thread sections into separate agent docs | Reduces `AGENTS.md` length but is a structural rewrite |
| Duplicate verify table in `services/ai-gateway/AGENTS.md` | Keep gateway AGENTS.md short; link to root table instead |
| Resolve tension: v0.1 constraints list "OpenVINO" as do-not-add vs implemented gateway | Docs already say "unless ticket asks"; add one clarifying sentence in `02_v0_1_scope.md` current-implementation section |

---

## 2. Recommended new / updated task docs

| Doc | Action | Priority |
|-----|--------|----------|
| [`local-ai-agent-guide.md`](../local-ai-agent-guide.md) | **Created** — primary entry for Codex | P0 |
| [`prompts/local_ai_ticket_prompt_template.md`](../../prompts/local_ai_ticket_prompt_template.md) | **Create** — variant of feature ticket template with gateway constraints | P1 |
| [`prompts/feature_ticket_prompt_template.md`](../../prompts/feature_ticket_prompt_template.md) | Add "For AI/gateway tickets, use local AI template" note | P2 |
| [`09_agent_development_guide.md`](../09_agent_development_guide.md) | Link local AI guide in Post-010 section | P1 (partial) |
| Root [`README.md`](../../README.md) | Optional "Optional: local AI" subsection with gateway quickstart link | P2 |

---

## 3. Proposed command reference (root npm scripts)

Today there is no root script for gateway tests. Agents must `cd services/ai-gateway`.

**Proposed** (single ticket):

```json
"gateway:test": "cd services/ai-gateway && cross-env SCOUT_PROVIDER=mock pytest",
"gateway:test:thread": "cd services/ai-gateway && cross-env SCOUT_PROVIDER=mock pytest tests/test_thread_eval_fixtures.py -q"
```

On Windows-native workflows, document PowerShell `$env:SCOUT_PROVIDER="mock"` instead of `cross-env` if adding scripts is undesirable.

**Lint:** No `npm run lint` exists. Either add ESLint in a dedicated ticket or remove stale lint references from historical design docs (e.g. `.kiro/specs/ux-first-redesign/design.md`).

---

## 4. Guardrails summary (canonical)

Use in agent prompts; full detail in [`local-ai-agent-guide.md`](../local-ai-agent-guide.md).

### Do

- Rules-first app; gateway optional
- Task endpoints (`/chat-harness`, `/raw-lab`), not model endpoints
- `SCOUT_*` config in gateway only
- Mock `pytest` + app `vitest` before PR
- Smallest diff; typed schemas; S3 gate; approval-gated mutations
- Read slice docs before prompt changes

### Don't

- OpenVINO/model names in Expo UI
- AI in core loop without ticket
- Auto-apply board mutations from AI
- GPU/weights in CI
- Broad app+gateway rewrites
- Weaken Raw Lab / Ask containment
- Commit models or real transcripts

---

## 5. CI / tooling follow-ups

| Item | Notes |
|------|-------|
| Root CI job for `services/ai-gateway` mock pytest | Ensures gateway regressions surface without manual `cd` |
| `test_prompt_shell_sync.py` in gateway CI | Already exists if full pytest runs |
| Unified `run_local_ai_evals.py` | Planned in [`local-ai-evals-v0.1.md`](./local-ai-evals-v0.1.md) |
| Eval suite expansion | harness / transcript / ask JSON fixtures — planning only |

---

## 6. Cross-links

- Product AI vision: [`08_ai_provider_and_a770_plan.md`](../08_ai_provider_and_a770_plan.md)
- Gateway phases: [`local-a770-plan.md`](../local-a770-plan.md)
- Intelligence roadmap: [`a770-local-intelligence-roadmap.md`](./a770-local-intelligence-roadmap.md)
- Eval planning: [`local-ai-evals-v0.1.md`](./local-ai-evals-v0.1.md)
- Gateway service rules: [`services/ai-gateway/AGENTS.md`](../../services/ai-gateway/AGENTS.md)
