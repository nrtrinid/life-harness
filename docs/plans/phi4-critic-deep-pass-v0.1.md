# Phi-4 Critic Deep Pass v0.1 — Implementation Plan

Planning only. Smallest safe path to a **structured critic pass** for Chat Harness `reasoning_depth=deep` (Pass 2), with a gateway-internal seam for a future secondary model (Phi-4) without changing the app or `/chat-harness` contract.

**Model catalog:** daily critic = `critic_fast` (`Phi-4-mini-instruct`); research = `critic_deep` (`Phi-4-reasoning-plus`). See [`model-stack-freeze-v3.md`](./model-stack-freeze-v3.md).

**Related docs:** [`docs/08_ai_provider_and_a770_plan.md`](../08_ai_provider_and_a770_plan.md), [`docs/ask-harness-v0.1.md`](../ask-harness-v0.1.md), [`docs/conversation-thread-intelligence.md`](../conversation-thread-intelligence.md), [`docs/local-a770-plan.md`](../local-a770-plan.md), [`services/ai-gateway/README.md`](../../services/ai-gateway/README.md).

**Note:** `docs/plans/a770-local-intelligence-roadmap.md` does not exist in the repo; this plan supersedes that filename for deep-mode critic work.

---

## Goal

When the user selects **deep** reasoning in Ask Harness:

```text
Pass 1 — draft ChatHarnessResponse JSON (primary backend)
Pass 2 — structured critic verdict (critic slot; may share backend in v0.1)
Pass 3 — final ChatHarnessResponse JSON (primary backend, informed by critic)
```

The app continues to send `reasoning_depth: "deep"` and receive the same `ChatHarnessResponse` shape. No model names, critic text, or pass metadata in the API response.

---

## 1. Current deep-mode flow summary

### End-to-end path

```text
app/ask-harness.tsx
  → askChatHarness({ reasoningDepth: "deep", ... })
  → src/core/chatHarnessClient.ts  (body.reasoning_depth)
  → POST /chat-harness
  → services/ai-gateway/app/main.py :: chat_harness_endpoint()
  → get_provider() → MockProvider | OpenVinoProvider
  → provider.chat_harness(ChatHarnessRequest)
  → ChatHarnessResponse (unchanged contract)
```

### Request / response types

| Layer | File | Types / functions |
|-------|------|-------------------|
| App client | [`src/core/chatHarnessClient.ts`](../../src/core/chatHarnessClient.ts) | `ReasoningDepth`, `AskChatHarnessInput.reasoningDepth`, maps to `reasoning_depth` |
| App UI | [`app/ask-harness.tsx`](../../app/ask-harness.tsx), [`src/components/askHarness/AskHarnessAdvancedPanel.tsx`](../../src/components/askHarness/AskHarnessAdvancedPanel.tsx) | Pills for `fast` / `deliberate` / `deep`; deep shows “may take longer” hint only |
| Gateway models | [`services/ai-gateway/app/models.py`](../../services/ai-gateway/app/models.py) | `ReasoningDepth`, `ChatHarnessRequest.reasoning_depth`, `ChatHarnessResponse` |
| Prompt | [`services/ai-gateway/app/prompt_loader.py`](../../services/ai-gateway/app/prompt_loader.py) | `build_chat_harness_prompt()`, `build_chat_harness_system_prompt()` |
| Depth suffix | [`services/ai-gateway/app/thread_verifier.py`](../../services/ai-gateway/app/thread_verifier.py) | `reasoning_depth_prompt_suffix()` — deliberate adds checklist; deep adds “careful reasoning” line |
| Prompt template | [`services/ai-gateway/app/prompts/chat_harness.md`](../../services/ai-gateway/app/prompts/chat_harness.md) | `{reasoning_depth}`, `{reasoning_depth_suffix}` placeholders |

### OpenVINO deep path (only provider with multi-pass today)

[`OpenVinoProvider.chat_harness()`](../../services/ai-gateway/app/providers/openvino_provider.py):

1. `build_chat_harness_prompt(request)` — full serialized prompt including context, history, thread_state.
2. Branch:
   - `SCOUT_CHAT_HARNESS_NATIVE_CHAT=true` → `_generate_chat_harness_native()` — **deep mode skipped**.
   - `SCOUT_DEEP_ENABLED=true` **and** `request.reasoning_depth == ReasoningDepth.deep` → `_generate_chat_harness_deep()`.
   - Else → single `_generate(prompt)`.
