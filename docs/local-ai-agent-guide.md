# Local AI Agent Guide

Task-specific instructions for Codex and other agents working on **Life Harness local AI** — the optional `services/ai-gateway/` bridge and Ask / Raw Lab screens.

**Build order:** [`plans/a770-local-intelligence-integrated-roadmap.md`](./plans/a770-local-intelligence-integrated-roadmap.md) — start here for phased implementation.

**Status:** current (2026-06-24).

## Core principle

```text
rules-only app core  →  optional local gateway  →  future cloud/local routing
```

The Momentum Board (Today, Board, Pounce, MVD, Salvage, Proof Shelf) must work with **no gateway running**. Ask and Raw Lab are dev bridges, not core-loop dependencies.

See also: [`08_ai_provider_and_a770_plan.md`](./08_ai_provider_and_a770_plan.md), [`local-a770-plan.md`](./local-a770-plan.md), root [`AGENTS.md`](../AGENTS.md).

## Read first (by task type)

| Task | Docs |
|------|------|
| Any local AI work | This guide, [`services/ai-gateway/AGENTS.md`](../services/ai-gateway/AGENTS.md), [`services/ai-gateway/README.md`](../services/ai-gateway/README.md) |
| Ask screen / board context | [`ask-harness-v0.1.md`](./ask-harness-v0.1.md), [`harness-context-quality-v0.1.md`](./harness-context-quality-v0.1.md) |
| Thread state / multi-turn | [`conversation-thread-intelligence.md`](./conversation-thread-intelligence.md) |
| Raw Lab | [`raw-lab-thread-state.md`](./raw-lab-thread-state.md), root `AGENTS.md` Raw Lab section |
| Model stack (frozen catalog) | [`plans/model-stack-freeze-v3.md`](./plans/model-stack-freeze-v3.md) |
| Model slots / VRAM (historical) | [`plans/ai-gateway-model-slots-v0.1.md`](./plans/ai-gateway-model-slots-v0.1.md) |
| Context packets | [`plans/context-packet-builder-v0.1.md`](./plans/context-packet-builder-v0.1.md) |
| Evals / quality bar | [`plans/local-ai-evals-v0.1.md`](./plans/local-ai-evals-v0.1.md) |
| Deep critic pass | [`plans/phi4-critic-deep-pass-v0.1.md`](./plans/phi4-critic-deep-pass-v0.1.md) |
| Companion reflection | [`plans/companion-reflection-engine-v0.1.md`](./plans/companion-reflection-engine-v0.1.md) |
| Local coding agent | [`plans/local-coding-agent-loop-v0.1.md`](./plans/local-coding-agent-loop-v0.1.md) |
| Deep-thinking UX | [`plans/local-ai-deep-ux-v0.1.md`](./plans/local-ai-deep-ux-v0.1.md) |
| Future architecture | [`plans/a770-local-intelligence-roadmap.md`](./plans/a770-local-intelligence-roadmap.md) |

## Architecture boundaries

```text
Expo app (app/, src/core/)
  - Rules-only board loop
  - harnessContext.ts, chatHarnessClient.ts, rawLabClient.ts
  - Task-level HTTP to gateway (no model names in UI)

services/ai-gateway/
  - FastAPI on 127.0.0.1:8111
  - SCOUT_PROVIDER=mock | openvino
  - Prompts in app/prompts/*.md
  - Providers in app/providers/
```

**App clients call endpoints, not models.** The Expo UI may expose `reasoningDepth`, `mode`, sensitivity, and gateway URL — not `Qwen3`, `SCOUT_MODEL_PATH`, or OpenVINO device strings.

Model configuration stays in gateway env (`services/ai-gateway/app/config.py`, `SCOUT_*` variables). See gateway README configuration table.

## Command reference

### App (repo root)

| Script | Command | Purpose |
|--------|---------|---------|
| typecheck | `npm run typecheck` | `tsc --noEmit` |
| test | `npm run test` | `vitest run` (app/core tests) |
| scout:runner:test | `npm run scout:runner:test` | Job Scout runner only |
| web | `npm run web` | Dev server for Ask / Raw Lab manual testing |

There is **no** root `lint` script. Web export smoke: `npx expo export --platform web` (see root [`README.md`](../README.md)).

### AI gateway (`services/ai-gateway/`)

