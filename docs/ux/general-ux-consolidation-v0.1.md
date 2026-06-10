# General UX Consolidation v0.1

**Date:** 2026-06-10  
**Scope:** Product-structure pass — navigation hierarchy, screen headers, Raw Lab layout, progressive disclosure. Not a visual redesign from scratch.

Prior audit: [`current_ux_audit.md`](./current_ux_audit.md) (historical snapshot).

---

## Current UX issues (pre-change)

- **Nav overload:** Primary (6) + Career Tools (6) + System (3) rows visible on every screen — 15 pills before content.
- **Raw Lab scaffolding:** Two full banners + three expanded inspector panels above a small chat surface; mode prompts duplicated in empty state and composer.
- **Header inconsistency:** Six screens used `screenIntro` text instead of `PageHeader`; Progress had no header.
- **Today duplication:** "What should I do now?" and "Career Pounce" both surface pounce mission copy.
- **Progress sprawl:** Scout stats, locks, and export/import mixed with proof shelf at equal visual weight.
- **Handoff wording:** "Use board context" inside Raw Lab implied in-thread grounding.

---

## Proposed hierarchy

| Tier | Screens | Default visibility |
|------|---------|-------------------|
| Daily | Today, Board, Career, Progress, Review | Primary nav row |
| AI sidecars | Ask Harness | Primary nav; inspector collapsed by default |
| Career execution | Intake, Paste, Queue, Bank, Sources, Setup | Collapsible **Career tools** row |
| System / lab | Memory, Log, Raw Lab | Collapsible **System** row |

Raw Lab stays in System — isolated sandbox, not a daily chat tab.

---

## Acceptance criteria

- A first-time user can tell what the current screen is for within 5 seconds.
- Daily/career actions feel more important than debug/system controls.
- Raw Lab clearly communicates sandbox identity without overwhelming the page.
- Advanced/internal details accessible but not dominant in default view.
- App still feels like Life Harness (Field Ops aesthetic).
- No core data/model/AI safety rules weakened.
- **Raw Lab must never directly consume board context.** Board-grounded actions are explicit handoffs to Ask Harness only.

---

## What changed

### Navigation
- Career Tools and System nav groups are **collapsed by default** with toggle headers (`▸` / `▾`).
- Groups **auto-expand** when the active route belongs to that group.
- Primary row unchanged: Today, Board, Career, Ask, Progress, Review.

### Shared primitives
- `CollapsibleSection` — reusable accordion with optional subtitle and badge.
- `SafetyBanner` — compact warning + expandable privacy note.
- `PageHeader` — optional `actions` slot.
- `ChatComposer` — optional `placeholder` and `showQuickQuestions`.
- `InspectorSection` — thin adapter over `CollapsibleSection`.

### Screen headers
- `PageHeader` added to Progress, Career Intake, Candidate Paste, Resume Bank, Memory Bank, Log, Source Setup.
- Ask Harness inspector **defaults closed** on all layouts (including wide).

### Raw Lab
- **Chat-first layout:** header → safety banner → chat surface → toolbar → advanced panels below.
- Chat surface min-height increased (~52vh).
- Two banners merged into one `SafetyBanner`.
- Thread memory, personality, and self-memory behind **collapsed** `CollapsibleSection`s with **badges** (no auto-expand on content alone).
- Self-memory auto-expands only when reflection **proposals** need review.
- Thread budget auto-expands only on compaction **notice**.
- Handoff copy: **"Open in Ask with board context"** (routes to `/ask-harness` with digest — never in-thread grounding).
- Mode prompts centralized as `RAW_LAB_MODE_PROMPTS`; composer chips hidden until conversation starts.
- Empty state uses short mode labels.

### Today / Progress
- When primary action is pounce, Career Pounce links move into collapsed **Career shortcuts**.
- Progress: proof, warmth, cold/dormant at top; scout stats, locks, export/import in collapsed **Data & operator details**.

---

## What intentionally did not change

- Expo Router structure and route list (`ConsolidatedNav` not wired; no `/career-hub` or `/more`).
- Core board loop, rules-only behavior, S3 routing, Raw Lab isolation policy.
- Gateway, prompts, or AI provider logic.
- `ConsolidatedNav.tsx` (left for future routing ticket).

---

## Future UX backlog

- Wire `PrimaryActionHero` and `RecoveryPanel` on Today.
- Progress "week in review" narrative view.
- `/more` hub if routing ticket adds it.
- Sticky Quick Capture bar.
- Consider 5-tab nav when `/career-hub` route exists.
