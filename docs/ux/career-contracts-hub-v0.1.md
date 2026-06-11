# Career Contracts Hub v0.1

## Current Problem

Career had useful tools, but the surface exposed them as peers:

- Intake
- Paste
- Queue
- Resume Bank
- Career Pack
- Sources
- Setup

That made the user understand the system architecture before knowing what to do. The Career screen should answer the job-search loop directly: what contract needs action, what is waiting, where to paste a job, where source material lives, and what needs follow-up.

## Target Flow

```text
job post/source -> candidate/application card -> resume angle -> application/follow-up -> proof
```

The hub uses "Contracts" language, but keeps labels plain enough for career work:

- Next contract
- Application queue
- Paste a job
- Resume artifacts
- Source material
- Follow-up
- Proof

## Existing Route / Tool Map

| Route | Hub role | Existing behavior preserved |
| --- | --- | --- |
| `/career` | Contracts Hub | Guided overview and next action |
| `/candidate-intake` | Paste a Job | Manual job post -> candidate queue |
| `/job-candidates` | Application Queue | Review/save/dismiss/approve candidates |
| `/career-intake` | Direct Card | Create an application card directly |
| `/resume-bank` | Resume Artifacts | View deterministic resume modules |
| `/career-pack` | Source Material | Import and inspect Career Source Pack |
| `/job-sources` | Sources | Run approved sources and manage saved sources |
| `/source-setup` | Advanced Setup | Detect/test/save source adapters |

## What Changed

- `/career` now opens on a dominant Next Contract card powered by rules-only local state.
- The page separates primary action, queue preview, paste entry, resume/source material, source running, and follow-up/proof.
- Source setup remains reachable but is quieter and no longer the main career frame.
- "Find fit matches" still exists, but it sits under Sources instead of leading the page.
- Candidate and application previews use existing local candidates/cards only.

## What Did Not Change

- No route paths changed.
- No persistence schema changed.
- No candidate, resume module, source, or application card model changed.
- No backend, runner, parser, scraping, AI provider, auth, or cloud behavior changed.
- Global nav remains grouped and uncluttered.
- Subpages were not redesigned in this pass.

## Future Backlog

- Add a dedicated Career Proof selector if Social / Career proof needs richer filtering.
- Give Career subpages the same contract-first hierarchy in a later, smaller pass.
- Consider merging the two manual intake paths only after dogfooding shows one path is redundant.
- Add richer queue previews only if the existing candidate/card model already exposes the needed state.
- Keep setup/debug/source internals secondary unless a real blocker makes them the next useful action.
