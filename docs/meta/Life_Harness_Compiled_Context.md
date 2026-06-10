# Life Harness - Compiled Context

This file combines the key documents from the Life Harness documentation bundle.



---

# Life Harness Documentation Bundle

This bundle captures the design context for **Life Harness / Momentum Board**: a low-friction, cross-platform executive-function board designed to help the user become more put together by making the next useful action obvious, small, urgent, rewarding, and recoverable.

## What is included

```text
docs/
  00_project_overview.md
  01_final_design_doc.md
  02_v0_1_scope.md
  03_motivation_layer.md
  04_evidence_informed_workflows.md
  05_product_rules.md
  06_data_model.md
  07_tech_stack_and_architecture.md
  08_ai_provider_and_a770_plan.md
  09_agent_development_guide.md
  10_future_roadmap.md
  11_backlog_and_use_before_improve_locks.md

architecture/
  proposed_repo_structure.md
  supabase_schema_sketch.sql

prompts/
  first_codex_prompt.md
  second_codex_review_prompt.md
  feature_ticket_prompt_template.md

tickets/
  001_scaffold_expo_app.md
  002_core_types_seed_data.md
  003_today_screen.md
  004_board_screen.md
  005_quick_capture.md
  006_pounce_salvage_mvd.md
  007_progress_proof_warmth.md
  008_card_detail.md
  009_while_you_were_away.md
  010_weekly_review_stub.md

AGENTS.md
```

## Recommended use

1. Start a new repo named `life-harness`.
2. Copy `AGENTS.md`, `docs/`, `prompts/`, `architecture/`, and `tickets/` into the repo.
3. Run Codex from the repo root.
4. Start with `prompts/first_codex_prompt.md`.
5. Keep v0.1 brutally small. Do not add AI, sync complexity, notifications, or integrations until the core loop proves useful.

## Product thesis

> Life Harness is an alive, low-friction executive-function board that keeps your life state warm, creates one useful pressure point per day, rewards starting and recovery, protects against over-optimization, and gives visible proof that you are becoming a put-together, self-sufficient builder.

## Most important v0.1 features

```text
While You Were Away
Pounce Mission
Minimum Viable Day
Salvage Mode
Proof Shelf
Momentum Warmth
Active / Parked board
One-sentence capture
Do vs Improve split
Use-before-improve locks
Resume Packets
```

## Non-negotiable philosophy

This app should help the user act. It should not become another elaborate system to maintain.

```text
If a feature does not help the user start sooner, recover faster, capture faster, resume easier, see progress, or reduce overwhelm, park it.
```


---

# 00 - Project Overview

## Working names

```text
Life Harness
Momentum Board
Pounce Board
Executive Function Harness
Outside Brain
Life Command Board
Momentum OS
Odysseus
```

Use **Momentum Board** for the practical v0.1 product. Use **Life Harness** for the larger vision.

## One-line thesis

Life Harness is an alive, low-friction executive-function board that keeps your life state warm, creates one useful pressure point per day, rewards starting and recovery, protects against over-optimization, and gives visible proof that you are becoming a put-together, self-sufficient builder.

## What it is

A cross-platform personal command board that combines:

```text
Trello-like board
one-sentence capture
daily pounce mission
minimum viable day
salvage mode
proof shelf
momentum warmth
resume packets
anti-over-optimization guardrails
future AI scout/operator layer
```

## What it is not

```text
not a generic to-do app
not a Notion clone
not a habit tracker
not a journal replacement
not an autonomous agent that lives your life
not a therapy replacement
not a local LLM project first
not a productivity dashboard you have to maintain
```

## Primary user problem

The user has many ideas and bursts of motivation, but struggles with:

```text
procrastination without outside pressure
difficulty starting good-for-me tasks
over-optimizing tasks until they expand
project abandonment and painful re-entry
too many open loops
declaring the day dead after a certain time
low tolerance for boring habit tracking
needing visible payoff
```

## Primary product response

```text
Too many ideas -> Inbox, Active limit, Parked state
No pressure -> Pounce Mission, Commitment Mode later
Trouble starting -> Smallest Start, Pounce Button, Initiation XP
Day feels dead -> Minimum Viable Day, Salvage Mode
Over-optimizing -> Do vs Improve, Optimization Parking Lot, Use-before-improve locks
Project abandonment -> Resume Packets, Dormant detection, Re-entry XP
Static board gets ignored -> While You Were Away, Momentum Warmth
Need payoff -> Proof Shelf, XP, progress bars, Life P&L
```

## Core screens

```text
Today
Board
Progress
Log
Card Detail
Review
```

## v0.1 success condition

The app is successful if the user opens it again because it makes life feel less mentally expensive.

Concrete v0.1 win:

```text
Open app on phone/laptop -> see Today -> click Pounce -> log one sentence -> Proof Shelf updates -> While You Were Away feels useful.
```


---

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


---

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


---

# 03 - Motivation Layer

## Purpose

The Motivation Layer exists to make the app feel fresh, useful, forgiving, and worth reopening.

It should not add random dopamine noise. It should create motivation from real state changes, useful next actions, proof of progress, and recovery paths.

## Core motivation features

