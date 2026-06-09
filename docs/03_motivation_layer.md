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
