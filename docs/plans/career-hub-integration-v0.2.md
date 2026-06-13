# Career Hub Integration v0.2 — Plan

**Status:** Implemented (2026-06-13)  
**Authority:** [`career-unified-workflow-v0.16.md`](../career-unified-workflow-v0.16.md), UX audit UX-007 in [`ux/current_ux_audit.md`](../ux/current_ux_audit.md)

**Related:**
- Board usability (Waiting nudge): [`plans/board-usability-v0.1.md`](board-usability-v0.1.md)
- Job Board UX: [`career-job-board-ux-v0.13.md`](../career-job-board-ux-v0.13.md)

---

## Problem

The unified Jobs board at `/career` (Find → Review → Apply → Follow up) was built in v0.13–v0.16, but **entry points still scattered** to legacy routes (`/candidate-intake`, `/job-candidates`, `/career-intake`). Users had to learn multiple paths; Today shortcuts duplicated the hub.

## North star

> Open Jobs → one obvious next move → finish one stage → board state makes sense (Active vs Waiting).

## What shipped

### Phase A — One entry surface (UX-007)

- Today, Board Inbox, job-sources, career-pack, `careerMorningLoop`, and `primaryAction` deep links now target `/career?tab=…`
- Backroom **Career Intake** relabeled **Direct application (advanced)**
- Add-job sheet **Paste a posting** sets `?paste=1` on Find tab (paste form shown first)

### Phase B — Board ↔ Jobs handoff

- **Waiting nudge** on Apply tab when resume is ready and card is Active
- Follow-up tab CTAs clarify board work (“Open card & log follow-up”)
- Application card detail: **Open in Jobs board** → Apply or Follow up tab

### Phase C — Today shortcuts

- [`buildTodayCareerShortcuts()`](../src/core/todayCareerShortcuts.ts) drives collapsed Jobs shortcuts from `buildCareerHubSummary`
- Primary = hub next action; secondary = Open Jobs board; optional Run due sources when not redundant

### Phase D — Docs

- Updated [`career-hub-v0.1.md`](../career-hub-v0.1.md), morning loop doc, job board UX doc, nav backroom doc
- `core-career-hub` block in [`AGENT_CONTEXT_MAP.md`](../AGENT_CONTEXT_MAP.md)

---

## Manual dogfood checklist (Phase E)

Run on **clean board** (Progress → Reset to clean):

- [ ] `/career` → Find → paste one real posting OR run due sources
- [ ] Review tab → **Start application** on one match
- [ ] Apply tab → resume readiness → export DOCX
- [ ] Move card to **Waiting** via nudge
- [ ] Set follow-up date → Follow up tab surfaces it → log on card detail
- [ ] From Today (More on Today), shortcuts show hub next-action — no legacy Intake/Queue URLs required

**Pass:** happy path never requires `/candidate-intake`, `/job-candidates`, or `/career-intake`; Active slot freed after apply.

---

## Ticket index

| ID | Title | Status |
|----|-------|--------|
| LH-CAR-01 | Replace legacy career hrefs | Done |
| LH-CAR-02 | Migrate careerMorningLoop hrefs + tests | Done |
| LH-CAR-03 | Nav/backroom label cleanup | Done |
| LH-CAR-04 | Add-job sheet → Find paste focus | Done |
| LH-CAR-05 | Waiting nudge on Apply tab | Done |
| LH-CAR-06 | Follow-up tab + card detail deep links | Done |
| LH-CAR-07 | Today career shortcuts from careerHub | Done |
| LH-CAR-08 | Docs + AGENT_CONTEXT_MAP | Done |
| LH-CAR-09 | Manual dogfood sign-off | User checklist above |

---

## Out of scope (defer)

- Inline resume editor in Apply tab (v0.17)
- Replacing `/job-sources` operator UI
- New AI/scout/automation
