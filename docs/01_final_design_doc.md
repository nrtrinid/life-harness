# 01 - Final Design Document

## Product thesis

**Life Harness** is an alive, low-friction executive-function board that helps the user become more put together by making the next useful action:

```text
obvious
small
urgent
rewarding
recoverable
```

It is a private command board that:

```text
keeps life state warm
captures ideas without making them obligations
limits active chaos
creates one useful pressure point per day
rewards starting and recovering
prevents over-optimization
makes projects resumable
collects proof of becoming more put together
```

## Core problem loop

```text
I have a lot I want to do
-> everything feels important
-> nothing has a hard deadline
-> I procrastinate
-> I look for the optimal future-saving system
-> the task expands
-> it gets late
-> the day feels ruined
-> I avoid the project
-> I start thinking about a new better idea
```

## Desired product loop

```text
Idea appears
-> captured safely
-> only a few things become active
-> today's pounce mission is chosen
-> smallest start is obvious
-> progress is rewarded immediately
-> if the day slips, salvage mode activates
-> projects stay resumable
-> proof accumulates
```

## Product promise

When the user opens the app, it should answer:

```text
What is active?
What is parked?
What changed while I was away?
What is today's main pounce?
What is the smallest start?
What can I do if the day already feels behind?
What proof do I have that I am becoming more put together?
```

## Design principles

### 1. Low friction above everything

```text
Log something in under 5 seconds.
Know what to do in under 10 seconds.
Add an idea without sorting it.
Resume a project without rereading everything.
Start a pounce block in one click.
```

### 2. One input box

Examples:

```text
worked on RPG enemy AI for 70 min
bought cart $45
texted OWASP contact
walked 25 min
new idea: local LLM life assistant
park haircut setup for now
```

The system interprets, classifies, updates, and responds.

### 3. Active limit

```text
1 Main Quest
3 Active Quests max
Everything else is Inbox, Parked, Waiting, Done, or Killed
```

### 4. Parked means safe, not failed

```text
Parked = saved for later
Killed = intentionally closed
Forgotten = system failure
```

### 5. Reward starting, re-entry, and recovery

Reward:

```text
starting
coming back
parking cleanly
salvaging a bad day
sending one external-world message
doing the ugly useful version
```

### 6. No guilt mechanics

No shame streaks. No red failure board. No "you missed yesterday."

Use:

```text
Momentum cooled.
Suggested reheat: one 10-minute action.
```

## Core life areas

```text
Build
Body
Money / Independence
Social / Career
Stability / Vices
```

### Build

Projects, coding, creative work, tools.

```text
EV Tracker / Kalshi
Text RPG
Life Harness
Local LLM
music
automation projects
web tools
```

### Body

Physical foundation.

```text
lifting
walking
running
eating
sleep
hygiene
energy
weight gain
```

### Money / Independence

Financial control and self-sufficiency.

```text
subscriptions
spending
DIY savings
haircutting
local AI replacing subscriptions
cooking
tools
```

### Social / Career

External-world momentum.

```text
job applications
networking
OWASP follow-ups
friends
family
beta testers
mentors
therapy / coaching
```

### Stability / Vices

Neutral visibility into destabilizers.

```text
weed
nicotine
sleep debt
doomscrolling
avoidance
impulse spending
overwhelm
```

This category must never feel moralistic. It is for visibility and recovery.

## Core objects

### Card

A card can be a project, goal, task cluster, idea, self-sufficiency experiment, career loop, social loop, or life area.

Fields:

```text
title
area
state
progress
warmth
why it matters
next tiny action
done-for-now condition
do lane
improve lane
trigger plan
obstacle plan
last touched
recent wins
open loops
optimization ideas
resume packet
proof items
```

### Log entry

```text
timestamp
raw text
area
linked card
type
XP
money delta
leak type
proof generated
```

### Daily state

```text
date
mode
main quest
pounce mission
smallest start
pounce window
minimum viable day status
salvage status
recent wins
```

## Card states

```text
Inbox
Active
Parked
Waiting
Done
Killed
```

### Inbox

Raw ideas. Not obligations.

Response to new idea:

```text
Captured to Inbox.
Not active yet.
```

### Active

Currently live. Max 3.

### Parked

Important but not current. Optional mini resume packet before parking:

```text
Why did I care?
Last state?
Next tiny action?
Open loops?
```

### Waiting

Blocked by outside response or dependency.

### Done

Completed or shipped.

### Killed

Intentionally closed. Killing a project can earn Clarity XP.

## Main screens

### Today

The command center.

Includes:

```text
While You Were Away briefing
current mode
main quest
pounce mission
smallest start
pounce button
active cards
body floor
recent wins
minimum viable day button
salvage options
quick capture input
```

### Board

Trello-like board with columns:

```text
Inbox
Active
Parked
Waiting
Done
Killed
```

Each card displays title, area, progress, warmth, last touched, and next tiny action.

### Card Detail

Sections:

```text
Why it matters
Next tiny action
Done-for-now
Do lane
Improve lane
Trigger plan
Obstacle plan
Resume packet
Open loops
Recent wins
Proof
Optimization parking lot
Calibration logs
```

### Progress

Shows:

```text
Quest progress bars
Identity scores
Momentum warmth
Weekly XP
Life P&L
Proof Shelf
Dormant projects
Rescued projects
Pounce sessions
Salvage wins
```

### Proof Shelf

Collects evidence that the user is becoming more put together.

Examples:

```text
Started 3 pounce sessions
Rescued Text RPG after 7 dormant days
Sent 2 career follow-ups
Walked twice
Parked 4 ideas cleanly
Saved $35 through self-sufficiency
Used Salvage Mode instead of writing off the day
```

### Log

Raw history with edit ability.

### Review

Weekly reflection:

```text
what moved
what got cold
what was over-optimized
what should be parked
what should become main quest
what proof accumulated
one patch for next week
```

Only one patch. No giant life plan.

## Final locked product statement

Life Harness is an alive, low-friction executive-function board that keeps your life state warm, creates one useful pressure point per day, rewards starting and recovery, protects against over-optimization, and gives visible proof that you are becoming a put-together, self-sufficient builder.