| Action | Command |
|--------|---------|
| Install (mock) | `pip install -e ".[dev]"` |
| Install (OpenVINO) | `pip install -e ".[dev,openvino]"` |
| All tests (mock) | `SCOUT_PROVIDER=mock pytest` |
| Thread eval fixtures | `SCOUT_PROVIDER=mock pytest tests/test_thread_eval_fixtures.py -q` |
| Prompt shell sync | `pytest tests/test_prompt_shell_sync.py -q` |
| Run gateway (mock) | `SCOUT_PROVIDER=mock uvicorn app.main:app --host 127.0.0.1 --port 8111` |
| OpenVINO smoke (manual) | Start gateway with `SCOUT_PROVIDER=openvino`, then `python scripts/run_thread_eval.py` |

PowerShell: `$env:SCOUT_PROVIDER="mock"` before `pytest` or `uvicorn`.

## Mock-first testing workflow

1. **Default:** `SCOUT_PROVIDER=mock` — deterministic, no GPU, CI-safe.
2. **App changes:** `npm run typecheck` + `npm run test` (e.g. `rawLabClient.test.ts`, `rawLabContextBudget.test.ts`).
3. **Gateway contract changes:** `pytest` full suite under mock.
4. **Thread / verifier / compaction:** `pytest tests/test_thread_eval_fixtures.py -q`.
5. **Prompt or `harnessContext.ts` budget:** `pytest tests/test_prompt_shell_sync.py -q`.
6. **OpenVINO only when needed:** after prompt or provider changes that mock cannot validate; never required for app-only tickets.

OpenVINO tests in CI assert **degraded/503** when model path is missing — they do not load weights.

## Mutation and approval rules

The system prepares; the user approves.

| Layer | Rule |
|-------|------|
| Gateway | Reject `sensitivity: S3` with HTTP 422 before any provider call |
| Ask Harness (`/ask-harness`) | `proposed_card_updates` require `requires_approval: true` (schema enforced) |
| Chat Harness (`/chat-harness`) | Read-only suggestions; `thread_verifier.py` flags board-mutation claims |
| App | No auto-apply of AI output to cards, logs, or state |
| Memory Bank | User explicitly saves summaries — not automatic from chat |
| Raw Lab | **No** mutation path, board context, tools, or persistence |

Typed boundaries: `services/ai-gateway/app/models.py` (gateway), `src/core/types.ts` and clients (app). Do not bypass validation with loose `any` or extra JSON fields.

## Guardrails (do / don't)

### Do

- Make the **smallest** change that satisfies the ticket.
- Put reusable logic in `src/core/` (UI-independent).
- Keep gateway prompts in `services/ai-gateway/app/prompts/`.
- Run mock `pytest` before finishing gateway work.
- Keep `CHAT_HARNESS_PROMPT_SHELL_CHARS` in `harnessContext.ts` synced with `test_prompt_shell_sync.py`.
- Link to existing plan docs instead of duplicating roadmap content.
- Preserve Raw Lab isolation and Ask Harness guardrails when extending threads.

### Don't

- Bind the Expo app to OpenVINO, llama.cpp, Ollama, or specific model IDs.
- Add AI to Today / Board / Pounce / capture parsing without an explicit ticket.
- Show model names or weight paths in app UI.
- Auto-apply card updates, send messages, or mutate board state from AI responses.
- Weaken S3 routing, Raw Lab containment, or export Raw Lab jailbreaks to Ask.
- Commit `models/`, `*.transcript.txt`, or real user data.
- Require GPU or downloaded weights in CI.
- Broad rewrites across `src/core/`, `app/`, and `services/ai-gateway/` in one change.

## Key file map

| Area | Path |
|------|------|
| Ask screen | `app/ask-harness.tsx` |
| Raw Lab screen | `app/raw-lab.tsx` |
| Board → gateway context | `src/core/harnessContext.ts` |
| Chat client | `src/core/chatHarnessClient.ts` |
| Raw Lab client | `src/core/rawLabClient.ts` |
| Shared thread state | `src/core/chatThreadState.ts` |
| Raw Lab thread + personality | `src/core/rawLabThreadState.ts` |
| Send budgets | `src/core/gatewayBudget.ts`, `src/core/rawLabContextBudget.ts` |
| Gateway routes | `services/ai-gateway/app/main.py` |
| Schemas | `services/ai-gateway/app/models.py` |
| Verifier | `services/ai-gateway/app/thread_verifier.py` |
| Mock provider | `services/ai-gateway/app/providers/mock.py` |
| OpenVINO provider | `services/ai-gateway/app/providers/openvino_provider.py` |
| Thread eval fixtures | `services/ai-gateway/evals/thread/*.json` |

