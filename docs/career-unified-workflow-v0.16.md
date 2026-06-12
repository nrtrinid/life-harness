# Unified Jobs Workflow v0.16

## Purpose

One **Jobs** board at `/career` for the full career loop:

```text
Find → Review → Apply → Follow up
```

Resume export stays on application card detail (`/card/[id]`).

## Tabs

| Tab | Route | Primary work |
|-----|-------|----------------|
| **Find** | `/career?tab=find` | Runner banner, run sources, paste posting |
| **Review** | `/career?tab=review` | Save / Pass / **Start application** |
| **Apply** | `/career?tab=apply` | Application cards + resume readiness |
| **Follow up** | `/career?tab=followup` | Due follow-up dates |

Sticky chrome on `/career`:

- **Pipeline stepper** — counts per stage; tap to switch tab
- **Next contract** — single CTA from [`careerHub.ts`](../src/core/careerHub.ts)
- **Add a job** — paste posting or direct card (`?add=1`)

## Legacy routes

| Route | Behavior |
|-------|----------|
| `/job-candidates` | Thin wrapper around Review tab |
| `/candidate-intake` | Redirects to `/career?tab=find&add=1` |
| `/job-sources` | Full operator UI + link back to Find tab |
| `/career-intake` | Direct application card (secondary path) |

## Resume draft packet backfill

Legacy or seed application cards without a packet show **Create draft packet** on card detail. Action: `applyBackfillResumeDraftPacket` — rebuilds from linked candidate or scores modules from posting text.

## Dogfood loop

1. Open **Jobs** (suggested tab from queue/follow-ups)
2. **Find** → Start runner → Run all enabled
3. **Review** → Start application on best match
4. Card → Create draft packet if needed → Build DOCX
5. **Apply** / **Follow up** for ongoing motion

## Related

- [`career-job-board-ux-v0.13.md`](career-job-board-ux-v0.13.md) — tab model spec
- [`ux/career-application-card-detail-v0.15.md`](ux/career-application-card-detail-v0.15.md) — card resume workspace
- [`career-v0.1-pipeline.md`](career-v0.1-pipeline.md) — core pipeline

## Non-goals

- Inline resume editor inside Apply tab (v0.17)
- Replacing `/job-sources` CRUD UI
