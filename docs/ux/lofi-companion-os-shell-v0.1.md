# Lo-Fi Companion OS Shell v0.1

**Branch:** `feat/lofi-companion-os-shell-v0.1`  
**Builds on:** [general-ux-consolidation-v0.1.md](./general-ux-consolidation-v0.1.md)

## Problem

Implementation structure was visible in the UI: dev-console labels ("Ask Harness Dev", "Daily command surface"), flat equal-weight Today sections, and pill-row nav without a warm companion voice. Users could not tell at a glance what mattered or what to do next.

## Theme: Lo-Fi Companion OS

Warm, cassette-era, bedroom-studio aesthetic — tiny quest loop, hedged companion voice, proof as playback. Not a full visual redesign; additive lo-fi tokens on Field Ops base.

**Font direction (future):** Outfit (body) + DM Mono (tape labels). **This pass:** system fonts + `fontLofiMono` token only — no `expo-font` wiring.

## Information hierarchy

**Primary nav (6):** Today · Board · Career · Companion · Playback · Replay

**Career tools (collapsed):** Intake · Paste · Queue · Pack · Bank · Sources

**Backroom (collapsed):** Raw Signal · Tape Archive · Log · Setup

Routes unchanged (`/ask-harness`, `/raw-lab`, `/progress`, etc.).

## What changed

- AppShell with sidebar (≥900px) and compact top nav (narrow)
- Nav label renames; System → Backroom; `/source-setup` moved to Backroom only
- Lo-fi color/type tokens and card primitives
- Today → **Today's Loop** with Companion note, Tiny Quest, bonus track, threads, proof
- Light copy on Companion, Raw Signal, Playback, Replay, Career hub, Tape Archive
- Handoff: **Open in Companion with board context**

## What did not change

- Route paths and gateway/backend
- Raw Signal containment (no in-thread board context)
- S3 / safety boundaries
- Board card action overload (Start/Done/More) — backlog
- Full Playback screen redesign — backlog
- Custom font loading — backlog

## Before / after

| Area | Before | After |
|------|--------|-------|
| Nav voice | Ask, Progress, Review, System, Raw Lab | Companion, Playback, Replay, Backroom, Raw Signal |
| Shell | Per-screen `<Nav />` pill rows | `AppShell` sidebar (≥900px) or compact top nav |
| Today | ~10 equal sections, WYWA bullets | Today's Loop: Companion note → Tiny Quest → threads → proof |
| Raw handoff | Open in Ask with board context | Open in Companion with board context |
| Career setup | Source Setup in career tools | Setup only in Backroom; Run sources on Career hub |

## Acceptance criteria

- [ ] Six primary nav labels visible without expanding groups
- [ ] `/job-sources` reachable from Career tools + Career hub
- [ ] `/source-setup` only under Backroom
- [ ] Today shows one dominant Tiny Quest + Companion prose (not bullet WYWA stack)
- [ ] Wide Today: docked capture footer; narrow: inline/expand capture after Tiny Quest
- [ ] typecheck + unit tests pass

## Manual screenshot checklist

- [ ] Today wide — sidebar, Today's Loop, docked capture
- [ ] Today narrow — compact nav, inline capture
- [ ] Board — shell nav only (no duplicate Nav in screen)
- [ ] Companion — header copy, inspector collapsed
- [ ] Raw Signal — safety banner, handoff label
- [ ] Career hub — sources entry prominent

## Backlog

- Board card Start/Done/More simplification
- Outfit + DM Mono via expo-font
- Full Playback / Replay visual pass
- PrimaryActionHero / RecoveryPanel polish outside Today