### Deep-lane foundations (PR-1 to PR-7)

These are gateway-internal **structural seams** (no model swaps, no app dependency changes, default behavior unchanged):

- **Critic evidence packet + budget (PR-1)**: deep critic sees `### Critic evidence` (thread/packet signals) and uses `SCOUT_CRITIC_CONTEXT_MAX_CHARS`.
- **Depth routing registry (PR-2)**: authoritative mapping lives in `services/ai-gateway/app/orchestrator/depth_routing.py` (`resolve_depth_route`).
- **Unified critic contract seam (PR-3)**: adapters/types in `services/ai-gateway/app/critic_contract.py` normalize Chat/Synthesis/RawLab verdicts.
- **Native chat deep alignment (PR-4)**: when `SCOUT_CHAT_HARNESS_NATIVE_CHAT=true`, deep mode uses native chat for **initial draft only**; critic + revision remain single-prompt (`services/ai-gateway/app/chat_harness_draft_generate.py`).
- **Stretch seam (PR-5)**: `with_stretch` jobs probe `stretch_batch` and expose optional `stretch_slot_status` as **operational metadata only** (slot availability/wiring state — not output quality). Still mock-simulated; no real stretch inference yet.
- **Retrieval stub (PR-6)**: `services/ai-gateway/app/retrieval/embedding_slot.py` resolves `memory_embed` to `disabled`/`unavailable_in_gateway`/`ready` without running embeddings or exposing a retrieval HTTP endpoint.
- **Eval hardening (PR-7)**: `services/ai-gateway/evals/thread/critic_evidence_coverage.json` + scorer `critic_evidence_sections_present` guard critic-evidence **section presence/structure** in CI (`pytest tests/test_thread_eval_fixtures.py -q`); they do not score real OpenVINO critic quality. OpenVINO thread eval (`scripts/run_thread_eval.py`) remains manual.
- **Memory/RAG spine (mock v0.1)**: [`local-memory-rag-spine-v0.1.md`](./local-memory-rag-spine-v0.1.md) — typed chunk/retrieve/evidence pipeline in `services/ai-gateway/app/retrieval/`; `SCOUT_MEMORY_RAG_ENABLED=false` by default. Enabling the flag turns on **mock token-overlap ranking only** — not real retrieval, not embeddings, not Chat Harness wiring.

## Manual dev loop (Ask)

**Terminal 1 — gateway:**

```powershell
cd services/ai-gateway
pip install -e ".[dev]"
$env:SCOUT_PROVIDER="mock"
uvicorn app.main:app --host 127.0.0.1 --port 8111
```

**Terminal 2 — app:**

```bash
npm run web
```

Open **Ask** (`/ask-harness`) or **Raw Lab** (`/raw-lab`). Details: [`ask-harness-v0.1.md`](./ask-harness-v0.1.md).

## Plans (review before large changes)

| Doc | Purpose |
|-----|---------|
| [`plans/model-stack-freeze-v3.md`](./plans/model-stack-freeze-v3.md) | **Frozen** model catalog and load policy (start here for slots) |
| [`plans/a770-local-intelligence-roadmap.md`](./plans/a770-local-intelligence-roadmap.md) | Multi-model slots, critics, eval architecture |
| [`plans/ai-gateway-model-slots-v0.1.md`](./plans/ai-gateway-model-slots-v0.1.md) | Gateway refactor history, backends, VRAM mutex |
| [`plans/context-packet-builder-v0.1.md`](./plans/context-packet-builder-v0.1.md) | Ranked context packets for gateway prompts |
| [`plans/local-ai-evals-v0.1.md`](./plans/local-ai-evals-v0.1.md) | Eval suites and quality bar |
| [`plans/phi4-critic-deep-pass-v0.1.md`](./plans/phi4-critic-deep-pass-v0.1.md) | Deep-mode critic pass seam |
| [`plans/companion-reflection-engine-v0.1.md`](./plans/companion-reflection-engine-v0.1.md) | Approval-gated companion reflection |
| [`plans/local-coding-agent-loop-v0.1.md`](./plans/local-coding-agent-loop-v0.1.md) | Ticket-scoped coding agent loop |
| [`plans/local-ai-deep-ux-v0.1.md`](./plans/local-ai-deep-ux-v0.1.md) | Fast / Deliberate / Deep UX |
| [`plans/agent-instructions-local-ai.md`](./plans/agent-instructions-local-ai.md) | Follow-up doc/tooling recommendations |