```text
While You Were Away
Pounce Mission / Boss Fight
Minimum Viable Day
Salvage Mode
Proof Shelf
Identity Scores
Momentum Warmth
Useful Wildcard Quest
Commitment Mode
Use-before-improve locks
```

For v0.1, prioritize:

```text
While You Were Away
Pounce Mission
Minimum Viable Day
Salvage Mode
Proof Shelf
Momentum Warmth
Use-before-improve locks
```

## 1. While You Were Away

Signature alive feature.

Purpose:

```text
make the system feel fresh
reduce re-entry friction
show what changed
prepare next actions
create return desire
```

Example:

```text
WHILE YOU WERE AWAY

Updated:
- EV Tracker progress +2%.
- Text RPG resume packet refreshed.
- Proof Shelf updated with 2 wins.

Detected:
- Career is cold.
- Fitness is cooling.
- Active quests are over limit: 4/3.

Prepared:
- Today's pounce mission.
- One salvage option.
- One career follow-up prompt.
- One project re-entry prompt.
```

The alive feeling should come from processing actual life state, not random motivation.

## 2. Daily Pounce Mission / Boss Fight

One highlighted action per day.

Purpose:

```text
create artificial pressure
reduce choice overload
make action feel urgent
```

Recommended UI term: **Pounce Mission**.

Optional theme term: **Boss Fight**.

Example:

```text
Today's Pounce:
Send one career follow-up.

Smallest Start:
Open messages and write one sentence.

Done-for-now:
Message sent or draft saved.

Reward:
+10 Initiation XP
+50 Career XP
```

## 3. Minimum Viable Day

For bad days.

Purpose:

```text
prevent "day is dead" thinking
create a no-thinking recovery path
preserve momentum
```

Button:

```text
Minimum Viable Day
```

Output:

```text
Minimum Viable Day

1. Eat something real.
2. Move 10 minutes.
3. Send one message OR open one project for 10 minutes.
4. Write tomorrow's first move.

Completion:
Day preserved.
+Rescue XP
```

## 4. Salvage Mode

For when the main window was missed.

Purpose:

```text
recover late in the day
avoid all-or-nothing collapse
convert failure into re-entry
```

Example:

```text
Main window missed.
Day not dead.

Pick one:
- 10-minute walk
- send one text
- open repo for 10 minutes
- eat something real
- write tomorrow's first move

Reward:
+30 Rescue XP
Momentum preserved.
```

## 5. Proof Shelf

Purpose:

```text
make progress visible
build identity evidence
replace streak guilt with proof
```

Examples:

```text
sent resume
worked on RPG
parked project cleanly
walked
saved money
resumed dormant project
used salvage mode
completed pounce
```

This connects to the desired identity:

```text
I am becoming a put-together, self-sufficient builder.
```

## 6. Identity Scores

Simple identity categories:

```text
Builder
Operator
Body
Social / Career
Self-Sufficient
Stable
```

Example:

```text
Builder          ███████░░░
Operator         ████░░░░░░
Self-Sufficient  ███░░░░░░░
Body             ██░░░░░░░░
Career           ██░░░░░░░░
Stable           ████░░░░░░
```

Use carefully. They should be motivating, not judgmental.

## 7. Momentum Warmth

Replaces streaks.

Statuses:

```text
Hot
Warm
Cooling
Cold
Dormant
```

Example:

```text
EV Tracker: Hot
Text RPG: Warm
Fitness: Cooling
Career: Cold
Local LLM: Dormant
```

Prompt:

```text
Career is cold.
Suggested reheat:
Send one follow-up or paste one job post.
```

## 8. Useful Wildcard Quest

For novelty-seeking without chaos.

Rules:

```text
one wildcard per day max
must be useful
cannot create a new active project by default
```

Examples:

```text
Wildcard Quest:
Rescue one parked project for 10 minutes.

Useful Side Quest:
Update the resume packet for one dormant card.

Random Useful Action:
Park or kill one old idea to reduce mental debt.
```

## 9. Commitment Mode

Optional outside pressure.

Example:

```text
Commitment:
Complete 3 pounce sessions by Friday.

Stakes:
Send weekly summary to accountability friend if missed.
```

Should be optional, not forced.

## 10. Use-before-improve locks

Critical for preventing over-optimization.

Examples:

```text
Calendar integration locked.
Unlock condition: Use manual pounce mode 7 times.

Resume automation locked.
Unlock condition: Submit 5 applications manually.

GitHub auto-sync locked.
Unlock condition: Log 10 build sessions manually.

AI weekly review locked.
Unlock condition: Complete 3 manual weekly reviews.
```

## What not to add yet

Avoid:

```text
leaderboards
tons of badges
complex achievements
daily questionnaires
mood graphs everywhere
big analytics dashboards
full AI autonomy
automatic applications
automatic messages
complicated scoring formulas
```

## Final Motivation Layer thesis

The system should create return desire through:

```text
fresh briefings
one daily pressure point
immediate visible progress
proof of identity change
forgiving recovery paths
warmth instead of streak failure
useful novelty
outside pressure when needed
locks that prevent overbuilding
```


---

# 04 - Evidence-Informed Workflows

## Philosophy

