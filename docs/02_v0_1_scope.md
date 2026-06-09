# 02 - Life Harness v0.1 Scope

## v0.1 product goal

Build the smallest usable version that proves the core behavior:

```text
Open app -> know what matters -> start one thing -> log it -> see progress -> recover if behind.
```

v0.1 is not a full life OS. It is a local, ugly, fast prototype that tests whether the loop actually makes the user come back.

## Build in v0.1

```text
Expo + React Native + TypeScript app
local seed data/state
Today screen
Board screen
Progress screen
Log screen
Card Detail screen
one-sentence capture
cards and card states
active limit
While You Were Away briefing
Pounce Mission
Pounce Button
Minimum Viable Day
Salvage Mode
Proof Shelf
Momentum Warmth
basic XP
next tiny action
do vs improve split
optimization parking lot
resume packet fields
simple weekly review
use-before-improve locks
```

## Do not build in v0.1

```text
auth
cloud sync
mobile widgets
notifications
bank integration
calendar integration
GitHub integration
voice assistant
full AI autonomy
local LLM setup
OpenVINO
llama.cpp
IPEX-LLM
beautiful UI
complex achievements
leaderboards
daily questionnaires
automatic messages
automatic applications
automatic trading
```

## v0.1 screens

### Today

Must include:

```text
While You Were Away
Main Quest
Pounce Mission
Smallest Start
Pounce Button
Minimum Viable Day Button
Salvage Mode Button
Active Cards Summary
Quick Capture Input
```

Example:

```text
TODAY

While You Were Away:
- EV Tracker / Kalshi is hot.
- Career / Networking is cold.
- Local LLM Setup is dormant.
- Active cards are 4/3. Park one soon.
- Suggested pounce: scaffold Life Harness v0.1.

Main Quest:
Life Harness

Pounce Mission:
Scaffold v0.1 app.

Smallest Start:
Open repo and create app shell.

[POUNCE]
[MINIMUM VIABLE DAY]
[SALVAGE MODE]
```

### Board

Columns:

```text
Inbox
Active
Parked
Waiting
Done
Killed
```

Each card shows:

```text
title
area
progress
warmth
next tiny action
last touched
```

No drag-and-drop required. Buttons are enough.

### Progress

Include:

```text
Quest progress bars
Momentum warmth
Weekly XP
Proof Shelf
Leaks / savings
Salvage wins
Pounce sessions
Use-before-improve locks
```

### Log

Include:

```text
raw entries
classification
linked card
XP
edit button
```

### Card Detail

Include:

```text
why it matters
next tiny action
done-for-now
do lane
improve lane
trigger plan
obstacle plan
resume packet
open loops
optimization ideas
recent wins
```

## Seed cards

```text
EV Tracker / Kalshi
Area: Build
State: Active
Progress: 72
Warmth: Hot
Next tiny action: Review one market and write a fair-value note.

Text RPG
Area: Build
State: Active
Progress: 62
Warmth: Warm
Next tiny action: Write one enemy behavior test.

Fitness Return
Area: Body
State: Active
Progress: 20
Warmth: Cooling
Next tiny action: Walk 10 minutes or do one small lift session.

Career / Networking
Area: Social / Career
State: Parked
Progress: 15
Warmth: Cold
Next tiny action: Send one follow-up message.

Life Harness
Area: Build
State: Active
Progress: 10
Warmth: Hot
Next tiny action: Scaffold v0.1 app.

Local LLM Setup
Area: Money / Independence
State: Parked
Progress: 15
Warmth: Dormant
Next tiny action: Pick one use case before researching models.

Haircut Setup
Area: Money / Independence
State: Parked
Progress: 5
Warmth: Dormant
Next tiny action: List starter tools.

Music Production
Area: Build
State: Inbox
Progress: 0
Warmth: Cold
Next tiny action: Capture first small project idea.
```

## Core interactions

### Pounce button

On click:

```text
log +10 Initiation XP
increment pounce session count
add proof item: Started pounce mission
```

### Minimum Viable Day

Actions:

```text
Eat something real.
Move 10 minutes.
Send one message OR open one project for 10 minutes.
Write tomorrow's first move.
```

When completed:

```text
log +30 Rescue XP
add proof item: Preserved the day
```

### Salvage Mode

Options:

```text
10-minute walk
send one text
open repo for 10 minutes
eat something real
write tomorrow's first move
```

When one is selected:

```text
log +30 Rescue XP
add proof item: Used Salvage Mode
```

### Quick Capture

Rule-based parsing:

```text
starts with "new idea:" -> create Inbox card
contains "worked on", "coded", "built" -> Build win
contains "walked", "lifted", "ran", "ate" -> Body win
contains "texted", "emailed", "applied", "follow-up" -> Social / Career win
contains "bought", "$", "subscription" -> Money / Stability log
contains "park" -> attempt to park matching card by title substring
```

After logging:

```text
update log list
update proof shelf if appropriate
update linked card last touched
update weekly XP totals
```

## Acceptance criteria

The prototype works if:

```text
I can open it and know what matters in under 10 seconds.
I can log something in under 5 seconds.
I can add an idea without making it active.
I can see Active vs Parked clearly.
I can click Pounce and get credit for starting.
I can use Minimum Viable Day when I feel behind.
I can use Salvage Mode when the day feels dead.
I can see proof that I moved life forward.
I can tell which projects are hot, warm, cooling, cold, or dormant.
I can park an optimization instead of letting it hijack the task.
I want to open it again because it feels alive and useful.
```

The prototype fails if:

```text
it becomes a guilt list
logging feels like homework
everything becomes active
points feel fake
the board becomes cluttered
the app requires daily maintenance
building the app replaces using the app
```