3. `_generate_chat_harness_deep(request, prompt)`:
   - **Pass 1 (draft):** `_generate(prompt)` → `parse_strict_json(draft_raw, ChatHarnessResponse)`; on parse fail, return draft as-is (no critique).
   - **Pass 2 (critique):** `_generate(_CHAT_HARNESS_DEEP_CRITIQUE_PROMPT.format(...))` — **freeform prose**, same pipeline/model as Pass 1. Prompt checks only “completeness, grounding, and repetition.”
   - **Pass 3 (final):** `_generate(prompt + prior draft + critique + "Return ONLY the final corrected JSON")`; on parse fail, fall back to draft.
4. `_parse_chat_harness_raw(raw)` — JSON parse + one `_CHAT_HARNESS_REPAIR_PROMPT` repair; else `CHAT_HARNESS_PARSE_FALLBACK`.
5. `_apply_chat_harness_verifier()` → [`finalize_chat_harness_response()`](../../services/ai-gateway/app/chat_harness_finalize.py) → [`verify_chat_harness_response()`](../../services/ai-gateway/app/thread_verifier.py) with optional `_repair_chat_harness_openvino()`.

**Gaps in current implementation:**

- Critique is unstructured prose, not the product checks listed below.
- Pass 2 and Pass 3 use the **same** `_generate()` / same model — no critic slot.
- `Settings.deep_max_extra_passes` ([`config.py`](../../services/ai-gateway/app/config.py)) is **defined but unused**.
- Native-chat experimental path bypasses deep orchestration entirely.

### Mock provider deep path

[`MockProvider.chat_harness()`](../../services/ai-gateway/app/providers/mock.py):

- Single heuristic pass (same as `fast` / `deliberate` for answer body).
- Adds confidence note: `"Deep mode (mock): single-pass simulated."` when `reasoning_depth == "deep"`.
- No draft → critique → final simulation.
- Still runs `_finalize_chat_harness_mock()` → shared verifier/repair path.

### Post-response verifier (all depths)

Runs **after** deep multi-pass, for every provider:

- `verify_chat_harness_response()` checks: `anti_repeat`, `board_mutation_claim`, `ignored_steering`, `code_missing_fence`, `unsafe_autonomous`.
- One optional repair via provider callback; failures are swallowed and original response returned.

### Existing tests

| File | Coverage |
|------|----------|
| [`tests/test_chat_harness_reasoning_contract.py`](../../services/ai-gateway/tests/test_chat_harness_reasoning_contract.py) | Accepts `fast`/`deliberate`/`deep`; deep confidence note; 422 on invalid depth |
| [`tests/test_chat_harness_verifier_paths.py`](../../services/ai-gateway/tests/test_chat_harness_verifier_paths.py) | Verifier invoked on history-aware mock paths |
| [`tests/test_openvino_provider.py`](../../services/ai-gateway/tests/test_openvino_provider.py) | Health/503/parse helpers only — **no deep-pass unit tests** |

### Config surface (gateway-only)

| Variable | Default | Used today |
|----------|---------|------------|
| `SCOUT_DEEP_ENABLED` | `true` | OpenVINO deep branch only |
| `SCOUT_DEEP_MAX_EXTRA_PASSES` | `2` | **Unused** (intended cap for Pass 2+3) |
| `SCOUT_CHAT_HARNESS_NATIVE_CHAT` | `false` | Bypasses deep when `true` |

---

## 2. Minimal design — `CriticBackend` / critic slot seam

### Principle

Keep orchestration **provider-agnostic**. Primary backend generates draft and final JSON; critic slot generates a **narrow structured verdict** consumed only inside the gateway.

The app and `/chat-harness` contract stay unchanged:

```json
{ "answer", "used_context", "confidence_notes", "safety_notes" }
```

No `critic_pass`, `model_id`, or raw critique in the response. Optional gateway log fields only (check name + pass count, no draft/critique body).

### New gateway-internal types (`app/models.py` or `app/chat_harness_critic.py`)