The app should be evidence-informed, not research-bloated.

Use research-backed mechanisms underneath, but keep the interface low-friction and tailored to the user.

Bad UX:

```text
Fill out a WOOP form.
Fill out an if-then worksheet.
Fill out a time estimate.
Answer a motivation survey.
```

Good UX:

```text
Today’s Pounce:
EV Tracker, 10 minutes.

Trigger:
After coffee.

Likely obstacle:
Over-optimizing.

Done-for-now:
One market note.

[POUNCE]
```

## Core workflows

```text
Trigger Plan
Obstacle Plan
Pressure Contract
Do vs Improve Split
Optimization Parking Lot
Calibration Log
Resume Packet
Loop Breaker
Mastery / Nourish Floor
```

## 1. Trigger Plan

For starting.

Format:

```text
If [cue], then [tiny action].
```

Example:

```text
If I open my laptop before 2 PM,
then I click Pounce and work on EV Tracker for 10 minutes.
```

Purpose:

```text
turn vague intention into cue-linked action
reduce task initiation friction
```

## 2. Obstacle Plan

For predictable failure points.

Format:

```text
Wish:
Outcome:
Obstacle:
Plan:
```

App version:

```text
Goal:
Become more put together.

Obstacle:
I procrastinate when there is no outside pressure.

Plan:
If it hits 1 PM with no progress, then I click Pounce for 10 minutes.
```

## 3. Pressure Contract

For weak deadlines.

Example:

```text
If I do not complete 3 pounce sessions this week,
then I send my weekly report to an accountability friend.
```

Pressure contracts are optional because too much pressure can create avoidance.

## 4. Do vs Improve Split

For over-optimization.

Every meaningful task has:

```text
Do the thing:
The smallest real-world useful action.

Improve the system:
The tooling or optimization idea.
```

Example:

```text
Card:
Resume / Career

Do the thing:
Send current resume to one contact.

Improve the system:
Build modular resume generator later.
```

## 5. Optimization Parking Lot

When scope expands:

```text
Scope creep detected.

Original:
Apply to one job.

Expanded:
Rewrite resume, build portfolio, research ATS, create tracker.

Suggested reset:
Send current resume to one person.
Park optimization.
```

## 6. Calibration Log

For tasks that take way longer than expected.

Format:

```text
Task:
Estimate:
Actual:
Why did it expand?
Patch:
```

Example:

```text
Task:
Update resume bullet.

Estimate:
20 min

Actual:
2 hours

Reason:
Turned into resume-system redesign.

Patch:
Next time define done-for-now before starting.
```

## 7. Resume Packet

For abandoned projects.

Fields:

```text
why it matters
last known state
next tiny action
open loops
recent wins
re-entry action
```

Example:

```text
Project:
Text RPG

Why it matters:
Make the tactical text RPG I actually want to play.

Last state:
Enemy behavior and combat loops were being shaped.

Next tiny action:
Open repo and write one enemy behavior test.

Re-entry:
Read this packet, then work for 10 minutes.
```

## 8. Loop Breaker

For recurring thought traps.

Examples:

```text
Thought:
It is too late now.

Counter-action:
Open Salvage Mode.
```

```text
Thought:
I need the optimal solution first.

Counter-action:
Do ugly version now. Park optimization.
```

```text
Thought:
I abandoned this, so re-entry will suck.

Counter-action:
Open Resume Packet. Start 10 minutes.
```

## 9. Mastery / Nourish Floor

To avoid pure grind.

Every day ideally includes:

```text
one Mastery action
one Nourish action
```

Examples:

```text
Mastery:
work on EV Tracker for 20 min
send one career follow-up
ship one RPG patch

Nourish:
walk
eat real meal
music
clean room
call friend
```

## Pattern-to-workflow map

```text
Problem: I do not start.
Workflow: Trigger Plan + Pounce Button.
```

```text
Problem: No outside pressure.
Workflow: Pressure Contract + Pounce Window.
```

```text
Problem: I declare the day dead.
Workflow: Loop Breaker + Salvage Mode + Minimum Viable Day.
```

```text
Problem: I over-optimize.
Workflow: Do vs Improve + Calibration Log + Use-before-improve locks.
```

```text
Problem: I abandon projects.
Workflow: Resume Packets + Dormant detection.
```

```text
Problem: I avoid boring tasks.
Workflow: Immediate reinforcement + task shrinking.
```

```text
Problem: I get unbalanced during hyperfocus.
Workflow: Hyperfocus Mode + Body Floor.
```


---

# 05 - Product Rules

## Non-negotiable rules

```text
No guilt streaks.
No huge task lists as the default view.
No daily questionnaire as the core UX.
No complex scoring formulas in v0.1.
No AI or integrations as v0.1 dependencies.
No feature that makes the user maintain the system instead of act.
```

## Active limit

```text
Maximum 3 Active cards.
Maximum 1 Main Quest.
New ideas enter Inbox.
Activating a new card when at limit requires parking, finishing, waiting, or killing another card.
```

## New idea rule

Every new idea gets this response:

```text
Captured to Inbox.
Not active yet.
```

## Parked rule

```text
Parked means safe, not failed.
```

