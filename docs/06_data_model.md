# 06 - Data Model

## Type unions

```ts
type LifeArea =
  | "build"
  | "body"
  | "money_independence"
  | "social_career"
  | "stability_vices";

type CardState =
  | "inbox"
  | "active"
  | "parked"
  | "waiting"
  | "done"
  | "killed";

type Warmth =
  | "hot"
  | "warm"
  | "cooling"
  | "cold"
  | "dormant";

type LogType =
  | "win"
  | "leak"
  | "idea"
  | "pounce"
  | "salvage"
  | "mvd"
  | "clarity"
  | "calibration";
```

## Card

```ts
interface LifeCard {
  id: string;
  title: string;
  area: LifeArea;
  state: CardState;
  progress: number;
  warmth: Warmth;
  whyItMatters?: string;
  nextTinyAction: string;
  doneForNow?: string;
  doLane?: string;
  improveLane?: string;
  triggerPlan?: TriggerPlan;
  obstaclePlan?: ObstaclePlan;
  lastTouched?: string;
  recentWins: string[];
  openLoops: string[];
  optimizationIdeas: string[];
  resumePacket?: ResumePacket;
  proofItemIds: string[];
  sensitivity?: SensitivityLevel;
}
```

## Trigger plan

```ts
interface TriggerPlan {
  cue: string;
  action: string;
}
```

Example:

```json
{
  "cue": "I open my laptop before 2 PM",
  "action": "click Pounce and work for 10 minutes"
}
```

## Obstacle plan

```ts
interface ObstaclePlan {
  wish?: string;
  outcome?: string;
  obstacle: string;
  plan: string;
}
```

## Resume packet

```ts
interface ResumePacket {
  whyItMatters?: string;
  lastState: string;
  nextTinyAction: string;
  openLoops: string[];
  reentryAction: string;
}
```

## Log entry

```ts
interface LifeLogEntry {
  id: string;
  timestamp: string;
  rawText: string;
  area: LifeArea;
  cardId?: string;
  type: LogType;
  xp: number;
  moneyDelta?: number;
  leakType?: "vice" | "money" | "energy" | "open_loop" | "scope_creep" | "avoidance";
  proofItemId?: string;
  sensitivity?: SensitivityLevel;
}
```

## Proof item

```ts
interface ProofItem {
  id: string;
  timestamp: string;
  title: string;
  area?: LifeArea;
  cardId?: string;
  sourceLogId?: string;
}
```

Examples:

```text
Started pounce mission.
Worked on Text RPG.
Used Salvage Mode.
Parked project cleanly.
Captured new idea without activating it.
```

## Daily state

```ts
interface DailyState {
  date: string;
  mode: "normal" | "pounce" | "hyperfocus" | "salvage" | "recovery" | "reentry";
  mainQuestId?: string;
  pounceMission?: string;
  smallestStart?: string;
  pounceWindowStart?: string;
  pounceWindowEnd?: string;
  pounceStarted: boolean;
  minimumViableDayCompleted: boolean;
  salvageCompleted: boolean;
}
```

## Briefing

```ts
interface Briefing {
  id: string;
  createdAt: string;
  title: string;
  updated: string[];
  detected: string[];
  prepared: string[];
}
```

Example:

```json
{
  "title": "While You Were Away",
  "updated": ["EV Tracker / Kalshi is hot."],
  "detected": ["Career / Networking is cold.", "Active cards are 4/3."],
  "prepared": ["Suggested pounce: scaffold Life Harness v0.1."]
}
```

## Sensitivity levels

```ts
type SensitivityLevel = "S0" | "S1" | "S2" | "S3";
```

```text
S0 - safe/boring; cloud AI allowed if enabled
S1 - personal but okay; cloud AI allowed if enabled
S2 - sensitive; local AI preferred
S3 - never send to AI; rules/manual only
```

## Core helpers

Suggested core logic:

```text
computeWarmth(card, logs)
computeXP(log)
parseQuickCapture(rawText)
generateProofItem(log)
enforceActiveLimit(cards)
generateWhileYouWereAway(cards, logs, dailyState)
detectScopeCreep(rawText)
createResumePacket(card)
checkUseBeforeImproveLocks(logs)
```