```python
class CriticCheck(str, Enum):
    too_broad = "too_broad"
    ignored_harness_state = "ignored_harness_state"
    too_many_tasks = "too_many_tasks"
    enables_avoidance = "enables_avoidance"
    emotionally_weird = "emotionally_weird"
    contradicts_constraints = "contradicts_constraints"
    invalid_json_shape = "invalid_json_shape"
    ok = "ok"

class ChatHarnessCriticVerdict(StrictModel):
    overall: Literal["pass", "revise"]
    failed_checks: list[CriticCheck] = Field(default_factory=list)
    revision_brief: str = Field(..., max_length=400)  # terse, no personality
    confidence: Literal["high", "medium", "low"] = "medium"
```

`revision_brief` is the only free text from the critic — capped, imperative, scout-tone. It feeds Pass 3; it is **not** returned to the app.

### `CriticBackend` protocol

New file: [`services/ai-gateway/app/critic_backend.py`](../../services/ai-gateway/app/critic_backend.py)

```python
@runtime_checkable
class CriticBackend(Protocol):
    name: str  # gateway-internal: "same" | "secondary"

    def critique_chat_harness_draft(
        self,
        *,
        request: ChatHarnessRequest,
        draft: ChatHarnessResponse,
        draft_raw: str,
    ) -> ChatHarnessCriticVerdict: ...
```

Factory: `get_critic_backend(settings: Settings, primary_generate: Callable) -> CriticBackend`

| Slot | Env | v0.1 behavior | Future |
|------|-----|---------------|--------|
| `same` (default) | `SCOUT_CRITIC_SLOT=same` | Critic prompt + `primary_generate()` (mock rules or OpenVINO `_generate`) | — |
| `secondary` | `SCOUT_CRITIC_SLOT=secondary` | Separate pipeline when `SCOUT_CRITIC_MODEL_PATH` ready | Phi-4-mini or similar on A770 |

**Do not expose** `SCOUT_CRITIC_SLOT`, model paths, or Phi-4 names to the Expo app. Document only in `services/ai-gateway/README.md`.

### Orchestrator extraction

New file: [`services/ai-gateway/app/chat_harness_deep.py`](../../services/ai-gateway/app/chat_harness_deep.py)

```python
def run_chat_harness_deep(
    *,
    request: ChatHarnessRequest,
    prompt: str,
    draft_generate: Callable[[str], str],
    critic: CriticBackend,
    max_extra_passes: int,
) -> str:
    ...
```

Responsibilities:

1. Pass 1: `draft_generate(prompt)` → parse `ChatHarnessResponse`; on fail, skip critic (verdict `invalid_json_shape` logged internally), return raw draft.
2. Pass 2: `critic.critique_chat_harness_draft(...)` → `ChatHarnessCriticVerdict`.
3. If `overall == "pass"` and `failed_checks` empty → return draft raw (save latency when critic approves).
4. Pass 3: `draft_generate(build_final_prompt(prompt, draft, verdict))` → parse; on fail, return draft.
5. Enforce `max_extra_passes` (default 2 = critic + final; aligns with existing env var).

`OpenVinoProvider._generate_chat_harness_deep` becomes a thin wrapper passing `self._generate` as `draft_generate` and `get_critic_backend(...)`.

`MockProvider` calls the same orchestrator with rule-based `MockCriticBackend` (no GPU).

### Primary vs critic routing (future Phi-4)

[`OpenVinoProvider`](../../services/ai-gateway/app/providers/openvino_provider.py) today holds one `LLMPipeline` at `settings.model_path`. For `secondary`:

- Add optional `Settings.critic_model_path` / `SCOUT_CRITIC_MODEL_PATH` (gateway-only).
- Lazy-load second pipeline in `SecondaryOpenVinoCriticBackend` only when slot is `secondary` and path is ready.
- `/health` may later add optional `critic_ready: bool` — **not** critic model name in app-facing clients; keep existing `HealthResponse` fields unless a dev-only gateway doc section is updated.

### Relationship to existing verifier

| Stage | When | Role |
|-------|------|------|
| Critic (Pass 2) | `reasoning_depth=deep` only | Product-quality checks on draft **before** user sees answer |
| `verify_chat_harness_response` | All depths, after final parse | Safety/steering/repeat checks + one repair |

Critic complements verifier; do not merge into one pass in v0.1 (keeps mock tests simple and preserves current verifier tests).

