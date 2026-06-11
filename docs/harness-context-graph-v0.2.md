# Harness Context Graph v0.2

First card-scoped integration spine for Life Harness as a personal command center.

## What this PR adds

- **Minimal context nodes** with stable IDs (`life_card:{id}`, `proof_ref:{id}`, etc.) in [`src/core/harnessContextGraph.ts`](../src/core/harnessContextGraph.ts)
- **`buildCardContextPacket(data, cardId)`** — compact, markdown-friendly context for one `LifeCard`
- **Card Detail action** — **Copy agent context** on [`app/card/[id].tsx`](../app/card/[id].tsx) (web clipboard)
- **Tests** — packet shape, career context, isolation, S3 block, strict memory policy, stable markdown

The packet header states intent explicitly:

```text
Purpose: Paste this into Codex/Cursor as context for work related to this card.
Boundary: This packet is read-only context. Do not mutate Life Harness state directly.
```

## Memory policy

Memory items have no `cardId` field today. v0.2 uses **explicit-tag-first, omit by default**:

1. Tag exactly equals `card.id`
2. Tag exactly equals normalized card title slug (e.g. `momentum-board-v0-1`)
3. Kind is `project_fact`, `decision`, or `rule` **and** match is very strong (exact title or exact career `{company} — {role}`, or company slug tag on career cards)

Otherwise the memory is omitted.

**Redaction:** `isSensitiveThreadLine()` gates title and summary. Sensitive memories are dropped entirely. When the body is long or uncertain, only **title + kind** appear in the packet.

**Tip:** Tag Memory Bank items with the card ID for reliable linkage:

```text
Tags: card-build-test
```

## What this PR intentionally does not add

- Sprint tracker or project registry UI
- Codex/Cursor execution bridge or PC automation
- Autonomous AI actions or board mutation from agents
- `/ai/code-*` gateway endpoints
- New AI provider logic
- Cloud sync / auth
- AI resume writer

## How this supports future work

### Agent Task Packets

The card packet becomes the **scope slice** of a future ticket packet. A later PR can layer files touched, acceptance criteria, and verification commands on top without inventing a second card model.

### Project Registry

`life_card:{id}` is the stable anchor for future repo path / workspace linkage. Registry entries should hang off existing card IDs, not parallel project entities.

### Assistant Action Registry

Context nodes reference the same IDs that proposed actions will target (`life_card:…`, `proof_ref:…`). Companion can eventually propose `park_card(life_card:…)` with a confirm step before `apply*()` runs.

## Usage

1. Open **Card Detail** for any card (career or non-career).
2. Tap **Copy agent context** (web only when clipboard is available).
3. Paste into Codex, Cursor, or another coding agent as read-only scope context.

## Related

- Board-wide export: [`src/core/harnessContext.ts`](../src/core/harnessContext.ts)
- Ranked Companion packet: [`src/core/contextPacketBuilder.ts`](../src/core/contextPacketBuilder.ts)
- Command center audit: [`docs/life-harness-command-center-audit.md`](life-harness-command-center-audit.md)
