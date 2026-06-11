# Lo-Fi Palette Lock v0.1

**Branch:** `feat/lofi-palette-lock-v0.1`
**Builds on:** [lofi-companion-os-shell-v0.1.md](./lofi-companion-os-shell-v0.1.md), [companion-chat-surfaces-v0.1.md](./companion-chat-surfaces-v0.1.md)

**Status:** Implemented on `feat/lofi-palette-lock-v0.1`.

## Problem

The app still reads as **Field Ops** — olive-green backgrounds, brass-tinted borders on everything, and terminal all-caps labels. That fights the Lo-Fi Companion OS mock: charcoal bedroom-studio base, warm off-white text, semantic accents, and cassette tape-label typography only where it belongs.

## Target palette

| Role | Token | Approx value |
|------|-------|--------------|
| App background | `lofiColors.background` | `#121214` |
| Sidebar | `lofiColors.sidebar` | `#18181B` |
| Card surface | `lofiColors.surface` | `#1E1E22` |
| Quiet surface | `lofiColors.surfaceQuiet` | `#1A1A1D` |
| Raised / hero | `lofiColors.surfaceRaised` | `#242428` |
| Primary text | `lofiColors.textPrimary` | `#EDE8DF` |
| Secondary text | `lofiColors.textSecondary` | warm off-white ~82% |
| Muted text | `lofiColors.textMuted` | warm off-white ~48% |
| Border | `lofiColors.border` | neutral warm ~8% |
| **Primary action** | `lofiColors.actionAmber` | `#C8A84B` |
| **Warning / caution** | `lofiColors.warningAmber` | `#B8923A` |
| Companion | `lofiColors.softViolet` | `#9B8BB8` |
| Raw Signal | `lofiColors.dustyBlue` | `#6B8FA3` |
| Body proof | `lofiColors.mossGreen` | `#7A9B6E` |
| Career proof | `lofiColors.fadedRose` | `#B87A7A` |

### Amber split

- **`actionAmber`** — Start/Continue buttons, active nav tape-marker, Tiny Quest hero strip, hot/build accents.
- **`warningAmber`** — warning banners, caution notices. Must not look like a primary CTA.

Legacy `cassetteAmber` aliases `actionAmber` for backward compatibility.

## Semantic exports

```ts
colorPrimaryAction → actionAmber
colorWarning → warningAmber
colorCompanion → softViolet
colorRawSignal → dustyBlue
colorProofBuild → actionAmber
colorProofCareer → fadedRose
colorProofBody → mossGreen
```

The existing `colors` object remaps to `lofiColors` so StyleSheet entries update without per-screen hex edits.

## Typography policy

**Keep uppercase + mono (tape-label language):**

- `lofiTapeLabel` — TINY QUEST, COMPANION NOTE, BONUS TRACK
- Sidebar group labels — BACKROOM, CAREER TOOLS
- Small status/data chips that read as tape metadata

**Sentence case (reduce operator console feel):**

- Section titles, column titles
- Primary/secondary button labels — Start, not START
- Chat inspector headings, small buttons
- Card warmth pills, card meta labels

## What changed

- Charcoal base replaces olive Field Ops backgrounds and amber-washed borders
- `actionAmber` vs `warningAmber` semantic split
- Sidebar active nav: left tape-marker strip + subtle surface lift (not full bordered box)
- Today cards: violet Companion note, amber Tiny Quest hero, dusty blue Bonus Track
- Quest cards and chat surfaces tuned on new tokens
- Muted text bumped slightly for card-surface legibility

## What did not change

- Routes, navigation structure, AI/gateway behavior
- Raw Signal containment and safety boundaries
- Custom font loading (Outfit + DM Mono deferred)
- Layout architecture or screen structure
- Board quest card action behavior

## Manual screenshot checklist

- [ ] Today wide — hierarchy: title → Companion note → Tiny Quest → Start
- [ ] Today narrow — compact nav, same hierarchy
- [ ] Board — quest cards, area accent strips
- [ ] Companion — violet frame/note, Backroom quiet
- [ ] Raw Signal — dusty blue frame, safety readable
- [ ] Playback · Replay · Career · Card detail — no olive dominance

## Manual contrast checklist

Verify on device/web (muted-on-card is the usual failure mode):

| Pair | Where |
|------|-------|
| Primary text on app background | Body copy, page titles |
| Muted text on card surface | Help text, inactive meta |
| `actionAmber` button text on filled primary | Tiny Quest Start, quest Start |
| `warningAmber` banner text on warning surface | Notice warning, bannerWarning |
| Inactive sidebar links | Idle nav on sidebar bg |
| Disabled buttons | Primary/secondary when disabled |

## Backlog

- Outfit (body) + DM Mono (tape labels) via `expo-font`
- Playback / Replay full visual pass
- Sticky/docked Quick Capture footer
- Wide Today NOW PLAYING / LIBRARY sidebar section labels
