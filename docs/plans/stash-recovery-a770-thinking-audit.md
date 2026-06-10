# Stash Recovery Audit — A770 Thinking WIP

**Audit date:** 2026-06-10  
**Auditor task:** Read-only inspection; no stash apply/pop/drop performed.  
**Repo:** `life-harness`  
**Branch at audit start:** `main` (with minor uncommitted local edits — see [Working tree note](#working-tree-note))

---

## Current HEAD

| Field | Value |
|-------|-------|
| **Branch** | `main` (tracks `origin/main`) |
| **HEAD** | `b5f24ceccb6000e0558142828491fad5659e7e04` |
| **Subject** | Add model bench runner tests. |
| **Date** | 2026-06-10 06:24:37 -0700 |

**Recent `main` ancestry (stash@{0} base → HEAD):**

```text
c5c5131  Career Source Pack import          ← stash@{0} base (feat/a770-model-bench-harness)
efc1cdf  Deep Synthesis Phase 3a
bc19d48  Merge PR #1 (deep synthesis)
f7ca856  Secondary critic thinking smoke + doc layout
bdc8a82  Eval runner fix
ee8a49e  Merge career source pack
53ba6f9  CollapsibleSection + bench scaffold
b5f24ce  Model bench runner tests           ← HEAD
```

---

## Stash inventory

| Stash | Date (local) | Source branch | Subject | Tracked files | Untracked-only | Total paths |
|-------|----------------|---------------|---------|---------------|----------------|-------------|
| `stash@{0}` | 2026-06-10 06:12:49 | `feat/a770-model-bench-harness` | park wip for a770 thinking branch | 176 | 112 | 288 |
| `stash@{1}` | 2026-06-10 05:32:09 | `feat/deep-synthesis-phase-3a` | a770 synthesis critic slot manager test | 0 | 1 | 1 |
| `stash@{2}` | 2026-06-10 05:32:01 | `feat/deep-synthesis-phase-3a` | a770 leftover on phase3a branch | 0 | 2 | 2 |
| `stash@{3}` | 2026-06-10 05:31:18 | `feat/deep-synthesis-phase-3a` | phase3a ts bridge wip | 87 | 2 | 89 |
| `stash@{4}` | 2026-06-10 05:29:29 | `feat/deep-synthesis-phase-3a` | a770 slot manager wip isolated | 89 | 3 | 92 |

**Stash commit SHAs (for reference):**

- `stash@{0}` → `d2d5086` (parents: `c5c5131`, index, untracked tree)
- `stash@{1}` → `3d24037`
- `stash@{2}` → `a5d948b`
- `stash@{3}` → `a4b7587`
- `stash@{4}` → `658d435`

---

## Per-stash verdict

### `stash@{0}` — **RECOVER (slice-by-slice)** — highest value

**Summary:** Large WIP parked when switching to thinking/critic work. Base commit `c5c5131` is now an ancestor of `main`, but **~101 untracked paths exist only in the stash** and **~108 tracked paths differ in content** from current `main`.

**Changed areas (tracked + untracked):**

| Area | Approx. files | Notes |
|------|---------------|-------|
| App screens (`app/`) | 18+ tracked diffs | `career.tsx`, `raw-lab.tsx`, `ask-harness.tsx` are **much richer in stash** (~603 net lines vs main in those three alone) |
| UI components (`src/components/`) | 31 untracked + 15 tracked | App shell, consolidated nav, career job board, chat chrome, Raw Lab panels |
| Core (`src/core/`) | 23 untracked + 13 tracked | Companion self-memory, context-packet app bridge, bonus track, gateway budget |
| AI gateway | 19 untracked + 20 tracked | `synthesis_reflection_stretch`, alternate `slot_manager.py`, extra evals/tests |
| Docs / plans | 20+ untracked + many tracked | `docs/plans/*`, UX consolidation, local AI roadmaps |
| Meta / hygiene | 6 renames | Stash has meta files at **repo root**; `main` moved them to `docs/meta/` |

**`main` vs `stash@{0}` tree diff:** 128 entries — `M` 105, `D` 15, `R` 6, `A` 2.

**Verdict:** Do **not** apply wholesale. Contains the bulk of unmerged companion/UX/bench-planning work. Recover in **coherent vertical slices** on isolated branches.

---

### `stash@{1}` — **RECOVER (small, after stash@{0} slice 7)**

**Files (untracked only):**

- `services/ai-gateway/tests/test_synthesis_critic_slot_manager.py` (~176 lines)

**On `main`?** No — file does not exist on `main`.  
**Overlap:** Same filename also appears in `stash@{0}` untracked list (likely identical or near-identical).

**Verdict:** Worth recovering as a **single test file** after slot/critic recovery branch exists. Low risk.

---

### `stash@{2}` — **HUMAN DECISION (architectural fork)**

**Files (untracked only):**

- `services/ai-gateway/app/slot_manager.py` (~130 lines)
- `services/ai-gateway/tests/test_slot_manager.py` (~159 lines)

**On `main`?** No at that path. `main` has `services/ai-gateway/app/slots/manager.py` (same line count, **different design**).

**Diff summary:** Stash version is an older/alternate **VRAM lease / `ModelSlotPolicy`** prototype (`SlotState`, threading, `model_slots` imports). Shipped `main` version is the **`slots/` package** integrated with backends, registry, and health endpoints.

**Verdict:** Not a straight copy. Use for **diff review only** unless promoting gates require resurrecting lease semantics. Also duplicated inside `stash@{0}` untracked list.

---

### `stash@{3}` — **LIKELY SUPERSEDED**

**Base:** `efc1cdf` (Deep Synthesis Phase 3a tip, pre-merge).

**`main` vs stash@{3}:** 64 file entries; stat shows **~5,885 deletions** relative to stash (i.e. `main` is far ahead).

**Unique vs main:** Mostly missing career pack, critic thinking trace, bench harness, `docs/meta/` layout, CollapsibleSection, etc.

**Verdict:** Historical snapshot of Phase 3a gateway + TS bridge. **No unique recovery priority** unless a targeted `git diff main stash@{3} -- <path>` finds a missing hunk (none found in spot checks).

**Drop later?** Yes, **after human sign-off** — keep until `stash@{0}` slices land.

---

### `stash@{4}` — **LIKELY SUPERSEDED**

Same as `stash@{3}` plus 6 extra differing paths (`main.py`, `models.py`, `synthesis_critic.py`, `conftest.py`, `deepSynthesisClient.ts`, `deepSynthesisTypes.ts`) — all **present on `main`** now.

**Verdict:** Superseded isolated slot-manager experiment snapshot. **Drop later with human approval** after confirming no manual diff needed.

---

## `stash@{0}` deep audit

### a) Already on `main` (or equivalent shipped)

These were in the stash but **`main` now has the intent** (possibly different implementation):

| Topic | Stash signal | On `main` |
|-------|--------------|-----------|
| Career Source Pack | `app/career-pack.tsx`, core pack modules | ✅ merged (`c5c5131` / `ee8a49e`) |
| Deep Synthesis gateway | tracked edits to `deep_synthesis.py`, critic, jobs | ✅ `efc1cdf` + merge |
| Secondary critic / thinking trace | partial overlap | ✅ `f7ca856` (`chat_harness_thinking_trace.py`, critic tests) |
| Model bench harness scaffold | untracked bench files in stash | ✅ `53ba6f9`, `b5f24ce` (`bench_*.py`, `run_model_bench.py`, tests) |
| Collapsible UI primitive | — | ✅ `CollapsibleSection.tsx` on `main` (stash used it but didn't add file) |
| `careerPipeline.ts` | tracked | ✅ on `main` (simpler) |
| Meta docs at root | `DESIGN_TOKENS.md`, etc. | ✅ moved to `docs/meta/` on `main` (stash still has root copies) |
| Raw Lab budget (gateway) | `test_raw_lab_budget.py` tracked | ✅ on `main` |
| llama.cpp critic tests | partial | ✅ `test_synthesis_critic_llamacpp.py`, `test_llamacpp_backend.py` |

### b) Unique and likely valuable

**Companion / reflection lane**

- `src/core/companionSelfMemory.ts` + store + tests
- `src/core/companionLabels.ts`, `companionNote.ts`, `bonusTrack.ts`
- `src/components/rawLab/CompanionSelfMemoryPanel.tsx`, `RawLabBudgetInspector.tsx`
- `src/core/rawLabSelfReflectionClient.ts`
- Gateway: `test_raw_lab_self_reflection.py`, `test_raw_lab_self_memory_contract.py`

**Context packet (app-side)**

- `src/core/contextPacket*.ts` (builder, wire, ranking, redaction, shim)
- Not present on `main` commit (gateway has `context_packet.py`; app bridge is stash-only)

**Ask / Raw Lab / Career UX (large screen diffs)**

- `app/raw-lab.tsx`, `app/ask-harness.tsx`, `app/career.tsx` — stash versions significantly larger
- `src/components/AppShell.tsx`, `ConsolidatedNav.tsx`, `nav/*`, `career/*`, `chat/*`
- `src/components/askHarness/ReasoningDepthChips.tsx`

**Gateway extensions**

- `services/ai-gateway/app/synthesis_reflection_stretch.py` + tests
- Extra eval fixtures: `evals/harness/`, `evals/routing/`, `evals/transcript/`, thread eval JSONs
- `test_ai_slots_route.py`, `test_slot_routing_eval.py`, `test_harness_eval_fixtures.py`, `test_phi4_synthesis_critic_smoke.py`

**Docs / promotion gates**

- `docs/plans/a770-model-promotion-gates.md`, `model-stack-freeze-v3.md`, `local-ai-evals-v0.1.md`, etc.
- `docs/ux/general-ux-consolidation-v0.1.md`, `lofi-companion-os-shell-v0.1.md`

### c) Obsolete / conflicting

| Item | Why |
|------|-----|
| Root-level meta doc copies | Conflicts with `docs/meta/` layout on `main` — **take content merges only** |
| `services/ai-gateway/app/slot_manager.py` (stash) | Forked design vs `app/slots/manager.py` — do not blind copy |
| Tracked gateway edits in stash to `deep_synthesis.py`, `main.py`, `critic_backend.py` | Superseded by merged Phase 3a + critic smoke commits — **prefer `main` + targeted ports** |
| `phase3a-pr-body.md` | PR artifact; archive or drop |
| `.kiro/specs/*` churn | Low product value; merge only if still active |

### d) Docs-only (safe first slice)

20 untracked `docs/plans/*` + `docs/DEVELOPMENT.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, UX docs — **no runtime conflict** with `main`.

### e) Needs human decision

1. **`slot_manager.py` vs `slots/manager.py`** — which VRAM/lease model is canonical for A770 promotion gates?
2. **Full UX shell** (`AppShell` + `ConsolidatedNav`) vs incremental screen polish
3. **Companion self-memory persistence** — sensitivity defaults (likely S1/S2); confirm before merge
4. **`career.tsx` / `job-candidates.tsx` tracked diffs** — stash may predate job-board refactors on `main`

---

## Coherent recoverable slices (`stash@{0}`)

| # | Slice | Key paths | Suggested branch | Risk |
|---|-------|-----------|------------------|------|
| 1 | **Docs & plans** | `docs/plans/*`, `docs/ux/*`, `CONTRIBUTING.md`, `CHANGELOG.md` | `recover/a770-stash0-docs` | Low |
| 2 | **Companion self-memory** | `src/core/companionSelfMemory*`, `companionLabels`, `companionNote`, Raw Lab panels | `recover/a770-stash0-companion-memory` | Medium (S1/S2 review) |
| 3 | **Context packet app bridge** | `src/core/contextPacket*` | `recover/a770-stash0-context-packet-app` | Medium |
| 4 | **Ask / Raw Lab UX** | `app/ask-harness.tsx`, `app/raw-lab.tsx`, `ReasoningDepthChips`, chat components | `recover/a770-stash0-ask-raw-lab-ux` | High (large diffs) |
| 5 | **Career hub / job board UX** | `app/career.tsx`, `app/job-candidates.tsx`, `src/components/career/*`, `CareerPipelineOverview` | `recover/a770-stash0-career-ux` | High |
| 6 | **UX shell / nav** | `AppShell`, `ConsolidatedNav`, `nav/*`, `Screen.tsx`, `styles.ts` | `recover/a770-stash0-ux-shell` | High (touches all routes) |
| 7 | **Gateway stretch + evals** | `synthesis_reflection_stretch.py`, extra eval JSON/tests, `test_phi4_synthesis_critic_smoke.py` | `recover/a770-stash0-gateway-stretch-evals` | Medium |
| 8 | **Slot manager fork review** | `slot_manager.py`, `test_slot_manager.py`, `test_synthesis_critic_slot_manager.py` | `recover/a770-stash2-slot-manager-review` | High (architecture) |

**Recommended order:** 1 → 2 → 3 → 7 → 4 → 5 → 6 → 8

---

## `stash@{1}` / `stash@{2}` vs `main`

| File | On `main`? | Equivalent? |
|------|------------|-------------|
| `test_synthesis_critic_slot_manager.py` | ❌ | Complements `test_critic_secondary_slot.py`; recover with slice 8 |
| `slot_manager.py` | ❌ (different path) | **Not equivalent** to `slots/manager.py` — different API/design |
| `test_slot_manager.py` | ❌ | Tests stash fork only |

---

## High-value files (stash@{0} untracked-only shortlist)

```text
src/core/companionSelfMemory.ts
src/core/companionSelfMemoryStore.ts
src/core/contextPacketBuilder.ts
src/core/contextPacketWire.ts
src/components/AppShell.tsx
src/components/ConsolidatedNav.tsx
src/components/rawLab/CompanionSelfMemoryPanel.tsx
src/components/rawLab/RawLabBudgetInspector.tsx
src/components/career/JobBoardFindPanel.tsx
services/ai-gateway/app/synthesis_reflection_stretch.py
docs/plans/a770-model-promotion-gates.md
docs/plans/model-stack-freeze-v3.md
docs/ux/lofi-companion-os-shell-v0.1.md
```

## Likely redundant (do not recover verbatim)

```text
DESIGN_TOKENS.md (root)              → use docs/meta/
Deep synthesis gateway tracked edits  → use main + port missing hunks only
stash@{3} / stash@{4} entire trees    → superseded by main
phase3a-pr-body.md                   → artifact
```

---

## Proposed recovery branches (no work started yet)

```text
recover/a770-stash0-audit          # optional: full tree for diff-only inspection
recover/a770-stash0-docs
recover/a770-stash0-companion-memory
recover/a770-stash0-context-packet-app
recover/a770-stash0-gateway-stretch-evals
recover/a770-stash0-ask-raw-lab-ux
recover/a770-stash0-career-ux
recover/a770-stash0-ux-shell
recover/a770-stash2-slot-manager-review
```

---

## Exact recommended next commands

### 1) Create isolated audit worktree (optional full inspection)

```powershell
cd C:\Users\nicki\Projects
git worktree add life-harness-stash0-audit -b recover/a770-stash0-audit main
cd life-harness-stash0-audit
git stash apply 'stash@{0}'   # NOT pop; expect conflicts — resolve only for inspection
```

### 2) First safe recovery — docs-only slice

```powershell
cd C:\Users\nicki\Projects\life-harness
git checkout -b recover/a770-stash0-docs main
git checkout 'stash@{0}^3' -- docs/plans docs/ux docs/DEVELOPMENT.md docs/ask-harness-v0.1.md docs/career-hub-v0.1.md CHANGELOG.md CONTRIBUTING.md SECURITY.md
# If paths missing in untracked parent, use instead:
# git show 'stash@{0}^3:<path>' > <path>   (per file)
git status
npm run typecheck
git commit -m "Recover A770 planning docs from stash@{0}."
```

### 3) Inspect single file without apply

```powershell
git show 'stash@{0}^3:src/core/companionSelfMemory.ts' | more
git diff main 'stash@{0}' -- app/raw-lab.tsx
```

### 4) Companion memory slice (after docs)

```powershell
git checkout -b recover/a770-stash0-companion-memory main
# Apply only companion-related paths from stash untracked parent (stash@{0}^3)
git checkout 'stash@{0}^3' -- src/core/companionSelfMemory.ts src/core/companionSelfMemoryStore.ts src/core/companionSelfMemory.test.ts src/core/companionLabels.ts src/core/companionNote.ts src/components/rawLab/CompanionSelfMemoryPanel.tsx
npm run typecheck && npm test
```

### 5) Slot manager review (stash@{2}, read-only)

```powershell
git diff main:'services/ai-gateway/app/slots/manager.py' 'stash@{2}^3:services/ai-gateway/app/slot_manager.py'
```

**Never run on `main`:**

```text
git stash pop
git stash drop
git checkout main && git stash apply 'stash@{0}'
```

---

## First safe recovery ticket

**Ticket:** Recover `docs/plans` + UX planning docs from `stash@{0}`

**Rationale:**

- Zero runtime conflict with `main`
- Captures promotion gates, model stack freeze, eval plans needed for `model_bench_harness`
- Validates recovery workflow before touching companion memory or gateway forks

**Acceptance:**

- [ ] Branch `recover/a770-stash0-docs` from `main`
- [ ] Files compile-free (markdown only)
- [ ] `stash@{0}` still intact (`git stash list` unchanged)
- [ ] PR or merge only after human review of plan doc accuracy

---

## Risks and conflicts

| Risk | Severity | Mitigation |
|------|----------|------------|
| Full `stash@{0}` apply | **Critical** | Slice-only recovery branches |
| Gateway double-fork (`slot_manager` vs `slots/manager`) | **High** | Architecture review before any port |
| UX shell vs current `Nav.tsx` / `navRoutes.ts` on `main` | **High** | Recover nav slice last; run `navRoutes.test.ts` |
| Companion memory sensitivity | **Medium** | Default S1/S2; no auto-export to Ask Harness |
| Meta doc path renames | **Low** | Never restore root copies; merge content into `docs/meta/` |
| Stash base drift (`c5c5131` → `b5f24ce`) | **Medium** | Always branch from **current `main`**, not stash base |

---

## Stash retention policy

### Do NOT drop yet

| Stash | Reason |
|-------|--------|
| `stash@{0}` | Primary unmerged UX/companion/bench/plan work |
| `stash@{1}` | Unique critic slot manager test |
| `stash@{2}` | Alternate slot manager for architecture compare |
| `stash@{3}` | Backup Phase 3a snapshot until slices verified |
| `stash@{4}` | Backup slot-manager isolation snapshot |

### May drop later (human approval only)

| Stash | Condition |
|-------|-----------|
| `stash@{3}` | After confirming `git diff main stash@{3}` has no wanted hunks |
| `stash@{4}` | After same check vs `stash@{3}` |
| `stash@{2}` | After slot manager decision recorded in `docs/plans/` |
| `stash@{1}` | After test file lands on a recovery branch and passes CI |

**Never drop `stash@{0}`** until slices 1–7 are recovered or explicitly abandoned in writing.

---

## Working tree note

At audit time, `main` had **uncommitted** local changes unrelated to stashes:

- `services/ai-gateway/README.md`
- `services/ai-gateway/app/eval_runner.py`
- `services/ai-gateway/tests/test_model_bench_runner.py`
- Untracked: `docs/plans/` (partial), `test_model_bench_real_phi4_target.py`, `phi4-synthesis-critic-smoke.md`

Stash or commit these before starting recovery branches to avoid mixing with stash applies.

---

## Commands used (read-only)

```text
git stash list --date=iso
git stash show 'stash@{N}' --stat
git stash show 'stash@{N}' --include-untracked --name-only
git diff --name-status main 'stash@{N}'
git diff --stat main 'stash@{N}' -- <paths>
git show 'stash@{2}^3:services/ai-gateway/app/slot_manager.py'
git rev-parse 'stash@{0}^1' 'stash@{0}^2' 'stash@{0}^3'
git ls-tree -r --name-only main
```

---

## Summary

| Stash | Verdict |
|-------|---------|
| `stash@{0}` | **Recover in 8 slices** — companion memory + UX + plans are the prize |
| `stash@{1}` | **Small test recovery** after slice 8 |
| `stash@{2}` | **Architecture fork** — compare, don't copy blindly |
| `stash@{3}` | **Superseded** — keep as backup only |
| `stash@{4}` | **Superseded** — keep as backup only |

**Next move:** Open `recover/a770-stash0-docs` and port planning markdown only — lowest risk, highest planning value for A770 promotion gates.

---

## Docs slice recovered (2026-06-10)

**Branch:** `recover/a770-stash0-docs` (from `b5f24ce` / `main`)  
**Method:** `git checkout 'stash@{1}^3' -- <paths>` — **no** `stash apply` / **no** stash dropped.

> **Stash index shift:** At audit time the thinking WIP was `stash@{0}`. A later `git stash push` for bench WIP moved it to **`stash@{1}`**. All recovery commands below should use `stash@{1}` until the list changes again. Verify with: `git stash list` and subject *park wip for a770 thinking branch*.

### Files committed on recovery branch

| Path | Role |
|------|------|
| `docs/plans/a770-local-intelligence-integrated-roadmap.md` | Integrated A770 roadmap |
| `docs/plans/a770-local-intelligence-roadmap.md` | A770 roadmap (earlier slice) |
| `docs/plans/a770-model-promotion-gates.md` | Promotion gates for bench → near_core |
| `docs/plans/model-stack-freeze-v3.md` | Canonical model-role freeze |
| `docs/plans/ai-gateway-model-slots-v0.1.md` | Slot catalog (superseded by freeze for authority) |
| `docs/plans/agent-instructions-local-ai.md` | Agent workflow for local AI |
| `docs/plans/companion-reflection-engine-v0.1.md` | Companion reflection plan |
| `docs/plans/context-packet-builder-v0.1.md` | Context packet builder plan |
| `docs/plans/deep-synthesis-overnight-brain-v0.1.md` | Overnight synthesis plan |
| `docs/plans/local-ai-deep-ux-v0.1.md` | Deep UX / reasoning UX plan |
| `docs/plans/local-ai-evals-v0.1.md` | Local eval harness plan |
| `docs/plans/local-coding-agent-loop-v0.1.md` | Coding agent loop plan |
| `docs/plans/phi4-critic-deep-pass-v0.1.md` | Phi-4 critic deep pass plan |
| `docs/ux/general-ux-consolidation-v0.1.md` | UX consolidation plan |
| `docs/ux/lofi-companion-os-shell-v0.1.md` | Companion OS shell UX |
| `docs/DEVELOPMENT.md` | Dev setup guide |
| `docs/ask-harness-v0.1.md` | Ask Harness slice doc |
| `docs/career-hub-v0.1.md` | Career hub slice doc |
| `docs/career-job-board-ux-v0.13.md` | Job board UX v0.13 |
| `docs/local-ai-agent-guide.md` | Local AI operator guide |
| `CHANGELOG.md` | Changelog scaffold |
| `CONTRIBUTING.md` | Contributing guide |
| `SECURITY.md` | Security notes |
| `docs/README.md` | Updated plans index links |

### Intentionally skipped (this slice)

- Tracked doc **edits** in the thinking stash (`docs/00_project_overview.md`, `docs/02_v0_1_scope.md`, `docs/local-a770-plan.md`, `docs/08_ai_provider_and_a770_plan.md`, etc.) — **`main` kept as authority**; stash deltas were broad rewrites, not isolated plan inserts.
- `phase3a-pr-body.md` — PR artifact.
- `.kiro/specs/*` — tooling metadata.
- All `app/`, `src/`, `services/ai-gateway/` runtime paths.

### Next recovery slice

**`recover/a770-stash0-companion-memory`** — `src/core/companionSelfMemory*` + Raw Lab panels from `stash@{1}^3` (see slice 2 in table above).
