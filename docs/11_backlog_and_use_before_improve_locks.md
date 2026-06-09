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
