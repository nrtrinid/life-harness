# Nav / Backroom Cleanup v0.1

## Product rationale

Life Harness has many powerful surfaces. Primary navigation should stay tiny: **act surfaces** for the daily loop. Everything else is **machinery** — reachable, but visually demoted under a collapsed Backroom group.

```text
Primary = cockpit lanes (Today, Board, Jobs, Companion, Playback)
Backroom = tools, labs, career machinery, logs, setup
```

## Primary nav

| Label | Route | Role |
|-------|-------|------|
| Today | `/` | Cockpit — next move, capture, recovery |
| Board | `/board` | Quest / source-of-truth lane |
| Jobs | `/career` | External pressure lane (career hub) |
| Companion | `/ask-harness` | Scout / operator lane |
| Playback | `/progress` | Proof, history, reflection lane |

Five items only. No machinery in primary.

## Backroom (collapsed)

Grouped in prose for readability; the shell renders one flat collapsed list.

**Build / agents**

- Agent Workbench (`/agent-workbench`)
- Proof Ledger (`/proof-ledger`)
- Weekly Review (`/review`)
- Log (`/log`)

**Memory / playback**

- Memory Bank (`/memory-bank`)

**Lab**

- Raw Signal (`/raw-lab`)

**Career tools**

- Resume Bank (`/resume-bank`)
- Job Sources (`/job-sources`)
- Career Pack (`/career-pack`)
- Queue (`/job-candidates`)
- Candidate Intake (`/candidate-intake`)
- Career Intake (`/career-intake`)
- Source Setup (`/source-setup`)

## What changed

- Primary order: Today → Board → Jobs → Companion → Playback
- Removed separate **Career tools** nav toggle; career machinery merged into **Backroom**
- Surfaced previously hidden career routes in Backroom (Job Sources, Career Pack, intakes, Queue)
- Labels: **Agent Workbench**, **Memory Bank** (was Workbench / Tape Archive)
- `getNavGroupForPath("/career")` now returns `primary` (Jobs hub is an act surface)
- Compact nav shows full Backroom list (Resume Bank no longer sidebar-only)

## What intentionally did not change

- No route files deleted — all `app/` screens and deep links preserved
- No screen internals, feature logic, assistant actions, or ai-gateway changes
- Card Detail (`/card/:id`) still has no nav group (contextual entry only)
- Jobs hub contextual links to sources/resume bank unchanged
- Proof Shelf → Proof Ledger link unchanged
- Feature Sprint Orchestrator not on branch — no nav entry

## Implementation

- [`src/components/navRoutes.ts`](../src/components/navRoutes.ts) — groups, labels, path classification
- [`src/components/SidebarNav.tsx`](../src/components/SidebarNav.tsx) — primary stack + one Backroom toggle
- [`src/components/navRoutes.test.ts`](../src/components/navRoutes.test.ts) — hierarchy contract tests

## Future path

- Backroom index screen (curated launcher instead of long flat list)
- Contextual tool launchers from Jobs hub, Card Detail Backroom, Playback
- Legacy career screen route consolidation (paths stay; fewer one-off screens)
- Raw Lab framed as lab-only (already Backroom)
- Companion as scoped operator over Today / Workbench without nav sprawl
