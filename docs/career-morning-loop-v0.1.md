# Career Morning Loop v0.1

> **Superseded for UI:** The Jobs hub now uses [`buildCareerHubSummary()`](../src/core/careerHub.ts) + [`CareerNextContractCard`](../src/components/career/CareerNextContractCard.tsx) on `/career`. `buildCareerMorningLoop()` remains for batch/find priority logic; hrefs target `/career?tab=…`.

## Priority (highest first)

1. Batch running (disabled CTA)
2. **Review matches** when waiting candidates exist → `/career?tab=review`
3. Run due sources
4. **Run healthy sources** (skips weak-pass/error feeds)
5. Run all enabled (retry after failures)
6. Review queue / follow-ups / resume blockers / paste / maintain

## Weak-pass

When the latest source run produced zero candidates with no errors, supporting lines note weak-pass and batch summaries count weak-pass sources separately from produced matches.

## Post-batch Review CTA

After batch runs on `/career`, when `createdCandidates > 0`, handoff banner points to **Review** tab (not legacy `/job-candidates`).

## Paste empty state

When career state is empty, next move links to `/career?tab=find&add=1`.
