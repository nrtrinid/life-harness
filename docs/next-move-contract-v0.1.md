# Next Move Contract v0.1

## One instrument

Life Harness has grown powerful subsystems: Momentum Board, Career/Jobs, Resume Bank, Harness Context Graph, Agent Task Packets, Project Registry, Agent Session Log, Agent Workbench, and Assistant Action Registry. Without a spine, those lanes can feel like separate apps under one roof.

**Next Move Contract v0.1** adds a small routing spine:

- Every subsystem **proposes** a compact next useful move.
- **Today** is the only place that **ranks** and **plays** the top move.

Product framing:

| Lane | Role |
|------|------|
| Today | Cockpit — ranks and surfaces the top move |
| Board | Quest lane |
| Jobs / Career | External pressure lane |
| Agent Workbench | Delegation lane |
| Resume Bank | Materials lane |
| Companion | Scout lane (no collector in v0.1) |
| Raw Lab | Lab / backroom — not product center |

Lanes are not equal apps. Lanes feed Today.

## Contract fields

```ts
NextMoveContract {
  id: string;
  source: "board" | "career" | "agent" | "recovery" | "companion";
  title: string;
  whyNow: string;
  doAction: string;
  improveLock?: string;
  proofOnDone: string;
  targetRoute?: string;
  cardId?: string;
  urgency: "low" | "medium" | "high";
  effortMinutes: 5 | 10 | 25;
  pressureLabel: string;
  createdAt: string;
}
```

`pressureLabel` explains why the move surfaced (e.g. `Follow-up due`, `Main quest`, `Agent result waiting`).

`NextMoveSummary` returns `primary`, `backup`, and a ranked `candidates` list (capped at 10).

## Collectors

Pure core logic in `src/core/nextMoveContract.ts`. No state mutation, no ai-gateway calls.

### Board

Uses `getActiveLimitStatus`, `getMainQuest`, active cards with `nextTinyAction`, and neglected/cold active cards via warmth helpers. S3 cards excluded via `shouldIncludeCard`.

### Career

**At most one** career contract per build:

1. `getFollowUpsDue` (first due card), or
2. `buildCareerHubSummary(...).nextAction`

### Agent

Uses `buildAgentWorkbenchSummary` — does **not** re-implement ready-to-delegate filtering. Cards with in-flight sessions stay excluded from `readyToDelegate`.

Emits up to three signals: needs-review session, in-motion session, ready-to-delegate card.

### Recovery

Uses `generateWhileYouWereAway` + `computeRecoveryVisibility` (`showSalvage`, `showMvd`, `shouldPromote`). Fallback recovery contract when no work contracts exist.

## Ranking

Deterministic, no LLM:

1. Urgency tier (high > medium > low)
2. Lane boosts (follow-up, agent review, main quest, over-limit, recovery promotion, ready-to-delegate)
3. Active card state boost
4. Tie-break: source priority (`career > agent > board > recovery > companion`), then title

**Rank first, then dedupe by `cardId`**, keeping the highest-ranked contract per card. Cardless recovery contracts only dedupe when they share the same `id`.

## Today integration

`app/index.tsx` calls `buildNextMoveSummary` and renders `NextMoveContractPanel` **below** the existing Today mission (`TinyQuestCard`), above Quick Capture.

The panel shows Move, Why, Do, Improve, Proof after, Pressure, an Open link when `targetRoute` is set, and a smaller backup move line.

**v0.1 keeps Today mission unchanged.** Unifying Today mission and Next Move Contract is future work.

## Intentionally not added

- LLM ranking
- New ai-gateway calls
- Raw Lab changes
- Assistant Action Registry changes
- Sprint tracker, PC automation, Codex/Cursor execution
- Browser automation
- New project dashboard
- Broad nav redesign
- Destructive actions
- Cloud sync / auth
- Major Today redesign
- New source of truth for cards, projects, or sessions

## Future path

- Richer lane collectors (resume readiness, companion proposals)
- Nav cleanup around lanes vs backroom
- Companion can propose Next Move Contracts when committed state exists
- Assistant Action Registry can approve actions from contracts
- Agent Workbench remains delegation lane, not a separate product center
- Unify Today mission and Next Move Contract into one cockpit CTA
