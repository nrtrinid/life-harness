# Career Hub v0.1

The **Jobs** screen (`/career`) is the career pipeline home — one board for the full loop:

```text
Find → Review → Apply → Follow up
```

See [`career-unified-workflow-v0.16.md`](career-unified-workflow-v0.16.md) for the authoritative workflow spec.

## Purpose

```text
Open Jobs → see pipeline counts + next contract → work one tab → hand off to the next stage.
```

Complements Today (daily pounce/recovery) with a durable career-work surface. Today’s collapsed **Jobs shortcuts** use the same next-action signal via [`buildTodayCareerShortcuts()`](../src/core/todayCareerShortcuts.ts).

## Pipeline header chips

Built by [`buildCareerPipelineState()`](../src/core/careerPipeline.ts):

| Chip | Meaning |
|------|---------|
| **N in queue** | Candidates with status `new` or `saved` |
| **N applications** | Application cards in Active + Waiting |
| **N follow-ups** | Follow-ups due today or overdue |
| **N due sources** | Enabled sources past cadence |
| **pack imported / no pack** | Career pack presence |

## Tabs

| Tab | Route | Primary work |
|-----|-------|----------------|
| **Find** | `/career?tab=find` | Run sources, paste posting (`?paste=1` focuses paste form) |
| **Review** | `/career?tab=review` | Save / Pass / **Start application** |
| **Apply** | `/career?tab=apply` | Application cards + resume readiness + Waiting nudge |
| **Follow up** | `/career?tab=followup` | Due follow-up dates |

Sticky chrome: **Pipeline stepper**, **Next contract** ([`buildCareerHubSummary()`](../src/core/careerHub.ts)), **Add a job** (`?add=1`), handoff banners after Find/Review.

## Add a job

**Add a job** (`/career?add=1` or `?tab=find&add=1`):

1. **Paste a posting** → Find tab with paste form first (`?paste=1`)
2. **Start application card directly** → `/career-intake` (advanced / secondary)

Legacy `/candidate-intake` redirects to `/career?tab=find&add=1`.

## More career tools (footer)

Resume Bank, Career Pack, Sources, Source setup — machinery stays reachable but demoted under the tab content.

## Navigation

**Jobs** is in **Primary** nav (`/career`). Backroom lists Resume Bank, Sources, Paste/Review deep links, and **Direct application (advanced)**. See [`nav-backroom-cleanup-v0.1.md`](nav-backroom-cleanup-v0.1.md).

## Code map

| File | Role |
|------|------|
| [`app/career.tsx`](../app/career.tsx) | Jobs screen shell + chips |
| [`src/components/career/jobBoard/JobBoardScreen.tsx`](../src/components/career/jobBoard/JobBoardScreen.tsx) | Tab router, stepper, next contract |
| [`src/core/careerHub.ts`](../src/core/careerHub.ts) | Next action + summary |
| [`src/core/careerPipeline.ts`](../src/core/careerPipeline.ts) | Pipeline aggregation |
| [`src/core/todayCareerShortcuts.ts`](../src/core/todayCareerShortcuts.ts) | Today ↔ hub shortcut parity |

## Related docs

| Version | Doc |
|---------|-----|
| Integration v0.2 | [`plans/career-hub-integration-v0.2.md`](plans/career-hub-integration-v0.2.md) |
| Unified workflow | [`career-unified-workflow-v0.16.md`](career-unified-workflow-v0.16.md) |
| Job Board UX | [`career-job-board-ux-v0.13.md`](career-job-board-ux-v0.13.md) |
| Job Scout foundation | [`job-scout-foundation-v0.2.md`](job-scout-foundation-v0.2.md) |
