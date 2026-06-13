# Career Morning Loop v0.1

The Jobs hub **Career check-in** panel (`CareerMorningLoopCard`) surfaces one primary move from `buildCareerMorningLoop`.

## Priority (highest first)

1. Batch running (disabled CTA)
2. **Review matches** when waiting candidates exist
3. Run due sources
4. **Run healthy sources** (skips weak-pass/error feeds)
5. Run all enabled (retry after failures)
6. Review queue / follow-ups / resume blockers / paste / maintain

## Weak-pass

When the latest source run produced zero candidates with no errors, supporting lines note weak-pass and batch summaries count weak-pass sources separately from produced matches.

## Post-batch Review CTA

After **Find fit matches** or batch runs on `/career`, when `createdCandidates > 0`, show **Review new matches** linking to `/job-candidates`.
