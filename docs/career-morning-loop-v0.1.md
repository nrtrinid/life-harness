# Career Morning Loop v0.1

## Purpose

A small **Career check-in** on the Jobs hub (`/career`) that makes current job-search state obvious and offers **one clear next move**. Warm companion nudge — not a command center.

## What the loop shows

1. **Label:** Career check-in
2. **Status strip:** compact counts — due / failed / stale sources, waiting candidates, ready applications, resume patches needed
3. **One primary move:** title + why line + CTA
4. **Supporting lines (0–3):** last run outcome, source health summary, applications in motion, missing resume proof

UI: [`CareerMorningLoopCard`](../src/components/career/CareerMorningLoopCard.tsx) using [`PrimaryMovePanel`](../src/components/AlivePatterns.tsx).

Core: [`buildCareerMorningLoop`](../src/core/careerMorningLoop.ts).

## Next-move priority

Evaluated top to bottom (deterministic, no AI):

| Step | Condition | Move | v0.1 action |
|------|-----------|------|-------------|
| 0 | Batch running | Sources are running | Disabled “Running…” |
| 1 | Due sources | Run due sources | `runDueJobSources()` |
| 2 | Failed runnable sources (no due) | Run enabled sources | `runAllEnabledJobSources()` |
| 3 | Waiting candidates | Review matches | `/job-candidates` |
| 4 | Due follow-up or ready-to-export app | Open follow-up / application | `/card/[id]` |
| 5 | Blocked or patch-needed resume | Improve resume readiness | `/card/[id]` |
| 6 | Empty career state | Paste a job | `/candidate-intake` |
| 7 | Otherwise | You're caught up | Secondary: `/job-sources` |

### Batch copy honesty

Step 2 uses **“Run enabled sources”**, not “Retry failed sources”, because `runAllEnabledJobSources()` runs the **full enabled set** — not a per-source retry. Same semantics as [`JobBoardFindTab`](../src/components/career/jobBoard/JobBoardFindTab.tsx).

Do **not** wire the morning loop hero to `runFitFinder()` — that always runs all runnable sources regardless of due/failed state.

### Future tab routes (doc only)

When unified `/career` tabs land ([`career-unified-workflow-v0.16.md`](career-unified-workflow-v0.16.md)):

```text
review  -> /career?tab=review
paste   -> /career?tab=find&add=1
find    -> /career?tab=find
```

v0.1 emits real routes above instead.

## Helpers composed

- [`deriveBatchRunnerLifecycle`](../src/core/jobRunnerLifecycle.ts) — due count, batch labels
- [`deriveSourceLifecycle`](../src/core/jobRunnerLifecycle.ts) — failed source detection
- [`buildSourceHealthStats`](../src/core/jobSourceHealth.ts) — stale / health supporting lines
- [`getBestJobCandidateToReview`](../src/core/jobFindings.ts) — review move
- [`getFollowUpsDue`](../src/core/career.ts) — follow-up open move
- [`buildApplicationResumeReadiness`](../src/core/resumeReadiness.ts) — resume readiness counts and patch move
- [`summarizeLastRunOutcome`](../src/core/jobRunnerLifecycle.ts) — last run line

## Intentional non-goals (v0.1)

- Background scheduling or reminders
- AI-generated summaries
- Persistence format changes
- Proof ledger integration
- Daily streak / playback line
- Per-source targeted retry
- Replacing [`buildCareerHubSummary`](../src/core/careerHub.ts) globally (still used for chips, queue preview, [`nextMoveContract`](../src/core/nextMoveContract.ts))

## Future follow-ups

1. **Proof ledger integration** — surface missing proof from career proof items, not only resume warnings
2. **Daily streak / playback line** — “Last outside-world move: …”
3. **Optional scheduled source reminder** — only after dogfood proves deterministic loop is useful
4. **AI morning summary** — only after deterministic version ships and stabilizes
5. **Per-source retry** — when runner exposes targeted retry semantics

## Related

- [`career-v0.1-pipeline.md`](career-v0.1-pipeline.md) — core pipeline
- [`career-unified-workflow-v0.16.md`](career-unified-workflow-v0.16.md) — future tabbed Jobs board
- [`runner-lifecycle-boundary-v0.2.md`](runner-lifecycle-boundary-v0.2.md) — source lifecycle helpers

## Dogfood

1. Open **Jobs** (`/career`)
2. Read status strip + one move
3. Tap CTA — lands on a real route or starts the correct batch handler
4. Backroom sections unchanged for setup depth

## Dogfood polish (v0.1)

Copy and CTA polish from real dogfood — **priority ladder unchanged**.

| State | Title | Why | CTA | Destination |
|-------|-------|-----|-----|-------------|
| Batch running | Sources are running | Fetching matches — {source} ({n}/{total}). Hang tight. | Running… (disabled) | — |
| Due sources | {n} source(s) due | Run what's due, then skim any new matches. | Run due sources | `runDueJobSources()` |
| Failed sources | Run enabled sources | A source failed last time. Run the enabled set again and see what comes back. | Run enabled sources | `runAllEnabledJobSources()` |
| Waiting candidates | {company} — {role} | Pick a resume angle or pass — one decision is enough for today. | Open review queue | `/job-candidates` |
| Ready application | {card title} | {nextTinyResumeAction} | Open and export resume | `/card/[id]` |
| Resume needs patch | {card title} | {nextTinyResumeAction} | Fix resume blockers | `/card/[id]` |
| Empty state | Paste one job posting | Paste one posting to start the review queue — sources can wait. | Paste a job | `/candidate-intake` |
| All clear | You're caught up for now | Nothing urgent right now. Check back when a source is due or a match lands. | (none) | Secondary: `/job-sources` ("Check sources") |

**Status strip** uses nouns: `2 sources due · 3 to review · 1 ready to export` (not bare counts).

**Supporting lines:** `Last fetch: 2 new matches` (when no errors); `Sources: 2 healthy · 1 stale`.

**Paste route fix:** `/candidate-intake` renders the paste form ([`JobBoardFindTab`](../src/components/career/jobBoard/JobBoardFindTab.tsx) `pasteOnly`) and navigates to `/job-candidates` on success — no redirect to unwired `/career?tab=find`.

**Intentionally not changed:** priority ladder order, architecture boundaries, persistence, sidecars, global [`jobRunnerLifecycle`](../src/core/jobRunnerLifecycle.ts) copy.