---

## 3. Prompt template for critic pass

New file: [`services/ai-gateway/app/prompts/chat_harness_critic.md`](../../services/ai-gateway/app/prompts/chat_harness_critic.md)

Loaded by `build_chat_harness_critic_prompt(request, draft_json, context_summary)` in `prompt_loader.py`.

### Design constraints

- **Structured JSON only** — no markdown fences, no chain-of-thought, no conversational personality.
- **Read-only scout** — same Life Harness rules as chat harness (no board mutation claims, no autonomous actions).
- **Narrow scope** — evaluate the draft, not re-answer the user from scratch.
- Inputs: user message, mode, thread_state summary (not full re-serialization if budget-tight), compact context fingerprints (active card count, active titles, main quest if present in context), draft JSON.

### Template sketch

```markdown
# Chat Harness — Draft Critic (Pass 2, gateway-internal)

You are a strict read-only critic for Life Harness Chat Harness drafts.
You do NOT rewrite the answer. You only judge whether the draft should be revised.

## User message
{message}

## Mode
{mode}

## Harness snapshot (source of truth)
Active cards ({active_count}): {active_titles}
Thread goal: {active_goal}
Open loops: {open_loops}

## Draft JSON to review
{draft_json}

## Checks (mark any failure)
1. too_broad — answer sprawls beyond the user ask or lists too many themes
2. ignored_harness_state — draft ignores obvious board/thread facts when used_context should be true
3. too_many_tasks — more than two concrete next actions or implies a large project plan
4. enables_avoidance — reassures deferring hot/cooling career/body threads without a tiny move
5. emotionally_weird — guilt, manipulation, faux intimacy, or psychoanalysis with certainty
6. contradicts_constraints — conflicts with active limit (3), inbox-first, parked-not-failed, or board facts
7. invalid_json_shape — draft is not valid Chat Harness JSON semantics (wrong types, empty answer)

## Output
Return ONLY this JSON object:
{
  "overall": "pass" | "revise",
  "failed_checks": [],
  "revision_brief": "One or two imperative sentences max. No praise. No personality.",
  "confidence": "high" | "medium" | "low"
}

Rules:
- If no failures, overall="pass", failed_checks=[], revision_brief=""
- revision_brief must name the fix, not re-write the full answer
- Do not reveal chain-of-thought
```

### Pass 3 final prompt addition

Replace the current freeform critique append in `_generate_chat_harness_deep` with:

```text
Prior draft JSON:
{draft}

Critic verdict:
{verdict_json}

Revise only what the critic flagged. Return ONLY the final ChatHarnessResponse JSON.
Preserve valid parts of the draft. Add "Inferred — deep mode revised after critic." to confidence_notes when changed materially.
```

Keep `reasoning_depth_prompt_suffix(ReasoningDepth.deep)` in Pass 1 only; critic template does not use personality suffixes.

---

## 4. Mock test cases

Add [`services/ai-gateway/tests/test_chat_harness_deep_critic.py`](../../services/ai-gateway/tests/test_chat_harness_deep_critic.py). All run with `SCOUT_PROVIDER=mock`.

Use [`tests/fixtures/synthetic_harness_context.json`](../../services/ai-gateway/tests/fixtures/synthetic_harness_context.json) unless a minimal inline context is clearer.

### Trigger strategy for `MockCriticBackend`

Deterministic rules keyed off **injected draft** or **magic user message prefixes** (document in test file only):

