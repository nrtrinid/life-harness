# Career Command Board v0.1

Career-first slice of Life Harness / Momentum Board. Helps the user apply to jobs while keeping the broader life board warm in the background.

## Thesis

```text
Open app -> see career pressure -> paste one job or send one follow-up -> log proof -> recover if behind.
```

v0.1 is local, ugly, and fast. No auth, cloud sync, AI, scraping, or resume automation.

## Screens

| Screen | Purpose |
|--------|---------|
| **Today** | While You Were Away, Career Pounce, Follow-ups due, MVD, Salvage, Quick Capture, Active summary, Proof preview |
| **Board** | Inbox / Active / Parked / Waiting / Done / Killed columns |
| **Intake** | Paste job description → create application card (default **Inbox**) |
| **Card Detail** | Do vs Improve, resume packet, career fields for application cards |
| **Progress** | Career stats, warmth, proof shelf, use-before-improve locks |
| **Log** | Timestamp, raw entry, area, linked card, XP, type |

## Application card model

Application cards extend `LifeCard` with optional `careerApplication`:

- company, roleTitle, sourceUrl, jobDescription, roleType
- applicationStatus (alias of `CardState`)
- resumeAngle, projectsToEmphasize, bulletsToEmphasize, followUpDate

### State/status sync (Option A)

`card.state` and `careerApplication.applicationStatus` must always match. All state transitions go through `syncApplicationStatus()` in `src/core/career.ts`.

## Core interactions

### Pounce

- +10 Initiation XP
- Proof: **Started career pounce**
- Does not require completion

### Minimum Viable Day

Checklist: eat, move 10 min, one message or 10 min on job/project, write tomorrow's first move → +30 Rescue XP, proof **Preserved the day**.

### Salvage Mode

Career-oriented options (follow-up, paste job desc, resume bullet, 10 min project, tomorrow's move) → +30 Rescue XP, proof **Used Salvage Mode**.

### Quick Capture (rule-based)

| Pattern | Result |
|---------|--------|
| `new idea:` | Inbox card + proof |
| `applied` | Social/Career log + **Applied to job** proof |
| `follow-up` / `texted` / `emailed` | Social/Career log + follow-up proof |
| `worked on` / `coded` / `built` | Build log |
| `walked` / `lifted` / `ate` | Body log |
| `bought` / `$` / `subscription` | Money/Stability leak |
| `park` | Park matching card by title substring |

### Career Intake

Creates application card with title `Company — Role`, area Social/Career, default state **Inbox**, next tiny action: choose resume angle or identify 3 matching bullets. No resume generation.

## Seed data (7 cards)

Six life cards plus one sample application (Qualcomm, Waiting, follow-up due):

- **Career / Networking** — Active, Cold (4/3 active demo with EV Tracker, Fitness, Life Harness)
- **EV Tracker / Kalshi** — Active, Hot — *Hold unless Career Pounce is complete today.*
- **Text RPG** — Parked, Cooling
- **Fitness Return** — Active, Cooling
- **Local LLM Setup** — Parked, Warm
- **Life Harness** — Active, Hot
- **Qualcomm — Security Engineer** — Waiting, follow-up due (demo)

Daily pounce: paste one job description and create an application card.

## Use-before-improve locks

| Feature | Unlock |
|---------|--------|
| Job-board scraping | 10 manual job cards |
| Resume automation | 5 manual applications |
| AI matching | 10 manual career actions |
| Calendar/email integration | 7 manual follow-ups |

## Run locally

```bash
npm install
npm run web
```

Verify:

```bash
npm run typecheck
npm run test
```

## Out of scope (v0.1)

- Supabase, auth, cloud sync, notifications
- AI providers, `services/ai-gateway` integration
- Job-board scraping, email/calendar/GitHub integrations
- Resume generation automation
- Monorepo move (`apps/mobile/`, `packages/core/` deferred)

## Product rules

- New ideas → Inbox, not Active
- Career pounce prefers outside-world action over research
- Parked = safe, not failed
- Warmth + proof + rescue XP, not guilt streaks