Parking should be easy and optionally capture a resume packet.

## Use-before-improve rule

Do the manual version first.

Examples:

```text
Calendar integration locked until 7 pounce sessions.
Resume automation locked until 5 manual applications.
GitHub integration locked until 10 manual build logs.
AI classification locked until 20 manual logs.
```

## Do vs Improve rule

Every significant task has two lanes:

```text
Do the thing.
Improve the system.
```

The app should push the smallest real-world useful action first.

## Done-for-now rule

Before starting a task, define:

```text
What counts as done today?
What is not allowed to expand today?
```

Example:

```text
Mission:
Update resume.

Done-for-now:
Replace 3 bullets and send to one person.

Not allowed today:
Build a resume automation system.
```

## Salvage rule

When the ideal window is missed, the app must not shame the user.

It should say:

```text
Day not dead.
Pick one salvage action.
```

## Warmth rule

Use warmth instead of streak failure.

```text
Hot
Warm
Cooling
Cold
Dormant
```

If a project cools:

```text
Suggested reheat: one 10-minute action.
```

## AI approval rule

The system can prepare. The user approves.

AI may draft, summarize, classify, and suggest. It must not automatically:

```text
send messages
submit applications
spend money
execute trades
delete projects
make commitments
change important files
```

## Feature validity test

A feature is valid only if it helps one of these:

```text
start sooner
recover faster
capture faster
resume easier
see progress
reduce overwhelm
prevent over-optimization
create useful pressure
```

If not, park it.


---

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


---

# 07 - Tech Stack and Architecture

## Recommended stack

```text
App:
Expo + React Native + TypeScript

Cross-platform target:
iPhone / Android / Web

v0.1 state:
local seed data / local state

v0.2+ shared source of truth:
Supabase Postgres

Background alive jobs later:
Supabase Edge Functions + Cron

AI layer later:
AI Provider Gateway with rules/cloud/local providers

Repo:
monorepo-style structure with docs, app, core package, prompts, tickets
```

## Why Expo

Expo gives a single TypeScript/React Native app that can target phone and web. Since the desired product should eventually exist on both phone and computer, Expo is a strong starting point.

## Why not local-only first

A local-only desktop app would be easy to build, but the actual product needs phone + computer continuity.

v0.1 can be local state only to validate UX, but the architecture should anticipate shared state.

## Why Supabase later

Supabase is a practical v0.2 source of truth because it gives:

```text
Postgres
Auth
Realtime APIs
Edge Functions
Cron-compatible background jobs
Storage
```

But Supabase should be treated as v0.1/v0.2 infrastructure, not a forever prison.

Keep core logic portable so future options remain possible:

```text
hosted Supabase
self-hosted Supabase
local Postgres
SQLite/local-first mode
local AI gateway
cloud AI
no AI
```

## Architecture layers

```text
Expo App
  - Today
  - Board
  - Progress
  - Log
  - Card Detail

Core Package
  - types
  - scoring
  - warmth
  - parsing
  - guards
  - proof
  - briefings
  - sensitivity
  - ai routing later

Data Layer
  - local seed state in v0.1
  - Supabase in v0.2+

Background Jobs Later
  - generate briefings
  - detect dormant cards
  - compute warmth
  - prepare pounce mission
  - draft weekly review

AI Gateway Later
  - rules provider
  - cloud provider
  - local A770 provider
```

## Suggested repo structure

```text
life-harness/
  AGENTS.md
  README.md

  docs/
    00_project_overview.md
    01_final_design_doc.md
    02_v0_1_scope.md
    03_motivation_layer.md
    04_evidence_informed_workflows.md
    05_product_rules.md
    06_data_model.md
    07_tech_stack_and_architecture.md
    08_ai_provider_and_a770_plan.md
    09_agent_development_guide.md
    10_future_roadmap.md
    11_backlog_and_use_before_improve_locks.md

  app/
    _layout.tsx
    index.tsx
    board.tsx
    progress.tsx
    log.tsx
    card/[id].tsx

  src/
    components/
    data/
      seed.ts
    core/
      types.ts
      scoring.ts
      warmth.ts
      parsing.ts
      guards.ts
      proof.ts
      briefing.ts
```

Future monorepo version:

```text
life-harness/
  apps/
    mobile/
  packages/
    core/
  supabase/
    migrations/
    functions/
  services/
    ai-gateway/
```

## Background alive behavior

Do not rely on the phone to do all background work. Mobile background execution can be constrained.

For reliable future "While You Were Away":

```text
Supabase Cron
-> calls Edge Function
-> scans cards/logs
-> writes briefing rows
-> app displays briefing on open
```

v0.1 should fake this by computing briefings from local state on app open.

## First milestone

```text
Open app on phone/laptop
-> see Today
-> click Pounce
-> log one sentence
-> Proof Shelf updates
-> While You Were Away feels useful
```


---

# 08 - AI Provider and Intel Arc A770 Plan

## Core principle

Do not make local AI or the Intel Arc A770 the foundation of v0.1.

The app should work in this order:

```text
rules-only -> cloud AI optional -> local A770 provider optional -> full operator layer later
```

## Why

The product's first value is not AI. It is the executive-function board:

```text
Today screen
Active / Parked board
Pounce Mission
Minimum Viable Day
Salvage Mode
Proof Shelf
Momentum Warmth
While You Were Away
```

These should all work without any LLM.

## A770 role

The Intel Arc A770 is useful later as a private local AI provider for lightweight operator tasks.

Good future uses:

```text
log classification
short summaries
card resume packets
pounce suggestions
weekly review drafts
private reflections
small RAG over Life Harness data
local embeddings
experimentation with quantized small/medium models
```

Not ideal as the foundation for:

```text
giant coding-agent workflows
large context reasoning
heavy multi-agent orchestration
replacing top cloud models
always-on Jarvis behavior
```

## AI Gateway architecture

```text
Life Harness App
  -> Core API / data layer
  -> AI Gateway
      -> rules provider
      -> cloud provider
      -> local A770 provider
      -> disabled/no-AI provider
```

The app should call task-level endpoints, not model-specific endpoints:

```text
POST /ai/classify-log
POST /ai/suggest-pounce
POST /ai/summarize-card
POST /ai/generate-briefing
POST /ai/create-resume-packet
POST /ai/detect-scope-creep
POST /ai/weekly-review
```

## Provider interface sketch

```ts
type AIProvider =
  | "none"
  | "rules"
  | "cloud_openai"
  | "cloud_groq"
  | "cloud_anthropic"
  | "local_openvino"
  | "local_llamacpp_sycl"
  | "local_ipex_llm";

type AITask =
  | "classify_log"
  | "suggest_pounce"
  | "summarize_card"
  | "generate_briefing"
  | "create_resume_packet"
  | "detect_scope_creep"
  | "weekly_review";
```

## Sensitivity levels

Every future AI call should check sensitivity.

```text
S0 - safe / boring
Cloud AI allowed if enabled.

S1 - personal but okay
Cloud AI allowed if enabled.

S2 - sensitive
Local AI preferred.

S3 - never send to AI
Rules-only or manual only.
```

Examples:

```text
Text RPG implementation note -> S0/S1
EV Tracker project note -> S1
Career application details -> S1/S2
Money/vice logs -> S2
Therapy/reflection notes -> S3 default
```

## Phases

### v0.1 - no AI

```text
rules-only behavior
local seed data
no provider integration
AI provider interface can be documented but not implemented
```

### v0.2 - stronger rules

```text
rule-based classification
computed warmth
computed briefings
dormant detection
use-before-improve locks
weekly review stub
```

### v0.3 - cloud AI optional

```text
classification
summaries
pounce suggestions
scope creep detection
resume packet drafts
weekly review drafts
```

### v0.4 - local A770 gateway

Desktop service:

```text
life-ai-gateway
  /health
  /classify-log
  /summarize-card
  /suggest-pounce
  /generate-briefing
```

Providers to experiment with later:

```text
OpenVINO
llama.cpp SYCL
IPEX-LLM
other Intel-compatible runtime
```

### v1.0 - operator layer

```text
background jobs
approval queue
drafts
integrations
GitHub
calendar
career repo
spending
fitness
local/cloud routing
```

## AI rule

The system can prepare. The user approves.

Do not allow AI to automatically:

```text
send messages
submit applications
spend money
execute trades
delete cards
make commitments
change important files
```

## Final recommendation

The A770 is enough to justify designing for local AI later, but not enough to justify blocking v0.1 on local model setup.

Best path:

```text
1. Build the cross-platform app.
2. Make rules-only Life Harness useful.
3. Add AI provider abstraction early in docs/core.
4. Add sensitivity levels early.
5. Use cloud AI only for non-sensitive high-value tasks later.
6. Add A770 local gateway later for private lightweight operator tasks.
```


---

# 09 - Agent Development Guide

## How to use coding agents

Use agents like junior engineers with narrow tickets, not like a magical founder.

Good agent tasks:

```text
Scaffold the app.
Create core types.
Build Today screen.
Build Board screen.
Implement active limit.
Implement quick capture parser.
Implement Pounce button.
Implement Proof Shelf.
```

Bad agent tasks:

```text
Build the whole Life Harness.
Make it like Jarvis.
Add AI and sync and notifications.
Make the app beautiful.
Figure out the best architecture.
```

## Agent workflow

For every task:

1. Read `AGENTS.md`.
2. Read `docs/01_final_design_doc.md`.
3. Read `docs/02_v0_1_scope.md`.
4. Make the smallest useful change.
5. Avoid new product concepts.
6. Run typecheck/tests.
7. Summarize exactly what changed.

## First prompt strategy

The first prompt should:

```text
create docs
create repo structure
scaffold Expo app
seed static screens
avoid backend
avoid AI
avoid integrations
```

It should not try to build the full app.

## Ticket size

Every ticket should be small enough that the agent can complete it cleanly.

Ideal ticket shape:

```text
Task:
Build X.

Context:
Read docs A, B, C.

Constraints:
Do not add Y.

Acceptance criteria:
Specific, checkable outcomes.
```

## Suggested ticket order