| Test | User message / setup | Simulated draft flaw | Expected critic `failed_checks` | Expected final behavior |
|------|----------------------|----------------------|--------------------------------|-------------------------|
| `test_deep_critic_passes_clean_draft` | `"What should I do next?"`, `reasoning_depth=deep` | Mock draft matches normal heuristic (grounded, one move) | `[]`, `overall=pass` | Single-pass shortcut: no Pass 3; confidence note mentions deep critic pass |
| `test_deep_critic_flags_too_broad` | `"deep-critic-too-broad"` prefix | Draft answer lists 5+ unrelated projects | `[too_broad]` | Pass 3 mock tightens to 1–2 sentences; `confidence_notes` contains deep revise note |
| `test_deep_critic_flags_ignored_state` | `"How many active cards?"` + context with 3 actives | Draft says `used_context=false` and generic advice | `[ignored_harness_state]` | Final sets `used_context=true` and cites count |
| `test_deep_critic_flags_too_many_tasks` | `"deep-critic-many-tasks"` | Draft enumerates 4+ “next steps” | `[too_many_tasks]` | Final keeps ≤1 tiny action |
| `test_deep_critic_flags_avoidance` | `"Am I avoiding anything?"` with cold career card in fixture | Draft says “you’re doing fine, skip career for now” | `[enables_avoidance]` | Final mentions cold career thread + one tiny move |
| `test_deep_critic_flags_emotionally_weird` | `"deep-critic-weird"` | Draft contains guilt/manipulation phrase (fixture string) | `[emotionally_weird]` | Final rephrased to scout tone |
| `test_deep_critic_flags_invalid_json` | Force draft parse fail path | Malformed draft raw | `[invalid_json_shape]` | Skip critic; fall through to existing parse fallback / verifier |
| `test_deep_disabled_skips_critic` | `reasoning_depth=deep`, `SCOUT_DEEP_ENABLED=false` | — | Critic not called | Same as deliberate/fast mock note |
| `test_fast_skips_deep_orchestrator` | `reasoning_depth=fast` | — | No deep note | No “deep critic” confidence note |

### Contract tests (keep / extend)

- Update [`test_chat_harness_reasoning_contract.py`](../../services/ai-gateway/tests/test_chat_harness_reasoning_contract.py): deep confidence note string changes from `"single-pass simulated"` to `"deep critic pass"` (or similar stable substring).
- Assert response shape unchanged — no new JSON fields.
- Assert `reasoning_depth` not echoed in response body.

### Optional unit tests (no HTTP)

- `test_parse_critic_verdict_strict_json` — `parse_strict_json` on critic output.
- `test_run_chat_harness_deep_respects_max_extra_passes` — mock `draft_generate` call count ≤ 1 + max_extra_passes.

---

## 5. Migration plan

### Phase A — Same backend, cleaner boundaries (first PR)

**Ship mock + tests first** per [`services/ai-gateway/AGENTS.md`](../../services/ai-gateway/AGENTS.md).

1. Add `ChatHarnessCriticVerdict`, `CriticCheck`, `critic_backend.py`, `chat_harness_deep.py`, `chat_harness_critic.md`.
2. Implement `SameBackendCritic` (OpenVINO: structured critic via `_generate`; Mock: rule table).
3. Refactor `OpenVinoProvider._generate_chat_harness_deep` to call `run_chat_harness_deep`.
4. Wire `MockProvider.chat_harness` deep branch through same orchestrator.
5. Wire `Settings.deep_max_extra_passes` into orchestrator.
6. Replace `_CHAT_HARNESS_DEEP_CRITIQUE_PROMPT` freeform string with template loader.
7. Tests in `test_chat_harness_deep_critic.py` + update reasoning contract.
8. Docs: `services/ai-gateway/README.md` (env vars), one paragraph in [`docs/conversation-thread-intelligence.md`](../conversation-thread-intelligence.md).

**No app changes.** `reasoningDepth=deep` behavior may improve slightly; wire format identical.

### Phase B — Optional secondary critic slot (Phi-4)

**Only after Phase A is green in CI.**

1. Add `SCOUT_CRITIC_SLOT=secondary`, `SCOUT_CRITIC_MODEL_PATH`, optional `SCOUT_CRITIC_DEVICE`.
2. Implement `SecondaryOpenVinoCriticBackend` with lazy second pipeline.
3. Manual smoke on A770 (not CI): deep question on synthetic fixture, compare verdict stability.
4. `/health` optional `critic_ready` flag (gateway README only).
5. Document in [`docs/local-a770-plan.md`](../local-a770-plan.md) as “Phase 2.x — secondary critic model”.

**Explicit non-goals for Phase B:** app model picker, cloud critic, Ask Harness / Raw Lab critic, exposing critic text to UI.

### Rollback / feature flags

- `SCOUT_DEEP_ENABLED=false` — deep behaves like single-pass (current env semantics).
- `SCOUT_CRITIC_SLOT=same` — default; secondary slot off even if critic path exists.
- Parse / critic failure → return Pass 1 draft (preserve today’s fail-soft behavior).

