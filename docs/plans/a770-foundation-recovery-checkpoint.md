# A770 Foundation Recovery Checkpoint

**Date:** 2026-06-10  
**Status:** Stopping point — stash archaeology complete for foundation slices.  
**Main HEAD:** `619ffe4` — Recover memory retrieval and context packet bridge

---

## Recovered slices (on `main`)

| Commit | Slice | Branch (historical) |
|--------|--------|---------------------|
| `ba9d861` | A770 stack docs and plans from thinking WIP | `recover/a770-stash0-docs` |
| `72f463e` | Raw Lab companion self-memory + budget inspector | `recover/a770-companion-memory` |
| `52350d0` | A770 model bench harness (eval scoring, promotion tiers, mock tests) | `recover/a770-model-bench-harness` |
| `619ffe4` | Memory retrieval + context packet app bridge (Ask Harness) | `recover/a770-memory-retrieval-context` |

All four fast-forward merged to `origin/main`. No open recovery branches ahead of main.

---

## Validation (checkpoint run)

| Check | Result |
|-------|--------|
| `git status` | clean |
| `git diff --check` | clean |
| `npm run typecheck` | pass |
| App vitest (context packet, chat/raw lab, companion memory, containment) | **72 passed** |
| ai-gateway pytest (bench + synthesis eval fixtures, `SCOUT_PROVIDER=mock`) | **41 passed** |

**Not run:** GPU tests, `SCOUT_REAL_MODEL_BENCH`, `SCOUT_PHI4_SMOKE`, full 350+ gateway suite (spot-check sufficient for checkpoint).

---

## Preserved stashes (7 — do not drop)

| Index | Subject |
|-------|---------|
| `stash@{0}` | WIP recover/a770-model-bench-harness before companion-memory branch |
| `stash@{1}` | park bench wip before docs recovery |
| `stash@{2}` | **park wip for a770 thinking branch** (large thinking WIP — partial recovery only) |
| `stash@{3}` | a770 synthesis critic slot manager test |
| `stash@{4}` | a770 leftover on phase3a branch |
| `stash@{5}` | phase3a ts bridge wip |
| `stash@{6}` | a770 slot manager wip isolated |

**Stash archaeology is complete for foundation work.** Remaining stash content is optional future slices, not blockers.

---

## What main has now

- Recovered plans/roadmaps under `docs/plans/`
- Raw Lab persistent companion self-memory (`companion_self_memories` on send)
- Ask Harness `context_packet` build + deterministic Memory Bank retrieval/ranking
- Model bench harness (`services/ai-gateway/app/bench_*`, promotion tier docs)
- Gateway `context_packet` support (pre-existing; app bridge now wired)

---

## Optional future slices (not started)

1. **Deep Synthesis UI / job polling** — async synthesis UX on board
2. **`memory_embed` / `memory_rerank` runtime** — behind deterministic fallback; no GPU in CI
3. **Raw Lab visual polish** — `RawLabThread`, `RawLabEmptyState`, collapsible sections (`stash@{2}^3`)
4. **App shell / nav / Career UI** — consolidated nav, job board (`stash@{2}`)
5. **Slot manager fork review** — `slot_manager.py` vs `app/slots/manager.py` (`stash@{3}`–`{6}`)

---

## Next recommended feature branch

**`feat/deep-synthesis-ui`** or **`recover/a770-raw-lab-ux`** — pick based on product priority:

- Deep Synthesis UI if board/async jobs are the next user-visible milestone
- Raw Lab UX polish if companion feel is the priority (low risk, isolated from shell)

Do not resume wholesale `stash@{2}` apply.

---

## Tag

Local tag: `checkpoint-a770-foundation-recovered-2026-06-10` → `619ffe4` (if created at checkpoint).
