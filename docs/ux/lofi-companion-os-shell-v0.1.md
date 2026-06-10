# Lo-Fi Companion OS Shell v0.1

**Branch:** `feat/lofi-companion-os-shell-v0.1`  
**Builds on:** [general-ux-consolidation-v0.1.md](./general-ux-consolidation-v0.1.md)
**Implementation plan:** [lofi-companion-os-shell-v0.1-implementation-plan.md](../plans/lofi-companion-os-shell-v0.1-implementation-plan.md)

**Status:** Implemented on `feat/lofi-companion-os-shell-v0.1`.

## Problem

Implementation structure was visible in the UI: dev-console labels ("Ask Harness Dev", "Daily command surface"), flat equal-weight Today sections, and pill-row nav without a warm companion voice. Users could not tell at a glance what mattered or what to do next.

## Theme: Lo-Fi Companion OS

Warm, cassette-era, bedroom-studio aesthetic — tiny quest loop, hedged companion voice, proof as playback. Not a full visual redesign; additive lo-fi tokens on Field Ops base.

**Font direction (future):** Outfit (body) + DM Mono (tape labels). **This pass:** system fonts + `fontLofiMono` token only — no `expo-font` wiring.

## Information hierarchy

**Primary nav (6):** Today · Board · Career · Companion · Playback · Replay

**Career tools (collapsed, wide sidebar only):** Intake · Paste · Queue · Pack · Bank · Sources

**Backroom (collapsed):** Raw Signal · Tape Archive · Log · Setup

Routes unchanged (`/ask-harness`, `/raw-lab`, `/progress`, etc.).

## What changed

- `AppShell` with sidebar (≥900px) and compact top nav (narrow) — nav injected once via `Screen`
- Nav label renames; System group label → **Backroom** (internal id kept `system`); `/source-setup` moved to Backroom only
- Lo-fi color/type tokens and card primitives (`lofiCard`, `lofiCardHero`, `CompanionNote`, `TinyQuestCard`, etc.)
- Today → **Today's Loop** with Companion note, Tiny Quest, bonus track, mutually exclusive recovery, active threads, recent proof
- Light copy on Companion, Raw Signal, Playback, Replay, Career hub, Tape Archive
- Handoff: **Open in Companion with board context**
- Raw Signal chat-first layout; advanced panels below chat; thread memory collapsed by default
- Companion inspector defaults closed on all layouts

## What did not change

- Route paths and gateway/backend
- Raw Signal containment (no in-thread board context)
- S3 / safety boundaries
- Board card action overload (Start/Done/More) — backlog
- Full Playback screen redesign — backlog
- Custom font loading — backlog
- Sticky/docked Quick Capture footer — backlog

## Before / after

| Area | Before | After |
|------|--------|-------|
| Nav voice | Ask, Progress, Review, System, Raw Lab | Companion, Playback, Replay, Backroom, Raw Signal |
| Shell | Per-screen `<Nav />` pill rows (15 pills) | `AppShell` sidebar (≥900px) or 6 primary + collapsed Backroom |
| Today | ~10 equal sections, WYWA bullets | Today's Loop: Companion note → Tiny Quest → recovery → threads → proof |
| Recovery | Full-width MVD + Salvage always at bottom | Promoted `RecoveryPanel` OR quiet `RescueRow` — never both |
| Raw handoff | Use board context | Open in Companion with board context |
| Career setup | Source Setup in career tools nav | Setup only in Backroom; Run sources on Career hub |

## Acceptance criteria

- [x] Six primary nav labels visible without expanding groups
- [x] `/job-sources` reachable from Career tools (wide) + Career hub
- [x] `/source-setup` only under Backroom
- [x] Today shows one dominant Tiny Quest + Companion prose (not bullet WYWA stack)
- [ ] Wide Today: docked capture footer (deferred — inline capture after Tiny Quest for now)
- [x] typecheck + unit tests pass

## Manual screenshot checklist

- [ ] Today wide — sidebar, Today's Loop, inline capture
- [ ] Today narrow — compact nav, inline capture
- [ ] Board — shell nav only (no duplicate Nav in screen)
- [ ] Companion — header copy, inspector collapsed
- [ ] Raw Signal — safety banner, handoff label
- [ ] Career hub — sources entry prominent

## Backlog

- Board card Start/Done/More simplification
- Outfit + DM Mono via expo-font
- Full Playback / Replay visual pass
- Sticky/docked Quick Capture footer on wide Today
- `dailyState` pounce mission write-back from briefing (UX-005)
- Progress week-in-review narrative
- `/more` hub or 5-tab ConsolidatedNav
- Migrate remaining `screenIntro` screens to `PageHeader`
- Card Detail progressive disclosure polish