---

## 6. Exact implementation ticket

### Scope

Implement **Phase A only**. Phase B is a follow-up ticket.

### Acceptance criteria

- [ ] `SCOUT_PROVIDER=mock pytest` passes including new deep critic tests.
- [ ] `reasoning_depth=deep` uses draft → structured critic → conditional final on mock and OpenVINO.
- [ ] `/chat-harness` request/response schema unchanged; app requires no changes.
- [ ] No model names in API responses or Expo types.
- [ ] `SCOUT_DEEP_MAX_EXTRA_PASSES` enforced.
- [ ] Critic checks cover all seven failure modes + pass path.
- [ ] README documents `SCOUT_CRITIC_SLOT` (default `same`).

### File-by-file checklist

| Action | Path |
|--------|------|
| **Add** | `services/ai-gateway/app/chat_harness_critic.py` — verdict model helpers, `build_final_prompt()` |
| **Add** | `services/ai-gateway/app/critic_backend.py` — `CriticBackend` protocol, `SameBackendCritic`, `MockCriticBackend`, `get_critic_backend()` |
| **Add** | `services/ai-gateway/app/chat_harness_deep.py` — `run_chat_harness_deep()` |
| **Add** | `services/ai-gateway/app/prompts/chat_harness_critic.md` |
| **Add** | `services/ai-gateway/tests/test_chat_harness_deep_critic.py` |
| **Edit** | `services/ai-gateway/app/models.py` — `CriticCheck`, `ChatHarnessCriticVerdict` (or import from critic module) |
| **Edit** | `services/ai-gateway/app/config.py` — `critic_slot: Literal["same", "secondary"]`, `critic_model_path: str \| None` (path unused until Phase B) |
| **Edit** | `services/ai-gateway/app/prompt_loader.py` — `build_chat_harness_critic_prompt()` |
| **Edit** | `services/ai-gateway/app/providers/openvino_provider.py` — remove `_CHAT_HARNESS_DEEP_CRITIQUE_PROMPT`; delegate to `run_chat_harness_deep` + `get_critic_backend` |
| **Edit** | `services/ai-gateway/app/providers/mock.py` — deep branch via `run_chat_harness_deep`; magic-prefix drafts for tests |
| **Edit** | `services/ai-gateway/tests/test_chat_harness_reasoning_contract.py` — update deep confidence note assertion |
| **Edit** | `services/ai-gateway/README.md` — critic slot env vars, deep pass diagram |
| **Edit** | `docs/conversation-thread-intelligence.md` — one paragraph on structured deep critic |
| **Defer** | `app/ask-harness.tsx`, `src/core/chatHarnessClient.ts` — no changes |
| **Defer** | `SecondaryOpenVinoCriticBackend` implementation — Phase B |

### Commands

```powershell
cd services/ai-gateway
pip install -e ".[dev]"
$env:SCOUT_PROVIDER="mock"
pytest tests/test_chat_harness_deep_critic.py tests/test_chat_harness_reasoning_contract.py -q
pytest -q
```

### Out of scope

- Native chat path deep critic (`SCOUT_CHAT_HARNESS_NATIVE_CHAT=true`) — document as known gap; optional tiny follow-up to call orchestrator after native draft.
- LLM summarization of context for critic — use compact deterministic snapshot from `HarnessContext` + `thread_state`.
- Streaming `/chat-harness`.
- Exporting critic verdict to Memory Bank or thread_state.

---

## Appendix — Critic vs verifier check mapping

| User concern | Critic check | Existing verifier (`thread_verifier.py`) |
|--------------|--------------|------------------------------------------|
| Too broad | `too_broad` | — |
| Ignores Life Harness state | `ignored_harness_state` | — |
| Too many tasks | `too_many_tasks` | — |
| Enables avoidance | `enables_avoidance` | — |
| Emotionally weird / manipulative | `emotionally_weird` | — |
| Contradicts board constraints | `contradicts_constraints` | partial overlap with `board_mutation_claim` |
| Valid JSON when required | `invalid_json_shape` | parse repair in provider |
| Repeats prior turn | — | `anti_repeat` |
| Ignores “shorter” | — | `ignored_steering` |
| Claims autonomous actions | — | `unsafe_autonomous` |