```text
001 Scaffold Expo app with routes and seed data.
002 Create core TypeScript models and seed cards.
003 Build Today screen with static seed data.
004 Build Board screen with card states and active limit.
005 Build one-sentence quick capture with rule-based parsing.
006 Build Pounce Mission, Pounce Button, MVD, and Salvage.
007 Build Progress screen with XP, warmth, and Proof Shelf.
008 Build Card Detail with Do vs Improve and Resume Packet.
009 Add computed While You Were Away briefing.
010 Add weekly review stub.
```

## Review prompt after first run

After Codex creates the scaffold, ask:

```text
Review the current Life Harness v0.1 scaffold against docs/v0.1.md and AGENTS.md. Find the top 5 gaps or rough edges. Do not implement yet. Return a prioritized patch plan with small tickets.
```

## Agent guardrails

Add this to any agent prompt if it starts to drift:

```text
Do not add new product concepts.
Do not add AI.
Do not add Supabase.
Do not add integrations.
Do not improve styling beyond basic usability.
Implement only the requested ticket.
```

## What to measure

Do not measure code volume.

Measure whether the built system supports:

```text
open app -> know next move
click Pounce -> get credit
log sentence -> progress visible
bad day -> MVD/Salvage available
idea appears -> captured but not active
```


---

# 10 - Future Roadmap

## Phase 0 - Documentation and agent setup

```text
Finalize design docs.
Create AGENTS.md.
Create first Codex prompt.
Create small ticket backlog.
```

## Phase 1 - v0.1 local/manual prototype

Build:

```text
Expo app shell
Today
Board
Progress
Log
Card Detail
seed data
one-sentence capture
Pounce
Minimum Viable Day
Salvage
Proof Shelf
Momentum Warmth
While You Were Away computed locally
Do vs Improve
Resume Packet fields
Use-before-improve locks
```

No AI. No backend. No integrations.

## Phase 2 - v0.2 shared data and better rules

Add:

```text
Supabase schema
basic auth if needed
shared cross-device state
rule-based parser improvements
computed warmth
dormant detection
weekly review stub
better briefing generation
```

Still avoid complex AI.

## Phase 3 - v0.3 optional cloud AI

Add AI for low-risk, high-value tasks:

```text
log classification
pounce suggestions
scope creep detection
resume packet drafts
weekly review drafts
briefing phrasing
```

Use sensitivity levels before sending data.

## Phase 4 - v0.4 local A770 gateway

Build optional local service:

```text
life-ai-gateway
  /classify-log
  /summarize-card
  /suggest-pounce
  /generate-briefing
  /create-resume-packet
```

Experiment with Intel-compatible runtimes later.

## Phase 5 - v0.5 integrations

Only after manual behavior is proven.

Possible integrations:

```text
GitHub commits -> Build progress
Calendar -> Social/Career events
Notes/voice memos -> Inbox
Spending -> Money/leak updates
Fitness -> Body progress
Career repo -> application state
```

## Phase 6 - v1 operator layer

Background agents:

```text
Career Agent
Project Agent
Life Ops Agent
Money Agent
Review Agent
```

Rule remains:

```text
The system can prepare. The user approves.
```

## Forever constraints

Do not turn the app into:

```text
a guilt board
a dashboard graveyard
a notification spammer
a fake gamification toy
a full autonomy agent
a local LLM science project before the core loop works
```


---

# 11 - Backlog and Use-Before-Improve Locks

## Why this exists

The user has a pattern of optimizing tasks into much larger systems. This app must prevent itself from becoming another optimization trap.

## Principle

```text
Do the thing manually until repeated pain proves the need for automation.
```

## Locked feature backlog

### AI classification

```text
Status: Locked
Unlock condition: 20 manual quick-capture logs
Reason: Need examples before automating classification.
```

### GitHub integration

```text
Status: Locked
Unlock condition: 10 manual Build logs
Reason: Need to prove Build logging matters before auto-importing commits.
```

### Calendar integration

```text
Status: Locked
Unlock condition: 7 Pounce sessions
Reason: Need to prove daily pounce is sticky before calendar complexity.
```

### Resume automation

```text
Status: Locked
Unlock condition: 5 manual career actions
Reason: Avoid building resume automation before sending applications/messages manually.
```

### Supabase backend

```text
Status: Locked for initial scaffold
Unlock condition: local seed prototype screens work
Reason: Validate UX shape before backend work.
```

### Local A770 AI gateway

```text
Status: Locked
Unlock condition: 20 manual logs + 5 weekly reviews + cloud/rules AI tasks identified
Reason: Do not make local model setup block the core product.
```

### Notifications

```text
Status: Locked
Unlock condition: app is used voluntarily for at least 7 sessions
Reason: Notifications should reinforce value, not compensate for lack of value.
```

### Mobile widgets

```text
Status: Locked
Unlock condition: Today screen proves useful
Reason: Widget should expose proven daily loop.
```

## Optimization Parking Lot examples

```text
build advanced scoring formula
animated RPG-style UI
browser extension
voice capture
home screen widget
local LLM agent
full calendar sync
spending import
job application automation
social accountability sharing
```

## Rule for adding features

Before adding a feature, answer:

```text
What failure mode does it address?
What manual behavior has proven the need?
What is the smallest version?
What will we not build yet?
```

