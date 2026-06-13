# Unified Job Board UX v0.13

## Purpose

Replace the scattered Career Tools nav (Intake, Paste, Queue, Sources, …) with one **Job Board** at `/career` that answers: *What job work is in front of me, and what's the next move?*

## Mental model

```text
Find jobs → Review matches → Start applications → Follow up
```

| Stage | What it is |
|-------|------------|
| **Find** | Run approved sources, see due counts and last run |
| **Review** | Candidate queue — decide before applying |
| **Apply** | Application cards on the Board (inbox, active, waiting) |
| **Follow up** | Due follow-up dates on application cards |

## What moved

**Primary nav:** `Career` → **Jobs** (still `/career`).

**Removed from Career Tools nav** (still reachable from Job Board → More career tools):

- Intake, Paste, Queue, Sources, Career Pack

**Career Tools nav now:** Bank, Setup only.

**Unified add job:** Job Board hero / **Add a job** opens two paths:

1. **Review a posting first** → `/career?tab=find&add=1` (paste form focused with `?paste=1`)
2. **Start application now** → `/career-intake` (advanced secondary path)

## Review queue UX

- Tabs: **To review**, **Saved for later**, **Passed**, **Applied** — empty tabs hidden
- Primary action: **Start application** (was Create Application Card)
- Pass (was Dismiss)
- Match detail collapsed under **Why this match?**
- With Career Pack: pack tier is the primary badge; keyword fit score in expanded detail

## Compatibility

- `/job-candidates` remains a full-page review wrapper linking back to Job Board
- Deep links: `/career?tab=review`, `/career?add=1`

## Dogfood loop (daily)

1. Open **Jobs** (Job Board)
2. **Find jobs** or **Add a job**
3. **Review** tab — **Start application** on a strong match
4. **Apply** tab or Board for submission work
5. **Follow up** when dates are due

## Non-goals

- No new scout features, AI, or auto-apply
- Sources operator UI stays at `/job-sources` (linked from Find tab)

## Follow-on

v0.14 enriches the Find tab with inline paste, source runs, and a pipeline stepper — see [`career-full-pipeline-ux-v0.14.md`](career-full-pipeline-ux-v0.14.md).

v0.15 simplifies application **card detail** after Start application — see [`ux/career-application-card-detail-v0.15.md`](ux/career-application-card-detail-v0.15.md).
