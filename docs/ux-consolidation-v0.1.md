# UX Consolidation v0.1

## Product rationale

Life Harness had a strong spine (Today Act Mode, Card Act/Backroom, Next Move Contract, Proof Ledger, Universal Capture, Agent Workbench) but surfaces still read like separate subsystems. This slice makes the app feel like **one instrument** through copy, hierarchy, and CTA priority — not new capabilities.

**Lanes:**

| Lane | Role |
|------|------|
| Today | Cockpit — one move, then proof |
| Board | Source of truth / quest lanes |
| Jobs | External pressure / career motion |
| Companion | Scout/operator chat |
| Playback | Proof and momentum reflection |
| Backroom | Machinery, labs, setup |

## Screen hierarchy model

Each major screen should read top-to-bottom as:

1. **What this is** — `PageHeader` title + short subtitle
2. **Primary next action** — one obvious move (hero or single primary button)
3. **Relevant context** — queues, cards, thread state
4. **Proof / recent movement** — shelf, ledger links
5. **Backroom / details** — collapsed or demoted setup blocks

## Language / verb guidelines

**Prefer on primary surfaces:** Move, Capture, Log proof, Delegate, Review, Park, Open card, Open Backroom.

**Reduce on primary surfaces:** optimize, pipeline, tool, execute, machinery, debug, operator.

**Align nav and page titles:** Jobs (not Career page title), Memory Bank (not Tape Archive), Backroom details (not operator details).

## Surfaces touched (v0.1)

| Surface | Changes |
|---------|---------|
| Today | Single hero move when contract exists; recovery copy; Jobs shortcuts; Board empty link |
| Board | Lane-specific empty copy; tighter subtitle |
| Jobs (`/career`) | Title Jobs; demoted duplicate primary; setup in collapsed Backroom |
| Companion | Subtitle; empty-state copy |
| Playback | Recovery proof label; Backroom details collapse title |
| Card Detail | Proof/agent empty states; Backroom collapsibles; Workbench link |
| Agent Workbench | Review hero; demoted copy CTAs; empty-state guidance |
| Proof Ledger | Demoted filters; Open Today empty CTA |
| Memory Bank | Renamed from Tape Archive; Open Companion when empty |
| Raw Signal | Lab subtitle; deduped Companion handoff CTA |
| Resume Bank | Readiness hero primary |
| Job Sources | PageHeader; Open Jobs; empty state; demoted kind chips |
| Nav | Paste a job / Review queue labels |

**Shared components:** `QuickCapture` (Capture button), `ProofShelf` empty copy, `CareerNextContractCard` tape label.

## Intentionally not changed

- No new data models, capture grammar, assistant actions, or proof-writing behavior
- No unified Jobs board WIP (`JobBoard*`, `AlivePatterns`, pipeline stepper UI)
- No ai-gateway, Raw Lab thread behavior, or automation
- No style-system / theme refactor
- `candidate-intake` / `job-candidates` route logic preserved (nav labels only)
- Feature Sprints screen not deeply reworked

## Future UX work

- Raw Lab capture/handoff back to spine (explicit user action only)
- Deeper Jobs/Board polish when unified workflow ships
- Backroom index / wayfinding
- Stronger empty states on secondary routes
- Mobile layout polish
- Visual theme pass

## Verification

```bash
npm run typecheck
npm test
```

Use a clean worktree when the main tree has unrelated WIP:

```bash
git worktree add ../life-harness-worktrees/ux-clean HEAD
cd ../life-harness-worktrees/ux-clean && npm ci && npm run typecheck && npm test
```