If the answer is vague, park the feature.


---

# Proposed Repo Structure

## v0.1 simple Expo structure

```text
life-harness/
  AGENTS.md
  README.md
  docs/
  prompts/
  tickets/

  app/
    _layout.tsx
    index.tsx
    board.tsx
    progress.tsx
    log.tsx
    card/
      [id].tsx

  src/
    components/
      BriefingCard.tsx
      CardColumn.tsx
      LifeCard.tsx
      ProgressBar.tsx
      ProofShelf.tsx
      QuickCapture.tsx
      PouncePanel.tsx
      SalvagePanel.tsx
      MinimumViableDayPanel.tsx

    data/
      seed.ts

    core/
      types.ts
      scoring.ts
      warmth.ts
      parsing.ts
      guards.ts
      proof.ts
      briefing.ts
      locks.ts
```

## Future monorepo version

```text
life-harness/
  AGENTS.md
  docs/
  prompts/
  tickets/

  apps/
    mobile/
      app/
      components/
      features/
      lib/

  packages/
    core/
      types/
      scoring/
      warmth/
      parsing/
      guards/
      briefings/
      sensitivity/
      ai-routing/

  supabase/
    migrations/
    functions/
      generate-briefing/
      weekly-review/

  services/
    ai-gateway/
      src/
        providers/
          rules.ts
          cloud-openai.ts
          local-openvino.ts
          local-llamacpp-sycl.ts
          local-ipex-llm.ts
        routes/
          classify-log.ts
          suggest-pounce.ts
          summarize-card.ts
          generate-briefing.ts
```

## Placement rules

```text
Product rules -> src/core or packages/core
UI rendering -> components/screens
Seed data -> data/seed.ts
AI provider code -> future services/ai-gateway only
Supabase-specific code -> future supabase/ only
```

Avoid scattering product logic across screens.


---

# First Codex Prompt

Paste this into Codex from an empty `life-harness/` folder.

```text
You are starting a new project called Life Harness.

Before coding, produce a concise implementation plan, then execute it.

Project thesis:
Life Harness is an alive, low-friction executive-function board that helps the user become more put together by making the next useful action obvious, small, urgent, rewarding, and recoverable.

It is NOT a generic to-do app, Notion clone, habit tracker, or full AI agent system.

v0.1 goal:
Create a cross-platform Expo + React Native + TypeScript app skeleton that works on phone and web, using seed data only. The app should demonstrate the core product loop without Supabase, AI, auth, notifications, or integrations yet.

Core v0.1 loop:
Open app -> see Today -> read While You Were Away -> see one Pounce Mission -> click Pounce -> log one sentence -> see Proof Shelf / XP / warmth update -> use Minimum Viable Day or Salvage Mode if behind.

Tech constraints:
- Use Expo + React Native + TypeScript.
- Use Expo Router if appropriate.
- Use local seed data/state only for v0.1.
- Keep the UI ugly but usable.
- Create portable core logic in a separate package/folder if practical.
- Do not add Supabase implementation yet.
- Do not add AI implementation yet.
- Do not add local LLM, OpenVINO, llama.cpp, IPEX-LLM, Ollama, or A770-specific code.
- Do not add notifications, auth, mobile widgets, calendar sync, GitHub sync, spending imports, or cloud functions.
- Do not add new product concepts beyond what is specified.

Create these project docs:
1. AGENTS.md
2. docs/design.md
3. docs/v0.1.md
4. docs/product-rules.md
5. docs/future-ai-provider-abstraction.md

AGENTS.md should include:
- Product mission.
- Non-negotiable v0.1 constraints.
- UX rules.
- No new major concepts rule.
- Manual before automation rule.
- The system can prepare; the user approves rule.
- The Intel Arc A770 is a future optional local AI provider, not a v0.1 dependency rule.
- Requirement that future AI behavior must go through a provider abstraction.
- Requirement that sensitive data must not be sent to cloud AI without explicit future user configuration.
- Agent workflow: read docs, make smallest change, run checks, summarize.

Core life areas:
- Build
- Body
- Money / Independence
- Social / Career
- Stability / Vices

Card states:
- Inbox
- Active
- Parked
- Waiting
- Done
- Killed

Warmth states:
- Hot
- Warm
- Cooling
- Cold
- Dormant

Seed cards:
1. EV Tracker / Kalshi
   Area: Build
   State: Active
   Progress: 72
   Warmth: Hot
   Next tiny action: Review one market and write a fair-value note.

2. Text RPG
   Area: Build
   State: Active
   Progress: 62
   Warmth: Warm
   Next tiny action: Write one enemy behavior test.

3. Fitness Return
   Area: Body
   State: Active
   Progress: 20
   Warmth: Cooling
   Next tiny action: Walk 10 minutes or do one small lift session.

4. Career / Networking
   Area: Social / Career
   State: Parked
   Progress: 15
   Warmth: Cold
   Next tiny action: Send one follow-up message.

5. Life Harness
   Area: Build
   State: Active
   Progress: 10
   Warmth: Hot
   Next tiny action: Scaffold v0.1 app.

6. Local LLM Setup
   Area: Money / Independence
   State: Parked
   Progress: 15
   Warmth: Dormant
   Next tiny action: Pick one use case before researching models.

7. Haircut Setup
   Area: Money / Independence
   State: Parked
   Progress: 5
   Warmth: Dormant
   Next tiny action: List starter tools.

8. Music Production
   Area: Build
   State: Inbox
   Progress: 0
   Warmth: Cold
   Next tiny action: Capture first small project idea.

Build these screens:

1. Today screen
Must include:
- While You Were Away briefing
- Main Quest
- Pounce Mission
- Smallest Start
- Pounce button
- Minimum Viable Day button
- Salvage Mode button
- Active cards summary
- Quick Capture input

Example briefing:
While You Were Away:
- EV Tracker / Kalshi is hot.
- Career / Networking is cold.
- Local LLM Setup is dormant.
- Active cards are 4/3. Park one soon.
- Suggested pounce: scaffold Life Harness v0.1.

2. Board screen
Columns:
- Inbox
- Active
- Parked
- Waiting
- Done
- Killed

Each card should show:
- title
- area
- progress
- warmth
- next tiny action
- last touched if available

No drag-and-drop required. Buttons are fine:
- Activate
- Park
- Waiting
- Done
- Kill

Enforce active limit:
- Max active cards: 3
- If activating a fourth card, show a warning and do not activate it.

3. Progress screen
Must show:
- Quest progress bars
- Identity scores / simple category bars
- Momentum warmth by card
- Weekly XP totals from seed logs
- Proof Shelf
- Pounce sessions count
- Salvage wins count

Identity categories:
- Builder
- Operator
- Body
- Social / Career
- Self-Sufficient
- Stable

4. Log screen
Must show:
- raw log entries
- timestamp
- area
- linked card
- XP
- type

5. Card detail screen
Must show:
- why it matters
- next tiny action
- done-for-now
- do lane
- improve lane
- trigger plan
- obstacle plan
- resume packet
- open loops
- optimization ideas
- recent wins

Core interactions to implement with local state:
1. Pounce button
- On click, log +10 Initiation XP.
- Increment pounce session count.
- Add proof item: Started pounce mission.

2. Minimum Viable Day button
On click, show/check these actions:
- Eat something real.
- Move 10 minutes.
- Send one message OR open one project for 10 minutes.
- Write tomorrow's first move.
When completed, log +30 Rescue XP and add proof item: Preserved the day.

3. Salvage Mode button
Show options:
- 10-minute walk
- send one text
- open repo for 10 minutes
- eat something real
- write tomorrow's first move
When one is selected, log +30 Rescue XP and add proof item: Used Salvage Mode.

4. Quick Capture
Implement simple rule-based parsing:
- starts with "new idea:" -> create Inbox card
- contains "worked on", "coded", "built" -> Build win
- contains "walked", "lifted", "ran", "ate" -> Body win
- contains "texted", "emailed", "applied", "follow-up" -> Social / Career win
- contains "bought", "$", "subscription" -> Money / Stability log
- contains "park" -> attempt to park matching card by title substring

After logging, update:
- log list
- proof shelf if appropriate
- linked card last touched
- weekly XP totals

5. Proof Shelf
Collect real evidence, not streaks.
Examples:
- Started pounce mission.
- Worked on Text RPG.
- Used Salvage Mode.
- Parked project cleanly.
- Captured new idea without activating it.

6. Momentum Warmth
Implement a simple helper:
- Hot, Warm, Cooling, Cold, Dormant
For v0.1, this can be seed/manual plus basic update when a card is touched.

7. Do vs Improve Split
Every card detail should show:
- Do the thing
- Improve the system
This is to prevent over-optimization.

8. Use-before-improve locks
Create a small locked features section showing:
- AI classification locked until 20 manual logs.
- GitHub integration locked until 10 manual Build logs.
- Calendar integration locked until 7 pounce sessions.
- Resume automation locked until 5 manual career actions.
These are display-only in v0.1.

Suggested file structure:
life-harness/
  AGENTS.md
  docs/
    design.md
    v0.1.md
    product-rules.md
    future-ai-provider-abstraction.md
  app/
    _layout.tsx
    index.tsx
    board.tsx
    progress.tsx
    log.tsx
    card/[id].tsx
  src/
    components/
    data/
      seed.ts
    core/
      types.ts
      scoring.ts
      warmth.ts
      parsing.ts
      guards.ts
      proof.ts
      briefing.ts

Acceptance criteria:
- App runs.
- TypeScript passes.
- Today screen renders seed data.
- Board screen groups cards by state.
- Active limit is enforced.
- Pounce button logs Initiation XP and proof.
- Minimum Viable Day logs Rescue XP and proof.
- Salvage Mode logs Rescue XP and proof.
- Quick Capture can add a new Inbox idea.
- Quick Capture can log a simple Build/Body/Social/Money event.
- Progress screen shows bars, warmth, XP, and Proof Shelf.
- Card detail shows Do vs Improve, next tiny action, and resume packet fields.
- No backend, AI, auth, notifications, or integrations are added.
- Final response summarizes what was built, commands run, and how to start the app.

Important:
Make the smallest useful version. Do not overbuild. Do not add features outside this prompt.
```
